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

**Status:** MVP backend implemented and verified end-to-end (68 automated
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
`docs/FRONTEND_PLAN.md` for details. (The dev stack raises
`POST /auth/register`'s 10/hour-per-IP production limit so the suite can
be re-run freely — Decision #60.)

### Try a game with dummy questions

With the stack up, `cd backend && npm run demo` creates an 8-question
general-knowledge quiz, starts a live session, and prints the join code
plus the Host and Display links. Open the Host link in one window, the
Display link in another, and join as players at `http://localhost:5173/join`
— one player per browser or profile (tabs in one browser share storage).
Sessions live in backend memory, so after a backend restart just run it
again.

## Screenshots

| Create | Create (dark mode) |
| --- | --- |
| ![Create a quiz](docs/screenshots/create.jpg) | ![Create a quiz in dark mode](docs/screenshots/create-dark.jpg) |

| Edit + start session |
| --- |
| ![Edit quiz with a live session](docs/screenshots/edit.jpg) |

| Join | Host controller |
| --- | --- |
| ![Join a game](docs/screenshots/join.jpg) | ![Host controller after a question is locked](docs/screenshots/host.jpg) |

| Display — lobby | Display — question |
| --- | --- |
| ![Display lobby with the join code](docs/screenshots/display-lobby.jpg) | ![Display showing a live question](docs/screenshots/display.jpg) |

| Display — reveal + leaderboard | Display — podium |
| --- | --- |
| ![Display revealing the correct answer beside the leaderboard](docs/screenshots/display-reveal.jpg) | ![Display end-of-game podium](docs/screenshots/display-podium.jpg) |

| Play (phone) — question | Play (phone) — result |
| --- | --- |
| <img src="docs/screenshots/play.jpg" alt="Player's phone: shape-only answer tiles mirroring the Display layout" width="260"> | <img src="docs/screenshots/play-result.jpg" alt="Player's correct-answer result screen" width="260"> |

| Results (phone) |
| --- |
| <img src="docs/screenshots/results.jpg" alt="Final results podium on a phone" width="260"> |
