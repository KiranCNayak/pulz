# CLAUDE.md — Pulz

Guidance for any Claude (or other) agent picking up this repository.

## What this project is

Pulz is a live, real-time quiz platform (Kahoot!-style): a host runs a
synchronous quiz session, players join from any device via a short join
code (no account needed), answer on a color/shape button grid, and see
live scoring, leaderboard rank, and a podium finish.

## Current status (2026-09-28)

**The MVP is feature-complete and verified end-to-end.** Don't assume this
summary stays accurate as work continues — verify with `ls`/`git log`, and
see `docs/DECISIONS.md` (the log runs to #66) for the why behind each piece.

- **Creator flow** (`/create`, `/quizzes/:id/edit`): capability-bearer-token
  identity (Decision #38 — no password/email/OAuth, no account recovery by
  design), quiz CRUD, and "Start session" with a results-retention choice
  (1/6/24h, Decision #65) that hands off Host/Display links.
- **Live game** over Socket.IO: Host controller, projector Display, and
  player phones that mirror the Display's shape layout (Decision #62). Join
  by code; late joiners spectate and can request to play; questions close
  when the host locks, the timer runs out, or every connected player has
  answered (Decision #63); scoring is server-authoritative (DESIGN.md §5).
- **Reconnect everywhere**: players (page refresh or network drop,
  Decisions #53/#58) and Host/Display (Decision #64) resume mid-game.
- **Results**: podium + paginated ranks at `/results/:sessionId`, from a
  `ResultsSnapshot` that expires per the session's retention choice.
- **Abuse resilience (app-level)**: join-code lockout, composite-key
  (IP + client id) connect/join limits, a per-connection message cap, and a
  registration limit (Decisions #23, #59, #66, #38). The Cloudflare/Turnstile
  edge layer is deployment infra, not yet provisioned.
- **Tests**: backend Vitest (unit + real-Socket.IO integration), frontend
  Vitest, and a Playwright E2E suite run against `docker compose up`
  (stable since Decision #59). `cd backend && npm run demo` seeds a
  playable 8-question game for manual checks.

There is also a **`backend-go/`** directory — this is a separate,
non-shipping performance-exploration module (Go), not an alternative or
successor to `backend/`. Do not port MVP work there or treat it as the
real backend. See `docs/GO_V2_EXPLORATION.md` and Decision #31.

## Read these first, in order

1. **`docs/PRD.md`** — product requirements: goals/non-goals, roles, user
   flows, the scoring model (with a worked example), leaderboard rules.
2. **`docs/DESIGN.md`** — functional design: entities, validation
   invariants, the session state machine, the realtime event catalogue,
   scoring pseudocode.
3. **`docs/ARCHITECTURE.md`** — tech stack and infra choices (Node.js +
   TypeScript, Fastify, Socket.IO, Postgres, hosting), each with the
   reasoning behind it.
4. **`docs/DECISIONS.md`** — a flat, quick-reference log of settled
   decisions with pointers to where each is detailed. **Check this before
   proposing to change something** — most "obvious alternatives" (e.g.
   rank-based scoring, bulk spectator approval, horizontal scaling) were
   already considered and deliberately deferred or rejected; the reasoning
   is recorded so it doesn't need to be rediscovered.

## Working conventions

- **Docs are living, not archival.** If you make a design or architecture
  decision in the course of implementation, add a row to
  `docs/DECISIONS.md` and update the relevant doc — don't let decisions
  live only in a commit message or PR description.
- **Push directly to `main`.** No PR-gated workflow for this phase (see
  Decision #19) — this is a deliberate, current instruction from the
  project owner, not a general default; re-confirm if the contributor
  pool or process expectations change.
- **Don't relitigate settled trade-offs** (see `docs/DECISIONS.md`)
  without an explicit new instruction. It's fine to flag a concern about
  one, but implement per the doc unless told otherwise.
- **Validation is server-authoritative.** Per PRD §5, scores/points are
  never trusted from the client — always computed server-side from raw
  answer + timestamp data. Keep this invariant when implementing the
  answer-submission path.
- **MVP scope discipline:** `docs/PRD.md` §9 and `docs/ARCHITECTURE.md` §8
  list explicit non-goals (native apps, rank-based scoring, horizontal
  scaling, bulk approvals, etc.). Don't build these speculatively — flag
  them as future work if they come up.

## What's left (as of 2026-09-28)

Everything tracked as a gap is closed. Remaining items are all deliberate
deferrals — **confirm with the project owner before starting any of them**:

1. **Postgres-backed integration tests** for the CRUD services
   (`quiz.service.ts`, `auth.service.ts`, `session.service.ts`) — deferred
   by the owner (Decision #56 for why they weren't in the first test pass).
2. **Deployment**, including the edge layer (Cloudflare + conditional
   Turnstile, ARCHITECTURE.md §11). At that point the rate limiters must
   read the real client IP from `CF-Connecting-IP` (trusting it only from
   Cloudflare), and the frontend must be built with `VITE_API_URL` /
   `VITE_SOCKET_URL` pointing at the real backend, with `CORS_ORIGIN` set to
   the real frontend origin.
3. **Account recovery / cross-device Creator access** — deliberately not
   built (Decision #38); a passwordless-email upgrade is the documented
   option if the owner ever wants it. Don't build it speculatively.

**Separately:** `backend-go/` is a low-priority, owner-driven exploration
to measure Go vs. Node performance for this workload — see
`docs/GO_V2_EXPLORATION.md`. It currently has only a health-check endpoint.
Pick it up only if explicitly asked to.
