import { Button } from '@/components/ui/button'
import {
  QUESTION_OPTIONS_MAX,
  QUESTION_OPTIONS_MIN,
  QUESTION_TIME_LIMIT_MAX_SECONDS,
  QUESTION_TIME_LIMIT_MIN_SECONDS,
} from '@/lib/quizConstants'
import type { QuestionInput } from '@/types/quiz'

type QuizQuestionFormProps = {
  value: QuestionInput
  onChange: (value: QuestionInput) => void
  onRemove?: () => void
}

export function QuizQuestionForm({ value, onChange, onRemove }: QuizQuestionFormProps) {
  const clampTimeLimit = (seconds: number) =>
    Math.min(QUESTION_TIME_LIMIT_MAX_SECONDS, Math.max(QUESTION_TIME_LIMIT_MIN_SECONDS, seconds))

  const setOptionText = (index: number, text: string) => {
    const options = value.options.map((option, i) => (i === index ? { ...option, text } : option))
    onChange({ ...value, options })
  }

  const setCorrectOption = (index: number) => {
    const options = value.options.map((option, i) => ({ ...option, isCorrect: i === index }))
    onChange({ ...value, options })
  }

  const addOption = () => {
    if (value.options.length >= QUESTION_OPTIONS_MAX) return
    onChange({ ...value, options: [...value.options, { text: '', isCorrect: false }] })
  }

  const removeOption = (index: number) => {
    if (value.options.length <= QUESTION_OPTIONS_MIN) return
    onChange({ ...value, options: value.options.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="Question text"
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
        {onRemove && (
          <Button type="button" variant="outline" onClick={onRemove}>
            Remove question
          </Button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        Time limit (seconds)
        <input
          type="number"
          min={QUESTION_TIME_LIMIT_MIN_SECONDS}
          max={QUESTION_TIME_LIMIT_MAX_SECONDS}
          className="w-20 rounded border px-2 py-1"
          value={value.timeLimitSeconds ?? QUESTION_TIME_LIMIT_MIN_SECONDS}
          onChange={(e) =>
            onChange({ ...value, timeLimitSeconds: clampTimeLimit(Number(e.target.value)) })
          }
        />
      </label>

      <div className="space-y-2">
        {value.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-option-${value.text}`}
              checked={option.isCorrect}
              onChange={() => setCorrectOption(index)}
              aria-label={`Option ${index + 1} is correct`}
            />
            <input
              className="flex-1 rounded border px-3 py-2"
              placeholder={`Option ${index + 1}`}
              value={option.text}
              onChange={(e) => setOptionText(index, e.target.value)}
            />
            {value.options.length > QUESTION_OPTIONS_MIN && (
              <Button type="button" variant="outline" size="sm" onClick={() => removeOption(index)}>
                Remove
              </Button>
            )}
          </div>
        ))}
        {value.options.length < QUESTION_OPTIONS_MAX && (
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            Add option
          </Button>
        )}
      </div>
    </div>
  )
}
