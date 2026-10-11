import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks Prisma entirely so this exercises the ranking/payload-shaping
// logic without a real Postgres instance. True Postgres-backed
// integration coverage (this upsert actually round-tripping, TTL
// filtering on read) is intentionally NOT attempted here — see this
// file's accompanying report for why. vi.hoisted is required (not a
// plain top-level const) because vi.mock's factory is itself hoisted
// above regular imports/statements.
const upsertMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const findFirstMock = vi.hoisted(() => vi.fn());
vi.mock("../db/client.js", () => ({
  prisma: { resultsSnapshot: { upsert: upsertMock, findFirst: findFirstMock } },
}));

import { ResultsNotFoundError, getResults, writeResultsSnapshot } from "./results.service.js";
import { createParticipant } from "./join.service.js";
import type { GameSession } from "../types/session.js";

function makeSession(): GameSession {
  return {
    id: "session-1",
    joinCode: "ABC123",
    quizId: "quiz-1",
    hostToken: "host-token",
    displayToken: "display-token",
    status: "ENDED",
    questions: [],
    currentQuestionIndex: -1,
    participants: new Map(),
    participantTokens: new Map(),
    createdAt: Date.now(),
    resultsTtlHours: 24,
  };
}

beforeEach(() => {
  upsertMock.mockClear();
  findFirstMock.mockClear();
});

describe("writeResultsSnapshot", () => {
  it("ranks PLAYER participants by score desc, sharing ranks on ties (1,1,3)", async () => {
    const session = makeSession();
    const alex = createParticipant(session, "Alex", "PLAYER");
    alex.score = 100;
    const sam = createParticipant(session, "Sam", "PLAYER");
    sam.score = 100;
    const jo = createParticipant(session, "Jo", "PLAYER");
    jo.score = 50;

    const payload = await writeResultsSnapshot(session);

    expect(payload.ranks.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(payload.totalParticipants).toBe(3);
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it("excludes spectators who never answered from the ranking", async () => {
    const session = makeSession();
    const player = createParticipant(session, "Alex", "PLAYER");
    player.score = 10;
    createParticipant(session, "LurkingSpectator", "SPECTATOR"); // never answered

    const payload = await writeResultsSnapshot(session);

    expect(payload.ranks).toHaveLength(1);
    expect(payload.ranks[0].displayName).toBe("Alex");
  });

  it("counts each player's correct answers out of the answers they gave (Decision #72)", async () => {
    const session = makeSession();
    const answer = (questionId: string, isCorrect: boolean) => ({
      questionId,
      selectedOptionId: `${questionId}-a`,
      serverReceivedAt: 0,
      timeTakenMs: 0,
      isCorrect,
      points: isCorrect ? 900 : 0,
    });
    const original = createParticipant(session, "Alex", "PLAYER");
    for (const [i, correct] of [true, true, false, true].entries()) original.answers.set(`q${i}`, answer(`q${i}`, correct));
    original.score = 2700;
    // Joined mid-game and was let in for the last two questions only.
    const lateJoiner = createParticipant(session, "Sam", "SPECTATOR");
    lateJoiner.role = "PLAYER";
    lateJoiner.answers.set("q2", answer("q2", true));
    lateJoiner.answers.set("q3", answer("q3", false));
    lateJoiner.score = 900;

    const payload = await writeResultsSnapshot(session);

    expect(payload.ranks.map(({ displayName, correctCount, answeredCount }) => ({ displayName, correctCount, answeredCount }))).toEqual([
      { displayName: "Alex", correctCount: 3, answeredCount: 4 },
      { displayName: "Sam", correctCount: 1, answeredCount: 2 },
    ]);
    expect(payload.podium[0].avatar).toEqual(original.avatar);
  });

  it("puts only the top 3 in the podium, with everyone in ranks", async () => {
    const session = makeSession();
    for (let i = 0; i < 5; i++) {
      const p = createParticipant(session, `Player${i}`, "PLAYER");
      p.score = 100 - i * 10;
    }

    const payload = await writeResultsSnapshot(session);

    expect(payload.podium).toHaveLength(3);
    expect(payload.ranks).toHaveLength(5);
  });

  it("upserts keyed by sessionId with an expiry derived from resultsTtlHours", async () => {
    const session = makeSession();
    session.resultsTtlHours = 1;
    const before = Date.now();

    await writeResultsSnapshot(session);

    const call = upsertMock.mock.calls[0][0] as { where: { sessionId: string }; create: { expiresAt: Date } };
    expect(call.where.sessionId).toBe(session.id);
    const expiresAtMs = call.create.expiresAt.getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 60 * 60_000 - 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(before + 60 * 60_000 + 1000);
  });
});

describe("getResults", () => {
  it("returns the stored payload when a non-expired snapshot exists", async () => {
    const fakePayload = { sessionId: "session-1", quizId: "quiz-1" };
    findFirstMock.mockResolvedValueOnce({ payload: fakePayload });

    const result = await getResults("session-1");
    expect(result).toBe(fakePayload);
  });

  it("throws ResultsNotFoundError when no non-expired snapshot exists (missing or TTL-expired)", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await expect(getResults("session-1")).rejects.toBeInstanceOf(ResultsNotFoundError);
  });
});
