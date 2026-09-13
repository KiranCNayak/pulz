import { randomBytes } from "node:crypto";
import { shuffled } from "../domain/shuffle.js";
import { allocateJoinCode, createSessionId, putSession } from "../domain/sessionStore.js";
import { NotFoundError, ValidationError } from "./quiz.service.js";
import * as quizService from "./quiz.service.js";
import { env } from "../config/env.js";
import type { GameSession, SnapshotQuestion } from "../types/session.js";

export { NotFoundError, ValidationError };

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Creates a live GameSession from a saved Quiz, snapshotting its
 * questions/options (ARCHITECTURE.md §2: durable Quiz data lives in
 * Postgres, but a *running* game must not change shape mid-session if the
 * Creator edits the quiz concurrently) and generating the session's fixed
 * question order (DESIGN.md §4, Decision #6 — shuffled once per session,
 * not per player).
 */
export async function createGameSession(creatorId: string, quizId: string): Promise<GameSession> {
  const quiz = await quizService.getQuizForCreator(creatorId, quizId);
  if (quiz.questions.length === 0) {
    throw new ValidationError("Quiz must have at least one question to start a session");
  }

  const snapshotQuestions: SnapshotQuestion[] = quiz.questions.map((q) => ({
    id: q.id,
    text: q.text,
    mediaUrl: q.mediaUrl,
    timeLimitSeconds: q.timeLimitSeconds,
    options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
  }));

  const session: GameSession = {
    id: createSessionId(),
    joinCode: allocateJoinCode(),
    quizId,
    hostToken: generateToken(),
    displayToken: generateToken(),
    status: "LOBBY",
    questions: shuffled(snapshotQuestions),
    currentQuestionIndex: -1,
    participants: new Map(),
    participantTokens: new Map(),
    createdAt: Date.now(),
    resultsTtlHours: env.resultsTtlHours,
  };

  putSession(session);
  return session;
}
