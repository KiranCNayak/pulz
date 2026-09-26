import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Podium } from '@/components/Podium'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { fetchResults, ResultsNotFoundError } from '@/lib/resultsApi'

const PAGE_SIZE = 10

// Post-game results/podium page: /results/:sessionId (PRD §4.4, §6).
export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [page, setPage] = useState(1)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['results', sessionId, page],
    queryFn: () => fetchResults(sessionId!, page, PAGE_SIZE),
    enabled: Boolean(sessionId),
  })

  let content: ReactNode

  if (isPending) {
    content = <div className="p-8 text-center text-muted-foreground">Loading results…</div>
  } else if (isError) {
    const expired = error instanceof ResultsNotFoundError
    content = (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {expired ? 'Results no longer available' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {expired
            ? "This session's results have expired or don't exist."
            : 'Could not load results. Please try again later.'}
        </p>
      </div>
    )
  } else {
    content = (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="space-y-1.5 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Final results</h1>
          <p className="text-muted-foreground">
            {data.totalParticipants} participant{data.totalParticipants === 1 ? '' : 's'}
          </p>
        </div>

        <div className="mt-8">
          <Podium
            entries={data.podium.map((entry) => ({
              rank: entry.rank,
              name: entry.displayName,
              score: entry.score,
            }))}
          />
        </div>

        {data.ranks.length > 0 && (
          <div className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.ranks.map((entry) => (
                  <tr
                    key={entry.participantId}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">#{entry.rank}</td>
                    <td className="px-4 py-3">{entry.displayName}</td>
                    <td className="px-4 py-3 text-right">{entry.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-4">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {data.page} of {data.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      {content}
    </div>
  )
}
