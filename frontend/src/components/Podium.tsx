export type PodiumEntry = {
  rank: 1 | 2 | 3
  name: string
  score: number
}

type PodiumProps = {
  entries: PodiumEntry[]
}

/**
 * Shared podium/confetti component (ARCHITECTURE.md §5, PRD §4.4) — used
 * by the Results view. Confetti/animation is not implemented yet.
 */
export function Podium({ entries }: PodiumProps) {
  return (
    <div className="flex items-end justify-center gap-4">
      {entries.map((entry) => (
        <div key={entry.rank} className="text-center">
          <div className="font-bold">#{entry.rank}</div>
          <div>{entry.name}</div>
          <div>{entry.score} pts</div>
        </div>
      ))}
    </div>
  )
}
