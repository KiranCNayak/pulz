// Mirrors backend/prisma/schema.prisma (Quiz/Question/Option) and
// backend/src/types/quiz.ts (CreateQuizInput/QuestionInput) — see
// backend/src/routes/quiz.schemas.ts for the exact validation ranges.

export type Option = {
  id: string
  text: string
  isCorrect: boolean
}

export type Question = {
  id: string
  order: number
  text: string
  mediaUrl: string | null
  timeLimitSeconds: number
  options: Option[]
}

export type Quiz = {
  id: string
  creatorId: string
  title: string
  coverImage: string | null
  createdAt: string
  updatedAt: string
  questions: Question[]
}

export type OptionInput = {
  text: string
  isCorrect: boolean
}

export type QuestionInput = {
  text: string
  mediaUrl?: string | null
  timeLimitSeconds?: number
  options: OptionInput[]
}

export type CreateQuizInput = {
  title: string
  coverImage?: string | null
  questions: QuestionInput[]
}

// Mirrors the response of POST /quizzes/:id/sessions
// (backend/src/routes/session.route.ts). hostToken/displayToken are
// returned exactly once (Decision #47) — the caller must hold onto them.
export type GameSession = {
  sessionId: string
  joinCode: string
  hostToken: string
  displayToken: string
  status: 'LOBBY' | 'IN_PROGRESS' | 'ENDED'
  questionCount: number
}
