import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000'

let socket: Socket | null = null

// Single shared Socket.IO client (Decision #42) — every view goes through
// this instead of creating its own connection.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false })
    if (import.meta.env.DEV) {
      // Test-only hook: lets E2E tests force a real transport-level drop
      // via `window.__pulzSocket.io.engine.close()` to verify reconnect
      // handling. Playwright's `context.setOffline()` doesn't reliably
      // tear down an already-open WebSocket to a localhost server, so
      // frontend/e2e/transport-reconnect.spec.ts uses this instead.
      ;(window as unknown as { __pulzSocket?: Socket }).__pulzSocket = socket
    }
  }
  return socket
}
