import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import type { GameSession, PodiumEntry, ResultsPayload } from "../types/session.js";

export class ResultsNotFoundError extends Error {}

/** Ranks all participants by score desc, using standard competition
 * ranking (ties share a rank; the next distinct score's rank accounts for
 * the tied group's size, e.g. 1,1,3 not 1,1,2) — PRD §5/§6 don't specify
 * tie-breaking beyond "sum of points," so this is the least-surprising
 * default. */
function rankParticipants(session: GameSession): PodiumEntry[] {
  const sorted = [...session.participants.values()]
    .filter((p) => p.role === "PLAYER" || p.answers.size > 0) // exclude never-played spectators
    .sort((a, b) => b.score - a.score);

  const ranked: PodiumEntry[] = [];
  let lastScore: number | undefined;
  let lastRank = 0;
  sorted.forEach((p, index) => {
    const rank = p.score === lastScore ? lastRank : index + 1;
    ranked.push({ participantId: p.id, displayName: p.displayName, score: p.score, rank });
    lastScore = p.score;
    lastRank = rank;
  });
  return ranked;
}

function buildPayload(session: GameSession): ResultsPayload {
  const ranked = rankParticipants(session);
  return {
    sessionId: session.id,
    quizId: session.quizId,
    generatedAt: new Date().toISOString(),
    totalParticipants: ranked.length,
    podium: ranked.slice(0, 3),
    ranks: ranked, // route layer paginates ranks 4+ per PRD §6
  };
}

/** Writes the once-only ResultsSnapshot at `game:ended` (DESIGN.md §7).
 * Idempotent via `upsert` — a duplicate `game:ended` (e.g. a retried host
 * action) overwrites rather than erroring or duplicate-inserting. */
export async function writeResultsSnapshot(session: GameSession): Promise<ResultsPayload> {
  const payload = buildPayload(session);
  const expiresAt = new Date(Date.now() + session.resultsTtlHours * 60 * 60_000);

  await prisma.resultsSnapshot.upsert({
    where: { sessionId: session.id },
    create: { sessionId: session.id, expiresAt, payload: payload as unknown as object },
    update: { expiresAt, payload: payload as unknown as object },
  });

  return payload;
}

/** Read path defensively filters `expiresAt > now()` itself
 * (ARCHITECTURE.md §3) so correctness never depends on the sweep's
 * timing. */
export async function getResults(sessionId: string): Promise<ResultsPayload> {
  const row = await prisma.resultsSnapshot.findFirst({
    where: { sessionId, expiresAt: { gt: new Date() } },
  });
  if (!row) throw new ResultsNotFoundError("Results not found or expired");
  return row.payload as unknown as ResultsPayload;
}

// Re-exported so route code doesn't need to reach into config directly
// just to report the configured default TTL.
export const defaultResultsTtlHours = env.resultsTtlHours;
