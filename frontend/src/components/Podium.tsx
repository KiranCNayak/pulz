export type PodiumEntry = {
  rank: number
  name: string
  score: number
}

type PodiumProps = {
  entries: PodiumEntry[]
}

const MEDAL_BY_RANK: Record<number, { label: string; className: string }> = {
  1: { label: '🥇', className: 'order-2 h-32 bg-amber-400/90' },
  2: { label: '🥈', className: 'order-1 h-24 bg-slate-300/90' },
  3: { label: '🥉', className: 'order-3 h-16 bg-orange-400/80' },
}

/**
 * Shared podium component (ARCHITECTURE.md §5, PRD §4.4) — used by the
 * Results view. Ties can put more than one entry at rank 1/2/3
 * (Decision #7's tie-breaking note), so this renders whatever entries
 * (up to 3 "slots") the caller passes rather than assuming exactly one
 * per rank.
 */
export function Podium({ entries }: PodiumProps) {
  return (
    <div className="flex items-end justify-center gap-4">
      {entries.map((entry) => {
        const medal = MEDAL_BY_RANK[entry.rank] ?? { label: `#${entry.rank}`, className: 'order-4 h-12 bg-muted' }
        return (
          <div
            key={`${entry.rank}-${entry.name}`}
            className={`flex w-28 flex-col items-center justify-end rounded-t-lg pb-2 text-center shadow-sm ${medal.className}`}
          >
            <div className="text-2xl">{medal.label}</div>
            <div className="mt-1 truncate px-1 font-semibold">{entry.name}</div>
            <div className="text-sm text-black/70">{entry.score} pts</div>
          </div>
        )
      })}
    </div>
  )
}
