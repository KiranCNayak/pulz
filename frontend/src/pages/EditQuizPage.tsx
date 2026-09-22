import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { QuizQuestionForm } from '@/components/QuizQuestionForm'
import { Button } from '@/components/ui/button'
import {
  useAddQuestion,
  useDeleteQuestion,
  useQuiz,
  useUpdateQuestion,
  useUpdateQuizTitle,
} from '@/hooks/useQuiz'
import { QUESTION_TIME_LIMIT_DEFAULT_SECONDS } from '@/lib/quizConstants'
import { isQuestionValid } from '@/lib/quizValidation'
import type { Question, QuestionInput, Quiz } from '@/types/quiz'

function toQuestionInput(question: Question): QuestionInput {
  return {
    text: question.text,
    mediaUrl: question.mediaUrl,
    timeLimitSeconds: question.timeLimitSeconds,
    options: question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })),
  }
}

function ExistingQuestionEditor({ quizId, question }: { quizId: string; question: Question }) {
  const [draft, setDraft] = useState<QuestionInput>(() => toQuestionInput(question))
  const updateQuestion = useUpdateQuestion(quizId)
  const deleteQuestion = useDeleteQuestion(quizId)

  return (
    <div className="space-y-2">
      <QuizQuestionForm value={draft} onChange={setDraft} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!isQuestionValid(draft) || updateQuestion.isPending}
          onClick={() => updateQuestion.mutate({ questionId: question.id, input: draft })}
        >
          {updateQuestion.isPending ? 'Saving…' : 'Save question'}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={deleteQuestion.isPending}
          onClick={() => deleteQuestion.mutate(question.id)}
        >
          Delete question
        </Button>
      </div>
    </div>
  )
}

// Keyed by quiz.id from the parent so a lazy initializer (not an effect)
// re-derives local edit state whenever a different quiz loads.
function QuizEditorForm({ quiz }: { quiz: Quiz }) {
  const updateTitle = useUpdateQuizTitle(quiz.id)
  const addQuestion = useAddQuestion(quiz.id)
  const [title, setTitle] = useState(() => quiz.title)

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Edit quiz</h1>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          type="button"
          disabled={title.trim().length === 0 || updateTitle.isPending}
          onClick={() => updateTitle.mutate(title)}
        >
          Save title
        </Button>
      </div>

      <div className="space-y-4">
        {quiz.questions.map((question) => (
          <ExistingQuestionEditor key={question.id} quizId={quiz.id} question={question} />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={addQuestion.isPending}
        onClick={() =>
          addQuestion.mutate({
            text: 'New question',
            timeLimitSeconds: QUESTION_TIME_LIMIT_DEFAULT_SECONDS,
            options: [
              { text: 'Option 1', isCorrect: true },
              { text: 'Option 2', isCorrect: false },
            ],
          })
        }
      >
        Add question
      </Button>
    </div>
  )
}

// Creator flow: /quizzes/:quizId/edit — load an existing quiz and edit its
// title/questions. Requires a valid Creator bearer token (Decision #38);
// the backend returns 401/404 otherwise, surfaced below.
export function EditQuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const { data: quiz, isLoading, isError, error } = useQuiz(quizId)

  if (isLoading) return <div className="p-6">Loading…</div>
  if (isError) return <div className="p-6 text-destructive">{(error as Error).message}</div>
  if (!quiz) return null

  return <QuizEditorForm key={quiz.id} quiz={quiz} />
}
