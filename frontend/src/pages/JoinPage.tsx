import { CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnswerShape } from '@/components/AnswerShape'
import { ANSWER_SLOT_STYLES } from '@/components/answerStyles'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { setParticipantToken } from '@/hooks/useGameSocket'
import { getSocket } from '@/lib/socket'

const JOIN_CODE_KEY = 'pulz:joinCode'
const DISPLAY_NAME_KEY = 'pulz:displayName'

type JoinAcceptedPayload = { participantId: string; participantToken: string; role: string; resumed?: boolean }
type JoinErrorPayload = { error: string }

// Player/Spectator entry point: /join — enter a join code + display name,
// then hand off to /play/:sessionId. The backend's join:accepted event
// doesn't return the session's real UUID (only game:ended's resultsUrl
// does, later) — so the join *code* itself is used as the `/play/:sessionId`
// route param. PlayPage re-resolves the session from the code via the same
// join:request event, using the stored participant token to resume.
// `?code=` (from the home page's PIN box) prefills the code.
export function JoinPage() {
  useDocumentTitle('Join a game')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [joinCode, setJoinCode] = useState(() => (searchParams.get('code') ?? '').toUpperCase().slice(0, 6))
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const code = joinCode.trim().toUpperCase()
    const name = displayName.trim()
    if (!code || !name) return

    setError(null)
    setSubmitting(true)

    const socket = getSocket()

    function onAccepted(payload: JoinAcceptedPayload) {
      cleanup()
      setParticipantToken(payload.participantToken)
      localStorage.setItem(JOIN_CODE_KEY, code)
      localStorage.setItem(DISPLAY_NAME_KEY, name)
      navigate(`/play/${code}`)
    }

    function onError(payload: JoinErrorPayload) {
      cleanup()
      setSubmitting(false)
      setError(payload.error)
    }

    // The server can also refuse the connection itself (rate limit —
    // `connection:error` then a forced disconnect), which would otherwise
    // leave this form stuck submitting forever.
    function onServerDisconnect(reason: string) {
      if (reason === 'io server disconnect') onError({ error: 'Disconnected by the server. Please try again.' })
    }

    function cleanup() {
      socket.off('join:accepted', onAccepted)
      socket.off('join:error', onError)
      socket.off('connection:error', onError)
      socket.off('disconnect', onServerDisconnect)
    }

    socket.on('join:accepted', onAccepted)
    socket.on('join:error', onError)
    socket.on('connection:error', onError)
    socket.on('disconnect', onServerDisconnect)
    socket.connect()
    socket.emit('join:request', { joinCode: code, displayName: name })
  }

  return (
    <AppShell className="bg-dot-grid-ink dark:bg-dot-grid">
      <div className="mx-auto flex w-full max-w-md flex-col px-4 pt-12 pb-16 sm:pt-20">
        <div aria-hidden="true" className="mb-6 flex gap-2">
          {ANSWER_SLOT_STYLES.map((slot) => (
            <span key={slot.shape} className="grid size-9 place-items-center rounded-lg" style={{ backgroundColor: slot.color }}>
              <AnswerShape shape={slot.shape} className="size-4 text-white" />
            </span>
          ))}
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Join a game</h1>
        <p className="mt-2 text-muted-foreground">Enter the PIN from the big screen, then pick a name.</p>

        <form
          className="mt-8 flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-soft"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="joinCode">Join code</Label>
            <Input
              id="joinCode"
              name="joinCode"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ABC123"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              maxLength={6}
              translate="no"
              className="h-14 text-center font-mono text-2xl font-semibold tracking-[0.35em] uppercase placeholder:tracking-[0.35em] placeholder:text-muted-foreground/45"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Your name</Label>
            <Input
              id="displayName"
              name="nickname"
              autoComplete="off"
              spellCheck={false}
              placeholder="Your nickname…"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={24}
              aria-describedby="displayName-hint"
            />
            <p id="displayName-hint" className="text-xs text-muted-foreground">
              Shown on the leaderboard. Up to 24 characters.
            </p>
          </div>
          <div aria-live="polite">
            {error ? (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? 'Joining…' : 'Join'}
          </Button>
        </form>
      </div>
    </AppShell>
  )
}
