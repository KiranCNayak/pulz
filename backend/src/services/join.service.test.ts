import { describe, expect, it } from "vitest";
import { createParticipant, lobbyParticipantList, roleForJoin, validateDisplayName } from "./join.service.js";
import type { GameSession } from "../types/session.js";

function makeSession(status: GameSession["status"]): GameSession {
  return {
    id: "session-1",
    joinCode: "ABC123",
    quizId: "quiz-1",
    hostToken: "host-token",
    displayToken: "display-token",
    status,
    questions: [],
    currentQuestionIndex: -1,
    participants: new Map(),
    participantTokens: new Map(),
    createdAt: Date.now(),
    resultsTtlHours: 24,
  };
}

describe("validateDisplayName", () => {
  it("accepts a trimmed name within [1, 24] characters (PRD §4.3)", () => {
    expect(validateDisplayName("Alex")).toBe("Alex");
    expect(validateDisplayName("  Alex  ")).toBe("Alex");
    expect(validateDisplayName("a".repeat(24))).toBe("a".repeat(24));
  });

  it("rejects non-string input", () => {
    expect(validateDisplayName(undefined)).toBeUndefined();
    expect(validateDisplayName(42)).toBeUndefined();
    expect(validateDisplayName(null)).toBeUndefined();
  });

  it("rejects empty or whitespace-only names", () => {
    expect(validateDisplayName("")).toBeUndefined();
    expect(validateDisplayName("   ")).toBeUndefined();
  });

  it("rejects names over 24 characters", () => {
    expect(validateDisplayName("a".repeat(25))).toBeUndefined();
  });
});

describe("roleForJoin", () => {
  it("assigns PLAYER when the session hasn't started (Decision #11)", () => {
    expect(roleForJoin(makeSession("LOBBY"))).toBe("PLAYER");
  });

  it("assigns SPECTATOR once the session is in progress (Decision #11)", () => {
    expect(roleForJoin(makeSession("IN_PROGRESS"))).toBe("SPECTATOR");
  });

  it("assigns no role at all once the session has ended", () => {
    expect(roleForJoin(makeSession("ENDED"))).toBeUndefined();
  });
});

describe("createParticipant", () => {
  it("creates a participant with a unique token and registers both lookups", () => {
    const session = makeSession("LOBBY");
    const participant = createParticipant(session, "Alex", "PLAYER");

    expect(participant.displayName).toBe("Alex");
    expect(participant.role).toBe("PLAYER");
    expect(participant.connected).toBe(true);
    expect(participant.score).toBe(0);
    expect(participant.answers.size).toBe(0);

    expect(session.participants.get(participant.id)).toBe(participant);
    expect(session.participantTokens.get(participant.token)).toBe(participant.id);
  });

  it("generates a different token for each participant", () => {
    const session = makeSession("LOBBY");
    const a = createParticipant(session, "Alex", "PLAYER");
    const b = createParticipant(session, "Sam", "PLAYER");
    expect(a.token).not.toBe(b.token);
    expect(a.id).not.toBe(b.id);
  });
});

describe("lobbyParticipantList", () => {
  it("lists only connected participants, with id/displayName/role only", () => {
    const session = makeSession("LOBBY");
    const connected = createParticipant(session, "Alex", "PLAYER");
    const disconnected = createParticipant(session, "Sam", "SPECTATOR");
    disconnected.connected = false;

    const list = lobbyParticipantList(session);
    expect(list).toEqual([{ id: connected.id, displayName: "Alex", role: "PLAYER" }]);
  });
});
