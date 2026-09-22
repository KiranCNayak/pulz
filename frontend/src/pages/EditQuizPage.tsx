import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuizQuestionForm } from '@/components/QuizQuestionForm'
import { Button } from '@/components/ui/button'
import {
  useAddQuestion,
  useCreateSession,
  useDeleteQuestion,
  useQuiz,
  useUpdateQuestion,
  useUpdateQuizTitle,
} from '@/hooks/useQuiz'
import { QUESTION_TIME_LIMIT_DEFAULT_SECONDS } from '@/lib/quizConstants'
import { isQuestionValid } from '@/lib/quizValidation'
import type { GameSession, Question, QuestionInput, Quiz } from '@/types/quiz'

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

// Session tokens (hostToken/displayToken) are returned exactly once by
// POST /quizzes/:id/sessions (Decision #47) — held only in this
// component's state, not persisted, since there's no way to fetch them
// again after this render.
function StartSessionPanel({ quizId, canStart }: { quizId: string; canStart: boolean }) {
  const createSession = useCreateSession(quizId)
  const [session, setSession] = useState<GameSession | null>(null)

  if (session) {
    return (
      <div className="space-y-2 rounded border bg-muted/40 p-4">
        <p className="font-medium">
          Session started — join code: <span className="font-mono text-lg">{session.joinCode}</span>
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            render={
              <Link to={`/host/${session.sessionId}?token=${session.hostToken}`} target="_blank" rel="noreferrer" />
            }
          >
            Open Host Controller
          </Button>
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                to={`/display/${session.sessionId}?token=${session.displayToken}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            Open Display
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={!canStart || createSession.isPending}
        onClick={() => createSession.mutate(undefined, { onSuccess: setSession })}
      >
        {createSession.isPending ? 'Starting…' : 'Start session'}
      </Button>
      {!canStart && <p className="text-sm text-muted-foreground">Add at least one question first.</p>}
      {createSession.isError && (
        <p className="text-destructive text-sm">{(createSession.error as Error).message}</p>
      )}
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

      <StartSessionPanel quizId={quiz.id} canStart={quiz.questions.length > 0} />

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
