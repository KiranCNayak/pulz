// Mirrors backend/src/domain/constants.ts — kept in sync manually since
// the frontend/backend don't share a package. Client-side use is a UX
// nicety only; the backend remains the authoritative validator.
export const QUESTION_TIME_LIMIT_MIN_SECONDS = 5
export const QUESTION_TIME_LIMIT_MAX_SECONDS = 120
export const QUESTION_TIME_LIMIT_DEFAULT_SECONDS = 20
export const QUESTION_OPTIONS_MIN = 2
export const QUESTION_OPTIONS_MAX = 4

// Mirrors backend/src/domain/resultsTtl.ts (DESIGN.md §7).
export const RESULTS_TTL_PRESET_HOURS = [1, 6, 24] as const
export const RESULTS_TTL_DEFAULT_HOURS = 24
