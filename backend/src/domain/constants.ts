// Domain-level constants shared by REST validation, service logic, and
// (later) the socket/game-loop layer. Keeping these in one place means the
// "5-120s" / "2-4 options" invariants from PRD §4.1 / DESIGN.md §1 aren't
// duplicated as magic numbers across files.

export const QUESTION_TIME_LIMIT_MIN_SECONDS = 5;
export const QUESTION_TIME_LIMIT_MAX_SECONDS = 120;
export const QUESTION_TIME_LIMIT_DEFAULT_SECONDS = 20;

export const QUESTION_OPTIONS_MIN = 2;
export const QUESTION_OPTIONS_MAX = 4;

/** Clamp a question time limit into the allowed [5, 120] second range. */
export function clampTimeLimitSeconds(seconds: number): number {
  return Math.min(
    QUESTION_TIME_LIMIT_MAX_SECONDS,
    Math.max(QUESTION_TIME_LIMIT_MIN_SECONDS, Math.trunc(seconds)),
  );
}

// --- Creator registration (Decision #38) ---

// POST /auth/register is anonymous by construction (that's the whole
// point of a login-free capability token), so — unlike other Creator
// endpoints, which sit behind Decision #22's "already authenticated"
// exemption — it IS part of the anonymous attack surface and needs its
// own rate limit against runaway row creation / storage abuse. Loose
// per-IP window, same shape as the join-attempt limiter. This is the
// production default; `REGISTER_RATE_LIMIT_PER_HOUR` (config/env.ts) can
// override it — the dev-only docker-compose stack raises it so repeated
// E2E runs (3 registrations each) don't trip it.
export const REGISTER_IP_RATE_LIMIT = 10;
export const REGISTER_IP_RATE_WINDOW_MS = 60 * 60_000;

// --- Player/Spectator display name (PRD §4.3) ---

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 24;

// --- Session / join code (PRD §4.2, Decision #10) ---

export const JOIN_CODE_LENGTH = 6;
// Excludes 0/O/1/I to avoid a joiner misreading a projected code
// (functional nicety, doesn't change the abuse-resilience math in any
// meaningful way given the alphabet is still ~32^6 ≈ 1B combinations).
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// --- Join-code brute-force lockout (DESIGN.md §8, Decision #23) ---

// Failed attempts against one *specific* join-code string within this
// window trigger a temporary lockout of that code string, independent of
// whether it currently resolves to a session.
export const JOIN_CODE_LOCKOUT_THRESHOLD = 20;
export const JOIN_CODE_LOCKOUT_WINDOW_MS = 5 * 60_000;
export const JOIN_CODE_LOCKOUT_DURATION_MS = 5 * 60_000;

// Loose join-attempt limiter (ARCHITECTURE.md §11 table row 1), keyed
// per composite key (IP + client id) — must tolerate a whole classroom
// behind one shared IP.
export const JOIN_RATE_LIMIT = 30;
export const JOIN_RATE_WINDOW_MS = 60_000;

// New-connection cap per composite key (IP + client id — see
// compositeRateKey; ARCHITECTURE.md §11 table row 3).
export const SOCKET_CONNECT_RATE_LIMIT = 20;
export const SOCKET_CONNECT_RATE_WINDOW_MS = 60_000;

// Per-connection inbound message cap (ARCHITECTURE.md §11 table row 4) — a
// coarse backstop against protocol-level garbage, not gameplay throttling:
// a player sends a handful of events per question and a host a few clicks,
// so 60 per 10s is far above any legitimate pace (even a host approving a
// queue of spectators).
export const SOCKET_MESSAGE_RATE_LIMIT = 60;
export const SOCKET_MESSAGE_RATE_WINDOW_MS = 10_000;

// --- Scoring (PRD §5, DESIGN.md §5, Decision #67) ---

/** A correct answer earns SCORE_MAX_POINTS if it reaches the server the
 * instant the question is broadcast, falling linearly to SCORE_MIN_POINTS
 * at the time limit. Integer rounding leaves ~1 point per 40ms on a 20s
 * question (240ms on 120s), so near-simultaneous answers still separate. */
export const SCORE_MAX_POINTS = 1000;
export const SCORE_MIN_POINTS = 500;

// --- Player avatars (Decision #74) ---

// A deliberately small v1 set: the client picks one of each, and the server
// only ever stores values from these lists (anything else falls back to a
// random pick), so a hand-crafted join can't put arbitrary text on the
// projector. Colours are keys, not hex — the frontend owns how they look
// (frontend/src/lib/avatars.ts mirrors both lists).
export const AVATAR_EMOJIS = [
  "🦊", "🐼", "🐸", "🐙", "🦁", "🐯", "🐨", "🐵", "🦄", "🐶",
  "🐱", "🐧", "🦉", "🐢", "🐝", "🦖", "🚀", "⚡", "🍕", "🎸",
] as const;
export const AVATAR_COLORS = ["red", "orange", "gold", "green", "teal", "blue", "pink", "slate"] as const;

// --- Question images (Decision #75) ---

/** Per-file upload cap (owner's choice), enforced as the route's body limit. */
export const QUESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Total image storage per Creator. Postgres holds the bytes (Neon's free
 * plan is 0.5 GB), so one account can't fill it alone; the registration
 * limit above is what bounds many accounts. */
export const CREATOR_IMAGE_QUOTA_BYTES = 100 * 1024 * 1024;
/** Uploaded images no question points at (removed, replaced, or never
 * saved) are swept once they're this old — long enough to outlast an
 * editing session that uploads before it saves. */
export const ORPHAN_IMAGE_MAX_AGE_MS = 24 * 60 * 60_000;
