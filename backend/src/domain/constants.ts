// Domain-level constants shared by REST validation, service logic, and
// (later) the socket/game-loop layer. Keeping these in one place means the
// "5-120s" / "2-4 options" invariants from PRD §4.1 / DESIGN.md §1 aren't
// duplicated as magic numbers across files.

export const QUESTION_TIME_LIMIT_MIN_SECONDS = 5;
export const QUESTION_TIME_LIMIT_MAX_SECONDS = 120;
export const QUESTION_TIME_LIMIT_DEFAULT_SECONDS = 20;

export const QUESTION_OPTIONS_MIN = 2;
export const QUESTION_OPTIONS_MAX = 4;

export const SCORE_BASE_POINTS = 10;

/** Clamp a question time limit into the allowed [5, 120] second range. */
export function clampTimeLimitSeconds(seconds: number): number {
  return Math.min(
    QUESTION_TIME_LIMIT_MAX_SECONDS,
    Math.max(QUESTION_TIME_LIMIT_MIN_SECONDS, Math.trunc(seconds)),
  );
}

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

// Loose per-IP join-attempt limiter (ARCHITECTURE.md §11 table row 1) —
// must tolerate a whole classroom behind one shared IP.
export const JOIN_IP_RATE_LIMIT = 30;
export const JOIN_IP_RATE_WINDOW_MS = 60_000;

// New-connection cap per IP (ARCHITECTURE.md §11 table row 3).
export const SOCKET_CONNECT_IP_RATE_LIMIT = 20;
export const SOCKET_CONNECT_IP_RATE_WINDOW_MS = 60_000;

// --- Scoring (PRD §5, DESIGN.md §5, Decision #1/#2) ---

/** Ordered ascending; first bracket whose `maxPct` the answer's elapsed
 * fraction-of-time-limit falls within wins. */
export const SCORE_BRACKETS: ReadonlyArray<{ maxPct: number; multiplier: number }> = [
  { maxPct: 0.2, multiplier: 5 },
  { maxPct: 0.4, multiplier: 4 },
  { maxPct: 0.6, multiplier: 3 },
  { maxPct: 0.8, multiplier: 2 },
  { maxPct: 1.0, multiplier: 1 },
];
