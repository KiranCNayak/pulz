import { randomInt } from "node:crypto";

/** Fisher-Yates shuffle, returning a new array (does not mutate input).
 * Used for both question order and per-question option order — both are
 * shuffled once per *session*, not per player (DESIGN.md §4, Decision
 * #6), so every caller here is on the session-creation/question-broadcast
 * path, never per-client. */
export function shuffled<T>(items: readonly T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
