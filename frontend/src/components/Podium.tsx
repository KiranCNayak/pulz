export type PodiumEntry = {
  rank: number
  name: string
  score: number
}

type PodiumProps = {
  entries: PodiumEntry[]
}

const MEDAL_BY_RANK: Record<number, { label: string; blockClassName: string }> = {
  1: { label: '🥇', blockClassName: 'h-28 bg-amber-400/90' },
  2: { label: '🥈', blockClassName: 'h-20 bg-slate-300/90' },
  3: { label: '🥉', blockClassName: 'h-14 bg-orange-400/80' },
}

// Visual slot by position in the ranked list, not by rank: the leader
// stands in the middle, the next on the left, the next on the right — so
// ties (e.g. two players sharing 2nd) still keep the winner centred.
const SLOT_ORDER = ['order-2', 'order-1', 'order-3']

/**
 * Shared podium component (ARCHITECTURE.md §5, PRD §4.4) — used by the
 * Results view. Ties can put more than one entry at rank 1/2/3
 * (Decision #7's tie-breaking note), so this renders whatever entries
 * (up to 3 "slots") the caller passes rather than assuming exactly one
 * per rank.
 *
 * Name and score sit above each medal block, in the theme's own text
 * colors, and wrap rather than truncate — this is the only place the top
 * three are listed (the table below starts at 4th), and a fixed-size block
 * can't hold a 24-character name on a phone.
 */
export function Podium({ entries }: PodiumProps) {
  const ranked = [...entries].sort((a, b) => a.rank - b.rank)

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4">
      {ranked.map((entry, index) => {
        const medal = MEDAL_BY_RANK[entry.rank] ?? { label: `#${entry.rank}`, blockClassName: 'h-10 bg-muted' }
        return (
          <div
            key={`${entry.rank}-${entry.name}`}
            className={`flex max-w-32 min-w-0 flex-1 flex-col items-center gap-1 text-center ${SLOT_ORDER[index] ?? 'order-4'}`}
          >
            <div className="w-full leading-tight font-semibold [overflow-wrap:anywhere]">{entry.name}</div>
            <div className="text-sm text-muted-foreground">{entry.score} pts</div>
            <div
              className={`mt-1 flex w-full justify-center rounded-t-lg pt-2 text-2xl shadow-sm ${medal.blockClassName}`}
            >
              {medal.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
