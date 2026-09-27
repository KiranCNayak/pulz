import { useEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'

const PARTICIPANT_TOKEN_KEY = 'pulz:participantToken'

// Mounted useGameSocket consumers — see the deferred disconnect below.
let activeConsumers = 0

const SERVER_DISCONNECT_MESSAGE = 'Disconnected by the server.'

export function getParticipantToken(): string | null {
  return localStorage.getItem(PARTICIPANT_TOKEN_KEY)
}

export function setParticipantToken(token: string): void {
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, token)
}

/**
 * Shared connect/reconnect hook (Decision #42, ARCHITECTURE.md §6) for
 * Host/Display/Play views. Owns the socket connection; `onConnect` (if
 * given) is invoked on the socket's native `connect` event — which fires
 * both on the very first connection AND every time Socket.IO's own
 * automatic reconnection recovers a transport-level drop (e.g. a brief
 * WiFi blip), not just once on mount. Callers should emit their
 * role-appropriate join/auth event (`join:request`/`host:auth`/
 * `display:auth`) from `onConnect` instead of emitting it directly in
 * their own effect, so a transport-level reconnect re-authenticates the
 * same way a full page reload already does (Decision #53 covered the
 * page-reload case; this covers the narrower one it left open).
 *
 * `onConnect` is stored in a ref so passing a new inline function on
 * every render doesn't re-run this hook's own effect (which would
 * otherwise disconnect/reconnect the socket needlessly) — each view
 * still listens for its own events (DESIGN.md event catalogue) and holds
 * its own game-loop state in plain React state/context per Decision #46.
 *
 * If the shared socket is *already* connected on mount (JoinPage opens it
 * and joins just before navigating to PlayPage), no `connect` event is
 * coming, so `onConnect` runs immediately instead — at most once per
 * underlying connection (keyed on `socket.id`, which changes on every
 * reconnect), so StrictMode's double-invoked effect doesn't send it twice.
 *
 * Unmount doesn't disconnect synchronously: StrictMode (and any
 * hook-to-hook navigation) re-acquires the socket in the same tick, and
 * a disconnect/connect pair there churns a whole new server-side
 * connection for nothing (Decision #59). The disconnect is deferred and
 * skipped if another consumer has taken the socket in the meantime.
 *
 * `connectionError` is set when the server refuses the connection (its
 * rate limiter emits `connection:error` and force-disconnects, and
 * Socket.IO never auto-reconnects from a server-initiated disconnect) —
 * callers render it instead of an indefinite "Connecting…".
 */
export function useGameSocket(sessionId: string, onConnect?: () => void) {
  const socket = getSocket()
  const onConnectRef = useRef(onConnect)
  const handledConnectionRef = useRef<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Keep the ref current post-render (not during render, which oxlint's
  // react(refs) rule correctly flags as unsafe) so a new inline callback
  // on every render doesn't force the connection effect below to re-run.
  useEffect(() => {
    onConnectRef.current = onConnect
  })

  useEffect(() => {
    function handleConnect() {
      setConnectionError(null)
      const connectionKey = `${sessionId}:${socket.id}`
      if (handledConnectionRef.current === connectionKey) return
      handledConnectionRef.current = connectionKey
      onConnectRef.current?.()
    }
    function handleConnectionError(payload: { error: string }) {
      setConnectionError(payload.error)
    }
    function handleDisconnect(reason: string) {
      if (reason === 'io server disconnect') setConnectionError((current) => current ?? SERVER_DISCONNECT_MESSAGE)
    }

    activeConsumers += 1
    socket.on('connect', handleConnect)
    socket.on('connection:error', handleConnectionError)
    socket.on('disconnect', handleDisconnect)
    if (socket.connected) handleConnect()
    else socket.connect()

    return () => {
      socket.off('connect', handleConnect)
      socket.off('connection:error', handleConnectionError)
      socket.off('disconnect', handleDisconnect)
      activeConsumers -= 1
      setTimeout(() => {
        if (activeConsumers === 0) socket.disconnect()
      }, 0)
    }
  }, [socket, sessionId])

  return { socket, connectionError }
}
