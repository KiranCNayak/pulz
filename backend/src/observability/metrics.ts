// Pulz-specific metrics (ARCHITECTURE.md §13, docs/OBSERVABILITY.md).
// The HTTP and runtime instrumentations can't see inside the game loop
// or the Socket.IO rate limiters, so these cover what they miss.
//
// Attribute values always come from a fixed, server-defined set — never
// session ids, join codes or client-sent event names — so the series
// count stays far inside Grafana Cloud's free 10k-active-series budget.
// Until telemetry.ts starts the SDK the API hands out no-op instruments,
// so tests and un-configured dev runs record nothing. The meter is taken
// at import time and the API has no proxy for it, which is one more reason
// telemetry.ts must be index.ts's first import.

import { metrics } from "@opentelemetry/api";
import type { Server } from "socket.io";
import { sessionStats } from "../domain/sessionStore.js";

const meter = metrics.getMeter("pulz");

export const gamesStarted = meter.createCounter("pulz.games.started", {
  description: "Games moved from LOBBY to IN_PROGRESS",
});

export const gamesEnded = meter.createCounter("pulz.games.ended", {
  description: "Games that reached ENDED and wrote a results snapshot",
});

/** `reason`: host | timer | all_answered (gameLoop's LockReason). */
export const questionsLocked = meter.createCounter("pulz.questions.locked", {
  description: "Questions closed, by what closed them",
});

/** `correct`: true | false. */
export const answersSubmitted = meter.createCounter("pulz.answers.submitted", {
  description: "Accepted answer submissions",
});

/** `outcome`: accepted | resumed | invalid_code | rejected | throttled. */
export const joinAttempts = meter.createCounter("pulz.join.attempts", {
  description: "join:request outcomes",
});

/** `limiter`: socket_connect | socket_message | join | join_code_lockout | register. */
export const rateLimited = meter.createCounter("pulz.rate_limit.rejections", {
  description: "Requests turned away by an in-process limiter (ARCHITECTURE.md §11)",
});

// Start every known series at 0. A cumulative counter otherwise first
// reaches Prometheus already at 1, and rate()/increase() never count that
// first event — after a deploy or Fly auto-stop, the first game, join or
// rejection would be invisible on the dashboard and to alerts.
gamesStarted.add(0);
gamesEnded.add(0);
for (const reason of ["host", "timer", "all_answered"]) questionsLocked.add(0, { reason });
for (const correct of [true, false]) answersSubmitted.add(0, { correct });
for (const outcome of ["accepted", "resumed", "invalid_code", "rejected", "throttled"]) {
  joinAttempts.add(0, { outcome });
}
for (const limiter of ["socket_connect", "socket_message", "join", "join_code_lockout", "register"]) {
  rateLimited.add(0, { limiter });
}

/** Gauges over the in-memory session store and the Socket.IO server —
 * called once from createSocketServer, since that's where `io` exists. */
export function observeLiveState(io: Server): void {
  meter
    .createObservableGauge("pulz.sessions", { description: "In-memory sessions, by status" })
    .addCallback((result) => {
      for (const [status, count] of Object.entries(sessionStats().sessionsByStatus)) {
        result.observe(count, { status });
      }
    });

  meter
    .createObservableGauge("pulz.participants.connected", {
      description: "Connected players and spectators across live sessions",
    })
    .addCallback((result) => result.observe(sessionStats().connectedParticipants));

  meter
    .createObservableGauge("pulz.sockets.connected", {
      description: "Open Socket.IO connections, authenticated or not",
    })
    .addCallback((result) => result.observe(io.engine.clientsCount));
}
