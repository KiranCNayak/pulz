import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env.js";
import {
  SOCKET_CONNECT_RATE_LIMIT,
  SOCKET_CONNECT_RATE_WINDOW_MS,
} from "../domain/constants.js";
import { compositeRateKey, SlidingWindowLimiter } from "../domain/rateLimiter.js";
import { registerSessionHandlers } from "./session.socket.js";

/**
 * Wires up the Socket.IO realtime layer per ARCHITECTURE.md §1: rooms map
 * 1:1 onto GameSession (room name = sessionId), and Controller / Display /
 * Player / Spectator are distinguished by which room(s) a socket joins,
 * not by separate protocols.
 *
 * The full session/game-loop state machine (DESIGN.md §2, §3, §5) lives
 * in sockets/session.socket.ts and services/gameLoop.service.ts.
 */
export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.corsOrigin.split(",").map((o) => o.trim()),
    },
  });

  // New-connection cap per composite key (ARCHITECTURE.md §11 table row
  // 3) — a coarse backstop against connection flooding, ahead of the
  // edge-layer (Cloudflare) protections which are infra, not this
  // process's job. Keyed on IP + the client's self-assigned `clientId`
  // (sent in the handshake's `auth`), not raw IP: every device in a
  // shared-IP classroom opens its own connection(s) within the same
  // minute, which a raw-IP cap would reject after the first ~20.
  const connectLimiter = new SlidingWindowLimiter(SOCKET_CONNECT_RATE_LIMIT, SOCKET_CONNECT_RATE_WINDOW_MS);

  io.on("connection", (socket) => {
    const rateKey = compositeRateKey(socket.handshake.address, socket.handshake.auth?.clientId);
    if (!connectLimiter.consume(rateKey)) {
      socket.emit("connection:error", { error: "Too many connections — slow down" });
      socket.disconnect(true);
      return;
    }
    registerSessionHandlers(io, socket);
  });

  return io;
}
