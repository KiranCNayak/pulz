import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  QUESTION_OPTIONS_MAX,
  QUESTION_OPTIONS_MIN,
  QUESTION_TIME_LIMIT_MAX_SECONDS,
  QUESTION_TIME_LIMIT_MIN_SECONDS,
} from '@/lib/quizConstants'
import type { QuestionInput } from '@/types/quiz'

type QuizQuestionFormProps = {
  index: number
  value: QuestionInput
  onChange: (value: QuestionInput) => void
  onRemove?: () => void
}

export function QuizQuestionForm({ index, value, onChange, onRemove }: QuizQuestionFormProps) {
  const clampTimeLimit = (seconds: number) =>
    Math.min(QUESTION_TIME_LIMIT_MAX_SECONDS, Math.max(QUESTION_TIME_LIMIT_MIN_SECONDS, seconds))

  const setOptionText = (optionIndex: number, text: string) => {
    const options = value.options.map((option, i) => (i === optionIndex ? { ...option, text } : option))
    onChange({ ...value, options })
  }

  const setCorrectOption = (optionIndex: number) => {
    const options = value.options.map((option, i) => ({ ...option, isCorrect: i === optionIndex }))
    onChange({ ...value, options })
  }

  const addOption = () => {
    if (value.options.length >= QUESTION_OPTIONS_MAX) return
    onChange({ ...value, options: [...value.options, { text: '', isCorrect: false }] })
  }

  const removeOption = (optionIndex: number) => {
    if (value.options.length <= QUESTION_OPTIONS_MIN) return
    onChange({ ...value, options: value.options.filter((_, i) => i !== optionIndex) })
  }

  const correctIndex = value.options.findIndex((option) => option.isCorrect)

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`question-${index}-text`}>Question {index + 1}</Label>
          <Input
            id={`question-${index}-text`}
            placeholder="What do you want to ask?"
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
          />
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-6 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove question"
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Label htmlFor={`question-${index}-time`} className="text-muted-foreground font-normal">
          Time limit
        </Label>
        <Input
          id={`question-${index}-time`}
          type="number"
          min={QUESTION_TIME_LIMIT_MIN_SECONDS}
          max={QUESTION_TIME_LIMIT_MAX_SECONDS}
          className="w-20"
          value={value.timeLimitSeconds ?? QUESTION_TIME_LIMIT_MIN_SECONDS}
          onChange={(e) => onChange({ ...value, timeLimitSeconds: clampTimeLimit(Number(e.target.value)) })}
        />
        <span className="text-sm text-muted-foreground">seconds</span>
      </div>

      <div className="mt-4 space-y-2">
        <RadioGroup
          value={correctIndex >= 0 ? correctIndex.toString() : undefined}
          onValueChange={(val) => setCorrectOption(Number(val))}
        >
          {value.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <RadioGroupItem
                value={optionIndex.toString()}
                aria-label={`Option ${optionIndex + 1} is correct`}
              />
              <Input
                className="flex-1"
                placeholder={`Option ${optionIndex + 1}`}
                value={option.text}
                onChange={(e) => setOptionText(optionIndex, e.target.value)}
              />
              {value.options.length > QUESTION_OPTIONS_MIN && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeOption(optionIndex)}
                  aria-label={`Remove option ${optionIndex + 1}`}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
        </RadioGroup>
        {value.options.length < QUESTION_OPTIONS_MAX && (
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus /> Add option
          </Button>
        )}
      </div>
    </div>
  )
}
