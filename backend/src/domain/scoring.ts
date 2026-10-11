// Server-authoritative scoring (PRD §5, DESIGN.md §5, Decision #67).
// Never trust a client-supplied point value or elapsed time — only the
// server's own receipt timestamp of an answer feeds this.

import { SCORE_MAX_POINTS, SCORE_MIN_POINTS } from "./constants.js";

/** Clamp elapsed time into [0, timeLimitMs] — an out-of-range value
 * (clock skew, a delayed message) is clamped, not rejected, so a
 * legitimate-but-late answer degrades to the minimum score rather than
 * erroring. */
export function clampTimeTakenMs(timeTakenMs: number, timeLimitMs: number): number {
  return Math.min(timeLimitMs, Math.max(0, timeTakenMs));
}

/** Points for a correct answer landing at `timeTakenMs` out of
 * `timeLimitMs`: linear from SCORE_MAX_POINTS at 0ms down to
 * SCORE_MIN_POINTS at the time limit, rounded to a non-negative integer.
 * An earlier answer never scores less than a later one. */
export function computePoints(isCorrect: boolean, timeTakenMs: number, timeLimitMs: number): number {
  if (!isCorrect) return 0;
  const pctUsed = timeLimitMs === 0 ? 1 : clampTimeTakenMs(timeTakenMs, timeLimitMs) / timeLimitMs;
  return Math.round(SCORE_MAX_POINTS - (SCORE_MAX_POINTS - SCORE_MIN_POINTS) * pctUsed);
}
