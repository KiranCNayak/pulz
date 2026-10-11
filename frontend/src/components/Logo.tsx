import { AnswerShape } from '@/components/AnswerShape'
import { ANSWER_SLOT_STYLES } from '@/components/answerStyles'
import { cn } from '@/lib/utils'

/**
 * The Pulz mark: the four answer shapes in their slot colours on an ink
 * tile — the game's spectrum is the brand (DESIGN_SYSTEM.md §2). Ink in
 * both themes; on the dark theme and the stage it gets a hairline so the
 * tile still has an edge.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 grid-cols-2 place-items-center gap-[2px] rounded-[10px] bg-[#0e1118] p-[5px] ring-1 ring-white/10',
        className,
      )}
    >
      {ANSWER_SLOT_STYLES.map((slot) => (
        <AnswerShape key={slot.shape} shape={slot.shape} className="size-full" style={{ color: slot.color }} />
      ))}
    </span>
  )
}

export function Wordmark({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span translate="no" className={cn('inline-flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight', className)}>
      <BrandMark className={markClassName} />
      Pulz
    </span>
  )
}
