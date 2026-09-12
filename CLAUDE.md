# CLAUDE.md — Pulz

Guidance for any Claude (or other) agent picking up this repository.

## What this project is

Pulz is a live, real-time quiz platform (Kahoot!-style): a host runs a
synchronous quiz session, players join from any device via a short join
code (no account needed), answer on a color/shape button grid, and see
live scoring, leaderboard rank, and a podium finish.

## Current status (2026-09-12)

**Design phase — no implementation yet.** The repo currently contains only
documentation. Do not assume any backend/frontend code exists until you've
checked — verify with `ls`/`git log`, don't rely on this file staying
current about that fact.

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

No code exists yet. The natural next steps, roughly in order:
1. Scaffold the backend (Fastify + Socket.IO + Postgres client) per
   `docs/ARCHITECTURE.md`.
2. Scaffold the frontend (React + Vite) with the route structure from
   `docs/ARCHITECTURE.md` §5.
3. Implement the Creator flow (quiz CRUD) first — it's the simplest,
   least real-time-dependent piece, and everything else depends on a quiz
   existing.
4. Implement the session/game loop (join, lobby, question broadcast,
   answer submission, scoring, leaderboard) per the state machine and
   event catalogue in `docs/DESIGN.md`.
5. Implement the podium/results flow, including the TTL cleanup sweep.

If you're an agent starting implementation, confirm with the project
owner which of these to tackle first rather than assuming — this list is
a plausible ordering, not a locked-in plan.
