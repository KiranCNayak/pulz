// In-memory domain types for a live GameSession (DESIGN.md §1, §2;
// ARCHITECTURE.md §2 — deliberately NOT Prisma models, this state never
// touches Postgres except as the flattened ResultsSnapshot payload
// written once at game end).

export type ParticipantRole = "PLAYER" | "SPECTATOR";
export type PromotionStatus = "NONE" | "REQUESTED" | "APPROVED" | "DENIED";
export type SessionStatus = "LOBBY" | "IN_PROGRESS" | "ENDED";
export type QuestionPhase = "ACTIVE" | "LOCKED";

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
  role: ParticipantRole;
  connected: boolean;
  socketId?: string;
  joinedAt: number;
  promotionStatus: PromotionStatus;
  score: number;
  answers: Map<string, AnswerRecord>; // keyed by questionId
}

/** State for whichever question is currently ACTIVE or LOCKED. */
export interface ActiveQuestionState {
  index: number; // index into GameSession.questions
  question: SnapshotQuestion;
  optionOrder: string[]; // shuffled option ids, this session's display order
  phase: QuestionPhase;
  broadcastAt: number; // server clock ms — the only clock timeTakenMs is derived from
  lockTimer?: NodeJS.Timeout;
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
  score: number;
  rank: number;
}

export interface ResultsPayload {
  sessionId: string;
  quizId: string;
  generatedAt: string;
  totalParticipants: number;
  podium: PodiumEntry[]; // top 3
  ranks: PodiumEntry[]; // full ranked list (4+), paginated by the results route
}
