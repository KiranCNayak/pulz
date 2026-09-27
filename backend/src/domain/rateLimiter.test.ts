import { describe, expect, it } from "vitest";
import { compositeRateKey, LockoutTracker, SlidingWindowLimiter } from "./rateLimiter.js";

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit within a window, then rejects", () => {
    const limiter = new SlidingWindowLimiter(3, 1000);
    const now = 0;
    expect(limiter.consume("key", now)).toBe(true);
    expect(limiter.consume("key", now)).toBe(true);
    expect(limiter.consume("key", now)).toBe(true);
    expect(limiter.consume("key", now)).toBe(false);
  });

  it("resets once the window elapses", () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    expect(limiter.consume("key", 0)).toBe(true);
    expect(limiter.consume("key", 999)).toBe(false);
    expect(limiter.consume("key", 1000)).toBe(true); // new window
  });

  it("tracks separate keys independently", () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    expect(limiter.consume("a", 0)).toBe(true);
    expect(limiter.consume("b", 0)).toBe(true);
    expect(limiter.consume("a", 0)).toBe(false);
    expect(limiter.consume("b", 0)).toBe(false);
  });

  it("matches the /auth/register limiter shape from Decision #38 (10/hour)", () => {
    const oneHourMs = 60 * 60_000;
    const limiter = new SlidingWindowLimiter(10, oneHourMs);
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume("1.2.3.4", 0)).toBe(true);
    }
    expect(limiter.consume("1.2.3.4", 0)).toBe(false);
    // Still locked just before the hour is up...
    expect(limiter.consume("1.2.3.4", oneHourMs - 1)).toBe(false);
    // ...and free again once it is.
    expect(limiter.consume("1.2.3.4", oneHourMs)).toBe(true);
  });
});

describe("LockoutTracker", () => {
  it("is not locked out before the threshold is reached", () => {
    const tracker = new LockoutTracker(3, 1000, 5000);
    tracker.recordFailure("code", 0);
    tracker.recordFailure("code", 0);
    expect(tracker.isLockedOut("code", 0)).toBe(false);
  });

  it("locks out once the threshold is crossed within the window", () => {
    const tracker = new LockoutTracker(3, 1000, 5000);
    tracker.recordFailure("code", 0);
    tracker.recordFailure("code", 0);
    tracker.recordFailure("code", 0);
    expect(tracker.isLockedOut("code", 0)).toBe(true);
  });

  it("expires the lockout after lockoutDurationMs", () => {
    // threshold=2, not 1: the first-ever failure for a key always takes
    // the "new window" fast path in recordFailure and never checks the
    // threshold on that call, so a threshold of exactly 1 can never
    // trigger on a key's first failure. Documented in this file's report
    // as a pre-existing edge-case quirk, not fixed here (out of scope —
    // the real configured thresholds are 10/20, where this never bites).
    const tracker = new LockoutTracker(2, 1000, 5000);
    tracker.recordFailure("code", 0);
    tracker.recordFailure("code", 0);
    expect(tracker.isLockedOut("code", 0)).toBe(true);
    expect(tracker.isLockedOut("code", 4999)).toBe(true);
    expect(tracker.isLockedOut("code", 5000)).toBe(false);
  });

  it("resets the failure count once the counting window elapses without a lockout", () => {
    const tracker = new LockoutTracker(3, 1000, 5000);
    tracker.recordFailure("code", 0);
    tracker.recordFailure("code", 0);
    // Window elapses before the 3rd failure — count restarts.
    tracker.recordFailure("code", 1000);
    expect(tracker.isLockedOut("code", 1000)).toBe(false);
  });

  it("recordSuccess clears in-progress failures so a lockout isn't triggered later", () => {
    const tracker = new LockoutTracker(3, 1000, 5000);
    tracker.recordFailure("code", 0);
    tracker.recordFailure("code", 0);
    tracker.recordSuccess("code");
    tracker.recordFailure("code", 0);
    expect(tracker.isLockedOut("code", 0)).toBe(false);
  });

  it("matches the join-code lockout shape from DESIGN.md §8 (20 failures/5min -> 5min lockout)", () => {
    const windowMs = 5 * 60_000;
    const lockoutMs = 5 * 60_000;
    const tracker = new LockoutTracker(20, windowMs, lockoutMs);
    for (let i = 0; i < 19; i++) {
      tracker.recordFailure("ABC123", 0);
    }
    expect(tracker.isLockedOut("ABC123", 0)).toBe(false);
    tracker.recordFailure("ABC123", 0); // 20th failure crosses the threshold
    expect(tracker.isLockedOut("ABC123", 0)).toBe(true);
    expect(tracker.isLockedOut("ABC123", lockoutMs - 1)).toBe(true);
    expect(tracker.isLockedOut("ABC123", lockoutMs)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const tracker = new LockoutTracker(2, 1000, 5000); // see threshold=1 note above
    tracker.recordFailure("a", 0);
    tracker.recordFailure("a", 0);
    expect(tracker.isLockedOut("a", 0)).toBe(true);
    expect(tracker.isLockedOut("b", 0)).toBe(false);
  });
});

describe("compositeRateKey", () => {
  it("keys on IP + client id so shared-IP devices get separate buckets (ARCHITECTURE.md §11)", () => {
    const a = compositeRateKey("203.0.113.7", "client-aaaaaaaa");
    const b = compositeRateKey("203.0.113.7", "client-bbbbbbbb");
    expect(a).not.toBe(b);

    const limiter = new SlidingWindowLimiter(1, 1000);
    expect(limiter.consume(a, 0)).toBe(true);
    expect(limiter.consume(b, 0)).toBe(true); // a different device behind the same IP
    expect(limiter.consume(a, 0)).toBe(false);
  });

  it("falls back to the bare IP for a missing or malformed client id", () => {
    expect(compositeRateKey("203.0.113.7", undefined)).toBe("203.0.113.7");
    expect(compositeRateKey("203.0.113.7", 42)).toBe("203.0.113.7");
    expect(compositeRateKey("203.0.113.7", "short")).toBe("203.0.113.7");
    expect(compositeRateKey("203.0.113.7", "x".repeat(65))).toBe("203.0.113.7");
    expect(compositeRateKey("203.0.113.7", "has|pipe-chars")).toBe("203.0.113.7");
  });
});
