import type { Server } from "socket.io";
import { beforeEach, describe, expect, it, vi } from "vitest";

// writeResultsSnapshot hits Prisma/Postgres — mocked so this whole suite
// stays DB-free (game-loop state itself is pure in-memory per Decision
// #16/#34, only the results write touches Postgres). vi.hoisted is
// required here (not just a plain top-level const) because vi.mock's
// factory is itself hoisted above regular imports/statements.
const writeResultsSnapshotMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("./results.service.js", () => ({
  writeResultsSnapshot: writeResultsSnapshotMock,
}));

import {
  advance,
  buildResumeSnapshot,
  buildScreenSnapshot,
  lockIfEveryoneAnswered,
  lockQuestion,
  startGame,
  submitAnswer,
} from "./gameLoop.service.js";
import { createParticipant } from "./join.service.js";
import type { GameSession, SnapshotQuestion } from "../types/session.js";

type EmittedEvent = { rooms: string[]; event: string; payload: unknown };

function createFakeIo(): { io: Server; emitted: EmittedEvent[] } {
  const emitted: EmittedEvent[] = [];
  function makeChain(rooms: string[]) {
    return {
      to(room: string) {
        return makeChain([...rooms, room]);
      },
      emit(event: string, payload: unknown) {
        emitted.push({ rooms, event, payload });
      },
    };
  }
  return {
    io: { to: (room: string) => makeChain([room]) } as unknown as Server,
    emitted,
  };
}

function makeQuestion(id: string, correctOptionId: string, timeLimitSeconds = 20): SnapshotQuestion {
  return {
    id,
    text: `Question ${id}`,
    mediaUrl: null,
    timeLimitSeconds,
    options: [
      { id: `${id}-a`, text: "A", isCorrect: correctOptionId === `${id}-a` },
      { id: `${id}-b`, text: "B", isCorrect: correctOptionId === `${id}-b` },
    ],
  };
}

function makeSession(questions: SnapshotQuestion[]): GameSession {
  return {
    id: "session-1",
    joinCode: "ABC123",
    quizId: "quiz-1",
    hostToken: "host-token",
    displayToken: "display-token",
    status: "LOBBY",
    questions,
    currentQuestionIndex: -1,
    participants: new Map(),
    participantTokens: new Map(),
    createdAt: Date.now(),
    resultsTtlHours: 24,
  };
}

beforeEach(() => {
  writeResultsSnapshotMock.mockClear();
});

describe("startGame", () => {
  it("moves LOBBY -> IN_PROGRESS and broadcasts the first question", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io, emitted } = createFakeIo();

    const result = startGame(io, session);

    expect(result).toEqual({ ok: true });
    expect(session.status).toBe("IN_PROGRESS");
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.current?.phase).toBe("ACTIVE");

    const broadcast = emitted.find((e) => e.event === "question:broadcast");
    expect(broadcast?.rooms).toEqual(["session-1"]);
    const payload = broadcast?.payload as { options: Array<{ id: string; text: string; isCorrect?: boolean }> };
    // isCorrect must never leak to the broadcast payload (only Host's
    // reveal-time payload includes it).
    expect(payload.options.every((o) => !("isCorrect" in o))).toBe(true);
  });

  it("refuses to start a session that isn't in LOBBY", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    session.status = "IN_PROGRESS";
    const { io } = createFakeIo();

    expect(startGame(io, session)).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("submitAnswer", () => {
  function startedSession() {
    const session = makeSession([makeQuestion("q1", "q1-a", 20)]);
    const { io } = createFakeIo();
    startGame(io, session);
    return session;
  }

  it("rejects answers when no question is active", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]); // still LOBBY
    const player = createParticipant(session, "Alex", "PLAYER");
    expect(submitAnswer(session, player, "q1", "q1-a")).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects an answer for a question that is not the current one", () => {
    const session = startedSession();
    const player = createParticipant(session, "Alex", "PLAYER");
    expect(submitAnswer(session, player, "not-the-current-question", "q1-a")).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it("rejects spectators (PRD §4.3 / DESIGN.md §5)", () => {
    const session = startedSession();
    const spectator = createParticipant(session, "Sam", "SPECTATOR");
    expect(submitAnswer(session, spectator, "q1", "q1-a")).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects a second answer to the same question", () => {
    const session = startedSession();
    const player = createParticipant(session, "Alex", "PLAYER");
    expect(submitAnswer(session, player, "q1", "q1-a").ok).toBe(true);
    expect(submitAnswer(session, player, "q1", "q1-b")).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects an option id that doesn't exist on the question", () => {
    const session = startedSession();
    const player = createParticipant(session, "Alex", "PLAYER");
    expect(submitAnswer(session, player, "q1", "not-a-real-option")).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it("scores a correct, fast answer at the top bracket (PRD §5)", () => {
    const session = startedSession();
    const player = createParticipant(session, "Alex", "PLAYER");
    session.current!.broadcastAt = Date.now(); // answered ~immediately

    expect(submitAnswer(session, player, "q1", "q1-a")).toEqual({ ok: true });

    const record = player.answers.get("q1")!;
    expect(record.isCorrect).toBe(true);
    expect(record.points).toBe(50); // <=20% of time limit -> 5x base(10)
    expect(player.score).toBe(50);
  });

  it("scores a wrong answer as 0 points", () => {
    const session = startedSession();
    const player = createParticipant(session, "Alex", "PLAYER");

    expect(submitAnswer(session, player, "q1", "q1-b")).toEqual({ ok: true });
    expect(player.answers.get("q1")!.points).toBe(0);
    expect(player.score).toBe(0);
  });
});

describe("lockQuestion", () => {
  it("refuses to lock when there's no active question", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]); // still LOBBY
    const { io } = createFakeIo();
    expect(lockQuestion(io, session)).toEqual({ ok: false, error: expect.any(String) });
  });

  it("tallies answers, reveals the correct option, and reports each player's own result", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io, emitted } = createFakeIo();
    startGame(io, session);

    const alex = createParticipant(session, "Alex", "PLAYER");
    alex.socketId = "socket-alex";
    const sam = createParticipant(session, "Sam", "PLAYER");
    sam.socketId = "socket-sam";

    submitAnswer(session, alex, "q1", "q1-a"); // correct
    submitAnswer(session, sam, "q1", "q1-b"); // wrong

    const result = lockQuestion(io, session);
    expect(result).toEqual({ ok: true });
    expect(session.current?.phase).toBe("LOCKED");

    const reveal = emitted.find((e) => e.event === "question:reveal")!.payload as {
      correctOptionId: string;
      tally: Record<string, number>;
    };
    expect(reveal.correctOptionId).toBe("q1-a");
    expect(reveal.tally).toEqual({ "q1-a": 1, "q1-b": 1 });

    const alexResult = emitted.find((e) => e.event === "answer:result" && e.rooms.includes("socket-alex"))!
      .payload as { isCorrect: boolean; pointsEarned: number; myRank: number; totalPlayers: number };
    expect(alexResult).toEqual({ isCorrect: true, pointsEarned: 50, myRank: 1, totalPlayers: 2 });

    const samResult = emitted.find((e) => e.event === "answer:result" && e.rooms.includes("socket-sam"))!
      .payload as { isCorrect: boolean; pointsEarned: number; myRank: number; totalPlayers: number };
    expect(samResult).toEqual({ isCorrect: false, pointsEarned: 0, myRank: 2, totalPlayers: 2 });

    const leaderboard = emitted.find((e) => e.event === "leaderboard:update")!.payload as {
      ranked: Array<{ participantId: string; rank: number }>;
    };
    expect(leaderboard.ranked[0]).toMatchObject({ participantId: alex.id, rank: 1 });
  });

  it("does not count a spectator's non-answer against the tally and doesn't send them an answer:result", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io, emitted } = createFakeIo();
    startGame(io, session);
    const spectator = createParticipant(session, "Sam", "SPECTATOR");
    spectator.socketId = "socket-sam";

    lockQuestion(io, session);

    expect(emitted.some((e) => e.event === "answer:result" && e.rooms.includes("socket-sam"))).toBe(false);
  });
});

describe("lockIfEveryoneAnswered (Decision #63)", () => {
  function lockedEvent(emitted: ReturnType<typeof createFakeIo>["emitted"]) {
    return emitted.find((e) => e.event === "question:locked")?.payload as { reason: string } | undefined;
  }

  it("waits while a connected player hasn't answered, then locks the moment the last one does", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io, emitted } = createFakeIo();
    startGame(io, session);
    const alex = createParticipant(session, "Alex", "PLAYER");
    const sam = createParticipant(session, "Sam", "PLAYER");

    submitAnswer(session, alex, "q1", "q1-a");
    expect(lockIfEveryoneAnswered(io, session)).toBe(false);
    expect(session.current?.phase).toBe("ACTIVE");

    submitAnswer(session, sam, "q1", "q1-b");
    expect(lockIfEveryoneAnswered(io, session)).toBe(true);
    expect(session.current?.phase).toBe("LOCKED");
    expect(lockedEvent(emitted)?.reason).toBe("all_answered");
  });

  it("doesn't wait for disconnected players or spectators", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    const alex = createParticipant(session, "Alex", "PLAYER");
    createParticipant(session, "Dropped", "PLAYER").connected = false;
    createParticipant(session, "Watcher", "SPECTATOR");

    submitAnswer(session, alex, "q1", "q1-a");
    expect(lockIfEveryoneAnswered(io, session)).toBe(true);
  });

  it("locks when the only player still owing an answer disconnects", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    const alex = createParticipant(session, "Alex", "PLAYER");
    const sam = createParticipant(session, "Sam", "PLAYER");
    submitAnswer(session, alex, "q1", "q1-a");
    expect(lockIfEveryoneAnswered(io, session)).toBe(false);

    sam.connected = false; // what the socket disconnect handler does before re-checking
    expect(lockIfEveryoneAnswered(io, session)).toBe(true);
  });

  it("never locks with no connected players — the timer decides then", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    createParticipant(session, "Gone", "PLAYER").connected = false;

    expect(lockIfEveryoneAnswered(io, session)).toBe(false);
    expect(session.current?.phase).toBe("ACTIVE");
  });

  it("does nothing once the question is already locked", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io, emitted } = createFakeIo();
    startGame(io, session);
    const alex = createParticipant(session, "Alex", "PLAYER");
    submitAnswer(session, alex, "q1", "q1-a");
    lockQuestion(io, session, "host");

    expect(lockIfEveryoneAnswered(io, session)).toBe(false);
    expect(emitted.filter((e) => e.event === "question:locked")).toHaveLength(1);
    expect(lockedEvent(emitted)?.reason).toBe("host");
  });

  it("tags a timer-expiry lock with reason 'timer'", () => {
    vi.useFakeTimers();
    try {
      const session = makeSession([makeQuestion("q1", "q1-a", 5)]);
      const { io, emitted } = createFakeIo();
      startGame(io, session);
      createParticipant(session, "Alex", "PLAYER"); // never answers

      vi.advanceTimersByTime(5000);
      expect(session.current?.phase).toBe("LOCKED");
      expect(lockedEvent(emitted)?.reason).toBe("timer");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("advance", () => {
  it("refuses to advance a question that isn't locked yet", async () => {
    const session = makeSession([makeQuestion("q1", "q1-a"), makeQuestion("q2", "q2-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    await expect(advance(io, session)).resolves.toEqual({ ok: false, error: expect.any(String) });
  });

  it("broadcasts the next question when more remain", async () => {
    const session = makeSession([makeQuestion("q1", "q1-a"), makeQuestion("q2", "q2-a")]);
    const { io, emitted } = createFakeIo();
    startGame(io, session);
    lockQuestion(io, session);

    const result = await advance(io, session);

    expect(result).toEqual({ ok: true });
    expect(session.status).toBe("IN_PROGRESS");
    expect(session.currentQuestionIndex).toBe(1);
    expect(session.current?.question.id).toBe("q2");
    expect(emitted.filter((e) => e.event === "question:broadcast")).toHaveLength(2);
    expect(writeResultsSnapshotMock).not.toHaveBeenCalled();
  });

  it("ends the game, writes results, and releases the join code after the last question", async () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io, emitted } = createFakeIo();
    startGame(io, session);
    lockQuestion(io, session);

    const result = await advance(io, session);

    expect(result).toEqual({ ok: true });
    expect(session.status).toBe("ENDED");
    expect(session.current).toBeUndefined();
    expect(session.endedAt).toBeDefined();
    expect(writeResultsSnapshotMock).toHaveBeenCalledExactlyOnceWith(session);

    const ended = emitted.find((e) => e.event === "game:ended")!.payload as { resultsUrl: string };
    expect(ended.resultsUrl).toBe(`/results/${session.id}`);
  });
});

describe("buildResumeSnapshot", () => {
  it("returns just the status for a session still in the lobby", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]); // LOBBY
    const player = createParticipant(session, "Alex", "PLAYER");
    expect(buildResumeSnapshot(session, player)).toEqual({ status: "LOBBY", question: null });
  });

  it("includes a resultsUrl once the session has ended", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    session.status = "ENDED";
    const player = createParticipant(session, "Alex", "PLAYER");
    expect(buildResumeSnapshot(session, player)).toEqual({
      status: "ENDED",
      question: null,
      resultsUrl: `/results/${session.id}`,
    });
  });

  it("rehydrates the active question plus the participant's own answered-option id", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    const player = createParticipant(session, "Alex", "PLAYER");
    submitAnswer(session, player, "q1", "q1-a");

    const snapshot = buildResumeSnapshot(session, player) as {
      status: string;
      question: { phase: string; questionId: string } | null;
      answeredOptionId: string | null;
    };

    expect(snapshot.status).toBe("IN_PROGRESS");
    expect(snapshot.question?.phase).toBe("ACTIVE");
    expect(snapshot.question?.questionId).toBe("q1");
    expect(snapshot.answeredOptionId).toBe("q1-a");
  });

  it("rehydrates the reveal and this player's own result once locked", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    const player = createParticipant(session, "Alex", "PLAYER");
    player.socketId = "socket-alex";
    submitAnswer(session, player, "q1", "q1-a");
    lockQuestion(io, session);

    const snapshot = buildResumeSnapshot(session, player) as {
      question: { phase: string } | null;
      reveal?: { correctOptionId: string };
      result?: { isCorrect: boolean; pointsEarned: number } | null;
    };

    expect(snapshot.question?.phase).toBe("LOCKED");
    expect(snapshot.reveal?.correctOptionId).toBe("q1-a");
    expect(snapshot.result).toMatchObject({ isCorrect: true, pointsEarned: 50 });
  });

  it("gives a spectator the reveal but no player result", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    const spectator = createParticipant(session, "Sam", "SPECTATOR");
    lockQuestion(io, session);

    const snapshot = buildResumeSnapshot(session, spectator) as {
      reveal?: { correctOptionId: string };
      result: unknown;
    };

    expect(snapshot.reveal?.correctOptionId).toBe("q1-a");
    expect(snapshot.result).toBeNull();
  });
});

describe("buildScreenSnapshot (Host/Display resume, Decision #64)", () => {
  it("is empty in the lobby", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    expect(buildScreenSnapshot(session)).toEqual({
      question: null,
      lockReason: null,
      reveal: null,
      ranked: null,
      resultsUrl: null,
    });
  });

  it("restores an active question without leaking the correct answer", () => {
    const session = makeSession([makeQuestion("q1", "q1-a"), makeQuestion("q2", "q2-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    createParticipant(session, "Alex", "PLAYER");

    const snap = buildScreenSnapshot(session);
    expect(snap.question).toMatchObject({ questionId: "q1", phase: "ACTIVE", index: 0, total: 2 });
    expect(snap.reveal).toBeNull();
    expect(snap.ranked).toBeNull(); // nothing scored yet
    expect(JSON.stringify(snap)).not.toContain("isCorrect");
  });

  it("restores a locked question's reveal, lock reason and standings", () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    const alex = createParticipant(session, "Alex", "PLAYER");
    submitAnswer(session, alex, "q1", "q1-a");
    lockIfEveryoneAnswered(io, session);

    const snap = buildScreenSnapshot(session);
    expect(snap.question).toMatchObject({ questionId: "q1", phase: "LOCKED" });
    expect(snap.lockReason).toBe("all_answered");
    expect(snap.reveal).toEqual({ questionId: "q1", correctOptionId: "q1-a", tally: { "q1-a": 1, "q1-b": 0 } });
    expect(snap.ranked?.[0]).toMatchObject({ participantId: alex.id, rank: 1 });
  });

  it("keeps standings from earlier questions while a later one is active", async () => {
    const session = makeSession([makeQuestion("q1", "q1-a"), makeQuestion("q2", "q2-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    const alex = createParticipant(session, "Alex", "PLAYER");
    submitAnswer(session, alex, "q1", "q1-a");
    lockQuestion(io, session, "host");
    await advance(io, session);

    const snap = buildScreenSnapshot(session);
    expect(snap.question).toMatchObject({ questionId: "q2", phase: "ACTIVE" });
    expect(snap.ranked?.[0].score).toBeGreaterThan(0);
  });

  it("points an ended game at its results", async () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);
    const { io } = createFakeIo();
    startGame(io, session);
    createParticipant(session, "Alex", "PLAYER");
    lockQuestion(io, session, "host");
    await advance(io, session);

    const snap = buildScreenSnapshot(session);
    expect(snap.question).toBeNull();
    expect(snap.resultsUrl).toBe(`/results/${session.id}`);
    expect(snap.ranked).toHaveLength(1);
  });
});
