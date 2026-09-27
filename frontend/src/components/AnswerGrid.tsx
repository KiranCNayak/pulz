import { Check } from 'lucide-react'
import { AnswerShape } from '@/components/AnswerShape'
import { cn } from '@/lib/utils'

export type AnswerOption = {
  id: string
  label: string
  color: string
  shape: 'circle' | 'triangle' | 'square' | 'diamond'
}

type AnswerGridProps = {
  options: AnswerOption[]
  /** Makes the tiles buttons (Play). Omit for a read-only grid (Display, Host). */
  onSelect?: (optionId: string) => void
  disabled?: boolean
  /** The player's own pick — stays prominent while the other tiles recede. */
  selectedOptionId?: string | null
  /** After lock: marks the correct tile and recedes the rest; `tally` adds
   * each option's answer count. */
  reveal?: { correctOptionId: string; tally?: Record<string, number> }
  /** `large` for the projector-facing Display. */
  size?: 'default' | 'large'
  /** Shape above a centered label — for tall tiles (Play fills the phone
   * screen with them), where a left-aligned row floats in empty space. */
  stacked?: boolean
  className?: string
  /** Extra classes for every tile (e.g. viewport-scaled sizing on the
   * projector), so callers don't have to reach into the grid's DOM. */
  tileClassName?: string
}

/**
 * Shared color/shape answer grid (ARCHITECTURE.md §5) — Play answers on it,
 * Display and Host show it read-only. Tile colors are the fixed Kahoot-style
 * slot palette (answerStyles.ts), independent of the app theme, so label
 * text is always white.
 */
export function AnswerGrid({
  options,
  onSelect,
  disabled,
  selectedOptionId,
  reveal,
  size = 'default',
  stacked = false,
  className,
  tileClassName: extraTileClassName,
}: AnswerGridProps) {
  const large = size === 'large'

  return (
    <div className={cn('grid grid-cols-2', large ? 'gap-5' : 'gap-3 sm:gap-4', className)}>
      {options.map((option) => {
        const isCorrect = reveal?.correctOptionId === option.id
        const isSelected = selectedOptionId === option.id
        const emphasized = reveal ? isCorrect : isSelected
        const receding = reveal ? !isCorrect : Boolean(selectedOptionId) && !isSelected
        const count = reveal?.tally ? (reveal.tally[option.id] ?? 0) : null

        const tileClassName = cn(
          'relative flex items-center rounded-2xl font-bold text-white',
          stacked ? 'flex-col justify-center text-center' : 'text-left',
          'shadow-[0_6px_0_rgb(0_0_0/0.28)] transition-[transform,opacity,filter,box-shadow] duration-200',
          large ? 'min-h-32 gap-5 px-7 text-3xl' : 'min-h-24 gap-3 px-4 text-lg sm:min-h-28 sm:text-xl',
          onSelect &&
            !disabled &&
            'cursor-pointer hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_2px_0_rgb(0_0_0/0.28)]',
          'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white',
          emphasized && 'z-10 scale-[1.03] ring-4 ring-white',
          // Darken + desaturate rather than fade: a faded tile turns pastel
          // on the light-theme Host page and its white label washes out.
          receding && 'brightness-[.55] saturate-[.35]',
          disabled && !emphasized && !receding && 'opacity-60',
          extraTileClassName,
        )

        const content = (
          <>
            <AnswerShape
              shape={option.shape}
              className={cn('shrink-0 drop-shadow-sm', large || stacked ? 'size-12' : 'size-7 sm:size-9')}
            />
            <span className={cn('min-w-0 [overflow-wrap:anywhere]', !stacked && 'flex-1')}>{option.label}</span>
            {isCorrect ? (
              <Check
                aria-hidden="true"
                strokeWidth={3.5}
                className={cn(large ? 'size-10' : 'size-7', stacked && 'absolute top-3 right-3')}
              />
            ) : null}
            {count !== null ? (
              <span
                className={cn(
                  'shrink-0 rounded-full bg-black/25 tabular-nums',
                  large ? 'px-4 py-1 text-2xl' : 'px-2.5 py-0.5 text-base',
                )}
              >
                <span className="sr-only">Answers: </span>
                {count}
              </span>
            ) : null}
          </>
        )

        return onSelect ? (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.id)}
            className={tileClassName}
            style={{ backgroundColor: option.color }}
          >
            {content}
          </button>
        ) : (
          <div key={option.id} className={tileClassName} style={{ backgroundColor: option.color }}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
