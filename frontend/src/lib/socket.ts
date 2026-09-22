import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000'

let socket: Socket | null = null

// Single shared Socket.IO client (Decision #42) — every view goes through
// this instead of creating its own connection.
export function getSocket(): Socket {
  socket ??= io(SOCKET_URL, { autoConnect: false })
  return socket
}
