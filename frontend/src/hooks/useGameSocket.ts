import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'

const PARTICIPANT_TOKEN_KEY = 'pulz:participantToken'

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
 */
export function useGameSocket(sessionId: string, onConnect?: () => void) {
  const socket = getSocket()
  const onConnectRef = useRef(onConnect)

  // Keep the ref current post-render (not during render, which oxlint's
  // react(refs) rule correctly flags as unsafe) so a new inline callback
  // on every render doesn't force the connection effect below to re-run.
  useEffect(() => {
    onConnectRef.current = onConnect
  })

  useEffect(() => {
    function handleConnect() {
      onConnectRef.current?.()
    }

    socket.on('connect', handleConnect)
    socket.connect()

    return () => {
      socket.off('connect', handleConnect)
      socket.disconnect()
    }
  }, [socket, sessionId])

  return socket
}
