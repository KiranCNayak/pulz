import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
export function JoinPage() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
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

    function cleanup() {
      socket.off('join:accepted', onAccepted)
      socket.off('join:error', onError)
    }

    socket.on('join:accepted', onAccepted)
    socket.on('join:error', onError)
    socket.connect()
    socket.emit('join:request', { joinCode: code, displayName: name })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Join a game</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="joinCode">Join code</Label>
              <Input
                id="joinCode"
                autoComplete="off"
                placeholder="ABC123"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                maxLength={6}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">Your name</Label>
              <Input
                id="displayName"
                autoComplete="off"
                placeholder="Nickname"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={24}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Joining...' : 'Join'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
