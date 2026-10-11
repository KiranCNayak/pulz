import { Check, CircleAlert, ImagePlus, LoaderCircle, Plus, Timer, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { QUESTION_IMAGE_TYPES, questionImageUrl, uploadQuestionImage } from '@/lib/images'
import { cn } from '@/lib/utils'
import type { QuestionInput } from '@/types/quiz'

type QuizQuestionFormProps = {
  index: number
  value: QuestionInput
  onChange: (value: QuestionInput) => void
  onRemove?: () => void
  /** Rendered under the options (the Edit page's Save/Delete row). */
  footer?: React.ReactNode
}

// Options get neutral letters, not answer-tile colours: option order is
// shuffled once per session (answerStyles.ts), so the colour shown here
// wouldn't match the tile players see.
const OPTION_LETTERS = ['A', 'B', 'C', 'D']

export function QuizQuestionForm({ index, value, onChange, onRemove, footer }: QuizQuestionFormProps) {
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
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-2">
            <Label htmlFor={`question-${index}-text`}>Question {index + 1}</Label>
            <Input
              id={`question-${index}-text`}
              name={`question-${index}-text`}
              autoComplete="off"
              placeholder="What do you want to ask?"
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              className="h-12 font-display text-lg font-semibold md:text-lg"
            />
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Label htmlFor={`question-${index}-time`} className="font-medium text-muted-foreground">
              <Timer aria-hidden="true" className="size-3.5" />
              Time limit
            </Label>
            <div className="relative">
              <Input
                id={`question-${index}-time`}
                name={`question-${index}-time`}
                type="number"
                inputMode="numeric"
                min={QUESTION_TIME_LIMIT_MIN_SECONDS}
                max={QUESTION_TIME_LIMIT_MAX_SECONDS}
                className="h-12 w-24 pr-8 tabular-nums"
                value={value.timeLimitSeconds ?? QUESTION_TIME_LIMIT_MIN_SECONDS}
                onChange={(e) => onChange({ ...value, timeLimitSeconds: clampTimeLimit(Number(e.target.value)) })}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                s
              </span>
            </div>
          </div>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mb-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={onRemove}
              aria-label="Remove question"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>

        <QuestionImageField
          index={index}
          imageId={value.imageId ?? null}
          onChange={(imageId) => onChange({ ...value, imageId })}
        />

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-semibold">
            Answers <span className="font-normal text-muted-foreground">· select the correct one</span>
          </legend>
          <RadioGroup
            value={correctIndex >= 0 ? correctIndex.toString() : undefined}
            onValueChange={(val) => setCorrectOption(Number(val))}
            className="gap-2.5"
          >
            {value.options.map((option, optionIndex) => {
              const isCorrect = optionIndex === correctIndex
              return (
                <div
                  key={optionIndex}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border py-1.5 pr-1.5 pl-3.5 transition-[background-color,border-color] duration-150',
                    isCorrect ? 'border-stage-correct/45 bg-stage-correct/[0.06]' : 'border-transparent bg-muted/60',
                  )}
                >
                  <RadioGroupItem value={optionIndex.toString()} aria-label={`Option ${optionIndex + 1} is correct`} />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-md font-display text-sm font-bold',
                      isCorrect ? 'bg-stage-correct text-white' : 'bg-card text-muted-foreground ring-1 ring-border',
                    )}
                  >
                    {isCorrect ? <Check strokeWidth={3} className="size-4" /> : OPTION_LETTERS[optionIndex]}
                  </span>
                  <Input
                    className="h-10 flex-1 border-transparent bg-card shadow-none dark:bg-white/[0.04]"
                    name={`question-${index}-option-${optionIndex}`}
                    autoComplete="off"
                    placeholder={`Option ${optionIndex + 1}`}
                    value={option.text}
                    onChange={(e) => setOptionText(optionIndex, e.target.value)}
                  />
                  {value.options.length > QUESTION_OPTIONS_MIN && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeOption(optionIndex)}
                      aria-label={`Remove option ${optionIndex + 1}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )
            })}
          </RadioGroup>
          {value.options.length < QUESTION_OPTIONS_MAX && (
            <Button type="button" variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={addOption}>
              <Plus aria-hidden="true" /> Add option
            </Button>
          )}
        </fieldset>
      </div>
      {footer ? <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3 sm:px-6">{footer}</div> : null}
    </section>
  )
}

/**
 * One optional image per question (Decision #75), shown with the question
 * on the Display and Host screens. Uploads as soon as it's picked, so the
 * question only ever holds an image id; images as answers are not offered
 * (left for a later version).
 */
function QuestionImageField({
  index,
  imageId,
  onChange,
}: {
  index: number
  imageId: string | null
  onChange: (imageId: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hintId = `question-${index}-image-hint`

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      onChange(await uploadQuestionImage(file))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = '' // picking the same file again still fires
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        id={`question-${index}-image`}
        type="file"
        accept={QUESTION_IMAGE_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-describedby={hintId}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {imageId ? (
        <div className="flex flex-wrap items-end gap-3">
          <img
            src={questionImageUrl(imageId)}
            alt={`Image for question ${index + 1}`}
            className="max-h-40 max-w-full rounded-xl bg-muted object-contain ring-1 ring-border"
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <ImagePlus aria-hidden="true" />}
              {uploading ? 'Uploading…' : 'Replace image'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={uploading}
              onClick={() => onChange(null)}
            >
              <Trash2 aria-hidden="true" /> Remove image
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start border-dashed"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <ImagePlus aria-hidden="true" />}
          {uploading ? 'Uploading…' : 'Add image'}
        </Button>
      )}
      <p id={hintId} className="text-xs text-muted-foreground">
        Optional. One image, up to 5 MB: JPEG, PNG, WebP or GIF.
      </p>
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
