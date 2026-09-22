export type AnswerOption = {
  id: string
  label: string
  color: string
  shape: 'circle' | 'triangle' | 'square' | 'diamond'
}

type AnswerGridProps = {
  options: AnswerOption[]
  onSelect?: (optionId: string) => void
  disabled?: boolean
}

/**
 * Shared color/shape answer grid (ARCHITECTURE.md §5) — used by the Play
 * view (answering) and the Display view (showing options read-only).
 * Styling/shape rendering is a placeholder; feature agents build on this.
 */
export function AnswerGrid({ options, onSelect, disabled }: AnswerGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect?.(option.id)}
          className="rounded-lg p-6 font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: option.color }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
