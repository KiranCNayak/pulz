import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Copy,
  Flag,
  Hourglass,
  KeyRound,
  ListOrdered,
  Loader2,
  Lock,
  Play,
  Trophy,
  UserPlus,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { AnswerGrid } from '@/components/AnswerGrid'
import { toAnswerOptions } from '@/components/answerStyles'
import { ConnectionErrorMessage } from '@/components/ConnectionErrorMessage'
import { Countdown } from '@/components/Countdown'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useGameSocket } from '@/hooks/useGameSocket'
import { useTheme } from '@/hooks/useTheme'
import { questionDeadline } from '@/lib/questionTimer'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'

type LobbyParticipant = { id: string; displayName: string }

type SessionStatus = 'LOBBY' | 'IN_PROGRESS' | 'ENDED'

type HostSnapshot = {
  sessionId: string
  joinCode: string
  status: SessionStatus
  questionCount: number
  currentQuestionIndex: number
  participants: LobbyParticipant[]
  /** Live game state for a mid-game (re)connect — backend buildScreenSnapshot. */
  live?: ScreenSnapshot
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

// Mirrors backend gameLoop.service.ts's LockReason (sent on `question:locked`).
type LockReason = 'host' | 'timer' | 'all_answered'

type ScreenSnapshot = {
  question: (QuestionBroadcast & { phase: QuestionPhase }) | null
  lockReason: LockReason | null
  reveal: QuestionReveal | null
  ranked: LeaderboardEntry[] | null
  resultsUrl: string | null
}

const LOCK_LABEL: Record<LockReason, string> = {
  host: 'Locked',
  timer: "Time's up",
  all_answered: 'Everyone answered',
}

const LEADERBOARD_LIMIT = 10

/** Big, chunky "game button" treatment for the host's one primary action
 * per state — the brand violet reads in both themes, and the pressed-down
 * bottom edge echoes the answer tiles. */
const PRIMARY_ACTION_CLASS =
  'h-12 gap-2 rounded-xl bg-violet-600 px-6 text-base font-semibold text-white shadow-[0_4px_0_var(--color-violet-800)] hover:bg-violet-700 active:not-aria-[haspopup]:translate-y-0.5 active:shadow-[0_2px_0_var(--color-violet-800)] focus-visible:ring-violet-500/50'

/** Answer-slot colors (see answerStyles.ts), reused for player avatars so
 * the lobby carries the game's palette. */
const AVATAR_COLORS = ['bg-[#e21b3c]', 'bg-[#1368ce]', 'bg-[#b87a00]', 'bg-[#26890c]']

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
 *
 * Theme: the Host is the operator's (theme-aware) control panel, unlike the
 * fixed-look game stage of Play/Display — it applies the saved/system theme
 * but, per Decision #55, doesn't render a toggle on a gameplay screen.
 */
export function HostPage() {
  useTheme()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()

  const [hostToken, setHostToken] = useState(searchParams.get('token') ?? '')
  const [tokenDraft, setTokenDraft] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  // Re-sent on every socket `connect` (initial + auto-reconnect after a
  // transport-level drop, not just on page reload — see useGameSocket).
  const sendHostAuth = useCallback(() => {
    if (!sessionId || !hostToken) return
    getSocket().emit('host:auth', { sessionId, hostToken })
  }, [sessionId, hostToken])

  const { socket, connectionError } = useGameSocket(sessionId ?? '', sendHostAuth)

  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null)
  const [question, setQuestion] = useState<QuestionBroadcast | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [phase, setPhase] = useState<QuestionPhase | null>(null)
  const [lockReason, setLockReason] = useState<LockReason | null>(null)
  const [reveal, setReveal] = useState<QuestionReveal | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [promotionRequests, setPromotionRequests] = useState<PromotionRequest[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [resultsUrl, setResultsUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId || !hostToken) return

    const onAuthOk = (snap: HostSnapshot) => {
      setAuthError(null)
      setSnapshot(snap)
      // Mid-game (re)connect (page refresh, dropped Wi-Fi): restore the
      // current question and its controls — without this the Lock/Next
      // buttons never came back and the game could not advance (Decision #64).
      const live = snap.live
      if (live?.question) {
        setQuestion(live.question)
        setDeadline(questionDeadline(live.question, 'resumed'))
        setPhase(live.question.phase)
        setLockReason(live.lockReason)
        setReveal(live.reveal)
      }
      if (live?.ranked) setLeaderboard(live.ranked)
      if (live?.resultsUrl) setResultsUrl(live.resultsUrl)
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
      setDeadline(questionDeadline(payload, 'live'))
      setPhase('ACTIVE')
      setReveal(null)
      setLockReason(null)
      // Keep the previous standings visible while the next question runs —
      // the host wants them on hand, and the next lock replaces them.
      setActionError(null)
      setSnapshot((prev) => (prev ? { ...prev, status: 'IN_PROGRESS', currentQuestionIndex: payload.index } : prev))
    }
    const onQuestionLocked = (payload: { reason?: LockReason }) => {
      setPhase('LOCKED')
      setLockReason(payload?.reason ?? null)
    }
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

  if (!sessionId) {
    return (
      <CenteredShell>
        <Card className="w-full max-w-md">
          <CardContent className="py-2 text-center text-muted-foreground">Missing session id.</CardContent>
        </Card>
      </CenteredShell>
    )
  }

  if (!hostToken || authError) {
    const connect = () => {
      const token = tokenDraft.trim()
      setAuthError(null)
      setHostToken(token)
      // useGameSocket only runs `sendHostAuth` on a socket `connect`, and
      // the socket is normally already connected by the time a token is
      // pasted (or re-pasted after an auth error) — so authenticate here.
      if (socket.connected) socket.emit('host:auth', { sessionId, hostToken: token })
    }
    return (
      <CenteredShell>
        <Card className="w-full max-w-md gap-5 py-6 shadow-sm">
          <CardHeader className="gap-2 px-6">
            <div className="mb-1 grid size-10 place-items-center rounded-xl bg-violet-600/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300">
              <KeyRound aria-hidden="true" className="size-5" />
            </div>
            <CardTitle className="text-xl font-semibold tracking-tight">Connect as host</CardTitle>
            <CardDescription>
              Paste the host token from session creation to control this game.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-6">
            <p className="text-xs text-muted-foreground">
              Session <span className="font-mono text-foreground">{sessionId}</span>
            </p>
            {authError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {authError}
              </p>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (tokenDraft.trim()) connect()
              }}
            >
              <Input
                aria-label="Host token"
                className="h-10 font-mono"
                placeholder="Host token"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
              />
              <Button type="submit" className="h-10 px-4" disabled={!tokenDraft.trim()}>
                Connect
              </Button>
            </form>
          </CardContent>
        </Card>
      </CenteredShell>
    )
  }

  if (connectionError) {
    return (
      <CenteredShell>
        <Card className="w-full max-w-md items-center gap-2 py-6 text-center shadow-sm">
          <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <WifiOff aria-hidden="true" className="size-5" />
          </div>
          <p className="text-base font-semibold">Connection lost</p>
          <ConnectionErrorMessage error={connectionError} />
        </Card>
      </CenteredShell>
    )
  }

  if (!snapshot) {
    return (
      <CenteredShell>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-5 animate-spin" />
          <p>Connecting to session {sessionId}…</p>
        </div>
      </CenteredShell>
    )
  }

  const decidePromotion = (participantId: string, approve: boolean) => {
    socket.emit('promotion:decision', { participantId, approve })
    setPromotionRequests((prev) => prev.filter((r) => r.participantId !== participantId))
  }

  const promotionPanel =
    promotionRequests.length > 0 ? (
      <PromotionRequestsCard requests={promotionRequests} onDecide={decidePromotion} />
    ) : null

  return (
    <div className="min-h-dvh bg-muted/40 text-foreground dark:bg-background">
      <HostHeader status={snapshot.status} joinCode={snapshot.joinCode} />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {actionError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

        {snapshot.status === 'LOBBY' && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <LobbyCard participants={snapshot.participants} onStart={() => socket.emit('game:start')} />
            <aside className="space-y-6">
              <RunOfShowCard questionCount={snapshot.questionCount} />
              {promotionPanel}
            </aside>
          </div>
        )}

        {snapshot.status === 'IN_PROGRESS' && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            {question ? (
              <QuestionPanel
                question={question}
                deadline={deadline}
                phase={phase}
                lockReason={lockReason}
                reveal={reveal}
                onLock={() => socket.emit('host:lock_question')}
                onNext={() => socket.emit('host:next_question')}
              />
            ) : (
              <Card className="py-10 text-center shadow-sm">
                <CardContent className="text-muted-foreground">Waiting for the next question…</CardContent>
              </Card>
            )}
            <aside className="space-y-6">
              <LeaderboardCard entries={leaderboard} playerCount={snapshot.participants.length} />
              {promotionPanel}
            </aside>
          </div>
        )}

        {snapshot.status === 'ENDED' && (
          <div
            className={cn(
              'grid items-start gap-6',
              leaderboard && leaderboard.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_22rem]',
            )}
          >
            <Card className="items-center gap-4 px-6 py-12 text-center shadow-sm">
              <div className="grid size-16 place-items-center rounded-2xl bg-amber-400/20 text-amber-600 dark:text-amber-300">
                <Flag aria-hidden="true" className="size-8" />
              </div>
              <div className="space-y-1.5">
                <p className="text-3xl font-bold tracking-tight">Game ended.</p>
                <p className="text-muted-foreground">Thanks for hosting — the final standings are ready.</p>
              </div>
              {resultsUrl && (
                <Button className={cn(PRIMARY_ACTION_CLASS, 'mt-2')} render={<Link to={resultsUrl} />}>
                  <Trophy aria-hidden="true" className="size-5" /> View results
                </Button>
              )}
            </Card>
            {leaderboard && leaderboard.length > 0 && (
              <aside className="space-y-6">
                <LeaderboardCard entries={leaderboard} playerCount={snapshot.participants.length} final />
                {promotionPanel}
              </aside>
            )}
            {!(leaderboard && leaderboard.length > 0) && promotionPanel}
          </div>
        )}
      </main>
    </div>
  )
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-muted/40 px-4 py-10 text-foreground dark:bg-background">
      {children}
    </div>
  )
}

function BrandMark() {
  return (
    <div aria-hidden="true" className="grid size-9 shrink-0 grid-cols-2 gap-0.5 rounded-lg p-1 ring-1 ring-border">
      {AVATAR_COLORS.map((color) => (
        <span key={color} className={cn('rounded-[3px]', color)} />
      ))}
    </div>
  )
}

const STATUS_STYLES: Record<SessionStatus, { badge: string; dot: string }> = {
  LOBBY: {
    badge: 'bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  IN_PROGRESS: {
    badge: 'bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-300',
    dot: 'bg-emerald-500 motion-safe:animate-pulse',
  },
  ENDED: {
    badge: 'bg-muted text-muted-foreground ring-border',
    dot: 'bg-muted-foreground/60',
  },
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const styles = STATUS_STYLES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider ring-1 ring-inset',
        styles.badge,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', styles.dot)} />
      {status}
    </span>
  )
}

function HostHeader({ status, joinCode }: { status: SessionStatus; joinCode: string }) {
  const [copied, setCopied] = useState(false)

  const copyJoinCode = async () => {
    await navigator.clipboard.writeText(joinCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Host Controller</h1>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Players join at{' '}
              <span className="font-medium text-foreground">{window.location.host}/join</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border bg-background py-2 pr-2 pl-4 dark:bg-muted/40">
          <div>
            <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Join code</p>
            <p className="font-mono text-3xl leading-tight font-bold tracking-[0.18em]">{joinCode}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            className="size-11 rounded-lg"
            onClick={copyJoinCode}
            aria-label={copied ? 'Join code copied' : 'Copy join code'}
          >
            {copied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
          </Button>
        </div>
      </div>
    </header>
  )
}

function LobbyCard({ participants, onStart }: { participants: LobbyParticipant[]; onStart: () => void }) {
  const count = participants.length
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-6 px-6 py-6 sm:px-8">
        <div className="flex items-center gap-5">
          <div className="grid size-14 place-items-center rounded-2xl bg-violet-600/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300">
            <Users aria-hidden="true" className="size-7" />
          </div>
          <div>
            <p className="text-5xl leading-none font-bold tracking-tight tabular-nums">{count}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {count === 1 ? 'player' : 'players'} in the lobby
            </p>
          </div>
        </div>
        <Button type="button" className={cn(PRIMARY_ACTION_CLASS, 'h-14 w-full px-8 text-lg sm:w-auto')} onClick={onStart}>
          <Play aria-hidden="true" className="size-5 fill-current" />
          Start game
        </Button>
      </div>

      <div className="min-h-56 border-t px-6 py-6 sm:px-8">
        {count === 0 ? (
          <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
            <Hourglass aria-hidden="true" className="size-6 text-muted-foreground motion-safe:animate-pulse" />
            <p className="font-medium">Waiting for players to join…</p>
            <p className="text-sm text-muted-foreground">Share the join code above — names pop in here live.</p>
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2.5">
            {participants.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full border bg-background py-1 pr-4 pl-1 text-sm font-medium shadow-xs motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 dark:bg-muted/40"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-7 place-items-center rounded-full text-xs font-bold text-white uppercase',
                    AVATAR_COLORS[i % AVATAR_COLORS.length],
                  )}
                >
                  {p.displayName.trim().charAt(0)}
                </span>
                <span>{p.displayName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function QuestionPanel({
  question,
  deadline,
  phase,
  lockReason,
  reveal,
  onLock,
  onNext,
}: {
  question: QuestionBroadcast
  deadline: number | null
  phase: QuestionPhase | null
  lockReason: LockReason | null
  reveal: QuestionReveal | null
  onLock: () => void
  onNext: () => void
}) {
  const locked = phase === 'LOCKED'
  const isLast = question.index + 1 >= question.total
  const totalAnswers = reveal ? Object.values(reveal.tally).reduce((sum, n) => sum + n, 0) : null

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex items-start justify-between gap-6 px-6 pt-6 sm:px-8">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              Question {question.index + 1} of {question.total}
            </p>
            <div aria-hidden="true" className="flex gap-1">
              {Array.from({ length: question.total }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 w-6 rounded-full',
                    i <= question.index ? 'bg-violet-600 dark:bg-violet-400' : 'bg-muted-foreground/20',
                  )}
                />
              ))}
            </div>
          </div>
          <h2 className="text-2xl leading-tight font-bold tracking-tight text-pretty [overflow-wrap:anywhere] sm:text-3xl">
            {question.text}
          </h2>
        </div>
        {deadline !== null && (
          // Color via the wrapper (Countdown inherits currentColor) so the
          // component's own final-seconds red state isn't overridden.
          <div className={locked ? 'text-muted-foreground' : 'text-violet-600 dark:text-violet-300'}>
            <Countdown
              deadline={deadline}
              durationSeconds={question.timeLimitSeconds}
              stopped={locked}
              className="size-16 text-xl"
            />
          </div>
        )}
      </div>

      {question.mediaUrl && (
        <div className="px-6 pt-5 sm:px-8">
          <img
            src={question.mediaUrl}
            alt=""
            className="max-h-56 w-full rounded-xl bg-muted object-contain"
          />
        </div>
      )}

      <div className="px-6 py-6 sm:px-8">
        <AnswerGrid
          options={toAnswerOptions(question.options)}
          reveal={reveal ? { correctOptionId: reveal.correctOptionId, tally: reveal.tally } : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t bg-muted/40 px-6 py-4 sm:px-8 dark:bg-muted/20">
        <PhaseStatus
          locked={locked}
          lockReason={lockReason}
          revealed={reveal !== null}
          totalAnswers={totalAnswers}
          isLast={isLast}
        />
        {phase === 'ACTIVE' && (
          <Button type="button" className={cn(PRIMARY_ACTION_CLASS, 'w-full sm:w-auto')} onClick={onLock}>
            <Lock aria-hidden="true" className="size-5" />
            Lock question
          </Button>
        )}
        {phase === 'LOCKED' && (
          <Button type="button" className={cn(PRIMARY_ACTION_CLASS, 'w-full sm:w-auto')} onClick={onNext}>
            Next
            <ArrowRight aria-hidden="true" className="size-5" />
          </Button>
        )}
      </div>
    </Card>
  )
}

function PhaseStatus({
  locked,
  lockReason,
  revealed,
  totalAnswers,
  isLast,
}: {
  locked: boolean
  lockReason: LockReason | null
  revealed: boolean
  totalAnswers: number | null
  isLast: boolean
}) {
  if (!locked) {
    return (
      <div className="flex items-center gap-2.5 text-sm">
        <span aria-hidden="true" className="relative flex size-2.5">
          <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <span>
          <span className="font-medium">Answers open</span>
          <span className="text-muted-foreground">
            {' '}
            — lock early, or it locks itself once everyone has answered or time runs out.
          </span>
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
      <span>
        <span className="font-medium">
          {LOCK_LABEL[lockReason ?? 'host']}
          {revealed ? ` · ${totalAnswers} ${totalAnswers === 1 ? 'answer' : 'answers'}` : ''}
        </span>
        <span className="text-muted-foreground">
          {isLast ? ' — Next ends the game.' : ' — Next shows the following question.'}
        </span>
      </span>
    </div>
  )
}

const RUN_OF_SHOW = [
  { action: 'Kick off', detail: 'The first question goes live on every screen.' },
  { action: 'Lock it in', detail: 'Lock early or let the timer run out — answers and scores are revealed.' },
  { action: 'Move on', detail: 'Advance to the next question; after the last one, the game ends.' },
]

function RunOfShowCard({ questionCount }: { questionCount: number }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <ListOrdered aria-hidden="true" className="size-4 text-violet-600 dark:text-violet-300" />
          <h2 className="font-semibold">Run of show</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {questionCount} {questionCount === 1 ? 'question' : 'questions'}
        </span>
      </div>
      <ol className="space-y-4 px-5 py-5">
        {RUN_OF_SHOW.map((step, i) => (
          <li key={step.action} className="flex gap-3">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground tabular-nums"
            >
              {i + 1}
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{step.action}</p>
              <p className="text-sm text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-400 text-amber-950',
  2: 'bg-slate-300 text-slate-900',
  3: 'bg-orange-400 text-orange-950',
}

function LeaderboardCard({
  entries,
  playerCount,
  final,
}: {
  entries: LeaderboardEntry[] | null
  playerCount: number
  final?: boolean
}) {
  const shown = entries?.slice(0, LEADERBOARD_LIMIT) ?? []
  const hidden = (entries?.length ?? 0) - shown.length

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <Trophy aria-hidden="true" className="size-4 text-amber-500" />
          <h2 className="font-semibold">{final ? 'Final standings' : 'Leaderboard'}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users aria-hidden="true" className="size-3.5" />
          {playerCount} {playerCount === 1 ? 'player' : 'players'}
        </span>
      </div>

      {entries === null ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="grid size-10 place-items-center rounded-full bg-muted">
            <Trophy aria-hidden="true" className="size-5 text-muted-foreground" />
          </div>
          <p className="max-w-56 text-sm text-muted-foreground">
            Scores update here each time you lock a question.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">No scores yet.</p>
      ) : (
        <ol className="divide-y">
          {shown.map((entry) => (
            <li
              key={entry.participantId}
              className={cn('flex items-center gap-3 px-5 py-2.5', entry.rank === 1 && 'bg-amber-400/10')}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums',
                  RANK_STYLES[entry.rank] ?? 'bg-muted text-muted-foreground',
                )}
              >
                {entry.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.displayName}</span>
              <span className="text-sm font-semibold tabular-nums">
                {entry.score.toLocaleString()}
                <span className="ml-1 text-xs font-normal text-muted-foreground">pts</span>
              </span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="px-5 py-2.5 text-center text-xs text-muted-foreground">+{hidden} more</li>
          )}
        </ol>
      )}
    </Card>
  )
}

function PromotionRequestsCard({
  requests,
  onDecide,
}: {
  requests: PromotionRequest[]
  onDecide: (participantId: string, approve: boolean) => void
}) {
  return (
    <Card className="gap-0 py-0 shadow-sm ring-violet-500/40">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <UserPlus aria-hidden="true" className="size-4 text-violet-600 dark:text-violet-300" />
          <h2 className="font-semibold">Spectator promotion requests</h2>
        </div>
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-violet-600 px-1.5 text-xs font-bold text-white tabular-nums">
          {requests.length}
        </span>
      </div>
      <ul className="divide-y">
        {requests.map((req) => (
          <li key={req.participantId} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="min-w-0 truncate text-sm font-medium">{req.displayName}</span>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" onClick={() => onDecide(req.participantId, true)}>
                <Check aria-hidden="true" />
                Approve
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onDecide(req.participantId, false)}>
                <X aria-hidden="true" />
                Deny
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
