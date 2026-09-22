import { useEffect } from 'react'
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
 * Host/Display/Play views. Owns the socket connection and re-sends the
 * stored participant token on reconnect; each view still listens for its
 * own events (DESIGN.md event catalogue) and holds its own game-loop state
 * in plain React state/context per Decision #46 — not built here.
 */
export function useGameSocket(sessionId: string) {
  const socket = getSocket()

  useEffect(() => {
    socket.connect()

    // TODO(feature agents): emit the role-appropriate join/reconnect event
    // for this sessionId, passing getParticipantToken() when present, per
    // DESIGN.md's event catalogue.

    return () => {
      socket.disconnect()
    }
  }, [socket, sessionId])

  return socket
}
