import type { Server, Socket } from "socket.io";

// Event names as a stub of the catalogue in DESIGN.md §3. Only enough is
// implemented here to prove rooms-as-sessions works end-to-end; the real
// join/lobby/question/answer/scoring logic is CLAUDE.md's step 4
// (session/game loop), including auth of which role a socket may act as,
// the in-memory GameSession/Participant/Answer store (ARCHITECTURE.md
// §2), and the per-code join lockout / rate limiting (ARCHITECTURE.md
// §11). None of that is implemented yet — these are intentionally thin
// stubs, not a shortcut around the real design.

export function registerSessionHandlers(io: Server, socket: Socket): void {
  /**
   * Stub for `join:request` (DESIGN.md §3). Real implementation must:
   * resolve joinCode -> GameSession, apply per-code failed-attempt
   * lockout, assign role (PLAYER pre-start / SPECTATOR post-start per
   * Decision #11), issue a participant token, and emit `join:accepted`.
   * For now it just joins the Socket.IO room named after the session id
   * so broadcasting-to-a-session is exercised end-to-end.
   */
  socket.on("join:request", (payload: { sessionId: string; displayName?: string }) => {
    if (!payload?.sessionId) {
      socket.emit("join:error", { error: "sessionId is required" });
      return;
    }
    socket.join(payload.sessionId);
    socket.emit("join:accepted", {
      participantId: socket.id,
      role: "PLAYER",
      note: "stub handler — full join/lobby/role logic not yet implemented",
    });
    io.to(payload.sessionId).emit("session:lobby_update", {
      participants: [{ id: socket.id, displayName: payload.displayName ?? "Player" }],
    });
  });

  socket.on("disconnect", () => {
    // Real implementation: mark participant as disconnected (not removed
    // — see ARCHITECTURE.md §6 reconnect handling) rather than doing
    // nothing, once Participant state exists.
  });
}
