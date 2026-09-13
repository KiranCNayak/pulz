// In-process GameSession store (ARCHITECTURE.md §2, Decision #16). This
// is the entire "database" for live gameplay state — a plain Map, no
// persistence, gone on process restart (documented, accepted MVP
// limitation). ResultsSnapshot is the only piece that survives past a
// game, written separately once at game end (see results.service.ts).

import { randomUUID } from "node:crypto";
import { generateJoinCode } from "./joinCode.js";
import type { GameSession, Participant } from "../types/session.js";

const sessionsById = new Map<string, GameSession>();
const sessionIdByJoinCode = new Map<string, string>();

export function createSessionId(): string {
  return randomUUID();
}

export function allocateJoinCode(): string {
  return generateJoinCode((code) => sessionIdByJoinCode.has(code));
}

export function putSession(session: GameSession): void {
  sessionsById.set(session.id, session);
  sessionIdByJoinCode.set(session.joinCode, session.id);
}

export function getSessionById(id: string): GameSession | undefined {
  return sessionsById.get(id);
}

/** Only resolves to a session that can still actually be joined — an
 * ENDED session's code is treated as free even though we lazily remove
 * the join-code mapping at end-of-game (see removeJoinCode). */
export function getSessionByJoinCode(joinCode: string): GameSession | undefined {
  const id = sessionIdByJoinCode.get(joinCode);
  return id ? sessionsById.get(id) : undefined;
}

/** Free up a join code for reuse once a session ends (DESIGN.md §1:
 * "codes can be recycled once a session ends") without discarding the
 * session object itself yet (results are still readable via sessionId
 * until its own TTL). */
export function releaseJoinCode(joinCode: string): void {
  sessionIdByJoinCode.delete(joinCode);
}

/** Resolves an opaque participant token to that participant within a
 * session (used for both answer:submit auth and reconnect-on-join). */
export function resolveParticipant(session: GameSession, token: string): Participant | undefined {
  const participantId = session.participantTokens.get(token);
  return participantId ? session.participants.get(participantId) : undefined;
}

/** Fully drop a session from memory (e.g. once its results have also
 * expired — called from resultsCleanup, or available for future use). */
export function deleteSession(id: string): void {
  const session = sessionsById.get(id);
  if (session) sessionIdByJoinCode.delete(session.joinCode);
  sessionsById.delete(id);
}
