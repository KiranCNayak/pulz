// Join-flow business logic (DESIGN.md §3 `join:request`, §8 idempotent
// join/reconnect). Kept separate from sockets/session.socket.ts so the
// role-assignment and validation rules are in one place regardless of
// transport.

import { randomBytes, randomUUID } from "node:crypto";
import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from "../domain/constants.js";
import type { GameSession, Participant, ParticipantRole } from "../types/session.js";

export function validateDisplayName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH || trimmed.length > DISPLAY_NAME_MAX_LENGTH) return undefined;
  return trimmed;
}

/** Pre-start joiners become Players; post-start joiners default to
 * Spectators (Decision #11). A session that has ENDED accepts no new
 * joins at all. */
export function roleForJoin(session: GameSession): ParticipantRole | undefined {
  if (session.status === "LOBBY") return "PLAYER";
  if (session.status === "IN_PROGRESS") return "SPECTATOR";
  return undefined; // ENDED
}

export function createParticipant(session: GameSession, displayName: string, role: ParticipantRole): Participant {
  const participant: Participant = {
    id: randomUUID(),
    token: randomBytes(24).toString("base64url"),
    displayName,
    role,
    connected: true,
    joinedAt: Date.now(),
    promotionStatus: "NONE",
    score: 0,
    answers: new Map(),
  };
  session.participants.set(participant.id, participant);
  session.participantTokens.set(participant.token, participant.id);
  return participant;
}

export function lobbyParticipantList(session: GameSession) {
  return [...session.participants.values()]
    .filter((p) => p.connected)
    .map((p) => ({ id: p.id, displayName: p.displayName, role: p.role }));
}
