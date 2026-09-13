import type { Server, Socket } from "socket.io";
import {
  JOIN_CODE_LOCKOUT_DURATION_MS,
  JOIN_CODE_LOCKOUT_THRESHOLD,
  JOIN_CODE_LOCKOUT_WINDOW_MS,
  JOIN_IP_RATE_LIMIT,
  JOIN_IP_RATE_WINDOW_MS,
} from "../domain/constants.js";
import { LockoutTracker, SlidingWindowLimiter } from "../domain/rateLimiter.js";
import { getSessionById, getSessionByJoinCode, resolveParticipant } from "../domain/sessionStore.js";
import * as gameLoop from "../services/gameLoop.service.js";
import { controllerRoom, displayRoom, baseRoom } from "../services/gameLoop.service.js";
import { createParticipant, lobbyParticipantList, roleForJoin, validateDisplayName } from "../services/join.service.js";
import type { GameSession, Participant } from "../types/session.js";

// Realtime event names implement the catalogue in DESIGN.md §3, plus
// host/display auth and the promotion flow. The full join/lobby/
// question/answer/scoring/end-game state machine lives here; the pure
// transition logic itself is in services/gameLoop.service.js and
// services/join.service.js so it isn't tangled up with Socket.IO wiring.

// Join-code brute-force lockout (DESIGN.md §8, Decision #23) and the
// loose per-IP join limiter (ARCHITECTURE.md §11) are module-level,
// process-lifetime state — deliberately not per-session (see
// types/session.ts's note on GameSession).
const joinCodeLockout = new LockoutTracker(
  JOIN_CODE_LOCKOUT_THRESHOLD,
  JOIN_CODE_LOCKOUT_WINDOW_MS,
  JOIN_CODE_LOCKOUT_DURATION_MS,
);
const joinIpLimiter = new SlidingWindowLimiter(JOIN_IP_RATE_LIMIT, JOIN_IP_RATE_WINDOW_MS);

type SocketRole = "HOST" | "DISPLAY" | "PARTICIPANT";
interface SocketContext {
  sessionId: string;
  role: SocketRole;
  participantId?: string;
}
// socket.id -> what this socket is authenticated as, for routing
// per-socket commands (host actions, answer submissions) without
// re-validating a token on every single message.
const socketContexts = new Map<string, SocketContext>();

function socketIp(socket: Socket): string {
  return socket.handshake.address;
}

function hostSnapshot(session: GameSession) {
  return {
    sessionId: session.id,
    joinCode: session.joinCode,
    status: session.status,
    questionCount: session.questions.length,
    currentQuestionIndex: session.currentQuestionIndex,
    participants: lobbyParticipantList(session),
  };
}

export function registerSessionHandlers(io: Server, socket: Socket): void {
  socket.on("host:auth", (payload: { sessionId?: string; hostToken?: string }) => {
    const session = payload?.sessionId ? getSessionById(payload.sessionId) : undefined;
    if (!session || session.hostToken !== payload?.hostToken) {
      socket.emit("host:auth_error", { error: "Invalid session or host token" });
      return;
    }
    socketContexts.set(socket.id, { sessionId: session.id, role: "HOST" });
    socket.join(baseRoom(session.id));
    socket.join(controllerRoom(session.id));
    socket.emit("host:auth_ok", hostSnapshot(session));
  });

  socket.on("display:auth", (payload: { sessionId?: string; displayToken?: string }) => {
    const session = payload?.sessionId ? getSessionById(payload.sessionId) : undefined;
    if (!session || session.displayToken !== payload?.displayToken) {
      socket.emit("display:auth_error", { error: "Invalid session or display token" });
      return;
    }
    socketContexts.set(socket.id, { sessionId: session.id, role: "DISPLAY" });
    socket.join(baseRoom(session.id));
    socket.join(displayRoom(session.id));
    socket.emit("display:auth_ok", { sessionId: session.id, status: session.status });
  });

  /**
   * `join:request` (DESIGN.md §3). Handles both a fresh join and a
   * reconnect (ARCHITECTURE.md §6) via an optional `participantToken` —
   * idempotent per DESIGN.md §8 so a flaky-network retry resumes the same
   * Participant instead of creating a duplicate.
   */
  socket.on(
    "join:request",
    (payload: { joinCode?: string; displayName?: string; participantToken?: string }) => {
      const joinCode = (payload?.joinCode ?? "").trim().toUpperCase();
      if (!joinCode) {
        socket.emit("join:error", { error: "joinCode is required" });
        return;
      }

      if (joinCodeLockout.isLockedOut(joinCode)) {
        socket.emit("join:error", { error: "Too many attempts against this code — try again later" });
        return;
      }
      if (!joinIpLimiter.consume(socketIp(socket))) {
        socket.emit("join:error", { error: "Too many join attempts — slow down" });
        return;
      }

      const session = getSessionByJoinCode(joinCode);
      if (!session) {
        joinCodeLockout.recordFailure(joinCode);
        socket.emit("join:error", { error: "Invalid or expired join code" });
        return;
      }

      // Reconnect path: an existing, valid participant token for *this*
      // session resumes rather than creating a new Participant.
      if (payload.participantToken) {
        const existing = resolveParticipant(session, payload.participantToken);
        if (existing) {
          existing.connected = true;
          existing.socketId = socket.id;
          socketContexts.set(socket.id, { sessionId: session.id, role: "PARTICIPANT", participantId: existing.id });
          socket.join(baseRoom(session.id));
          joinCodeLockout.recordSuccess(joinCode);
          socket.emit("join:accepted", {
            participantId: existing.id,
            participantToken: existing.token,
            role: existing.role,
            resumed: true,
          });
          io.to(baseRoom(session.id)).emit("session:lobby_update", { participants: lobbyParticipantList(session) });
          return;
        }
        // Stale/unknown token — fall through to a fresh join below.
      }

      const displayName = validateDisplayName(payload.displayName);
      const role = roleForJoin(session);
      if (!displayName || !role) {
        joinCodeLockout.recordFailure(joinCode);
        socket.emit("join:error", {
          error: !role ? "This session has ended" : "displayName is required (1-24 characters)",
        });
        return;
      }

      const participant = createParticipant(session, displayName, role);
      participant.socketId = socket.id;
      socketContexts.set(socket.id, { sessionId: session.id, role: "PARTICIPANT", participantId: participant.id });
      socket.join(baseRoom(session.id));
      joinCodeLockout.recordSuccess(joinCode);

      socket.emit("join:accepted", { participantId: participant.id, participantToken: participant.token, role });
      io.to(baseRoom(session.id)).emit("session:lobby_update", { participants: lobbyParticipantList(session) });
    },
  );

  socket.on("game:start", () => {
    const { session } = requireHost(socket);
    if (!session) return;
    const result = gameLoop.startGame(io, session);
    if (!result.ok) socket.emit("host:error", { error: result.error });
  });

  socket.on("host:lock_question", () => {
    const { session } = requireHost(socket);
    if (!session) return;
    const result = gameLoop.lockQuestion(io, session);
    if (!result.ok) socket.emit("host:error", { error: result.error });
  });

  socket.on("host:next_question", () => {
    const { session } = requireHost(socket);
    if (!session) return;
    void gameLoop.advance(io, session).then((result) => {
      if (!result.ok) socket.emit("host:error", { error: result.error });
    });
  });

  socket.on(
    "answer:submit",
    (payload: { questionId?: string; selectedOptionId?: string }) => {
      const { session, participant } = requireParticipant(socket);
      if (!session || !participant) {
        socket.emit("answer:error", { error: "Not joined to a session" });
        return;
      }
      if (!payload?.questionId || !payload?.selectedOptionId) {
        socket.emit("answer:error", { error: "questionId and selectedOptionId are required" });
        return;
      }
      const result = gameLoop.submitAnswer(session, participant, payload.questionId, payload.selectedOptionId);
      if (!result.ok) {
        socket.emit("answer:error", { error: result.error });
        return;
      }
      socket.emit("answer:ack", { received: true });
    },
  );

  socket.on("promotion:request", () => {
    const { session, participant } = requireParticipant(socket);
    if (!session || !participant) return;
    if (participant.role !== "SPECTATOR") return; // already a Player, or invalid — no-op
    participant.promotionStatus = "REQUESTED";
    io.to(controllerRoom(session.id)).emit("promotion:incoming", {
      participantId: participant.id,
      displayName: participant.displayName,
    });
  });

  socket.on("promotion:decision", (payload: { participantId?: string; approve?: boolean }) => {
    const { session } = requireHost(socket);
    if (!session || !payload?.participantId) return;
    const participant = session.participants.get(payload.participantId);
    if (!participant || participant.role !== "SPECTATOR") return;

    // No retroactive points for questions missed while spectating
    // (Decision #13) — promotion only changes `role` going forward.
    participant.promotionStatus = payload.approve ? "APPROVED" : "DENIED";
    if (payload.approve) participant.role = "PLAYER";

    if (participant.connected && participant.socketId) {
      io.to(participant.socketId).emit("promotion:result", { approved: Boolean(payload.approve) });
    }
    io.to(baseRoom(session.id)).emit("session:lobby_update", { participants: lobbyParticipantList(session) });
  });

  socket.on("disconnect", () => {
    const ctx = socketContexts.get(socket.id);
    socketContexts.delete(socket.id);
    if (!ctx || ctx.role !== "PARTICIPANT" || !ctx.participantId) return;
    const session = getSessionById(ctx.sessionId);
    const participant = session?.participants.get(ctx.participantId);
    // Mark disconnected, don't remove — ARCHITECTURE.md §6 reconnect
    // handling resumes this same Participant via participantToken.
    if (participant) participant.connected = false;
  });
}

function requireHost(socket: Socket): { session?: GameSession } {
  const ctx = socketContexts.get(socket.id);
  if (!ctx || ctx.role !== "HOST") {
    socket.emit("host:error", { error: "Not authenticated as host" });
    return {};
  }
  const session = getSessionById(ctx.sessionId);
  if (!session) {
    socket.emit("host:error", { error: "Session no longer exists" });
    return {};
  }
  return { session };
}

function requireParticipant(socket: Socket): { session?: GameSession; participant?: Participant } {
  const ctx = socketContexts.get(socket.id);
  if (!ctx || ctx.role !== "PARTICIPANT" || !ctx.participantId) return {};
  const session = getSessionById(ctx.sessionId);
  const participant = session?.participants.get(ctx.participantId);
  return { session, participant };
}
