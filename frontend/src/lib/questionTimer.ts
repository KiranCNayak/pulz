type TimedQuestion = { serverStartTime: number; timeLimitSeconds: number }

/**
 * Client-clock deadline for a question's countdown. A live
 * `question:broadcast` arrives within network latency of the server's
 * `serverStartTime`, so anchoring on the local receive time sidesteps any
 * client/server clock skew; a resumed question (reconnect snapshot) has no
 * such anchor, so it trusts the client clock against `serverStartTime`.
 * Cosmetic only — locking and scoring stay server-authoritative (PRD §5).
 * Call from an event handler, not during render.
 */
export function questionDeadline(question: TimedQuestion, source: 'live' | 'resumed'): number {
  const start = source === 'live' ? Date.now() : question.serverStartTime
  return start + question.timeLimitSeconds * 1000
}
