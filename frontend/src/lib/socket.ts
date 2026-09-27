import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000'

const CLIENT_ID_KEY = 'pulz:clientId'

let socket: Socket | null = null

// Opaque per-device tag sent in the handshake so the backend's
// connection/join rate limits key on IP + client id rather than raw IP
// (ARCHITECTURE.md §11) — otherwise a classroom behind one shared IP
// looks like a single client. Not authentication; falls back to an
// in-memory id if storage is unavailable.
function getClientId(): string {
  // getRandomValues, not randomUUID: the latter only exists in secure
  // contexts, and devices on the LAN hit the dev server over plain http.
  const fresh = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY)
    if (stored) return stored
    localStorage.setItem(CLIENT_ID_KEY, fresh)
  } catch {
    // Storage blocked (private mode etc.) — use the one-off id.
  }
  return fresh
}

// Single shared Socket.IO client (Decision #42) — every view goes through
// this instead of creating its own connection.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false, auth: { clientId: getClientId() } })
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
