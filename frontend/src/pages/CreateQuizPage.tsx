import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QuizQuestionForm } from '@/components/QuizQuestionForm'
import { Button } from '@/components/ui/button'
import { hasCreatorToken, useRegisterCreator } from '@/hooks/useCreatorAuth'
import { useCreateQuiz } from '@/hooks/useQuiz'
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
  const navigate = useNavigate()
  const registerCreator = useRegisterCreator()
  const createQuiz = useCreateQuiz()
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<QuestionInput[]>([emptyQuestion()])

  const isValid = title.trim().length > 0 && questions.length > 0 && questions.every(isQuestionValid)

  const handleSubmit = async () => {
    if (!hasCreatorToken()) {
      await registerCreator.mutateAsync()
    }
    const quiz = await createQuiz.mutateAsync({ title, questions })
    navigate(`/quizzes/${quiz.id}/edit`)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Create a quiz</h1>

      <input
        className="w-full rounded border px-3 py-2"
        placeholder="Quiz title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="space-y-4">
        {questions.map((question, index) => (
          <QuizQuestionForm
            key={index}
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
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}>
          Add question
        </Button>
        <Button type="button" disabled={!isValid || createQuiz.isPending} onClick={handleSubmit}>
          {createQuiz.isPending ? 'Creating…' : 'Create quiz'}
        </Button>
      </div>

      {createQuiz.isError && (
        <p className="text-destructive text-sm">{(createQuiz.error as Error).message}</p>
      )}
    </div>
  )
}
