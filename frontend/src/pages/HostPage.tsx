import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useGameSocket } from '@/hooks/useGameSocket'

type LobbyParticipant = { id: string; displayName: string }

type HostSnapshot = {
  sessionId: string
  joinCode: string
  status: 'LOBBY' | 'IN_PROGRESS' | 'ENDED'
  questionCount: number
  currentQuestionIndex: number
  participants: LobbyParticipant[]
}

type QuestionBroadcast = {
  questionId: string
  text: string
  mediaUrl?: string | null
  options: { id: string; text: string }[]
  timeLimitSeconds: number
  serverStartTime: number
  index: number
  total: number
}

type QuestionReveal = {
  questionId: string
  correctOptionId: string
  tally: Record<string, number>
}

type LeaderboardEntry = { participantId: string; displayName: string; score: number; rank: number }

type PromotionRequest = { participantId: string; displayName: string }

type QuestionPhase = 'ACTIVE' | 'LOCKED'

/**
 * Host controller: /host/:sessionId (DESIGN.md §6 "Controller"). Drives
 * the two-click-per-question flow from Decision #33: `host:lock_question`
 * locks + scores + reveals + shows the leaderboard as one step, then
 * `host:next_question` advances or ends the game.
 *
 * Auth note: `hostToken` is only ever returned once, by
 * `POST /quizzes/:id/sessions` (backend/src/routes/session.route.ts) — this
 * page has no way to look it up again. Until the Creator flow hands off
 * directly (e.g. `?token=`), it also accepts manual paste as a fallback.
 */
export function HostPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()
  const socket = useGameSocket(sessionId ?? '')

  const [hostToken, setHostToken] = useState(searchParams.get('token') ?? '')
  const [tokenDraft, setTokenDraft] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null)
  const [question, setQuestion] = useState<QuestionBroadcast | null>(null)
  const [phase, setPhase] = useState<QuestionPhase | null>(null)
  const [reveal, setReveal] = useState<QuestionReveal | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [promotionRequests, setPromotionRequests] = useState<PromotionRequest[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [resultsUrl, setResultsUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId || !hostToken) return

    socket.emit('host:auth', { sessionId, hostToken })

    const onAuthOk = (snap: HostSnapshot) => {
      setAuthError(null)
      setSnapshot(snap)
    }
    const onAuthError = (payload: { error: string }) => {
      setSnapshot(null)
      setAuthError(payload.error)
    }
    const onLobbyUpdate = (payload: { participants: LobbyParticipant[] }) => {
      setSnapshot((prev) => (prev ? { ...prev, participants: payload.participants } : prev))
    }
    const onQuestionBroadcast = (payload: QuestionBroadcast) => {
      setQuestion(payload)
      setPhase('ACTIVE')
      setReveal(null)
      setLeaderboard(null)
      setActionError(null)
      setSnapshot((prev) => (prev ? { ...prev, status: 'IN_PROGRESS', currentQuestionIndex: payload.index } : prev))
    }
    const onQuestionLocked = () => setPhase('LOCKED')
    const onQuestionReveal = (payload: QuestionReveal) => setReveal(payload)
    const onLeaderboardUpdate = (payload: { ranked: LeaderboardEntry[] }) => setLeaderboard(payload.ranked)
    const onPromotionIncoming = (payload: PromotionRequest) =>
      setPromotionRequests((prev) => [...prev, payload])
    const onGameEnded = (payload: { resultsUrl: string }) => {
      setResultsUrl(payload.resultsUrl)
      setSnapshot((prev) => (prev ? { ...prev, status: 'ENDED' } : prev))
    }
    const onHostError = (payload: { error: string }) => setActionError(payload.error)

    socket.on('host:auth_ok', onAuthOk)
    socket.on('host:auth_error', onAuthError)
    socket.on('session:lobby_update', onLobbyUpdate)
    socket.on('question:broadcast', onQuestionBroadcast)
    socket.on('question:locked', onQuestionLocked)
    socket.on('question:reveal', onQuestionReveal)
    socket.on('leaderboard:update', onLeaderboardUpdate)
    socket.on('promotion:incoming', onPromotionIncoming)
    socket.on('game:ended', onGameEnded)
    socket.on('host:error', onHostError)

    return () => {
      socket.off('host:auth_ok', onAuthOk)
      socket.off('host:auth_error', onAuthError)
      socket.off('session:lobby_update', onLobbyUpdate)
      socket.off('question:broadcast', onQuestionBroadcast)
      socket.off('question:locked', onQuestionLocked)
      socket.off('question:reveal', onQuestionReveal)
      socket.off('leaderboard:update', onLeaderboardUpdate)
      socket.off('promotion:incoming', onPromotionIncoming)
      socket.off('game:ended', onGameEnded)
      socket.off('host:error', onHostError)
    }
  }, [socket, sessionId, hostToken])

  if (!sessionId) return <div className="p-6">Missing session id.</div>

  if (!hostToken || authError) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <h1 className="mb-2 text-xl font-semibold">Host session {sessionId}</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Paste the host token from session creation to control this game.
        </p>
        {authError && <p className="mb-2 text-sm text-destructive">{authError}</p>}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-3 py-2"
            placeholder="Host token"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => {
              setAuthError(null)
              setHostToken(tokenDraft.trim())
            }}
            disabled={!tokenDraft.trim()}
          >
            Connect
          </Button>
        </div>
      </div>
    )
  }

  if (!snapshot) {
    return <div className="p-6">Connecting to session {sessionId}…</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Host Controller</h1>
          <p className="text-sm text-muted-foreground">
            Join code: <span className="font-mono text-lg font-bold">{snapshot.joinCode}</span>
          </p>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-sm">{snapshot.status}</span>
      </header>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {snapshot.status === 'LOBBY' && (
        <section className="space-y-3">
          <h2 className="font-medium">
            Lobby — {snapshot.participants.length} joined
          </h2>
          <ul className="list-inside list-disc text-sm">
            {snapshot.participants.map((p) => (
              <li key={p.id}>{p.displayName}</li>
            ))}
          </ul>
          <Button type="button" onClick={() => socket.emit('game:start')}>
            Start game
          </Button>
        </section>
      )}

      {snapshot.status === 'IN_PROGRESS' && question && (
        <section className="space-y-3">
          <h2 className="font-medium">
            Question {question.index + 1} of {question.total}
          </h2>
          <p>{question.text}</p>
          <ul className="space-y-1 text-sm">
            {question.options.map((o) => (
              <li
                key={o.id}
                className={reveal?.correctOptionId === o.id ? 'font-semibold text-green-700' : undefined}
              >
                {o.text}
                {reveal && ` — ${reveal.tally[o.id] ?? 0} answer(s)`}
              </li>
            ))}
          </ul>

          {phase === 'ACTIVE' && (
            <Button type="button" onClick={() => socket.emit('host:lock_question')}>
              Lock question
            </Button>
          )}
          {phase === 'LOCKED' && (
            <Button type="button" onClick={() => socket.emit('host:next_question')}>
              Next
            </Button>
          )}

          {leaderboard && (
            <div>
              <h3 className="mt-4 font-medium">Leaderboard</h3>
              <ol className="list-inside list-decimal text-sm">
                {leaderboard.map((entry) => (
                  <li key={entry.participantId}>
                    {entry.displayName} — {entry.score} pts
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {promotionRequests.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Spectator promotion requests</h2>
          {promotionRequests.map((req) => (
            <div key={req.participantId} className="flex items-center justify-between text-sm">
              <span>{req.displayName}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    socket.emit('promotion:decision', { participantId: req.participantId, approve: true })
                    setPromotionRequests((prev) => prev.filter((r) => r.participantId !== req.participantId))
                  }}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    socket.emit('promotion:decision', { participantId: req.participantId, approve: false })
                    setPromotionRequests((prev) => prev.filter((r) => r.participantId !== req.participantId))
                  }}
                >
                  Deny
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {snapshot.status === 'ENDED' && resultsUrl && (
        <section>
          <p>Game ended.</p>
          <Link className="text-blue-600 underline" to={resultsUrl}>
            View results
          </Link>
        </section>
      )}
    </div>
  )
}
