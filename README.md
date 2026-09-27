# Pulz

Live, real-time quiz platform (Kahoot!-style). Host runs a synchronous quiz
session; players join from any device via a short join code, answer on a
color/shape button grid, and see live scoring.

See:
- [`CLAUDE.md`](CLAUDE.md) — orientation for any agent/contributor picking
  this up
- [`docs/PRD.md`](docs/PRD.md) — product requirements, scope, flows
- [`docs/DESIGN.md`](docs/DESIGN.md) — domain model, state machine, event
  surface
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — tech stack and infra
  choices, with reasoning
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — quick-reference log of
  settled decisions
- [`docs/GO_V2_EXPLORATION.md`](docs/GO_V2_EXPLORATION.md) — scope of the
  `backend-go/` performance exploration (not the MVP backend)
- [`docs/FRONTEND_PLAN.md`](docs/FRONTEND_PLAN.md) — frontend plan,
  settled decisions, progress checklist, and how to run the stack locally.

## Layout

- [`backend/`](backend/) — the real MVP backend (Node.js/TypeScript,
  Fastify + Socket.IO + Prisma/Postgres): Creator auth and quiz CRUD,
  session creation, the full realtime game loop, and results. See
  `CLAUDE.md` for current status and next steps.
- [`backend-go/`](backend-go/) — **not** the MVP backend. A separate,
  low-priority Go performance-exploration module; see
  `docs/GO_V2_EXPLORATION.md`.
- [`frontend/`](frontend/) — React + Vite SPA. All seven routes (Creator
  flows, Host, Display, Join/Play, Results) are implemented, including the
  Creator→session hand-off. Manually verified end-to-end against a live
  backend and covered by three Playwright E2E tests. See
  `docs/FRONTEND_PLAN.md`.

**Status:** MVP backend implemented and verified end-to-end (67 automated
tests); frontend's full user journey (create → start session →
host/display/play → results) is implemented, manually verified
end-to-end, and covered by three automated E2E tests, which are stable
(Decision #59 fixed the earlier flakiness). See `docs/FRONTEND_PLAN.md`
for the plan/progress and how to run the stack locally, and `CLAUDE.md`
for the full up-to-date picture.

## Local development

`docker compose up --build` from the repo root starts Postgres, the
backend, and the frontend together. With that running,
`cd frontend && npm run test:e2e` runs the E2E suite — see
`docs/FRONTEND_PLAN.md` for details. Each full E2E run registers 3
Creators against `POST /auth/register`'s 10/hour-per-IP limit, so after
~3 runs in an hour, `docker compose restart backend` to reset it.

## Screenshots

| Create | Create (dark mode) |
| --- | --- |
| ![Create a quiz](docs/screenshots/create.jpg) | ![Create a quiz in dark mode](docs/screenshots/create-dark.jpg) |

| Edit + start session |
| --- |
| ![Edit quiz with a live session](docs/screenshots/edit.jpg) |

| Join | Host controller |
| --- | --- |
| ![Join a game](docs/screenshots/join.jpg) | ![Host controller](docs/screenshots/host.jpg) |

| Display (cast) | Play |
| --- | --- |
| ![Display view](docs/screenshots/display.jpg) | ![Player answering a question](docs/screenshots/play.jpg) |

| Results |
| --- |
| ![Final results podium](docs/screenshots/results.jpg) |
