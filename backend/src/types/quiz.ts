// Request/response DTOs for the Creator quiz-CRUD REST surface
// (CLAUDE.md step 3, DESIGN.md §1). These are intentionally separate from
// the Prisma models: request payloads are pre-validation/pre-clamped
// shapes, not persisted rows.

export interface OptionInput {
  text: string;
  isCorrect: boolean;
}

export interface QuestionInput {
  text: string;
  mediaUrl?: string | null;
  /** Optional; defaults to 20s and is clamped to [5, 120] server-side. */
  timeLimitSeconds?: number;
  options: OptionInput[];
}

export interface CreateQuizInput {
  title: string;
  coverImage?: string | null;
  questions: QuestionInput[];
}

export interface UpdateQuizInput {
  title?: string;
  coverImage?: string | null;
}
