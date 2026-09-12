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

- **Backend:** single web service (REST + Socket.IO in one process) on a
  low-cost PaaS with an always-on hobby/free instance — Fly.io or Render
  are the leading candidates (both support WebSocket connections on cheap
  tiers, unlike pure serverless functions which don't hold persistent
  connections well).
- **Frontend:** a static SPA built with **React + Vite**, deployed
  separately to a free static host (Cloudflare Pages, Vercel, or Netlify
  free tier), calling the backend over REST + WebSocket.
- **Why split frontend/backend deploys:** static hosting for the SPA is
  effectively free and globally cached; only the stateful realtime piece
  needs an always-on server, so we're not paying "server pricing" for
  serving JS/CSS/HTML.

## 5. Frontend Structure

One React app, role-driven by route rather than separate apps:

- `/create`, `/quizzes/:id/edit` — Creator flows (authenticated)
- `/host/:sessionId` — Controller view
- `/display/:sessionId` — Display/cast view (read-only token, safe to
  project publicly)
- `/join` → `/play/:sessionId` — Player/Spectator join + gameplay
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

- Only the **Creator** role needs an account. Simplest viable option:
  email + password with a session cookie (or a minimal JWT) — no need for
  a full OAuth/social-login stack for MVP.
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

- Direct push to `main` deploys (per repo convention — see `CLAUDE.md`),
  using the chosen PaaS's git-integrated auto-deploy rather than a
  separate CI/CD pipeline for MVP. Revisit once there's a team beyond a
  single contributor/agent, or once there's a test suite worth gating on.

## 10. Summary of Stack Choices

| Layer | Choice |
|---|---|
| Backend language/runtime | Node.js + TypeScript |
| REST framework | Fastify |
| Realtime | Socket.IO (rooms = sessions) |
| Durable DB | Postgres (Neon or Supabase free tier) |
| Live game state | In-process memory, not persisted until game ends |
| TTL cleanup | In-process interval sweep, no external cron |
| Frontend | React + Vite SPA |
| Frontend hosting | Static host (Cloudflare Pages / Vercel / Netlify free tier) |
| Backend hosting | Fly.io or Render, always-on hobby instance |
| Auth | Email/password (or minimal JWT) for Creators only |
