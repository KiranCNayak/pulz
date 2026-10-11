import { Check, CircleAlert, Copy, ExternalLink, MonitorPlay, Plus, Radio } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { QuizQuestionForm } from '@/components/QuizQuestionForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import {
  useAddQuestion,
  useCreateSession,
  useDeleteQuestion,
  useQuiz,
  useUpdateQuestion,
  useUpdateQuizTitle,
} from '@/hooks/useQuiz'
import {
  QUESTION_TIME_LIMIT_DEFAULT_SECONDS,
  RESULTS_TTL_DEFAULT_HOURS,
  RESULTS_TTL_PRESET_HOURS,
} from '@/lib/quizConstants'
import { isQuestionValid } from '@/lib/quizValidation'
import type { GameSession, Question, QuestionInput, Quiz } from '@/types/quiz'

function toQuestionInput(question: Question): QuestionInput {
  return {
    text: question.text,
    mediaUrl: question.mediaUrl,
    imageId: question.imageId,
    timeLimitSeconds: question.timeLimitSeconds,
    options: question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })),
  }
}

function ExistingQuestionEditor({ quizId, question, index }: { quizId: string; question: Question; index: number }) {
  const [draft, setDraft] = useState<QuestionInput>(() => toQuestionInput(question))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const updateQuestion = useUpdateQuestion(quizId)
  const deleteQuestion = useDeleteQuestion(quizId)
  const dirty = JSON.stringify(draft) !== JSON.stringify(toQuestionInput(question))

  const footer = confirmingDelete ? (
    <>
      <p className="mr-auto text-sm font-medium">Delete this question? This can't be undone.</p>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={deleteQuestion.isPending}
        onClick={() => deleteQuestion.mutate(question.id)}
      >
        {deleteQuestion.isPending ? 'Deleting…' : 'Delete'}
      </Button>
    </>
  ) : (
    <>
      <Button
        type="button"
        size="sm"
        disabled={!isQuestionValid(draft) || updateQuestion.isPending}
        onClick={() => updateQuestion.mutate({ questionId: question.id, input: draft })}
      >
        {updateQuestion.isPending ? 'Saving…' : 'Save question'}
      </Button>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {dirty ? 'Unsaved changes' : updateQuestion.isSuccess ? 'Saved' : ''}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirmingDelete(true)}
      >
        Delete question
      </Button>
    </>
  )

  return <QuizQuestionForm index={index} value={draft} onChange={setDraft} footer={footer} />
}

function formatHours(hours: number): string {
  return hours === 1 ? '1 hour' : `${hours} hours`
}

// Session tokens (hostToken/displayToken) are returned exactly once by
// POST /quizzes/:id/sessions (Decision #47) — held only in this
// component's state, not persisted, since there's no way to fetch them
// again after this render.
function StartSessionPanel({ quizId, canStart }: { quizId: string; canStart: boolean }) {
  const createSession = useCreateSession(quizId)
  const [session, setSession] = useState<GameSession | null>(null)
  const [copied, setCopied] = useState(false)
  const [resultsTtlHours, setResultsTtlHours] = useState<number>(RESULTS_TTL_DEFAULT_HOURS)

  const copyJoinCode = async () => {
    if (!session) return
    await navigator.clipboard.writeText(session.joinCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (session) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-stage-correct dark:text-emerald-400">
              <Radio aria-hidden="true" className="size-4" />
              Session is live. Players join with
            </p>
            <p
              data-testid="session-join-code"
              translate="no"
              className="font-mono text-4xl font-bold tracking-[0.2em] sm:text-5xl"
            >
              {session.joinCode}
            </p>
            <p className="text-sm text-muted-foreground">
              Results stay available for {formatHours(session.resultsTtlHours)} after the game ends.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={copyJoinCode} aria-live="polite">
            {copied ? <Check aria-hidden="true" className="text-stage-correct" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
          <Button
            size="lg"
            className="flex-1"
            render={
              <Link to={`/host/${session.sessionId}?token=${session.hostToken}`} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLink aria-hidden="true" /> Open Host Controller
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1"
            render={
              <Link
                to={`/display/${session.sessionId}?token=${session.displayToken}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <MonitorPlay aria-hidden="true" /> Open Display
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Run the game from the Host Controller and put the Display on the projector. These links can't be shown
          again, so keep both tabs open.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <h2 className="font-display text-xl font-bold tracking-tight">Ready to go live?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Starting a session gives you a join code plus links for the Host Controller and the Display.
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        {/* DESIGN.md §7: results auto-expire; the host picks how long. */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="results-ttl" className="font-medium text-muted-foreground">
            Keep results for
          </Label>
          <select
            id="results-ttl"
            name="results-ttl"
            value={resultsTtlHours}
            onChange={(e) => setResultsTtlHours(Number(e.target.value))}
            className="h-12 cursor-pointer rounded-lg border border-input bg-card px-3 text-[0.9375rem] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
          >
            {RESULTS_TTL_PRESET_HOURS.map((hours) => (
              <option key={hours} value={hours}>
                {formatHours(hours)}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          size="lg"
          className="flex-1 sm:flex-none"
          disabled={!canStart || createSession.isPending}
          onClick={() => createSession.mutate(resultsTtlHours, { onSuccess: setSession })}
        >
          <Radio aria-hidden="true" /> {createSession.isPending ? 'Starting…' : 'Start session'}
        </Button>
      </div>
      {!canStart && <p className="mt-3 text-sm text-muted-foreground">Add at least one question first.</p>}
      {createSession.isError && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="size-4" />
          {(createSession.error as Error).message}
        </p>
      )}
    </section>
  )
}

// Keyed by quiz.id from the parent so a lazy initializer (not an effect)
// re-derives local edit state whenever a different quiz loads.
function QuizEditorForm({ quiz }: { quiz: Quiz }) {
  useDocumentTitle(quiz.title)
  const updateTitle = useUpdateQuizTitle(quiz.id)
  const addQuestion = useAddQuestion(quiz.id)
  const [title, setTitle] = useState(() => quiz.title)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
      <div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Edit quiz</h1>
        <p className="mt-2 text-muted-foreground">Update the title and questions, then start a live session.</p>
      </div>

      <StartSessionPanel quizId={quiz.id} canStart={quiz.questions.length > 0} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="quiz-title">Quiz title</Label>
        <div className="flex gap-2">
          <Input
            id="quiz-title"
            name="quiz-title"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-12 font-display text-lg font-bold md:text-lg"
          />
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={title.trim().length === 0 || title === quiz.title || updateTitle.isPending}
            onClick={() => updateTitle.mutate(title)}
          >
            {updateTitle.isPending ? 'Saving…' : 'Save title'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <h2 className="font-display text-lg font-bold">
          Questions <span className="font-sans text-base font-medium text-muted-foreground tabular-nums">{quiz.questions.length}</span>
        </h2>
        {quiz.questions.map((question, index) => (
          <ExistingQuestionEditor key={question.id} quizId={quiz.id} question={question} index={index} />
        ))}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="border-dashed bg-transparent shadow-none"
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
          <Plus aria-hidden="true" /> Add question
        </Button>
      </div>
    </div>
  )
}

// Creator flow: /quizzes/:quizId/edit — load an existing quiz and edit its
// title/questions. Requires a valid Creator bearer token (Decision #38);
// the backend returns 401/404 otherwise, surfaced below.
export function EditQuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const { data: quiz, isLoading, isError, error } = useQuiz(quizId)

  let content: React.ReactNode = null
  if (isLoading) {
    content = <EditorSkeleton />
  } else if (isError) {
    content = (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <CircleAlert aria-hidden="true" className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-bold">Couldn't open this quiz</h1>
        <p role="alert" className="text-muted-foreground">
          {(error as Error).message}
        </p>
        <Button variant="outline" render={<Link to="/create" />}>
          Create a new quiz
        </Button>
      </div>
    )
  } else if (quiz) {
    content = <QuizEditorForm key={quiz.id} quiz={quiz} />
  }

  return <AppShell>{content}</AppShell>
}

/** Placeholder in the editor's own shape while the quiz loads. */
function EditorSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading quiz" className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-10 sm:px-6 sm:pt-14">
      <div className="h-12 w-56 rounded-lg bg-muted motion-safe:animate-pulse" />
      <div className="h-36 rounded-2xl bg-muted motion-safe:animate-pulse" />
      <div className="h-12 rounded-lg bg-muted motion-safe:animate-pulse" />
      <div className="h-64 rounded-2xl bg-muted motion-safe:animate-pulse" />
    </div>
  )
}
