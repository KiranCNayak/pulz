import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check, ChevronUp, Crown, Loader2, TriangleAlert, Trophy, Users, X } from 'lucide-react'
import { AnswerGrid } from '@/components/AnswerGrid'
import { AnswerShape } from '@/components/AnswerShape'
import { ANSWER_SLOT_STYLES, toAnswerOptions } from '@/components/answerStyles'
import { Countdown } from '@/components/Countdown'
import { GameStage } from '@/components/GameStage'
import { useGameSocket } from '@/hooks/useGameSocket'
import { questionDeadline } from '@/lib/questionTimer'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'

type AuthStatus = 'connecting' | 'ok' | 'error'

type SessionStatus = 'LOBBY' | 'IN_PROGRESS' | 'ENDED'

type LobbyParticipant = { id: string; displayName: string; role?: string }

type DisplayAuthOk = {
  sessionId?: string
  status?: SessionStatus
  joinCode?: string
  participants?: LobbyParticipant[]
  /** Live game state for a mid-game (re)connect — backend buildScreenSnapshot. */
  live?: {
    question: (QuestionBroadcast & { phase: 'ACTIVE' | 'LOCKED' }) | null
    lockReason: LockReason | null
    reveal: RevealPayload | null
    ranked: LeaderboardEntry[] | null
  }
}

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

/** A leaderboard row plus what changed since the previous standings —
 * derived client-side, purely for the reveal's "+points / climbed" flair. */
type Standing = LeaderboardEntry & { gained: number; rankChange: number }

// Mirrors backend gameLoop.service.ts's LockReason.
type LockReason = 'host' | 'timer' | 'all_answered'

type QuestionPhase = 'active' | 'locked'

const LEADERBOARD_SIZE = 5
/** Beyond this many name chips the lobby would crowd out the join code. */
const MAX_LOBBY_CHIPS = 36

/**
 * Display/cast view: /display/:sessionId?token=<displayToken>.
 * Read-only — safe to project publicly (ARCHITECTURE.md §5). No click
 * handlers, no host controls; just a large-format subscriber to the same
 * event stream the Host Controller drives. Always the fixed dark game
 * stage (Decision #55), sized to read from the back of a room.
 */
export function DisplayPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()
  const displayToken = searchParams.get('token')
  const hasParams = Boolean(sessionId && displayToken)

  // Re-sent on every socket `connect` (initial + auto-reconnect after a
  // transport-level drop, not just on page reload — see useGameSocket).
  const sendDisplayAuth = useCallback(() => {
    if (!hasParams) return
    getSocket().emit('display:auth', { sessionId, displayToken })
  }, [sessionId, displayToken, hasParams])

  const { socket, connectionError } = useGameSocket(sessionId ?? '', sendDisplayAuth)

  const [authStatus, setAuthStatus] = useState<AuthStatus>('connecting')
  const [authError, setAuthError] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('LOBBY')
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [participants, setParticipants] = useState<LobbyParticipant[]>([])
  const [question, setQuestion] = useState<QuestionBroadcast | null>(null)
  const [deadline, setDeadline] = useState(0)
  // Why the question closed (server-sent on `question:locked`, Decision #63)
  // — drives the "Time's up" / "Everyone answered!" / "Answers locked" badge.
  const [lockReason, setLockReason] = useState<LockReason | null>(null)
  const [phase, setPhase] = useState<QuestionPhase>('active')
  const [reveal, setReveal] = useState<RevealPayload | null>(null)
  const [standings, setStandings] = useState<Standing[] | null>(null)
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    if (!hasParams) return

    function handleAuthOk(payload?: DisplayAuthOk) {
      setAuthStatus('ok')
      if (payload?.joinCode) setJoinCode(payload.joinCode)
      if (payload?.participants) setParticipants(payload.participants)
      if (payload?.status) setSessionStatus(payload.status)
      if (payload?.status === 'ENDED') setEnded(true)

      // Mid-game (re)connect: jump straight to the live question / reveal
      // instead of waiting for the next broadcast (Decision #64).
      const live = payload?.live
      if (live?.question) {
        setQuestion(live.question)
        setDeadline(questionDeadline(live.question, 'resumed'))
        setPhase(live.question.phase === 'LOCKED' ? 'locked' : 'active')
        setLockReason(live.lockReason)
        setReveal(live.reveal)
      }
      // No previous standings to diff against, so no "+points"/climb chips.
      if (live?.ranked) setStandings(live.ranked.map((entry) => ({ ...entry, gained: 0, rankChange: 0 })))
    }
    function handleAuthError(payload: { error?: string }) {
      setAuthStatus('error')
      setAuthError(payload?.error ?? 'Failed to authenticate as display')
    }
    function handleLobbyUpdate(payload: { participants?: LobbyParticipant[] }) {
      setParticipants(payload?.participants ?? [])
    }
    function handleQuestion(payload: QuestionBroadcast) {
      setQuestion(payload)
      setDeadline(questionDeadline(payload, 'live'))
      setLockReason(null)
      setPhase('active')
      setReveal(null)
      setSessionStatus('IN_PROGRESS')
    }
    function handleLocked(payload: { reason?: LockReason }) {
      setPhase('locked')
      setLockReason(payload?.reason ?? null)
    }
    function handleReveal(payload: RevealPayload) {
      setReveal(payload)
    }
    function handleLeaderboard(payload: { ranked: LeaderboardEntry[] }) {
      setStandings((previous) => {
        const before = new Map((previous ?? []).map((entry) => [entry.participantId, entry]))
        return payload.ranked.map((entry) => {
          const prior = before.get(entry.participantId)
          return {
            ...entry,
            gained: entry.score - (prior?.score ?? 0),
            rankChange: prior ? prior.rank - entry.rank : 0,
          }
        })
      })
    }
    function handleGameEnded() {
      setEnded(true)
    }

    socket.on('display:auth_ok', handleAuthOk)
    socket.on('display:auth_error', handleAuthError)
    socket.on('session:lobby_update', handleLobbyUpdate)
    socket.on('question:broadcast', handleQuestion)
    socket.on('question:locked', handleLocked)
    socket.on('question:reveal', handleReveal)
    socket.on('leaderboard:update', handleLeaderboard)
    socket.on('game:ended', handleGameEnded)

    return () => {
      socket.off('display:auth_ok', handleAuthOk)
      socket.off('display:auth_error', handleAuthError)
      socket.off('session:lobby_update', handleLobbyUpdate)
      socket.off('question:broadcast', handleQuestion)
      socket.off('question:locked', handleLocked)
      socket.off('question:reveal', handleReveal)
      socket.off('leaderboard:update', handleLeaderboard)
      socket.off('game:ended', handleGameEnded)
    }
  }, [socket, sessionId, displayToken, hasParams])

  if (!hasParams) {
    return <StageMessage tone="error">Missing session id or display token in the URL</StageMessage>
  }

  if (authStatus === 'error') {
    return <StageMessage tone="error">{authError}</StageMessage>
  }

  if (connectionError) {
    return <StageMessage tone="error">{connectionError} Reload the page to try again.</StageMessage>
  }

  if (authStatus === 'connecting') {
    return <StageMessage tone="loading">Connecting…</StageMessage>
  }

  if (ended) {
    return <GameOverScreen standings={standings} />
  }

  if (!question) {
    if (sessionStatus === 'IN_PROGRESS') {
      return <StageMessage tone="loading">Game in progress — the next question will appear here</StageMessage>
    }
    return <LobbyScreen joinCode={joinCode} participants={participants} />
  }

  if (phase === 'locked') {
    return <RevealScreen question={question} reveal={reveal} standings={standings} lockReason={lockReason} />
  }

  return <QuestionScreen question={question} deadline={deadline} />
}

// ─── Shared bits ────────────────────────────────────────────────────────

function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-3xl font-black tracking-tight', className)}>
      <span className="grid size-11 grid-cols-2 gap-1 rounded-xl bg-white/10 p-1.5" aria-hidden="true">
        {ANSWER_SLOT_STYLES.map((slot) => (
          <span key={slot.shape} className="rounded-sm" style={{ backgroundColor: slot.color }} />
        ))}
      </span>
      Pulz
    </div>
  )
}

function StageMessage({ tone, children }: { tone: 'error' | 'loading'; children: React.ReactNode }) {
  return (
    <GameStage className="items-center justify-center gap-10 p-12 text-center">
      <Wordmark className="text-5xl" />
      <div className="flex max-w-4xl flex-col items-center gap-6 text-4xl font-semibold text-balance">
        {tone === 'error' ? (
          <TriangleAlert aria-hidden="true" className="size-12 shrink-0 text-[#ff5c7a]" />
        ) : (
          <Loader2 aria-hidden="true" className="size-12 shrink-0 text-stage-muted motion-safe:animate-spin" />
        )}
        <p>{children}</p>
      </div>
    </GameStage>
  )
}

function QuestionProgress({ question }: { question: QuestionBroadcast }) {
  return (
    <div className="rounded-full bg-white/10 px-7 py-3 text-3xl font-bold tabular-nums ring-1 ring-white/15">
      Question {question.index + 1} <span className="text-stage-muted">of {question.total}</span>
    </div>
  )
}

// ─── Lobby ──────────────────────────────────────────────────────────────

function LobbyScreen({ joinCode, participants }: { joinCode: string | null; participants: LobbyParticipant[] }) {
  const players = participants.filter((p) => !p.role || p.role === 'PLAYER')
  const joinUrl = `${window.location.host}/join`

  return (
    <GameStage className="gap-8 px-12 py-10">
      <header className="flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-3 rounded-full bg-white/10 px-6 py-3 text-3xl font-bold tabular-nums ring-1 ring-white/15">
          <Users aria-hidden="true" className="size-8" />
          {players.length} {players.length === 1 ? 'player' : 'players'}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10">
        <section className="flex w-full max-w-[min(64rem,70vw)] flex-col items-center overflow-hidden rounded-[2rem] bg-white text-stage shadow-[0_12px_0_rgb(0_0_0/0.35)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-500">
          <p className="w-full bg-stage/[0.06] px-10 py-5 text-center text-[clamp(2.25rem,2.5vw,3rem)] font-semibold text-stage/70">
            Join at <strong className="font-extrabold text-stage [overflow-wrap:anywhere]">{joinUrl}</strong>
          </p>
          <div className="flex flex-col items-center gap-2 px-10 pt-6 pb-9">
            <p className="text-2xl font-bold tracking-[0.3em] text-stage/55 uppercase">Game PIN</p>
            <p className="pl-[0.15em] font-mono text-[clamp(7rem,10.5vw,13rem)] leading-none font-black tracking-[0.15em]">
              {joinCode ?? '······'}
            </p>
          </div>
        </section>

        {players.length === 0 ? (
          <p className="text-3xl text-stage-muted">Players will pop up here as they join</p>
        ) : (
          <ul className="flex max-w-7xl flex-wrap content-start justify-center gap-4">
            {players.slice(0, MAX_LOBBY_CHIPS).map((player) => (
              <li
                key={player.id}
                className={cn(
                  'max-w-md truncate rounded-full bg-white/12 font-bold ring-1 ring-white/20 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in motion-safe:duration-300',
                  players.length > 16 ? 'px-5 py-2 text-2xl' : 'px-7 py-3 text-3xl',
                )}
              >
                {player.displayName}
              </li>
            ))}
            {players.length > MAX_LOBBY_CHIPS && (
              <li className="rounded-full px-5 py-2 text-2xl font-bold text-stage-muted">
                +{players.length - MAX_LOBBY_CHIPS} more
              </li>
            )}
          </ul>
        )}
      </main>

      <footer className="flex items-center justify-center gap-4 text-3xl font-semibold text-stage-muted">
        <span className="relative flex size-4" aria-hidden="true">
          <span className="absolute inline-flex size-full rounded-full bg-stage-muted opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-4 rounded-full bg-stage-muted" />
        </span>
        Waiting for the host to start the game…
      </footer>
    </GameStage>
  )
}

// ─── Active question ────────────────────────────────────────────────────

function QuestionScreen({ question, deadline }: { question: QuestionBroadcast; deadline: number }) {
  return (
    <GameStage className="gap-6 px-12 pt-8 pb-10">
      <header className="flex items-center justify-between">
        <QuestionProgress question={question} />
        {/* Dark well behind the ring; kept off Countdown itself so its
            own final-seconds red disc isn't overridden. */}
        <div className="rounded-full bg-black/25 p-2">
          <Countdown
            key={question.questionId}
            deadline={deadline}
            durationSeconds={question.timeLimitSeconds}
            size="large"
            className="size-36 text-6xl"
          />
        </div>
      </header>

      <main
        key={question.questionId}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-500"
      >
        <h1 className="max-w-7xl text-center text-[clamp(3rem,5vw,5.75rem)] leading-[1.08] font-extrabold tracking-tight text-balance">
          {question.text}
        </h1>
        {question.mediaUrl && (
          <img
            src={question.mediaUrl}
            alt=""
            className="max-h-[30vh] max-w-full rounded-2xl object-contain shadow-2xl ring-4 ring-white/10"
          />
        )}
      </main>

      <AnswerGrid
        options={toAnswerOptions(question.options)}
        size="large"
        className="w-full"
            tileClassName="min-h-[18vh] text-[2.75rem]"
      />
    </GameStage>
  )
}

// ─── Locked / reveal ────────────────────────────────────────────────────

function RevealScreen({
  question,
  reveal,
  standings,
  lockReason,
}: {
  question: QuestionBroadcast
  reveal: RevealPayload | null
  standings: Standing[] | null
  lockReason: LockReason | null
}) {
  const matchingReveal = reveal && reveal.questionId === question.questionId ? reveal : null
  const correctCount = matchingReveal ? (matchingReveal.tally[matchingReveal.correctOptionId] ?? 0) : null
  const playerCount = standings?.length ?? 0

  return (
    <GameStage className="gap-6 px-12 pt-8 pb-10">
      <header className="flex items-center justify-between">
        <QuestionProgress question={question} />
        <div
          className={cn(
            'rounded-full px-7 py-3 text-3xl font-black tracking-wide uppercase shadow-[0_5px_0_rgb(0_0_0/0.3)]',
            lockReason === 'timer' ? 'bg-stage-incorrect' : lockReason === 'all_answered' ? 'bg-stage-correct' : 'bg-white/15',
          )}
        >
          {lockReason === 'timer' ? (
            <>Time&rsquo;s up</>
          ) : lockReason === 'all_answered' ? (
            'Everyone answered!'
          ) : (
            'Answers locked'
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col justify-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <p className="line-clamp-2 max-w-6xl text-center text-4xl leading-tight font-bold text-balance text-white/80">
            {question.text}
          </p>
          {correctCount !== null && (
            <RevealHeadline key={question.questionId} correctCount={correctCount} playerCount={playerCount} />
          )}
        </div>

        <div
          className={cn(
            'grid items-center gap-10',
            standings && standings.length > 0 ? 'grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]' : 'grid-cols-1',
          )}
        >
          <AnswerGrid
            options={toAnswerOptions(question.options)}
            reveal={
              matchingReveal
                ? { correctOptionId: matchingReveal.correctOptionId, tally: matchingReveal.tally }
                : undefined
            }
            size="large"
            tileClassName="min-h-[19vh] text-4xl"
          />
          {standings && standings.length > 0 && <LeaderboardPanel standings={standings} />}
        </div>
      </main>
    </GameStage>
  )
}

function RevealHeadline({ correctCount, playerCount }: { correctCount: number; playerCount: number }) {
  const everyone = playerCount > 0 && correctCount >= playerCount
  const text =
    correctCount === 0
      ? 'Nobody got it right!'
      : everyone
        ? 'Everyone got it right!'
        : playerCount > 0
          ? `${correctCount} of ${playerCount} got it right!`
          : `${correctCount} ${correctCount === 1 ? 'player' : 'players'} got it right!`

  return (
    <div className="flex items-center justify-center gap-5 motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:fade-in motion-safe:duration-500">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-24 shrink-0 place-items-center rounded-full shadow-[0_6px_0_rgb(0_0_0/0.3)]',
          correctCount === 0 ? 'bg-stage-incorrect' : 'bg-stage-correct',
        )}
      >
        {correctCount === 0 ? <X strokeWidth={4} className="size-14" /> : <Check strokeWidth={4} className="size-14" />}
      </span>
      <h1 className="text-[5.25rem] leading-none font-black tracking-tight">{text}</h1>
    </div>
  )
}

const RANK_BADGE: Record<number, string> = {
  1: 'bg-amber-400 text-amber-950',
  2: 'bg-slate-200 text-slate-800',
  3: 'bg-orange-400 text-orange-950',
}

function LeaderboardPanel({ standings }: { standings: Standing[] }) {
  const top = standings.slice(0, LEADERBOARD_SIZE)

  return (
    <section className="flex flex-col gap-4 rounded-[1.75rem] bg-stage-raised/85 p-6 shadow-[0_10px_0_rgb(0_0_0/0.3)] ring-1 ring-white/10">
      <h2 className="flex items-center gap-3 px-2 text-3xl font-black">
        <Trophy aria-hidden="true" className="size-9 text-amber-300" />
        Leaderboard
      </h2>
      <ol className="flex flex-col gap-3">
        {top.map((entry, index) => (
          <li
            key={entry.participantId}
            style={{ animationDelay: `${index * 90}ms` }}
            className={cn(
              'flex items-center gap-4 rounded-2xl px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 motion-safe:duration-500 motion-safe:fill-mode-backwards',
              entry.rank === 1 ? 'bg-white/15 ring-2 ring-amber-300/70' : 'bg-white/[0.07]',
            )}
          >
            <span
              className={cn(
                'grid size-14 shrink-0 place-items-center rounded-full text-3xl font-black tabular-nums',
                RANK_BADGE[entry.rank] ?? 'bg-white/15 text-white',
              )}
            >
              {entry.rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-4xl font-bold">{entry.displayName}</span>
            {entry.rankChange > 0 && (
              <span className="flex shrink-0 items-center text-2xl font-black text-emerald-300 tabular-nums">
                <ChevronUp aria-hidden="true" strokeWidth={3.5} className="size-7" />
                <span className="sr-only">Up </span>
                {entry.rankChange}
              </span>
            )}
            {entry.gained > 0 && (
              <span className="shrink-0 rounded-full bg-emerald-400/15 px-3 py-0.5 text-2xl font-bold text-emerald-300 tabular-nums">
                +{entry.gained}
              </span>
            )}
            <span className="min-w-28 shrink-0 text-right text-4xl font-black tabular-nums">{entry.score}</span>
          </li>
        ))}
      </ol>
      {standings.length > LEADERBOARD_SIZE && (
        <p className="px-2 text-2xl text-stage-muted">+{standings.length - LEADERBOARD_SIZE} more playing</p>
      )}
    </section>
  )
}

// ─── Game over ──────────────────────────────────────────────────────────

/** Podium blocks by *place* (visual order 2nd · 1st · 3rd); colors follow
 * the entry's actual rank instead, so a tie for 2nd shows two silvers. */
const PODIUM_PLACES = [
  { order: 'order-2', height: 'h-[34vh]', delay: 500 },
  { order: 'order-1', height: 'h-[26vh]', delay: 250 },
  { order: 'order-3', height: 'h-[19vh]', delay: 0 },
]

const PODIUM_COLORS: Record<number, string> = {
  1: 'from-amber-300 to-amber-500 text-amber-950',
  2: 'from-slate-100 to-slate-300 text-slate-800',
  3: 'from-orange-300 to-orange-500 text-orange-950',
}

/** Fixed confetti scatter (answer-tile shapes/colors) — deterministic so
 * renders stay pure; it just drops in once. */
type ConfettiPiece = {
  shape: 'circle' | 'triangle' | 'square' | 'diamond'
  color: string
  left: string
  top: string
  size: string
  rotate: number
}

const CONFETTI: ConfettiPiece[] = [
  // Kept to the side gutters and the band between title and podium.
  { shape: 'triangle', color: '#e21b3c', left: '5%', top: '12%', size: 'size-10', rotate: 18 },
  { shape: 'square', color: '#26890c', left: '13%', top: '28%', size: 'size-7', rotate: 24 },
  { shape: 'diamond', color: '#1368ce', left: '6%', top: '47%', size: 'size-8', rotate: 0 },
  { shape: 'circle', color: '#f5b400', left: '14%', top: '63%', size: 'size-6', rotate: 0 },
  { shape: 'triangle', color: '#1368ce', left: '4%', top: '80%', size: 'size-7', rotate: -30 },
  { shape: 'circle', color: '#e21b3c', left: '29%', top: '26%', size: 'size-5', rotate: 0 },
  { shape: 'square', color: '#f5b400', left: '68%', top: '24%', size: 'size-6', rotate: -12 },
  { shape: 'triangle', color: '#26890c', left: '93%', top: '11%', size: 'size-10', rotate: -20 },
  { shape: 'diamond', color: '#e21b3c', left: '85%', top: '29%', size: 'size-9', rotate: 0 },
  { shape: 'circle', color: '#1368ce', left: '94%', top: '46%', size: 'size-7', rotate: 0 },
  { shape: 'square', color: '#e21b3c', left: '86%', top: '64%', size: 'size-6', rotate: 40 },
  { shape: 'diamond', color: '#f5b400', left: '95%', top: '79%', size: 'size-6', rotate: 0 },
]

function GameOverScreen({ standings }: { standings: Standing[] | null }) {
  const podium = (standings ?? []).slice(0, 3)
  const rest = (standings ?? []).slice(3, 10)

  return (
    <GameStage className="items-center gap-6 px-12 pt-10 pb-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_32%_48%_at_50%_58%,rgb(251_191_36/0.26),transparent_70%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {CONFETTI.map((piece, index) => (
          <span
            key={index}
            className="absolute motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-40 motion-safe:duration-1000 motion-safe:fill-mode-backwards"
            style={{
              left: piece.left,
              top: piece.top,
              color: piece.color,
              rotate: `${piece.rotate}deg`,
              animationDelay: `${(index % 5) * 120}ms`,
            }}
          >
            <AnswerShape shape={piece.shape} className={cn(piece.size, 'opacity-80')} />
          </span>
        ))}
      </div>

      <h1 className="relative flex items-center gap-5 text-8xl font-black tracking-tight motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:fade-in motion-safe:duration-700">
        <Trophy aria-hidden="true" className="size-20 text-amber-300" />
        Game over!
      </h1>

      {podium.length > 0 ? (
        <div className="relative flex flex-1 items-end justify-center gap-6">
          {podium.map((entry, index) => {
            const place = PODIUM_PLACES[index]
            return (
              <div
                key={entry.participantId}
                style={{ animationDelay: `${place.delay}ms` }}
                className={cn(
                  'flex w-80 flex-col items-center gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-16 motion-safe:duration-600 motion-safe:fill-mode-backwards',
                  place.order,
                )}
              >
                {entry.rank === 1 && <Crown aria-hidden="true" className="size-16 text-amber-300 drop-shadow-lg" />}
                <p className={cn('max-w-full truncate px-2 font-black', index === 0 ? 'text-6xl' : 'text-5xl')}>
                  {entry.displayName}
                </p>
                <p className="mb-2 text-3xl font-bold text-stage-muted tabular-nums">{entry.score} pts</p>
                <div
                  className={cn(
                    'flex w-full items-start justify-center rounded-t-3xl bg-gradient-to-b pt-5 shadow-[0_-8px_40px_rgb(0_0_0/0.25)]',
                    place.height,
                    PODIUM_COLORS[entry.rank] ?? 'from-white/25 to-white/10 text-white',
                  )}
                >
                  <span className="text-8xl font-black tabular-nums">{entry.rank}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="flex flex-1 items-center text-4xl text-stage-muted">Thanks for playing!</p>
      )}

      {rest.length > 0 && (
        <ol className="relative flex w-full max-w-6xl flex-wrap justify-center gap-3">
          {rest.map((entry) => (
            <li
              key={entry.participantId}
              className="flex items-center gap-3 rounded-full bg-white/10 py-2 pr-6 pl-2 text-3xl font-bold ring-1 ring-white/15"
            >
              <span className="grid size-11 place-items-center rounded-full bg-white/15 text-2xl tabular-nums">
                {entry.rank}
              </span>
              <span className="max-w-72 truncate">{entry.displayName}</span>
              <span className="text-stage-muted tabular-nums">{entry.score}</span>
            </li>
          ))}
        </ol>
      )}
    </GameStage>
  )
}
