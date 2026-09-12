# Go v2 Backend — Performance Exploration

**Status:** Exploration only. Not MVP, not scheduled. Owner-initiated
curiosity about Go vs. Node.js performance for this workload — see
`docs/DECISIONS.md` #31.

## Purpose

The Node.js/TypeScript backend (`backend/`, per `docs/ARCHITECTURE.md`) is
the real, shipping MVP backend and stays that way. This track exists
purely to **measure** whether a Go rewrite of the same service would give
a meaningful performance improvement for this specific workload (many
small, latency-sensitive requests: quiz CRUD, and eventually
answer-submission/broadcast under load). It is explicitly a **post-MVP
nice-to-have**, listed in `docs/PRD.md` §10, not a replacement plan.

**This is not a rewrite-and-switch project.** If the numbers come back
favorable, that becomes a new, separate decision to make later — not an
automatic migration.

## Scope of the comparison

To keep this honest and apples-to-apples:
1. Same Postgres schema/migrations (`backend/prisma/migrations`) — the Go
   service points at the **same database**, no schema fork.
2. Same surface to start: `GET /health` and the Creator quiz CRUD
   endpoints (create/list/get/update/delete quiz + questions), since
   that's what exists and is verified in the Node backend today.
3. Same validation rules ported over (exactly-one-correct-option, 5–120s
   time limit clamp) — a perf comparison is meaningless if one side skips
   the work the other side does.
4. **Stretch, not initial scope:** the Socket.IO/realtime layer. Porting
   this raises a real compatibility question, not just a perf one — see
   "Realtime protocol caveat" below. Don't attempt this until the REST-only
   comparison is done and still seems worth extending.

## Stack chosen for the Go side

| Layer | Choice | Why |
|---|---|---|
| HTTP router | `chi` (`github.com/go-chi/chi/v5`) | Idiomatic `net/http`-compatible router, not a bespoke non-standard runtime like `fasthttp`-based frameworks (e.g. Fiber) — keeps the comparison about "Go vs. Node," not "a non-standard HTTP stack vs. Node." |
| DB access | `pgx` (`github.com/jackc/pgx/v5`) + `sqlc` (codegen from SQL, not an ORM) | Closest-to-the-metal option, consistent with "we're specifically testing raw performance" — avoids an ORM's overhead confounding the measurement. Reuses the existing Postgres schema as-is. |
| Config | `godotenv` | Mirrors the Node side's `.env` convention. |
| Linting | `golangci-lint` | Standard Go tooling, catches the equivalent of what ESLint/tsc catch on the Node side. |
| Hot reload (dev) | `air` | Equivalent of `tsx watch` on the Node side. |
| Load testing | `hey` (`github.com/rakyll/hey`) | Single static Go binary, trivial to install via `go install`, no system package manager needed — good fit for "just testing this out" without adding standing infra/tooling. |

**Realtime protocol caveat (read before attempting the stretch scope):**
the Node backend uses Socket.IO, which is its own framing protocol on top
of WebSocket, not raw WebSocket. A Go raw-WebSocket server (e.g. via
`nhooyr.io/websocket` or `gorilla/websocket`) would **not** be
wire-compatible with a Socket.IO client without also implementing (or
finding a maintained Go implementation of) the Socket.IO protocol itself.
Since no frontend exists yet, this is a good moment to note it rather than
discover it mid-port — but it also means "port the realtime layer to Go"
is a bigger task than "port the REST layer," and should be scoped as its
own decision later, not assumed to be a quick follow-on.

## Required local tooling (installed/verified 2026-09-12)

- **Go toolchain:** 1.23.4, already present on this machine (`go version`).
- **`hey`** load-testing binary: install via
  `go install github.com/rakyll/hey@latest` (adds a binary to `$(go env
  GOPATH)/bin` — make sure that's on `PATH`; nothing system-wide).
- **`golangci-lint`**: install via
  `go install github.com/golangci-lint/golangci-lint/cmd/golangci-lint@latest`
  (or `brew install golangci-lint` if preferred — either is fine, not
  scaffolded automatically here since it's a dev-time convenience, not a
  build dependency).
- **`air`**: install via `go install github.com/air-verse/air@latest`
  for hot-reload dev, mirroring the Node backend's `tsx watch`.
- **`sqlc`**: install via `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`
  to generate the DB access layer from the existing SQL migrations.

None of these were installed system-wide by default — each is a
`go install`, scoped to your user's Go bin directory. Run them yourself
when you're ready to actually build against this scaffold; the repo only
commits the project files (`go.mod`, source, config), not tool binaries.

## Benchmark methodology (once both sides are comparable)

1. Run both backends against the **same Postgres instance** (or two
   identical instances) to remove DB variance from the comparison.
2. Use `hey` against the same set of endpoints with the same
   concurrency/request-count parameters against each backend in turn,
   e.g.:
   ```
   hey -n 10000 -c 100 http://localhost:PORT/health
   hey -n 10000 -c 100 -m POST -d '<same quiz payload>' http://localhost:PORT/quizzes
   ```
3. Record: requests/sec, p50/p95/p99 latency, error rate, and memory/CPU
   of the server process during the run (`top`/`htop` or `go tool pprof`
   for the Go side, Node's built-in profiler or `clinic.js` for the Node
   side, if it comes to that level of depth).
4. Write results into a `docs/GO_V2_BENCHMARK_RESULTS.md` (not created
   yet — create it when there's an actual run to report) rather than only
   reporting numbers in chat, so the comparison is reproducible/auditable
   later.

## What's scaffolded so far

`backend-go/` — a minimal Go module with `chi` wired up and a `/health`
endpoint mirroring the Node backend's, plus the tooling config files
(`.golangci.yml`, `.air.toml`, `Makefile`) so the dev loop is ready. Quiz
CRUD and the `sqlc`-generated DB layer are **not yet ported** — that's the
next actual implementation step whenever this gets picked up, and is
explicitly not scheduled against the MVP timeline.
