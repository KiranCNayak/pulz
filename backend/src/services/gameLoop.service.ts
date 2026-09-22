// Core session/game-loop state machine (DESIGN.md §2, §5) and its
// realtime broadcasts (DESIGN.md §3). Kept separate from sockets/ so the
// transition logic is testable independent of Socket.IO wiring; sockets/
// session.socket.ts is just the thin event-registration layer that calls
// into this.
//
// State-machine note (confirmed with project owner): DESIGN.md's literal
// three host-driven steps per question (lock -> reveal -> leaderboard,
// each its own "host: next") are collapsed here into two:
// `lockQuestion` does lock+score+reveal+leaderboard as one atomic step,
// and `advance` moves to the next question or ends the game. Same
// information reaches every client, fewer host clicks to operate.

import type { Server } from "socket.io";
import { clampTimeTakenMs, computePoints } from "../domain/scoring.js";
import { shuffled } from "../domain/shuffle.js";
import { releaseJoinCode } from "../domain/sessionStore.js";
import { writeResultsSnapshot } from "./results.service.js";
import type {
  AnswerRecord,
  GameSession,
  Participant,
  PodiumEntry,
  SnapshotQuestion,
} from "../types/session.js";

export function baseRoom(sessionId: string): string {
  return sessionId;
}
export function controllerRoom(sessionId: string): string {
  return `${sessionId}:controller`;
}
export function displayRoom(sessionId: string): string {
  return `${sessionId}:display`;
}

/** Strips `isCorrect` before anything goes to a Player/Spectator/Display
 * client — only the Host's own reveal-time payload includes it. */
function publicOptions(question: SnapshotQuestion, optionOrder: string[]) {
  const byId = new Map(question.options.map((o) => [o.id, o]));
  return optionOrder.map((id) => ({ id, text: byId.get(id)!.text }));
}

function playerCount(session: GameSession): number {
  let n = 0;
  for (const p of session.participants.values()) if (p.role === "PLAYER") n++;
  return n;
}

/** Standard competition ranking (ties share a rank) over current PLAYER
 * scores — used for both the host's full leaderboard and each player's
 * own "X of Y". */
function rankPlayers(session: GameSession): PodiumEntry[] {
  const players = [...session.participants.values()]
    .filter((p) => p.role === "PLAYER")
    .sort((a, b) => b.score - a.score);

  const ranked: PodiumEntry[] = [];
  let lastScore: number | undefined;
  let lastRank = 0;
  players.forEach((p, index) => {
    const rank = p.score === lastScore ? lastRank : index + 1;
    ranked.push({ participantId: p.id, displayName: p.displayName, score: p.score, rank });
    lastScore = p.score;
    lastRank = rank;
  });
  return ranked;
}

/** Starts the game: LOBBY -> IN_PROGRESS, then broadcasts question 0.
 * Only valid from LOBBY. */
export function startGame(io: Server, session: GameSession): { ok: true } | { ok: false; error: string } {
  if (session.status !== "LOBBY") return { ok: false, error: "Game already started or ended" };
  session.status = "IN_PROGRESS";
  session.startedAt = Date.now();
  session.currentQuestionIndex = 0;
  broadcastQuestion(io, session);
  return { ok: true };
}

function broadcastQuestion(io: Server, session: GameSession): void {
  const question = session.questions[session.currentQuestionIndex];
  const optionOrder = shuffled(question.options.map((o) => o.id));
  const broadcastAt = Date.now();

  const lockTimer = setTimeout(() => {
    // Auto-lock if the host hasn't already (timer expiry per DESIGN.md §2).
    lockQuestion(io, session);
  }, question.timeLimitSeconds * 1000);
  lockTimer.unref();

  session.current = { index: session.currentQuestionIndex, question, optionOrder, phase: "ACTIVE", broadcastAt, lockTimer };

  io.to(baseRoom(session.id)).emit("question:broadcast", {
    questionId: question.id,
    text: question.text,
    mediaUrl: question.mediaUrl,
    options: publicOptions(question, optionOrder),
    timeLimitSeconds: question.timeLimitSeconds,
    serverStartTime: broadcastAt,
    index: session.currentQuestionIndex,
    total: session.questions.length,
  });
}

/** Validates and records one player's answer (DESIGN.md §5). Pure
 * state mutation; the socket handler is responsible for emitting
 * `answer:ack`/`answer:error` off the returned result. */
export function submitAnswer(
  session: GameSession,
  participant: Participant,
  questionId: string,
  selectedOptionId: string,
): { ok: true } | { ok: false; error: string } {
  if (session.status !== "IN_PROGRESS" || !session.current || session.current.phase !== "ACTIVE") {
    return { ok: false, error: "No question is currently accepting answers" };
  }
  if (session.current.question.id !== questionId) {
    return { ok: false, error: "That question is no longer active" };
  }
  if (participant.role !== "PLAYER") {
    return { ok: false, error: "Only players may submit answers" };
  }
  if (participant.answers.has(questionId)) {
    return { ok: false, error: "Already answered this question" };
  }
  const option = session.current.question.options.find((o) => o.id === selectedOptionId);
  if (!option) {
    return { ok: false, error: "Invalid option" };
  }

  const timeLimitMs = session.current.question.timeLimitSeconds * 1000;
  const timeTakenMs = clampTimeTakenMs(Date.now() - session.current.broadcastAt, timeLimitMs);
  const isCorrect = option.isCorrect;
  const points = computePoints(isCorrect, timeTakenMs, timeLimitMs);

  const record: AnswerRecord = { questionId, selectedOptionId, serverReceivedAt: Date.now(), timeTakenMs, isCorrect, points };
  participant.answers.set(questionId, record);
  participant.score += points;

  return { ok: true };
}

/** Locks the current question (host action or timer expiry), computes
 * the reveal + per-player results, and shows the leaderboard — all as
 * one step (see module-level note on the 2-click simplification). */
export function lockQuestion(io: Server, session: GameSession): { ok: true } | { ok: false; error: string } {
  const current = session.current;
  if (!current || current.phase !== "ACTIVE") {
    return { ok: false, error: "No active question to lock" };
  }
  clearTimeout(current.lockTimer);
  current.phase = "LOCKED";

  const correctOption = current.question.options.find((o) => o.isCorrect)!;
  const tally: Record<string, number> = Object.fromEntries(current.optionOrder.map((id) => [id, 0]));
  for (const p of session.participants.values()) {
    const answer = p.answers.get(current.question.id);
    if (answer && answer.selectedOptionId in tally) tally[answer.selectedOptionId]++;
  }

  io.to(baseRoom(session.id)).emit("question:locked", { questionId: current.question.id });
  io.to(baseRoom(session.id)).emit("question:reveal", {
    questionId: current.question.id,
    correctOptionId: correctOption.id,
    tally,
  });

  const ranked = rankPlayers(session);
  const rankByParticipantId = new Map(ranked.map((r) => [r.participantId, r]));
  const totalPlayers = playerCount(session);

  for (const p of session.participants.values()) {
    if (p.role !== "PLAYER" || !p.connected) continue;
    const answer = p.answers.get(current.question.id);
    io.to(p.socketId!).emit("answer:result", {
      isCorrect: answer?.isCorrect ?? false,
      pointsEarned: answer?.points ?? 0,
      myRank: rankByParticipantId.get(p.id)?.rank ?? totalPlayers,
      totalPlayers,
    });
  }

  io.to(controllerRoom(session.id)).to(displayRoom(session.id)).emit("leaderboard:update", { ranked });

  return { ok: true };
}

/** Advances past the leaderboard: next question, or end-of-game if that
 * was the last one. Only valid once the current question is LOCKED. */
export async function advance(io: Server, session: GameSession): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!session.current || session.current.phase !== "LOCKED") {
    return { ok: false, error: "Current question must be locked before advancing" };
  }
  const nextIndex = session.currentQuestionIndex + 1;
  if (nextIndex < session.questions.length) {
    session.currentQuestionIndex = nextIndex;
    broadcastQuestion(io, session);
    return { ok: true };
  }

  session.status = "ENDED";
  session.endedAt = Date.now();
  session.current = undefined;
  releaseJoinCode(session.joinCode); // DESIGN.md §1: codes recycle once a session ends
  await writeResultsSnapshot(session);
  io.to(baseRoom(session.id)).emit("game:ended", { resultsUrl: `/results/${session.id}` });
  return { ok: true };
}

/**
 * What a reconnecting Player/Spectator needs to rehydrate mid-game
 * (ARCHITECTURE.md §6, DESIGN.md §9's originally-open reconnect
 * question). `join:request`'s reconnect path only re-established the
 * socket-room membership and re-sent `join:accepted` — a client
 * reconnecting mid-question had no way to know a question was even
 * active, and `lockQuestion`'s per-participant `answer:result` targets a
 * socket id that goes stale across a reconnect, so a player who
 * disconnects between answering and lock never received their result at
 * all. This snapshot is attached to `join:accepted` as `state` so the
 * client can jump straight to the right screen instead of the lobby.
 */
export function buildResumeSnapshot(session: GameSession, participant: Participant) {
  if (session.status === "ENDED") {
    return { status: session.status, question: null, resultsUrl: `/results/${session.id}` } as const;
  }
  if (session.status !== "IN_PROGRESS" || !session.current) {
    return { status: session.status, question: null } as const;
  }

  const current = session.current;
  const questionPayload = {
    questionId: current.question.id,
    text: current.question.text,
    mediaUrl: current.question.mediaUrl,
    options: publicOptions(current.question, current.optionOrder),
    timeLimitSeconds: current.question.timeLimitSeconds,
    serverStartTime: current.broadcastAt,
    index: current.index,
    total: session.questions.length,
    phase: current.phase,
  };

  const answer = participant.answers.get(current.question.id);

  if (current.phase === "ACTIVE") {
    return {
      status: session.status,
      question: questionPayload,
      answeredOptionId: answer?.selectedOptionId ?? null,
    } as const;
  }

  // LOCKED: also rehydrate the reveal + this participant's own result,
  // same shape as the live `question:reveal`/`answer:result` events.
  const correctOption = current.question.options.find((o) => o.isCorrect)!;
  const tally: Record<string, number> = Object.fromEntries(current.optionOrder.map((id) => [id, 0]));
  for (const p of session.participants.values()) {
    const a = p.answers.get(current.question.id);
    if (a && a.selectedOptionId in tally) tally[a.selectedOptionId]++;
  }
  const ranked = rankPlayers(session);
  const totalPlayers = playerCount(session);

  return {
    status: session.status,
    question: questionPayload,
    answeredOptionId: answer?.selectedOptionId ?? null,
    reveal: { questionId: current.question.id, correctOptionId: correctOption.id, tally },
    result:
      participant.role === "PLAYER"
        ? {
            isCorrect: answer?.isCorrect ?? false,
            pointsEarned: answer?.points ?? 0,
            myRank: ranked.find((r) => r.participantId === participant.id)?.rank ?? totalPlayers,
            totalPlayers,
          }
        : null,
  } as const;
}
