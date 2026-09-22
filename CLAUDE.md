# CLAUDE.md — Pulz

Guidance for any Claude (or other) agent picking up this repository.

## What this project is

Pulz is a live, real-time quiz platform (Kahoot!-style): a host runs a
synchronous quiz session, players join from any device via a short join
code (no account needed), answer on a color/shape button grid, and see
live scoring, leaderboard rank, and a podium finish.

## Current status (2026-09-23)

**Backend game loop, results, and Creator identity all implemented;
frontend foundation is scaffolded, feature views in progress — see
`docs/FRONTEND_PLAN.md`.** `backend/` now has, on top of the Fastify +
Prisma/Postgres skeleton and Creator quiz-CRUD REST endpoints:

- **Creator identity is a capability bearer token**, not the old
  `x-creator-id` header: `POST /auth/register` mints a Creator + a random
  token (returned once; only its hash is stored), and every Creator-scoped
  route now requires `Authorization: Bearer <token>`. No password, no
  email, no OAuth dependency — and no account recovery if the token is
  lost, which is the accepted trade-off (see Decision #38). Real
  email/password or OAuth-based auth is still not built and is a
  deliberately separate, deferred upgrade, not a gap in what's shipped.
- `POST /quizzes/:id/sessions` — creates a live `GameSession` from a
  saved quiz (snapshotted, so mid-game Creator edits can't change a
  running game), gated by the same bearer-token auth as quiz CRUD.
- A full Socket.IO game loop (`backend/src/sockets/session.socket.ts`,
  `services/gameLoop.service.ts`, `services/join.service.ts`): host/
  display auth, join/reconnect (idempotent via participant token),
  per-session-shuffled question/option order, server-authoritative
  `answer:submit` scoring (DESIGN.md §5), spectator promotion request/
  decision, and the state machine per DESIGN.md §2 — collapsed from its
  literal 3 host-clicks-per-question to 2 (see Decision #33).
- Join-code brute-force lockout and basic in-process rate limiting
  (`backend/src/domain/rateLimiter.ts`) per DESIGN.md §8 /
  ARCHITECTURE.md §11 — the app-level piece only; Cloudflare/Turnstile
  edge protection is still not-yet-provisioned infra, not app code.
- `game:ended` writes a `ResultsSnapshot`; `GET /results/:sessionId`
  reads it back, paginated per PRD §6.

Verified end-to-end against a throwaway local Postgres container (both
migrations applied cleanly): register → bearer-token quiz/session
creation → a real Socket.IO client driving a full two-question game
(join, start, answer, lock/reveal/leaderboard, advance, end) → results
fetch, plus the join-code lockout and the `/auth/register` rate limiter,
both confirmed to trip at their exact configured thresholds. See
`docs/DECISIONS.md` #25-#38 for the choices made along the way (Prisma,
folder layout, the 2-click state machine, code-string-keyed lockout
tracking, the capability-token identity model). No frontend code exists
yet. Don't assume this summary stays accurate as work continues — verify
with `ls`/`git log`.

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

## Likely next steps (as of this writing)

Backend now has Creator CRUD, capability-token Creator auth, session
creation, the full game loop, and results (see "Current status" above).
Natural next steps, roughly in order:
1. ~~Scaffold the backend (Fastify + Socket.IO + Postgres client) per
   `docs/ARCHITECTURE.md`.~~ Done.
2. ~~Scaffold the frontend (React + Vite) with the route structure from
   `docs/ARCHITECTURE.md` §5.~~ Done, and all seven feature views
   (Creator flows, Host, Display, Join/Play, Results) are now
   implemented too — see `docs/FRONTEND_PLAN.md` for current status and
   Decisions #39-49. **Open gap:** nothing yet calls
   `POST /quizzes/:id/sessions` from the UI or links a Creator to
   `/host/:sessionId`/`/display/:sessionId` — see `docs/FRONTEND_PLAN.md`
   for what that next piece of work looks like.
3. ~~Finish the Creator flow~~ Done differently than originally planned —
   see Decision #38: instead of email/password or JWT auth
   (`docs/ARCHITECTURE.md` §7, now superseded for the moment), Creator
   identity is a capability bearer token from `POST /auth/register`, with
   no email/password/OAuth at all. Deliberately **not** done: any form of
   account recovery — if a Creator loses their token, their quizzes are
   unrecoverable by design. Revisit only if the project owner decides
   recovery/cross-device portability is worth the added infra (a
   passwordless-email upgrade is the documented option, see Decision
   #38); don't build it speculatively.
4. ~~Implement the session/game loop~~ Done — see Decision #37.
   Not yet done within this: reconnect hasn't been tested against an
   actual dropped connection (only a fresh join was exercised), and the
   abuse-resilience piece is app-level only — the edge layer (Cloudflare,
   Turnstile, ARCHITECTURE.md §11) is still unprovisioned infra.
5. ~~Implement the podium/results flow~~ Done — see Decision #37.
   Podium/results is API-only so far; there's no frontend page rendering
   it yet (that's step 2).

If you're an agent starting implementation, confirm with the project
owner which of these to tackle first rather than assuming — this list is
a plausible ordering, not a locked-in plan.

**Separately, and not part of the above ordering:** `backend-go/` is a
low-priority, owner-driven exploration to measure Go vs. Node performance
for this workload — see `docs/GO_V2_EXPLORATION.md`. It currently has only
a health-check endpoint. Pick it up only if explicitly asked to; it does
not block or get ahead of steps 2–5 above.
