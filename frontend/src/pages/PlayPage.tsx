import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerGrid } from '@/components/AnswerGrid'
import { toAnswerOptions } from '@/components/answerStyles'
import { Button } from '@/components/ui/button'
import { getParticipantToken, setParticipantToken, useGameSocket } from '@/hooks/useGameSocket'

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
type JoinAcceptedPayload = { participantId: string; participantToken: string; role: 'PLAYER' | 'SPECTATOR'; resumed?: boolean }
type JoinErrorPayload = { error: string }
type PromotionResult = { approved: boolean }
type GameEnded = { resultsUrl: string }

type Phase = 'connecting' | 'lobby' | 'question' | 'locked' | 'result' | 'ended' | 'error'

// Player/Spectator gameplay: /play/:sessionId. `sessionId` here is the
// join code the player entered on /join (see JoinPage's note on why —
// the backend never hands the frontend the real session UUID at join
// time). Re-runs join:request on mount with the stored participant token
// so this also serves as the reconnect-on-refresh path (ARCHITECTURE.md §6).
export function PlayPage() {
  const { sessionId: joinCode } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const socket = useGameSocket(joinCode ?? '')

  const [phase, setPhase] = useState<Phase>('connecting')
  const [role, setRole] = useState<'PLAYER' | 'SPECTATOR' | null>(null)
  const [promotionRequested, setPromotionRequested] = useState(false)
  const [question, setQuestion] = useState<QuestionBroadcast | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [reveal, setReveal] = useState<QuestionReveal | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!joinCode) return

    function onJoinAccepted(payload: JoinAcceptedPayload) {
      setParticipantToken(payload.participantToken)
      setRole(payload.role)
      setPhase('lobby')
    }
    function onJoinError(payload: JoinErrorPayload) {
      setError(payload.error)
      setPhase('error')
    }
    function onQuestionBroadcast(payload: QuestionBroadcast) {
      setQuestion(payload)
      setSelectedOptionId(null)
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
    function onPromotionResult(payload: PromotionResult) {
      setPromotionRequested(false)
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
    socket.on('promotion:result', onPromotionResult)
    socket.on('game:ended', onGameEnded)

    socket.emit('join:request', {
      joinCode,
      participantToken: getParticipantToken() ?? undefined,
      displayName: localStorage.getItem('pulz:displayName') ?? undefined,
    })

    return () => {
      socket.off('join:accepted', onJoinAccepted)
      socket.off('join:error', onJoinError)
      socket.off('question:broadcast', onQuestionBroadcast)
      socket.off('question:locked', onQuestionLocked)
      socket.off('question:reveal', onQuestionReveal)
      socket.off('answer:result', onAnswerResult)
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
    socket.emit('promotion:request')
  }

  if (phase === 'error') {
    return <div className="p-6 text-red-600">{error}</div>
  }
  if (phase === 'connecting' || phase === 'lobby') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p>Waiting for the host to start the game...</p>
        {role === 'SPECTATOR' ? (
          <Button onClick={handleRequestPromotion} disabled={promotionRequested}>
            {promotionRequested ? 'Request sent' : 'Request to play'}
          </Button>
        ) : null}
      </div>
    )
  }
  if (phase === 'ended') {
    return <div className="p-6">Game over — heading to results...</div>
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-4">
      {question ? <h1 className="text-center text-xl font-semibold">{question.text}</h1> : null}
      {role === 'SPECTATOR' ? (
        <p className="text-center text-sm text-muted-foreground">Spectating — you can't answer this round.</p>
      ) : null}
      {question ? (
        <AnswerGrid
          options={toAnswerOptions(question.options)}
          onSelect={handleSelect}
          disabled={role !== 'PLAYER' || phase !== 'question' || Boolean(selectedOptionId)}
        />
      ) : null}
      {phase === 'locked' && !result ? <p className="text-center">Answers locked — revealing soon...</p> : null}
      {reveal && phase === 'locked' && role === 'PLAYER' ? (
        <p className="text-center text-sm text-muted-foreground">
          Correct answer locked in — waiting for your result...
        </p>
      ) : null}
      {phase === 'result' && result ? (
        <div className="text-center">
          <p className="text-lg font-semibold">{result.isCorrect ? 'Correct!' : 'Not quite.'}</p>
          <p>+{result.pointsEarned} points</p>
          <p>
            Rank {result.myRank} of {result.totalPlayers}
          </p>
        </div>
      ) : null}
    </div>
  )
}
