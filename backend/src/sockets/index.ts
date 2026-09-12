import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env.js";
import { registerSessionHandlers } from "./session.socket.js";

/**
 * Wires up the Socket.IO realtime layer per ARCHITECTURE.md §1: rooms map
 * 1:1 onto GameSession (room name = sessionId), and Controller / Display /
 * Player / Spectator are distinguished by which room(s) a socket joins,
 * not by separate protocols.
 *
 * Handlers here are deliberately minimal/stub for this scaffolding pass —
 * the full session/game-loop state machine and scoring logic (DESIGN.md
 * §2, §3, §5) is CLAUDE.md's step 4, not this one. What's wired up now is
 * just enough to prove a client can connect, join a session's room, and
 * receive a broadcast to it.
 */
export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.corsOrigin.split(",").map((o) => o.trim()),
    },
  });

  io.on("connection", (socket) => {
    registerSessionHandlers(io, socket);
  });

  return io;
}
