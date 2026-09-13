// Minimal in-process sliding-window rate limiter (ARCHITECTURE.md §11 —
// "an in-process token-bucket/sliding-window limiter, same process as the
// Socket.IO server, no extra service"). This is deliberately the
// app-level piece only; the edge layer (Cloudflare, Turnstile) and the
// full progressive-friction ladder described in ARCHITECTURE.md §11 are
// infra concerns out of scope for this backend module.
//
// Each key tracks a simple counter + window-reset timestamp — cheap
// enough for MVP scale (ARCHITECTURE.md §8) and self-cleaning (a key not
// seen again just stops mattering; there is no persistent store to leak).

interface Bucket {
  count: number;
  windowStart: number;
}

export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if `key` is still under the limit for its current
   * window (and records the attempt); false if it should be rejected. */
  consume(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (bucket.count >= this.limit) return false;
    bucket.count += 1;
    return true;
  }
}

/** Tracks failed attempts against one specific composite key (e.g. a
 * literal join-code string) and locks it out temporarily once a
 * threshold is crossed within a window — DESIGN.md §8 / Decision #23.
 * Deliberately separate from SlidingWindowLimiter: this needs an
 * explicit lockout duration that outlives the counting window, not just
 * "reject once over limit within the window." */
export class LockoutTracker {
  private readonly attempts = new Map<string, { count: number; windowStart: number }>();
  private readonly lockouts = new Map<string, number>(); // key -> lockout-expires-at

  constructor(
    private readonly threshold: number,
    private readonly windowMs: number,
    private readonly lockoutDurationMs: number,
  ) {}

  isLockedOut(key: string, now = Date.now()): boolean {
    const until = this.lockouts.get(key);
    if (until === undefined) return false;
    if (now >= until) {
      this.lockouts.delete(key);
      return false;
    }
    return true;
  }

  /** Record a failed attempt; locks the key out if it crosses the
   * threshold within the window. */
  recordFailure(key: string, now = Date.now()): void {
    const bucket = this.attempts.get(key);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.attempts.set(key, { count: 1, windowStart: now });
      return;
    }
    bucket.count += 1;
    if (bucket.count >= this.threshold) {
      this.lockouts.set(key, now + this.lockoutDurationMs);
      this.attempts.delete(key);
    }
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }
}
