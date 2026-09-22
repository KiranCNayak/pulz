// Mirrors backend/src/domain/constants.ts — kept in sync manually since
// the frontend/backend don't share a package. Client-side use is a UX
// nicety only; the backend remains the authoritative validator.
export const QUESTION_TIME_LIMIT_MIN_SECONDS = 5
export const QUESTION_TIME_LIMIT_MAX_SECONDS = 120
export const QUESTION_TIME_LIMIT_DEFAULT_SECONDS = 20
export const QUESTION_OPTIONS_MIN = 2
export const QUESTION_OPTIONS_MAX = 4
