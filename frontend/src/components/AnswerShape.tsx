import type { AnswerOption } from '@/components/AnswerGrid'

const PATHS: Record<AnswerOption['shape'], React.ReactNode> = {
  triangle: <path d="M12 3 22 20H2Z" />,
  diamond: <path d="M12 2 22 12 12 22 2 12Z" />,
  circle: <circle cx="12" cy="12" r="10" />,
  square: <rect x="3" y="3" width="18" height="18" rx="2" />,
}

/**
 * The per-slot answer shape (Kahoot-style — see answerStyles.ts). Shapes
 * carry the answer identity alongside color, so the grid still reads for
 * color-blind players and on a washed-out projector. Decorative: the
 * option's text label is what assistive tech announces.
 */
export function AnswerShape({ shape, className }: { shape: AnswerOption['shape']; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      {PATHS[shape]}
    </svg>
  )
}
