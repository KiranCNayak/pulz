import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Podium } from '@/components/Podium'
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

  if (isPending) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading results…</div>
    )
  }

  if (isError) {
    const expired = error instanceof ResultsNotFoundError
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">
          {expired ? 'Results no longer available' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {expired
            ? "This session's results have expired or don't exist."
            : 'Could not load results. Please try again later.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-center text-3xl font-bold">Final Results</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        {data.totalParticipants} participant{data.totalParticipants === 1 ? '' : 's'}
      </p>

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
        <table className="mt-10 w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="py-2">Rank</th>
              <th className="py-2">Name</th>
              <th className="py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.ranks.map((entry) => (
              <tr key={entry.participantId} className="border-b last:border-0">
                <td className="py-2">#{entry.rank}</td>
                <td className="py-2">{entry.displayName}</td>
                <td className="py-2 text-right">{entry.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
