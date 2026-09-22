import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AnswerGrid } from '@/components/AnswerGrid'
import { toAnswerOptions } from '@/components/answerStyles'
import { useGameSocket } from '@/hooks/useGameSocket'

type AuthStatus = 'connecting' | 'ok' | 'error'

type QuestionBroadcast = {
  questionId: string
  text: string
  mediaUrl?: string | null
  options: Array<{ id: string; text: string }>
  timeLimitSeconds: number
  serverStartTime: number
  index: number
  total: number
}

type RevealPayload = {
  questionId: string
  correctOptionId: string
  tally: Record<string, number>
}

type LeaderboardEntry = {
  participantId: string
  displayName: string
  score: number
  rank: number
}

type QuestionPhase = 'active' | 'locked'

/**
 * Display/cast view: /display/:sessionId?token=<displayToken>.
 * Read-only — safe to project publicly (ARCHITECTURE.md §5). No click
 * handlers, no host controls; just a large-format subscriber to the same
 * event stream the Host Controller drives.
 */
export function DisplayPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()
  const displayToken = searchParams.get('token')
  const socket = useGameSocket(sessionId ?? '')

  const hasParams = Boolean(sessionId && displayToken)

  const [authStatus, setAuthStatus] = useState<AuthStatus>('connecting')
  const [authError, setAuthError] = useState<string | null>(null)
  const [question, setQuestion] = useState<QuestionBroadcast | null>(null)
  const [phase, setPhase] = useState<QuestionPhase>('active')
  const [reveal, setReveal] = useState<RevealPayload | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    if (!hasParams) return

    function handleAuthOk() {
      setAuthStatus('ok')
    }
    function handleAuthError(payload: { error?: string }) {
      setAuthStatus('error')
      setAuthError(payload?.error ?? 'Failed to authenticate as display')
    }
    function handleQuestion(payload: QuestionBroadcast) {
      setQuestion(payload)
      setPhase('active')
      setReveal(null)
    }
    function handleLocked() {
      setPhase('locked')
    }
    function handleReveal(payload: RevealPayload) {
      setReveal(payload)
    }
    function handleLeaderboard(payload: { ranked: LeaderboardEntry[] }) {
      setLeaderboard(payload.ranked)
    }
    function handleGameEnded() {
      setEnded(true)
    }

    socket.on('display:auth_ok', handleAuthOk)
    socket.on('display:auth_error', handleAuthError)
    socket.on('question:broadcast', handleQuestion)
    socket.on('question:locked', handleLocked)
    socket.on('question:reveal', handleReveal)
    socket.on('leaderboard:update', handleLeaderboard)
    socket.on('game:ended', handleGameEnded)

    socket.emit('display:auth', { sessionId, displayToken })

    return () => {
      socket.off('display:auth_ok', handleAuthOk)
      socket.off('display:auth_error', handleAuthError)
      socket.off('question:broadcast', handleQuestion)
      socket.off('question:locked', handleLocked)
      socket.off('question:reveal', handleReveal)
      socket.off('leaderboard:update', handleLeaderboard)
      socket.off('game:ended', handleGameEnded)
    }
  }, [socket, sessionId, displayToken, hasParams])

  if (!hasParams) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 p-8 text-center text-2xl text-white">
        Missing session id or display token in the URL
      </div>
    )
  }

  if (authStatus === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 p-8 text-center text-2xl text-white">
        {authError}
      </div>
    )
  }

  if (authStatus === 'connecting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 text-2xl text-white">
        Connecting…
      </div>
    )
  }

  if (ended) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-900 p-8 text-white">
        <h1 className="text-5xl font-bold">Game over!</h1>
        {leaderboard && <FinalLeaderboard entries={leaderboard} />}
      </div>
    )
  }

  if (leaderboard && (!question || phase === 'locked')) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-900 p-8 text-white">
        <h1 className="text-5xl font-bold">Leaderboard</h1>
        <FinalLeaderboard entries={leaderboard} />
      </div>
    )
  }

  if (!question) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 text-2xl text-white">
        Waiting for the host to start the game…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-neutral-900 p-8 text-white">
      <div className="text-lg text-neutral-400">
        Question {question.index + 1} of {question.total}
      </div>
      <h1 className="max-w-4xl text-center text-4xl font-bold">{question.text}</h1>
      {question.mediaUrl && (
        <img src={question.mediaUrl} alt="" className="max-h-64 rounded-lg object-contain" />
      )}
      <div className="w-full max-w-3xl text-2xl">
        <AnswerGrid
          options={toAnswerOptions(question.options)}
          disabled
        />
      </div>
      {reveal && (
        <div className="text-3xl font-semibold text-emerald-400">
          Correct answer revealed — {reveal.tally[reveal.correctOptionId] ?? 0} player(s) got it right
        </div>
      )}
    </div>
  )
}

function FinalLeaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <ol className="w-full max-w-xl space-y-2 text-2xl">
      {entries.map((entry) => (
        <li key={entry.participantId} className="flex justify-between rounded-lg bg-neutral-800 px-6 py-3">
          <span>
            #{entry.rank} {entry.displayName}
          </span>
          <span className="font-mono">{entry.score} pts</span>
        </li>
      ))}
    </ol>
  )
}
