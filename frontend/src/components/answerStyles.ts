import type { AnswerOption } from '@/components/AnswerGrid'

/**
 * Kahoot-style fixed color/shape-per-slot palette. The backend's
 * `question:broadcast` payload only sends `{id, text}` per option (not
 * `shape`/`color` as DESIGN.md's event catalogue describes) — until that's
 * added server-side, slot index is used to assign a consistent
 * color/shape, which still works for the "look at the shape" shared-screen
 * gameplay since option order is already shuffled once per session, not
 * per client.
 *
 * Every color carries white label text at >= 3:1 (WCAG large-text; tile
 * labels are large and bold) — the gold was darkened from #d89e00 (2.4:1)
 * for that reason (Decision #61).
 */
export const ANSWER_SLOT_STYLES: Array<Pick<AnswerOption, 'color' | 'shape'>> = [
  { color: '#e21b3c', shape: 'triangle' },
  { color: '#1368ce', shape: 'diamond' },
  { color: '#b87a00', shape: 'circle' },
  { color: '#26890c', shape: 'square' },
]

export function toAnswerOptions(options: Array<{ id: string; text: string }>): AnswerOption[] {
  return options.map((option, index) => ({
    id: option.id,
    label: option.text,
    ...ANSWER_SLOT_STYLES[index % ANSWER_SLOT_STYLES.length],
  }))
}
