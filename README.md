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
- [`docs/FRONTEND_PLAN.md`](docs/FRONTEND_PLAN.md) — **current work in
  progress:** frontend plan, open design decisions, and progress checklist.
  Start here to continue the active work.

## Layout

- [`backend/`](backend/) — the real MVP backend (Node.js/TypeScript,
  Fastify + Socket.IO + Prisma/Postgres). Health check and Creator
  quiz-CRUD scaffolded; see `CLAUDE.md` for current status and next steps.
- [`backend-go/`](backend-go/) — **not** the MVP backend. A separate,
  low-priority Go performance-exploration module; see
  `docs/GO_V2_EXPLORATION.md`.
- [`frontend/`](frontend/) — React + Vite SPA. Foundation (routing,
  Tailwind, shadcn/ui, TanStack Query, shared Socket.IO client, Vitest)
  is scaffolded; the seven feature views are still placeholders. See
  `docs/FRONTEND_PLAN.md`.

**Status:** MVP backend implemented and verified end-to-end; frontend
foundation is scaffolded and the feature views are in progress — see
`docs/FRONTEND_PLAN.md` for the plan and progress, and `CLAUDE.md` for the
full up-to-date picture.
