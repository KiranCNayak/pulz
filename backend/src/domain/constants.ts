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
