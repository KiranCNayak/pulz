import { randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server as SocketIOServer } from "socket.io";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// writeResultsSnapshot hits Prisma/Postgres — mocked so this suite stays
// DB-free even though it drives a real Socket.IO server (only game end
// touches Postgres, and this test never ends a game, but importing the
// socket layer pulls results.service in transitively). vi.hoisted is
// required because vi.mock's factory is hoisted above regular imports.
const writeResultsSnapshotMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../services/results.service.js", () => ({
  writeResultsSnapshot: writeResultsSnapshotMock,
}));

import { createSocketServer } from "./index.js";
import { SOCKET_MESSAGE_RATE_LIMIT } from "../domain/constants.js";
import { allocateJoinCode, createSessionId, deleteSession, putSession } from "../domain/sessionStore.js";
import type { GameSession, SnapshotQuestion } from "../types/session.js";

// Upper bound for any single awaited event — generous for a loopback
// round-trip, but short enough that a missing event fails fast instead
// of hanging until Vitest's own test timeout.
const EVENT_TIMEOUT_MS = 2000;

let httpServer: HttpServer;
let io: SocketIOServer;
let baseUrl: string;
const clients: ClientSocket[] = [];
const sessionIds: string[] = [];

function makeQuestion(id: string, correctOptionId: string): SnapshotQuestion {
  return {
    id,
    text: `Question ${id}`,
    mediaUrl: null,
    timeLimitSeconds: 20,
    options: [
      { id: `${id}-a`, text: "A", isCorrect: correctOptionId === `${id}-a` },
      { id: `${id}-b`, text: "B", isCorrect: correctOptionId === `${id}-b` },
    ],
  };
}

/** Registers a real, joinable session in the in-process store — the same
 * path POST /quizzes/:id/sessions takes, minus the Prisma quiz read. */
function makeSession(questions: SnapshotQuestion[]): GameSession {
  const session: GameSession = {
    id: createSessionId(),
    joinCode: allocateJoinCode(),
    quizId: "quiz-1",
    hostToken: randomBytes(16).toString("hex"),
    displayToken: randomBytes(16).toString("hex"),
    status: "LOBBY",
    questions,
    currentQuestionIndex: -1,
    participants: new Map(),
    participantTokens: new Map(),
    createdAt: Date.now(),
    resultsTtlHours: 24,
  };
  putSession(session);
  sessionIds.push(session.id);
  return session;
}

/** A fresh client per simulated device. Each gets its own random
 * `clientId` so the composite-key (IP + clientId) connect/join rate
 * limiters (Decision #59) treat them as distinct devices on loopback. */
async function connect(): Promise<ClientSocket> {
  const socket = connectClient(baseUrl, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: { clientId: randomBytes(16).toString("hex") },
  });
  clients.push(socket);
  await waitFor(socket, "connect");
  return socket;
}

/** Resolves with the next `event` payload on `socket`, or rejects after
 * EVENT_TIMEOUT_MS — so "event never arrived" is a clean assertion
 * failure rather than a hung test. */
function waitFor<T = unknown>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out after ${EVENT_TIMEOUT_MS}ms waiting for "${event}"`));
    }, EVENT_TIMEOUT_MS);
    function onEvent(payload: T) {
      clearTimeout(timer);
      resolve(payload);
    }
    socket.once(event, onEvent);
  });
}

beforeAll(async () => {
  httpServer = createServer();
  io = createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(() => {
  for (const socket of clients.splice(0)) socket.disconnect();
  for (const id of sessionIds.splice(0)) deleteSession(id);
});

afterAll(async () => {
  // io.close() also closes the attached http server.
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

describe("disconnect guard (session.socket.ts)", () => {
  it("a stale socket's late disconnect does not mark a reconnected participant disconnected", async () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);

    // Client A joins fresh and gets the participant token it would keep
    // in localStorage for reconnects (ARCHITECTURE.md §6).
    const clientA = await connect();
    clientA.emit("join:request", { joinCode: session.joinCode, displayName: "Alex" });
    const joinedA = await waitFor<{ participantId: string; participantToken: string }>(clientA, "join:accepted");

    // Client B is the "same player" reconnecting on a new transport
    // *before* A's old connection has been torn down — the ordering the
    // guard exists for (a page refresh or network flip can land the new
    // socket's join ahead of the old socket's disconnect).
    const clientB = await connect();
    clientB.emit("join:request", { joinCode: session.joinCode, participantToken: joinedA.participantToken });
    const joinedB = await waitFor<{ participantId: string; resumed?: boolean }>(clientB, "join:accepted");
    expect(joinedB).toMatchObject({ participantId: joinedA.participantId, resumed: true });

    const participant = session.participants.get(joinedA.participantId)!;
    expect(session.participants.size).toBe(1);
    expect(participant.socketId).toBe(clientB.id); // client/server socket ids match in Socket.IO v4

    // Now the stale socket A goes away. Hook the *server-side* socket's
    // own "disconnect" — registered after registerSessionHandlers' one,
    // and listeners fire in registration order, so once this resolves
    // the session handler has already run. No sleep/poll needed.
    const serverSocketA = io.of("/").sockets.get(clientA.id!);
    expect(serverSocketA).toBeDefined();
    const serverSawDisconnect = new Promise<void>((resolve) => serverSocketA!.once("disconnect", () => resolve()));
    clientA.disconnect();
    await serverSawDisconnect;

    expect(participant.connected).toBe(true);
    expect(participant.socketId).toBe(clientB.id);

    // End-to-end consequence: B is the only connected player, so answering
    // closes the question on its own (Decision #63) and B gets a result.
    // Without the guard B would count as disconnected — nothing would lock
    // and no `answer:result` would ever arrive.
    const host = await connect();
    host.emit("host:auth", { sessionId: session.id, hostToken: session.hostToken });
    await waitFor(host, "host:auth_ok");

    const broadcast = waitFor<{ questionId: string }>(clientB, "question:broadcast");
    host.emit("game:start");
    const { questionId } = await broadcast;

    // Arm every listener before emitting: ack, lock and result can land in
    // the same tick.
    const ack = waitFor(clientB, "answer:ack");
    const result = waitFor<{ isCorrect: boolean; pointsEarned: number }>(clientB, "answer:result");
    clientB.emit("answer:submit", { questionId, selectedOptionId: "q1-a" });
    await ack;
    const answerResult = await result;
    expect(answerResult.isCorrect).toBe(true);
    expect(answerResult.pointsEarned).toBeGreaterThan(0);
  });
});

describe("auto-lock once everyone has answered (Decision #63)", () => {
  it("keeps the question open until the last connected player answers, then reveals to all", async () => {
    const session = makeSession([makeQuestion("q1", "q1-a")]);

    const players = [];
    for (const name of ["Alex", "Sam"]) {
      const client = await connect();
      client.emit("join:request", { joinCode: session.joinCode, displayName: name });
      await waitFor(client, "join:accepted");
      players.push(client);
    }
    const [alex, sam] = players;

    const host = await connect();
    host.emit("host:auth", { sessionId: session.id, hostToken: session.hostToken });
    await waitFor(host, "host:auth_ok");
    const broadcast = waitFor<{ questionId: string }>(alex, "question:broadcast");
    host.emit("game:start");
    const { questionId } = await broadcast;

    // First answer: Sam still owes one, so the question stays open.
    const alexAck = waitFor(alex, "answer:ack");
    alex.emit("answer:submit", { questionId, selectedOptionId: "q1-a" });
    await alexAck;
    expect(session.current?.phase).toBe("ACTIVE");

    // Last answer closes it — no host click, no timer.
    const locked = waitFor<{ reason: string }>(host, "question:locked");
    const alexResult = waitFor<{ isCorrect: boolean }>(alex, "answer:result");
    const samResult = waitFor<{ isCorrect: boolean }>(sam, "answer:result");
    sam.emit("answer:submit", { questionId, selectedOptionId: "q1-b" });

    expect((await locked).reason).toBe("all_answered");
    expect((await alexResult).isCorrect).toBe(true);
    expect((await samResult).isCorrect).toBe(false);
  });
});

describe("per-connection message cap (ARCHITECTURE.md §11)", () => {
  it("lets a burst up to the cap through, then refuses and disconnects the flooding client", async () => {
    const client = await connect();
    const refused = waitFor<{ error: string }>(client, "connection:error");
    const dropped = waitFor<string>(client, "disconnect");

    // promotion:request from a socket that never joined is a harmless no-op
    // server-side — pure message volume.
    for (let i = 0; i < SOCKET_MESSAGE_RATE_LIMIT; i++) client.emit("promotion:request");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(client.connected).toBe(true);

    client.emit("promotion:request"); // one over the cap
    expect((await refused).error).toMatch(/Too many messages/);
    expect(await dropped).toBe("io server disconnect");
  });
});
