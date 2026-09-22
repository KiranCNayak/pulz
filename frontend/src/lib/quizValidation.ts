import { QUESTION_OPTIONS_MIN } from '@/lib/quizConstants'
import type { QuestionInput } from '@/types/quiz'

// Client-side mirror of the backend's "exactly one correct option" and
// non-empty-text invariants (DESIGN.md §1, PRD §4.1) — a UX nicety only;
// the server remains authoritative (CLAUDE.md).
export function isQuestionValid(question: QuestionInput): boolean {
  const correctCount = question.options.filter((option) => option.isCorrect).length
  return (
    question.text.trim().length > 0 &&
    question.options.length >= QUESTION_OPTIONS_MIN &&
    question.options.every((option) => option.text.trim().length > 0) &&
    correctCount === 1
  )
}
