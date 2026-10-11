import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { rankStandings } from "../domain/standings.js";
import type { GameSession, PodiumEntry, ResultsPayload } from "../types/session.js";

export class ResultsNotFoundError extends Error {}

/** Ranks everyone who played — players, plus anyone with answers on record
 * — leaving out spectators who never got to play. */
function rankParticipants(session: GameSession): PodiumEntry[] {
  return rankStandings(
    [...session.participants.values()].filter((p) => p.role === "PLAYER" || p.answers.size > 0),
  );
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
