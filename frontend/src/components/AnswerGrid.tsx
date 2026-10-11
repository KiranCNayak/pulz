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
  /** Big centered shape only; the label becomes screen-reader text. For
   * the player's phone, where the room reads the answers off the Display
   * and just needs to hit the matching shape fast (Decision #62). */
  shapeOnly?: boolean
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
 *
 * Layout is decided by option count alone — 2 options stack top/bottom,
 * 3-4 fill a 2x2 grid in slot order — and is the same on Display, Host and
 * Play, so a player's phone is a spatial mirror of the projector: the tile
 * top-left on the big screen is top-left in their hand.
 */
export function AnswerGrid({
  options,
  onSelect,
  disabled,
  selectedOptionId,
  reveal,
  size = 'default',
  shapeOnly = false,
  className,
  tileClassName: extraTileClassName,
}: AnswerGridProps) {
  const large = size === 'large'

  return (
    <div
      className={cn(
        'grid',
        options.length <= 2 ? 'grid-cols-1' : 'grid-cols-2',
        large ? 'gap-5' : 'gap-3 sm:gap-4',
        className,
      )}
    >
      {options.map((option) => {
        const isCorrect = reveal?.correctOptionId === option.id
        const isSelected = selectedOptionId === option.id
        const emphasized = reveal ? isCorrect : isSelected
        const receding = reveal ? !isCorrect : Boolean(selectedOptionId) && !isSelected
        const count = reveal?.tally ? (reveal.tally[option.id] ?? 0) : null
        const compact = !large && !shapeOnly

        const tileClassName = cn(
          'relative flex items-center rounded-2xl font-display font-bold text-white',
          shapeOnly ? 'justify-center' : 'text-left',
          // Darker bottom edge that compresses on press + a thin inner top
          // highlight: the tile reads as a physical button (DESIGN_SYSTEM.md §4).
          'shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_6px_0_rgb(0_0_0/0.3)] transition-[transform,filter,box-shadow,opacity] duration-200 ease-out-expo',
          large ? 'min-h-32 gap-5 px-7 text-3xl' : 'min-h-24 gap-3 px-4 text-lg sm:min-h-28 sm:text-xl',
          // Phone-width labelled tiles (Host, the home preview): two columns of
          // ~140px can't fit shape + label + check + tally on one line, which
          // left the label ~0px wide (one letter per line). Below sm the label
          // gets its own full-width line instead; the 2x2 mirror layout
          // (Decision #62) is unchanged.
          compact && 'max-sm:flex-wrap max-sm:content-center max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:px-3 max-sm:py-3 max-sm:text-base',
          onSelect &&
            !disabled &&
            'cursor-pointer hover:-translate-y-0.5 hover:brightness-110 active:translate-y-1 active:shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_2px_0_rgb(0_0_0/0.3)]',
          'outline-none focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white',
          emphasized && 'z-10 scale-[1.03] ring-4 ring-white',
          // Darken + desaturate rather than fade: a faded tile turns pastel
          // on the light-theme Host page and its white label washes out.
          receding && 'brightness-[.5] saturate-[.3]',
          disabled && !emphasized && !receding && 'opacity-60',
          extraTileClassName,
        )

        const content = (
          <>
            <AnswerShape
              shape={option.shape}
              className={cn(
                'shrink-0 drop-shadow-sm',
                shapeOnly ? 'size-20 sm:size-24' : large ? 'size-12' : 'size-6 sm:size-9',
              )}
            />
            <span
              className={cn(
                shapeOnly ? 'sr-only' : 'min-w-0 flex-1 [overflow-wrap:anywhere]',
                compact && 'max-sm:order-last max-sm:basis-full',
              )}
            >
              {option.label}
            </span>
            {/* `contents` keeps check + tally as direct flex items from sm up;
                below sm (compact tiles) they group at the line's right end. */}
            <span className={cn('contents', compact && 'max-sm:ml-auto max-sm:flex max-sm:items-center max-sm:gap-2')}>
            {isCorrect ? (
              <Check
                aria-hidden="true"
                strokeWidth={3.5}
                className={cn(large ? 'size-10' : 'size-7', compact && 'max-sm:size-5', shapeOnly && 'absolute top-3 right-3')}
              />
            ) : null}
            {count !== null ? (
              <span
                className={cn(
                  'shrink-0 rounded-full bg-black/30 font-sans tabular-nums',
                  large ? 'px-4 py-1 text-2xl' : 'px-2.5 py-0.5 text-base',
                )}
              >
                <span className="sr-only">Answers: </span>
                {count}
              </span>
            ) : null}
            </span>
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
