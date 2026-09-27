import { Check, CircleCheck, Clock, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnswerGrid } from '@/components/AnswerGrid'
import { AnswerShape } from '@/components/AnswerShape'
import { ANSWER_SLOT_STYLES, toAnswerOptions } from '@/components/answerStyles'
import { Countdown } from '@/components/Countdown'
import { GameStage } from '@/components/GameStage'
import { Button } from '@/components/ui/button'
import { getParticipantToken, setParticipantToken, useGameSocket } from '@/hooks/useGameSocket'
import { questionDeadline } from '@/lib/questionTimer'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'

type BackendOption = { id: string; text: string }

type QuestionBroadcast = {
  questionId: string
  text: string
  mediaUrl?: string | null
  options: BackendOption[]
  timeLimitSeconds: number
  serverStartTime: number
  index: number
  total: number
}

type QuestionReveal = { questionId: string; correctOptionId: string; tally: Record<string, number> }
type AnswerResult = { isCorrect: boolean; pointsEarned: number; myRank: number; totalPlayers: number }

// Mirrors backend gameLoop.service.ts's buildResumeSnapshot — what a
// reconnecting client needs to jump straight to the right screen instead
// of the lobby (ARCHITECTURE.md §6).
type ResumeState = {
  status: 'LOBBY' | 'IN_PROGRESS' | 'ENDED'
  question: (QuestionBroadcast & { phase: 'ACTIVE' | 'LOCKED' }) | null
  answeredOptionId?: string | null
  reveal?: QuestionReveal
  result?: AnswerResult | null
  resultsUrl?: string
}

type JoinAcceptedPayload = {
  participantId: string
  participantToken: string
  role: 'PLAYER' | 'SPECTATOR'
  resumed?: boolean
  state?: ResumeState
}
type JoinErrorPayload = { error: string }
type PromotionResult = { approved: boolean }
type GameEnded = { resultsUrl: string }
type AnswerError = { error: string }

type Phase = 'connecting' | 'lobby' | 'question' | 'locked' | 'result' | 'ended' | 'error'

// Player/Spectator gameplay: /play/:sessionId. `sessionId` here is the
// join code the player entered on /join (see JoinPage's note on why —
// the backend never hands the frontend the real session UUID at join
// time). Re-runs join:request on mount with the stored participant token
// so this also serves as the reconnect-on-refresh path (ARCHITECTURE.md §6).
export function PlayPage() {
  const { sessionId: joinCode } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  // Re-sent on every socket `connect` (initial + auto-reconnect after a
  // transport-level drop, not just on page reload — see useGameSocket).
  const sendJoinRequest = useCallback(() => {
    if (!joinCode) return
    getSocket().emit('join:request', {
      joinCode,
      participantToken: getParticipantToken() ?? undefined,
      displayName: localStorage.getItem('pulz:displayName') ?? undefined,
    })
  }, [joinCode])

  const { socket, connectionError } = useGameSocket(joinCode ?? '', sendJoinRequest)

  const [phase, setPhase] = useState<Phase>('connecting')
  const [role, setRole] = useState<'PLAYER' | 'SPECTATOR' | null>(null)
  const [promotionRequested, setPromotionRequested] = useState(false)
  const [promotionDenied, setPromotionDenied] = useState(false)
  const [question, setQuestion] = useState<QuestionBroadcast | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [displayName] = useState(() => localStorage.getItem('pulz:displayName'))
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  // Server confirmation for the selected answer (`answer:ack`, DESIGN.md
  // §3) — until it arrives, the tap is only known to have left this
  // device, not to have counted.
  const [answerAcked, setAnswerAcked] = useState(false)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [reveal, setReveal] = useState<QuestionReveal | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!joinCode) return

    function onJoinAccepted(payload: JoinAcceptedPayload) {
      setParticipantToken(payload.participantToken)
      setRole(payload.role)

      const state = payload.state
      if (!state || state.status === 'LOBBY' || !state.question) {
        setPhase('lobby')
        return
      }
      if (state.status === 'ENDED') {
        setPhase('ended')
        if (state.resultsUrl) navigate(state.resultsUrl)
        return
      }

      // IN_PROGRESS, mid-question — rehydrate straight into the right
      // screen instead of showing the lobby (this was the gap: a dropped
      // connection reconnecting mid-question used to land back in the
      // lobby with no way to see the active question).
      setQuestion(state.question)
      setDeadline(questionDeadline(state.question, 'resumed'))
      setSelectedOptionId(state.answeredOptionId ?? null)
      setAnswerAcked(Boolean(state.answeredOptionId))
      setAnswerError(null)
      if (state.question.phase === 'ACTIVE') {
        setPhase('question')
        return
      }
      if (state.reveal) setReveal(state.reveal)
      if (state.result) {
        setResult(state.result)
        setPhase('result')
      } else {
        setPhase('locked')
      }
    }
    function onJoinError(payload: JoinErrorPayload) {
      setError(payload.error)
      setPhase('error')
    }
    function onQuestionBroadcast(payload: QuestionBroadcast) {
      setQuestion(payload)
      setDeadline(questionDeadline(payload, 'live'))
      setSelectedOptionId(null)
      setAnswerAcked(false)
      setAnswerError(null)
      setReveal(null)
      setResult(null)
      setPhase('question')
    }
    function onQuestionLocked() {
      setPhase((current) => (current === 'question' ? 'locked' : current))
    }
    function onQuestionReveal(payload: QuestionReveal) {
      setReveal(payload)
    }
    function onAnswerResult(payload: AnswerResult) {
      setResult(payload)
      setPhase('result')
    }
    function onAnswerAck() {
      setAnswerAcked(true)
    }
    function onAnswerError(payload: AnswerError) {
      setAnswerError(payload.error)
    }
    function onPromotionResult(payload: PromotionResult) {
      setPromotionRequested(false)
      setPromotionDenied(!payload.approved)
      if (payload.approved) setRole('PLAYER')
    }
    function onGameEnded(payload: GameEnded) {
      setPhase('ended')
      navigate(payload.resultsUrl)
    }

    socket.on('join:accepted', onJoinAccepted)
    socket.on('join:error', onJoinError)
    socket.on('question:broadcast', onQuestionBroadcast)
    socket.on('question:locked', onQuestionLocked)
    socket.on('question:reveal', onQuestionReveal)
    socket.on('answer:result', onAnswerResult)
    socket.on('answer:ack', onAnswerAck)
    socket.on('answer:error', onAnswerError)
    socket.on('promotion:result', onPromotionResult)
    socket.on('game:ended', onGameEnded)

    return () => {
      socket.off('join:accepted', onJoinAccepted)
      socket.off('join:error', onJoinError)
      socket.off('question:broadcast', onQuestionBroadcast)
      socket.off('question:locked', onQuestionLocked)
      socket.off('question:reveal', onQuestionReveal)
      socket.off('answer:result', onAnswerResult)
      socket.off('answer:ack', onAnswerAck)
      socket.off('answer:error', onAnswerError)
      socket.off('promotion:result', onPromotionResult)
      socket.off('game:ended', onGameEnded)
    }
  }, [socket, joinCode, navigate])

  function handleSelect(optionId: string) {
    if (phase !== 'question' || role !== 'PLAYER' || !question || selectedOptionId) return
    setSelectedOptionId(optionId)
    socket.emit('answer:submit', { questionId: question.questionId, selectedOptionId: optionId })
  }

  function handleRequestPromotion() {
    setPromotionRequested(true)
    setPromotionDenied(false)
    socket.emit('promotion:request')
  }

  if (phase === 'error') {
    return (
      <StageMessage>
        <p className="text-xl font-semibold">{error}</p>
        <Link to="/join" className="text-stage-muted underline underline-offset-4">
          Back to join
        </Link>
      </StageMessage>
    )
  }
  if (connectionError) {
    return (
      <StageMessage>
        <p className="text-xl font-semibold">{connectionError}</p>
        <p className="text-stage-muted">Reload the page to try again.</p>
      </StageMessage>
    )
  }
  if (phase === 'connecting') {
    return (
      <StageMessage>
        <LoaderCircle aria-hidden="true" className="size-10 motion-safe:animate-spin" />
        <p className="text-lg">Connecting…</p>
      </StageMessage>
    )
  }
  if (phase === 'lobby') {
    return (
      <StageMessage>
        <ShapeParade />
        <h1 className="text-4xl font-black tracking-tight">You're in!</h1>
        {displayName ? (
          <p className="max-w-full rounded-3xl bg-white/10 px-5 py-2 text-xl font-semibold [overflow-wrap:anywhere]">
            {displayName}
          </p>
        ) : null}
        <p className="text-stage-muted">Waiting for the host to start the game...</p>
        {role === 'SPECTATOR' ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-sm text-stage-muted">The game already started, so you're spectating for now.</p>
            <Button
              size="lg"
              className="bg-white text-stage hover:bg-white/90"
              onClick={handleRequestPromotion}
              disabled={promotionRequested}
            >
              {promotionRequested ? 'Request sent' : 'Request to play'}
            </Button>
          </div>
        ) : null}
      </StageMessage>
    )
  }
  if (phase === 'ended') {
    return (
      <StageMessage>
        <LoaderCircle aria-hidden="true" className="size-10 motion-safe:animate-spin" />
        <p className="text-lg">Game over — heading to results...</p>
      </StageMessage>
    )
  }

  if (phase === 'result' && result) {
    const options = question ? toAnswerOptions(question.options) : []
    const correctOption = options.find((o) => o.id === reveal?.correctOptionId)
    const answered = Boolean(selectedOptionId)
    const tone = result.isCorrect ? 'correct' : answered ? 'incorrect' : 'timeout'
    const Icon = tone === 'correct' ? Check : tone === 'incorrect' ? X : Clock

    return (
      <div
        className={cn(
          'flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center text-white',
          tone === 'correct' && 'bg-stage-correct',
          tone === 'incorrect' && 'bg-stage-incorrect',
          tone === 'timeout' && 'bg-stage',
        )}
      >
        <div className="grid size-24 place-items-center rounded-full bg-white/20 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300">
          <Icon aria-hidden="true" strokeWidth={3} className="size-14" />
        </div>
        <h1 className="text-5xl font-black tracking-tight">
          {tone === 'correct' ? 'Correct!' : tone === 'incorrect' ? 'Not quite.' : "Time's up!"}
        </h1>
        <p className="rounded-full bg-black/20 px-6 py-2 text-2xl font-bold tabular-nums">+{result.pointsEarned} points</p>
        <p className="text-lg font-medium">
          Rank {result.myRank} of {result.totalPlayers}
        </p>
        {!result.isCorrect && correctOption ? (
          <p className="flex max-w-full items-center gap-2 rounded-xl bg-black/20 px-4 py-2 text-base">
            <AnswerShape shape={correctOption.shape} className="size-5 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Correct answer: <span className="font-semibold">{correctOption.label}</span>
            </span>
          </p>
        ) : null}
        <p className="mt-6 text-sm text-white/80">Waiting for the next question…</p>
      </div>
    )
  }

  return (
    <GameStage>
      <header className="flex items-center gap-3 px-4 pt-4">
        {question ? (
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tabular-nums">
            Q {question.index + 1}/{question.total}
          </span>
        ) : null}
        {displayName ? <span className="min-w-0 truncate text-sm text-stage-muted">{displayName}</span> : null}
        {question && deadline !== null ? (
          <Countdown
            className="ml-auto"
            deadline={deadline}
            durationSeconds={question.timeLimitSeconds}
            stopped={phase !== 'question'}
          />
        ) : null}
      </header>

      {question ? (
        <h1 className="px-5 pt-4 pb-2 text-center text-2xl leading-tight font-bold [overflow-wrap:anywhere] sm:text-3xl">
          {question.text}
        </h1>
      ) : null}

      <div className="flex min-h-14 items-center justify-center px-4 pt-1 pb-4 text-center text-sm" aria-live="polite">
        {role === 'SPECTATOR' ? (
          // Joined after the game started (DESIGN.md §2): the host has to let
          // them in, from the next answer on — no retroactive points
          // (Decision #13). This is the only screen a late joiner ever sees,
          // so the request has to live here, not just in the lobby.
          <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="text-stage-muted">
              {promotionDenied ? 'The host said not yet — you can ask again.' : "You joined mid-game, so you're watching."}
            </span>
            <Button
              size="sm"
              className="bg-white text-stage hover:bg-white/90"
              onClick={handleRequestPromotion}
              disabled={promotionRequested}
            >
              {promotionRequested ? 'Request sent' : 'Request to play'}
            </Button>
          </span>
        ) : answerError && !result ? (
          <span className="rounded-full bg-stage-incorrect px-4 py-1.5 font-medium">{answerError}</span>
        ) : phase === 'locked' ? (
          <span className="font-medium">Answers locked — revealing soon...</span>
        ) : answerAcked ? (
          <span className="flex items-center gap-2 rounded-full bg-white px-4 py-1.5 font-semibold text-stage">
            <CircleCheck aria-hidden="true" className="size-4" />
            Answer received — waiting for the host...
          </span>
        ) : selectedOptionId ? (
          <span className="text-stage-muted">Sending your answer…</span>
        ) : null}
      </div>

      {question ? (
        <div className="flex flex-1 flex-col px-4 pb-4 sm:mx-auto sm:w-full sm:max-w-3xl">
          <AnswerGrid
            className="flex-1 auto-rows-fr"
            shapeOnly
            options={toAnswerOptions(question.options)}
            onSelect={handleSelect}
            selectedOptionId={selectedOptionId}
            disabled={role !== 'PLAYER' || phase !== 'question' || Boolean(selectedOptionId)}
          />
        </div>
      ) : null}
    </GameStage>
  )
}

/** Centered single-message screen on the game stage (lobby, connecting,
 * errors, end-of-game hand-off). */
function StageMessage({ children }: { children: React.ReactNode }) {
  return <GameStage className="items-center justify-center gap-4 p-6 text-center">{children}</GameStage>
}

/** The four answer shapes bobbing in turn — lobby "the game's about to
 * start" flourish; static under prefers-reduced-motion. */
function ShapeParade() {
  return (
    <div className="mb-2 flex gap-3" aria-hidden="true">
      {ANSWER_SLOT_STYLES.map((s, i) => (
        <div
          key={s.shape}
          className="grid size-12 place-items-center rounded-xl motion-safe:animate-bounce"
          style={{ backgroundColor: s.color, animationDelay: `${i * 150}ms` }}
        >
          <AnswerShape shape={s.shape} className="size-6 text-white" />
        </div>
      ))}
    </div>
  )
}
