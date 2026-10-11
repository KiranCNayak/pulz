import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CircleAlert, Hourglass, LoaderCircle, Share2, Trophy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { Confetti } from '@/components/Confetti'
import { Podium } from '@/components/Podium'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getParticipantId } from '@/hooks/useGameSocket'
import { formatNumber } from '@/lib/format'
import { fetchResults, ResultsNotFoundError, type ResultsResponse } from '@/lib/resultsApi'
import { shareResultsImage, type ShareOutcome } from '@/lib/resultsImage'

const PAGE_SIZE = 10

// Post-game results/podium page: /results/:sessionId (PRD §4.4, §6).
export function ResultsPage() {
  useDocumentTitle('Final results')
  const { sessionId } = useParams<{ sessionId: string }>()
  const [page, setPage] = useState(1)
  const [myParticipantId] = useState(getParticipantId)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['results', sessionId, page],
    queryFn: () => fetchResults(sessionId!, page, PAGE_SIZE),
    enabled: Boolean(sessionId),
  })

  let content: ReactNode

  if (isPending) {
    content = (
      <div aria-busy="true" aria-label="Loading results" className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-16">
        <div className="h-12 w-64 rounded-lg bg-muted motion-safe:animate-pulse" />
        <div className="flex w-full max-w-md items-end justify-center gap-3">
          <div className="h-28 flex-1 rounded-t-2xl bg-muted motion-safe:animate-pulse" />
          <div className="h-40 flex-1 rounded-t-2xl bg-muted motion-safe:animate-pulse" />
          <div className="h-20 flex-1 rounded-t-2xl bg-muted motion-safe:animate-pulse" />
        </div>
      </div>
    )
  } else if (isError) {
    const expired = error instanceof ResultsNotFoundError
    const Icon = expired ? Hourglass : CircleAlert
    content = (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {expired ? 'Results no longer available' : 'Something went wrong'}
        </h1>
        <p className="text-muted-foreground">
          {expired
            ? "This session's results have expired or don't exist. Hosts choose how long results are kept."
            : 'Could not load results. Check your connection and reload the page.'}
        </p>
        <Button variant="outline" className="mt-2" render={<Link to="/" />}>
          Back to Pulz
        </Button>
      </div>
    )
  } else {
    // Ties share 1st, so more than one phone can be celebrating.
    const iWon = data.podium.some((entry) => entry.rank === 1 && entry.participantId === myParticipantId)
    content = (
      <div className="mx-auto max-w-2xl px-4 pt-12 pb-16 sm:px-6">
        {iWon ? <Confetti /> : null}
        <div className="flex flex-col items-center gap-2 text-center">
          {iWon ? (
            <span className="mb-2 grid size-24 place-items-center rounded-full bg-medal-gold text-[#0e1118] shadow-[inset_0_2px_0_rgb(255_255_255/0.5)] motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500">
              <Trophy aria-hidden="true" className="size-12" />
            </span>
          ) : (
            <span className="grid size-12 place-items-center rounded-2xl bg-medal-gold/25 text-[#9a7212] dark:text-medal-gold">
              <Trophy aria-hidden="true" className="size-6" />
            </span>
          )}
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            {iWon ? 'You won!' : 'Final results'}
          </h1>
          <p className="text-muted-foreground">
            {data.quizTitle ? (
              <>
                <span className="font-medium text-foreground">{data.quizTitle}</span>
                {' · '}
              </>
            ) : null}
            {data.totalParticipants} participant{data.totalParticipants === 1 ? '' : 's'}
          </p>
          <ShareResultsButton results={data} />
        </div>

        <div className="mt-10">
          <Podium
            entries={data.podium.map((entry) => ({
              rank: entry.rank,
              name: entry.displayName,
              score: entry.score,
              avatar: entry.avatar,
              correctCount: entry.correctCount,
              answeredCount: entry.answeredCount,
              celebrate: entry.rank === 1 && entry.participantId === myParticipantId,
            }))}
          />
        </div>

        {data.ranks.length > 0 && (
          <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="w-14 px-3 py-3 sm:w-20 sm:px-5 font-semibold">Rank</th>
                  <th scope="col" className="px-3 py-3 sm:px-5 font-semibold">Name</th>
                  <th scope="col" className="w-px px-3 py-3 text-right font-semibold whitespace-nowrap sm:px-5">Correct</th>
                  <th scope="col" className="w-px px-3 py-3 text-right font-semibold sm:px-5">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.ranks.map((entry) => (
                  <tr key={entry.participantId} className="transition-colors duration-150 hover:bg-muted/50">
                    <td className="px-3 py-3.5 sm:px-5 font-medium text-muted-foreground tabular-nums">#{entry.rank}</td>
                    <td className="max-w-0 px-3 py-3.5 sm:px-5 font-semibold">
                      <span className="flex items-center gap-2.5">
                        <Avatar avatar={entry.avatar} name={entry.displayName} className="size-7 text-base" />
                        <span className="min-w-0 truncate">{entry.displayName}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3.5 sm:px-5 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                      {entry.answeredCount !== undefined ? `${entry.correctCount} of ${entry.answeredCount}` : null}
                    </td>
                    <td className="px-3 py-3.5 sm:px-5 text-right font-display font-bold tabular-nums">{formatNumber(entry.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.totalPages > 1 && (
          <nav aria-label="Results pages" className="mt-5 flex items-center justify-center gap-4">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              Page {data.page} of {data.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        )}
      </div>
    )
  }

  return <AppShell>{content}</AppShell>
}

/** "Share results" (Decision #78): the podium as an image for WhatsApp
 * and the like, via the share sheet where the browser offers one, or as a
 * download. */
function ShareResultsButton({ results }: { results: ResultsResponse }) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const share = async () => {
    setBusy(true)
    setError(null)
    setOutcome(null)
    try {
      setOutcome(await shareResultsImage(results))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={share}>
        {busy ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <Share2 aria-hidden="true" />}
        {busy ? 'Making image…' : 'Share results'}
      </Button>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {error ? (
          <span role="alert" className="font-medium text-destructive">
            {error}
          </span>
        ) : outcome === 'downloaded' ? (
          'Image saved. Post it wherever you like.'
        ) : null}
      </p>
    </div>
  )
}
