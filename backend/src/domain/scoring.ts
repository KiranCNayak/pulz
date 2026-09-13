// Server-authoritative scoring (PRD §5, DESIGN.md §5, Decision #1/#2).
// Never trust a client-supplied point value or elapsed time — only the
// server's own receipt timestamp of an answer feeds this.

import { SCORE_BASE_POINTS, SCORE_BRACKETS } from "./constants.js";

/** Clamp elapsed time into [0, timeLimitMs] — an out-of-range value
 * (clock skew, a delayed message) is clamped, not rejected, so a
 * legitimate-but-late answer degrades to "worst bracket" rather than
 * erroring. */
export function clampTimeTakenMs(timeTakenMs: number, timeLimitMs: number): number {
  return Math.min(timeLimitMs, Math.max(0, timeTakenMs));
}

/** Points for a correct answer landing at `timeTakenMs` out of
 * `timeLimitMs`, always a non-negative integer multiple of the base. */
export function computePoints(isCorrect: boolean, timeTakenMs: number, timeLimitMs: number): number {
  if (!isCorrect) return 0;
  const pctUsed = timeLimitMs === 0 ? 1 : timeTakenMs / timeLimitMs;
  const bracket = SCORE_BRACKETS.find((b) => pctUsed <= b.maxPct) ?? SCORE_BRACKETS[SCORE_BRACKETS.length - 1];
  return SCORE_BASE_POINTS * bracket.multiplier;
}
