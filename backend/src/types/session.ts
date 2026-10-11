// In-memory domain types for a live GameSession (DESIGN.md §1, §2;
// ARCHITECTURE.md §2 — deliberately NOT Prisma models, this state never
// touches Postgres except as the flattened ResultsSnapshot payload
// written once at game end).

export type ParticipantRole = "PLAYER" | "SPECTATOR";
export type PromotionStatus = "NONE" | "REQUESTED" | "APPROVED" | "DENIED";
export type SessionStatus = "LOBBY" | "IN_PROGRESS" | "ENDED";
export type QuestionPhase = "ACTIVE" | "LOCKED";

/** Emoji on a coloured circle, picked when joining (Decision #74). Both
 * values come from the allowlists in domain/constants.ts. */
export interface Avatar {
  emoji: string;
  color: string;
}

/** A quiz question/option snapshotted at session-creation time (DESIGN.md
 * §7 note by analogy — a session must not change shape if the Creator
 * edits the quiz mid-game). */
export interface SnapshotOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface SnapshotQuestion {
  id: string;
  text: string;
  mediaUrl: string | null;
  imageId: string | null; // uploaded question image (Decision #75)
  timeLimitSeconds: number;
  options: SnapshotOption[];
}

export interface AnswerRecord {
  questionId: string;
  selectedOptionId: string;
  serverReceivedAt: number;
  timeTakenMs: number;
  isCorrect: boolean;
  points: number;
}

export interface Participant {
  id: string;
  token: string;
  displayName: string;
  avatar: Avatar;
  role: ParticipantRole;
  connected: boolean;
  socketId?: string;
  joinedAt: number;
  promotionStatus: PromotionStatus;
  score: number;
  answers: Map<string, AnswerRecord>; // keyed by questionId
}

/** Why a question closed (Decision #63) — sent on `question:locked`. */
export type LockReason = "host" | "timer" | "all_answered";

/** State for whichever question is currently ACTIVE or LOCKED. */
export interface ActiveQuestionState {
  index: number; // index into GameSession.questions
  question: SnapshotQuestion;
  optionOrder: string[]; // shuffled option ids, this session's display order
  phase: QuestionPhase;
  broadcastAt: number; // server clock ms — the only clock timeTakenMs is derived from
  lockTimer?: NodeJS.Timeout;
  lockReason?: LockReason; // set once LOCKED, so a (re)connecting screen can show it
}

// Note: join-code brute-force lockout (DESIGN.md §8) is tracked by the
// *literal guessed code string* in a module-level LockoutTracker
// (sockets/session.socket.ts), not as a field on GameSession — most
// brute-force guesses never resolve to a session at all, so a per-session
// counter can't see them; a code-string-keyed tracker can.

export interface GameSession {
  id: string; // unguessable UUID (results link)
  joinCode: string; // 6-char alphanumeric, what players type
  quizId: string;
  quizTitle: string; // snapshotted with the questions, for the results page/share image (Decision #78)
  hostToken: string;
  displayToken: string;
  status: SessionStatus;
  questions: SnapshotQuestion[]; // already in this session's shuffled order
  currentQuestionIndex: number; // -1 before the game starts
  current?: ActiveQuestionState;
  participants: Map<string, Participant>;
  participantTokens: Map<string, string>; // token -> participantId, for reconnect
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  resultsTtlHours: number;
}

export interface PodiumEntry {
  participantId: string;
  displayName: string;
  avatar: Avatar;
  score: number;
  rank: number;
  // "5 of 8 correct" (Decision #72): answers given, not questions shown, so
  // a mid-game joiner is judged on the questions they actually played.
  correctCount: number;
  answeredCount: number;
}

export interface ResultsPayload {
  sessionId: string;
  quizId: string;
  quizTitle?: string; // absent on snapshots saved before Decision #78
  generatedAt: string;
  totalParticipants: number;
  podium: PodiumEntry[]; // top 3
  ranks: PodiumEntry[]; // full ranked list (4+), paginated by the results route
}
