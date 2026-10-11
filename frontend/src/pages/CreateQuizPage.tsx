import { ArrowRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { QuizQuestionForm } from '@/components/QuizQuestionForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hasCreatorToken, useRegisterCreator } from '@/hooks/useCreatorAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCreateQuiz } from '@/hooks/useQuiz'
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning'
import { QUESTION_TIME_LIMIT_DEFAULT_SECONDS } from '@/lib/quizConstants'
import { isQuestionValid } from '@/lib/quizValidation'
import type { QuestionInput } from '@/types/quiz'

function emptyQuestion(): QuestionInput {
  return {
    text: '',
    timeLimitSeconds: QUESTION_TIME_LIMIT_DEFAULT_SECONDS,
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ],
  }
}

// Creator flow: /create — register a Creator identity if needed (Decision
// #38), then build and save a new quiz in one step.
export function CreateQuizPage() {
  useDocumentTitle('Create a quiz')
  const navigate = useNavigate()
  const registerCreator = useRegisterCreator()
  const createQuiz = useCreateQuiz()
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<QuestionInput[]>([emptyQuestion()])

  const isValid = title.trim().length > 0 && questions.length > 0 && questions.every(isQuestionValid)
  const isDirty = title.trim().length > 0 || questions.some((q) => q.text.trim() || q.options.some((o) => o.text.trim()))
  const [saved, setSaved] = useState(false)
  useUnsavedChangesWarning(isDirty && !saved)

  const handleSubmit = async () => {
    if (!hasCreatorToken()) {
      await registerCreator.mutateAsync()
    }
    const quiz = await createQuiz.mutateAsync({ title, questions })
    setSaved(true)
    navigate(`/quizzes/${quiz.id}/edit`)
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6 sm:pt-14">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Create a quiz</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Give it a title, add at least one question, and mark one correct answer per question.
        </p>

        <div className="mt-10 flex flex-col gap-2">
          <Label htmlFor="quiz-title">Quiz title</Label>
          <Input
            id="quiz-title"
            name="quiz-title"
            autoComplete="off"
            placeholder="e.g. Friday trivia…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-14 font-display text-xl font-bold md:text-xl"
          />
        </div>

        <div className="mt-8 flex flex-col gap-5">
          {questions.map((question, index) => (
            <QuizQuestionForm
              key={index}
              index={index}
              value={question}
              onChange={(updated) =>
                setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)))
              }
              onRemove={
                questions.length > 1
                  ? () => setQuestions((prev) => prev.filter((_, i) => i !== index))
                  : undefined
              }
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="border-dashed bg-transparent shadow-none"
            onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
          >
            <Plus aria-hidden="true" /> Add question
          </Button>
        </div>
      </div>

      {/* Sticky so the primary action is always one tap away on long quizzes. */}
      <div className="sticky bottom-0 z-30 mt-10 border-t border-border bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {createQuiz.isError ? (
              <span role="alert" className="font-medium text-destructive">
                {(createQuiz.error as Error).message}
              </span>
            ) : isValid ? (
              `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}, ready to save.`
            ) : (
              'Add a title, then fill in every question and answer.'
            )}
          </p>
          <Button type="button" size="lg" disabled={!isValid || createQuiz.isPending} onClick={handleSubmit}>
            {createQuiz.isPending ? 'Creating…' : 'Create quiz'}
            {createQuiz.isPending ? null : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
