import { Crown } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import type { Avatar as AvatarValue } from '@/lib/avatars'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export type PodiumEntry = {
  rank: number
  name: string
  score: number
  avatar?: AvatarValue
  correctCount?: number
  answeredCount?: number
  /** This viewer won: their avatar dances (Decision #76). */
  celebrate?: boolean
}

type PodiumProps = {
  entries: PodiumEntry[]
}

/** Block colour follows the entry's actual rank (a tie for 2nd shows two
 * silvers); block height follows its visual place. */
const MEDAL_BY_RANK: Record<number, string> = {
  1: 'bg-medal-gold',
  2: 'bg-medal-silver',
  3: 'bg-medal-bronze',
}

// Visual slot by position in the ranked list, not by rank: the leader
// stands in the middle, the next on the left, the next on the right — so
// ties (e.g. two players sharing 2nd) still keep the winner centred.
const SLOT_ORDER = ['order-2', 'order-1', 'order-3']
const SLOT_HEIGHT = ['h-36 sm:h-40', 'h-24 sm:h-28', 'h-16 sm:h-20']
// The podium rises 3rd, then 2nd, then 1st.
const SLOT_DELAY = [360, 180, 0]

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
 * can't hold a 24-character name on a phone. Medals are numerals on
 * medal-coloured blocks, not emoji (DESIGN_SYSTEM.md §7).
 */
export function Podium({ entries }: PodiumProps) {
  const ranked = [...entries].sort((a, b) => a.rank - b.rank)

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4">
      {ranked.map((entry, index) => (
        <div
          key={`${entry.rank}-${entry.name}`}
          style={{ animationDelay: `${SLOT_DELAY[index] ?? 0}ms` }}
          className={cn(
            'flex max-w-40 min-w-0 flex-1 flex-col items-center gap-1 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-500 motion-safe:fill-mode-backwards',
            SLOT_ORDER[index] ?? 'order-4',
          )}
        >
          {entry.rank === 1 ? (
            <Crown aria-hidden="true" className="mb-1 size-7 text-[#c99a1e] dark:text-medal-gold" />
          ) : null}
          <Avatar
            avatar={entry.avatar}
            name={entry.name}
            dancing={entry.celebrate}
            className="mb-1 size-12 text-3xl"
          />
          <div className="w-full font-display text-lg leading-tight font-bold [overflow-wrap:anywhere]">{entry.name}</div>
          <div className="text-sm font-medium text-muted-foreground tabular-nums">{formatNumber(entry.score)} pts</div>
          {entry.answeredCount !== undefined ? (
            <div className="text-xs text-muted-foreground tabular-nums">
              {entry.correctCount} of {entry.answeredCount} correct
            </div>
          ) : null}
          <div
            className={cn(
              'mt-2 flex w-full justify-center rounded-t-2xl pt-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]',
              SLOT_HEIGHT[index] ?? 'h-12',
              MEDAL_BY_RANK[entry.rank] ?? 'bg-muted',
            )}
          >
            <span className="font-display text-3xl font-extrabold text-[#0e1118]/80 tabular-nums sm:text-4xl">
              <span className="sr-only">Rank </span>
              {entry.rank}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
