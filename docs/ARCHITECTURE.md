# Architecture — Pulz

**Status:** Draft v1 — resolves the open questions left in `DESIGN.md` §8.
**Last updated:** 2026-09-12

**Guiding constraint:** this is an MVP whose primary cost pressure is the
ephemeral-results TTL requirement in the PRD ("whichever is least pricey").
Every choice below is picked to avoid standing infrastructure and extra
managed services unless the functional requirement genuinely needs it.

## 1. Runtime & Language

- **Node.js + TypeScript** for the backend. One language across REST and
  realtime code, one deploy artifact, minimal moving parts for a small team
  (or a single agent) to reason about.
- **Fastify** for the REST API (quiz CRUD, session creation, results
  fetch). Chosen over Express for lower overhead and built-in schema
  validation (useful for enforcing the PRD's validation rules — e.g.
  rejecting a `timeTaken` outside a question's limit — at the request
  boundary, not just in the DB).
- **Socket.IO** for realtime gameplay, not raw `ws`. Reasons specific to
  this app:
  - **Rooms** map 1:1 onto `GameSession` — broadcasting to "everyone in
    session X" is a primitive, not something we hand-roll.
  - Built-in reconnect/backoff on the client, which we need anyway for
    "player's phone drops mid-question" (§6).
  - Multiple logical channels (Controller / Display / Player / Spectator)
    can share one connection type and be distinguished by which room(s) a
    socket joins, rather than needing separate protocols per role.

## 2. Data Storage — split by lifetime, not by "one database for everything"

| Data | Where | Why |
|---|---|---|
| `Creator`, `Quiz`, `Question`, `Option` | **Postgres** (durable) | Long-lived, needs relational integrity (exactly-one-correct-option, ordered questions). |
| `GameSession`, `Participant`, `Answer` while `IN_PROGRESS` | **In-process memory** (a plain Map keyed by session id, inside the Node server) | This data is only meaningful for the few minutes a game is live. Putting it in Postgres/Redis would mean a network round-trip on every answer submission for data we're about to throw away. Keeping it in memory is both the cheapest and the fastest option, and it's a small enough object graph (dozens–hundreds of participants) to not stress a small instance. |
| `ResultsSnapshot` | **Postgres**, written once at `game:ended` | This is the one piece of live-session data that needs to survive past the game and be fetchable later (up to the configured TTL). |
| `QuestionImage` (Decision #75) | **Postgres** `bytea`, served by `GET /images/:id` | One image per question, at most 5 MB, and the editor shrinks anything wider than 1920px before upload (typically a few hundred KB). Keeping the bytes in the database we already run means no second service (object store, bucket credentials, CDN) to provision; only the Display and Host load them, and immutable rows let browsers cache them forever. Bounded by a 100 MB per-Creator quota and an hourly sweep of images no question uses (24h grace). **Revisit** if storage nears Neon's 0.5 GB free limit: move the bytes to an object store such as Cloudflare R2 behind the same `imageId`. |

**Explicit MVP limitation this creates:** if the server process restarts
mid-game, in-progress `GameSession` state is lost (players would need to
rejoin/restart). Given MVP scale (demos, classrooms, small teams) and that
this is a documented, not accidental, trade-off, this is acceptable for
now. A later hardening pass could periodically checkpoint session state to
Postgres or Redis for crash recovery — **explicitly deferred, not MVP**.

- **Postgres provider:** a free-tier managed Postgres (e.g. Neon or
  Supabase's free Postgres tier) — no self-hosted DB to operate.

## 3. Ephemeral Results TTL — implementation

Per DESIGN.md §7, the functional requirement is just "unreadable after
`expiresAt`," not any specific mechanism. Cheapest option that meets it:

- A `setInterval` sweep **inside the same Node process**, running every
  few minutes, doing `DELETE FROM results_snapshots WHERE expires_at < now()`.
- No cron service, no scheduled Lambda, no `pg_cron` extension dependency —
  zero additional infrastructure or cost beyond the one process we're
  already running.
- Trade-off: if the process is down, the sweep pauses (rows just live a
  little longer than their TTL, they're still correctly excluded from
  reads by an `expires_at` check at query time regardless). Read-path
  should **also** filter `WHERE expires_at > now()` defensively, so
  correctness never depends on the sweep having run recently.

## 4. Hosting

- **Backend:** single web service (REST + Socket.IO in one process) on
  one Fly.io machine in Singapore, which holds WebSocket connections fine
  (pure serverless functions don't). It runs **on demand, not always on**:
  started with `make cloud-up` before a game and stopped with
  `make cloud-down` after (Decision #71, `docs/DEPLOYMENT.md`).
- **Frontend:** a static SPA built with **React + Vite** on Cloudflare
  Pages (free), calling the backend over REST + WebSocket. It stays up
  while the backend is off and says so.
- **Database:** Neon's free plan in AWS Singapore, next to the backend.
  It sleeps when idle, so it needs no switching.
- **Why split frontend/backend deploys:** static hosting for the SPA is
  effectively free and globally cached; only the stateful realtime piece
  needs an always-on server, so we're not paying "server pricing" for
  serving JS/CSS/HTML.

## 5. Frontend Structure

One React app, role-driven by route rather than separate apps:

- `/` — Home: the two ways in (create a quiz, enter a PIN) (Decision #68)
- `/create`, `/quizzes/:id/edit` — Creator flows (authenticated)
- `/host/:sessionId` — Controller view
- `/display/:sessionId` — Display/cast view (read-only token, safe to
  project publicly)
- `/join` (optionally `?code=`) → `/play/:sessionId` — Player/Spectator join + gameplay
- `/results/:sessionId` — post-game results/podium page

Single codebase keeps shared components (the color/shape answer grid,
podium/confetti component, leaderboard rank badge) reusable across
Player/Display/Results views instead of duplicated per app.

## 6. Reconnect Handling

- On join, the client receives a **participant token** (short-lived,
  opaque) and stores it in `localStorage`.
- On reconnect (page refresh, dropped WiFi), the client re-establishes a
  Socket.IO connection and re-sends its participant token to rejoin the
  same room and resume receiving events; server maps the token back to the
  in-memory `Participant` record.
- If the server process itself restarted (see §2's documented limitation),
  the token won't resolve to any session — client falls back to the join
  screen. This is the one gap we're consciously accepting for MVP.

## 7. Auth

- Only the **Creator** role needs an account — but **not necessarily a
  login**. As implemented (Decision #38, superseding the email+password
  plan originally here): `POST /auth/register` mints a `Creator` row and
  a random capability bearer token, returned exactly once; only its
  SHA-256 hash is persisted. Every Creator-scoped route requires
  `Authorization: Bearer <token>`. No password, no email, no OAuth
  dependency — same "no full OAuth/social-login stack for MVP" goal this
  section originally stated, taken one step further by skipping
  email/password too.
  - **Accepted trade-off:** no account recovery. A lost token means
    permanently losing access to that Creator's quizzes; there is no
    "forgot my token" flow, by design, for MVP.
  - The `Creator` model keeps `email`/`passwordHash` as nullable columns
    for a possible future passwordless-email upgrade (verify control of
    an inbox, mainly for recovery/cross-device portability) — not built,
    and only worth doing if that trade-off proves to actually matter in
    practice.
- Host/Player/Spectator remain account-free per the PRD, identified only
  by session-scoped tokens (host's controller token, display token,
  participant token) — three different opaque tokens per session, not
  three different user models.

## 8. Load Expectations & Explicit Non-Goals

- Designed for: single-digit concurrent live sessions, each with up to a
  few hundred participants — comfortably within one small instance's
  memory/CPU given state is plain in-process objects.
- **Not designed for** (explicitly deferred, revisit only if actually
  needed): horizontal scaling across multiple server instances, which
  would require moving session state out of process memory (e.g. into
  Redis) and adding sticky-session or pub/sub routing for Socket.IO across
  instances. Don't build this speculatively — it adds real infra cost
  precisely where the PRD asked us to avoid it.

## 9. Deployment

- Frontend: a push to `main` deploys, through Cloudflare Pages' Git
  integration rather than a separate CI/CD pipeline.
- Backend: `make cloud-deploy` (manual on purpose; an auto-deploy would
  start the stopped machine). Migrations run as Fly's release command,
  before the new version goes live. Runbook: `docs/DEPLOYMENT.md`.
- Revisit CI gating once there's a team beyond a single
  contributor/agent.

## 11. Abuse Prevention & Rate Limiting

Requirements are in PRD §8; the domain-level pieces (per-code lockout
counter, idempotent join) are in `DESIGN.md` §8. This section is the
mechanism. Guiding principle: **the anonymous surface is narrow** — only
join, WebSocket connect, and in-game messages are unauthenticated (session
creation already requires a logged-in Creator, per §7) — so defenses are
scoped to that surface, not the whole app.

**Why not blanket per-IP bans:** IPs are shared behind NAT/school
Wi-Fi/carrier CGNAT (banning one punishes many innocent future users of a
reassigned IP) and trivially rotated by an actual attacker (banning
achieves little against anyone with a proxy pool or botnet). Every
mechanism below is either edge-layer (cheap, high-leverage, not our code
to maintain) or scoped/temporary/composite-keyed rather than a permanent
IP blacklist.

**1. Edge layer — Cloudflare (free tier), in front of both the static
frontend and the backend origin.** *(As deployed, only the frontend is
behind it; the API is DNS-only so the rate limiters see real visitor IPs.
See Decision #71.)*
- Absorbs L3/L4 volumetric DDoS before it reaches our one small backend
  instance — this is infrastructure built for exactly this problem; not
  worth reinventing in application code.
- **Turnstile** (Cloudflare's free, privacy-friendly CAPTCHA alternative)
  is available to invoke *conditionally* (see the friction ladder below),
  not on every request — keeps the no-login, low-friction join experience
  intact for the overwhelming majority of legitimate players.
- Effectively free; directly serves the "always-on and cheap" constraint
  from the PRD.

**2. Composite-key rate limiting, not raw-IP.**
Key = `IP + a lightweight client id` (an opaque value set in a cookie or
`localStorage` on first visit — not authentication, just a tag that raises
the cost of evasion beyond "rotate your IP"). Implemented as an in-process
token-bucket/sliding-window limiter (same process as the Socket.IO
server — no extra service, consistent with the "no standing infra beyond
one instance" theme elsewhere in this doc). Limits differ per action
because legitimate-use shapes differ:

| Action | Legitimate pattern | Limit shape |
|---|---|---|
| Join attempt, any code | A person retries a couple of times, typos included | Loose per-IP window (must tolerate shared-IP classrooms) |
| Join attempt against **one specific code** | A whole class can legitimately hit the same code within seconds | Lock out that *code* (not the IP) after N failed attempts — see `DESIGN.md` §8's `failedJoinAttempts` — this is what actually defeats PIN brute-forcing |
| New WebSocket connection | ~1 per device per session | Cap new connections/minute per composite key |
| `answer:submit` / `promotion:request` | Bounded by game rules already (one answer per question, role check) | No new limiter needed — see `DESIGN.md` §8; only a coarse message-rate cap at the socket level as a backstop against protocol-level garbage (implemented: 60 events per 10s per connection — Decision #66) |

**3. Progressive friction ladder, not a binary ban:**
`allow → throttle (delay the response) → challenge (Turnstile) → temporary
cooldown (minutes, on the composite key)`. Nothing here is permanent —
cooldowns expire on their own, so an attacker's cost is "wait a few
minutes and get a new client id," which is a real cost, while a legitimate
user who trips a false positive is never locked out for long.

**4. Resource caps as a backstop**, independent of whether the limiter
catches everything upstream: a max on concurrent sessions server-wide and
participants per session (ARCHITECTURE.md §8 already sets rough scale
expectations) protects the actual scarce resource — this process's memory —
even if some abusive traffic gets through.

**5. Reputation via decay, not a persistent blacklist table.** Strike
counts per composite key live in the same in-process store as the rate
limiter (e.g. a leaky bucket) and age out over minutes/hours on their own.
This is what makes "no blanket ban" concrete: there is no durable ban
list to accumulate, audit, or accidentally leave stale entries in.

**Explicit non-goals for MVP:** full bot-detection/fingerprinting beyond
the composite key, a dedicated WAF beyond Cloudflare's free-tier defaults,
and any persistent abuse database — all would add cost/complexity ahead of
evidence that the lighter measures above are insufficient.

## 12. Summary of Stack Choices

| Layer | Choice |
|---|---|
| Backend language/runtime | Node.js + TypeScript |
| REST framework | Fastify |
| Realtime | Socket.IO (rooms = sessions) |
| Durable DB | Postgres on Neon's free plan (Singapore) |
| Live game state | In-process memory, not persisted until game ends |
| TTL cleanup | In-process interval sweep, no external cron |
| Frontend | React + Vite SPA |
| Frontend hosting | Cloudflare Pages (free) |
| Backend hosting | One Fly.io machine (Singapore), started and stopped on demand (Decision #71) |
| Auth | Email/password (or minimal JWT) for Creators only |
| Edge/DDoS layer | Cloudflare free tier in front of the frontend; API DNS-only for now (Decision #71) |
| Abuse rate limiting | In-process composite-key (IP + client id) token bucket, no external service |
| Observability | OpenTelemetry (backend) + Grafana Faro (frontend) → Grafana Cloud free tier (§13) |

## 13. Observability

Requirement: know when Pulz is down or misbehaving, and why, without
paying for it or running another service. Grafana Cloud's free tier (no
card; 10k metric series, 50 GB each of logs and traces, 100k synthetic
checks a month, 14-day retention) covers that many times over at MVP
scale. Picked over New Relic, Sentry + Better Stack, and Axiom (Decision
#70). The setup runbook is `docs/OBSERVABILITY.md`.

- **Vendor-neutral by construction.** The backend speaks only standard
  OpenTelemetry over OTLP (`backend/src/observability/telemetry.ts`),
  configured entirely by the standard `OTEL_*` env vars, so moving to
  another OTLP backend is an env change, not a code change. Off when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is unset (tests, plain `make up`).
- **In-process, no agent or collector.** Same "one process, no standing
  infra" rule as §3 and §11: the SDK in the Node process pushes metrics
  (every 60s), traces and pino logs directly to Grafana Cloud. Pushing is
  outbound, so it doesn't keep a Fly machine from auto-stopping. Buffers
  are flushed on SIGTERM.
- **What's instrumented automatically:** HTTP + Fastify routes, Socket.IO
  events (spans renamed per event, e.g. `receive answer:submit`), pino logs
  (with trace ids), and Node runtime (event loop delay/utilization, heap,
  GC). Prisma isn't traced yet: `@prisma/instrumentation` v5 needs the older
  OTel SDK line, so it's deferred to the Prisma 6 upgrade.
- **Game metrics the auto-instrumentation can't see**
  (`backend/src/observability/metrics.ts`): live sessions by status,
  connected players, open sockets, games started/ended, answers (correct or
  not), questions closed by reason, join outcomes, and rejections per
  in-process limiter. Attribute values come only from fixed server-defined
  sets — never session ids, join codes or client input — so series count
  stays bounded (~200 locally, against a 10k budget). Counters start at 0 so
  the first event after a restart isn't lost to `rate()`.
- **Frontend:** Grafana Faro (JS errors, Web Vitals, sessions, and fetch
  spans that propagate `traceparent` to the API, so one trace spans browser
  → backend). Off unless `VITE_FARO_URL` is set at build time, and then
  loaded as a lazy chunk; unset, it's stripped from the bundle entirely.
- **Uptime:** a Grafana Synthetic Monitoring HTTP check on `/health`. That
  endpoint deliberately doesn't touch Postgres, so checks don't wake Neon.
  They do keep the Fly machine awake, which is the price of uptime
  monitoring (runbook covers the trade-off).
- **Locally:** `make observe` adds Grafana's all-in-one `otel-lgtm` image
  to the Docker stack with the same dashboard provisioned
  (`observability/grafana/`), so the whole pipeline can be checked
  without a Grafana Cloud account.
