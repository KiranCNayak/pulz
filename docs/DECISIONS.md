# Decisions Log — Pulz

Quick-reference list of decisions already made and closed during design.
If you're an agent or contributor picking this up: **treat these as
settled** — don't relitigate them without a new, explicit instruction from
the project owner. Each entry says what was decided and why, so you can
tell a "settled trade-off" apart from an "open question" (see
`ARCHITECTURE.md` §8 and `DESIGN.md` §8 for what's still genuinely open).

| # | Decision | Why | Where detailed |
|---|---|---|---|
| 1 | Scoring is **time-bracket based**, not rank-based | Rank-based scoring needs a strict global ordering of near-simultaneous answers across variable network latency — race-condition-prone. Time-bracket scoring only needs each player's own elapsed time. | PRD §5 |
| 2 | Scoring buckets are 5 tiers at 20%-of-time-limit steps, multiples of a base-10 point value, always non-negative integers | Explicit requirement: no fractional/negative scores, no "ugly" point values like 10 vs 25. | PRD §5, DESIGN.md §5 |
| 3 | Default question time limit: 20 seconds, configurable 5–120s per question | Matches an industry-validated default (Kahoot! itself defaults to 20s); configurable so text-heavy questions aren't shortchanged. | PRD §4.1 |
| 4 | No native mobile app for MVP | Responsive web covers "play from any device" without app-store overhead. | PRD §2, §7 |
| 5 | Host is split into two views: **Controller** (interactive) and **Display** (cast-friendly, read-only) | Matches real usage (host laptop + projected shared screen); both are just different subscriptions to the same event stream, not separate backend concepts. | PRD §4.2, DESIGN.md §6 |
| 6 | Question and answer-option order are randomized **per session**, not per player | Shared-screen "look at the shape" gameplay requires everyone in a session to see the same order. | DESIGN.md §4 |
| 7 | Podium (top 3, gold/silver/bronze, confetti/animation) is in MVP, not deferred | Low implementation cost (presentation-layer only), high payoff for the "aha" moment. | PRD §4.4 |
| 8 | Players see only their **own rank** (`"X of Y"`), never the full leaderboard | Explicit scope reduction: smaller per-player payload, avoids exposing other players' standings. | PRD §6, DESIGN.md §3 |
| 9 | No login for Host or Player/Spectator — only **Creators** have accounts | Keeps the common-case flow (join and play) frictionless. | PRD §3 |
| 10 | Join model: internal session UUID + short 4-character alphanumeric join code | UUID is the unguessable "real" identifier (used for the results link); the short code is what a human actually types. | PRD §4.2 |
| 11 | Pre-start joiners become **Players**; post-start joiners default to **Spectators** | Prevents a late joiner from disrupting an in-progress question, while still letting them watch. | PRD §4.3 |
| 12 | Spectator → Player promotion requires **explicit per-request Host approval**; no bulk-approve in MVP | Simpler to build and reason about; bulk approve is a listed post-MVP nice-to-have. | PRD §4.3, §8 |
| 13 | Promoted spectators do **not** get retroactive points for questions missed while spectating | Avoids retroactive score recomputation complexity. | PRD §4.3 |
| 14 | Results snapshot is ephemeral with a **configurable TTL, default 24h** | Explicit requirement to minimize storage cost/duration; default chosen as a reasonable "long enough to share, short enough to not accumulate." | PRD §4.4, §8 |
| 15 | TTL cleanup implemented as an **in-process interval sweep**, not a separate cron/scheduled service | Zero additional infrastructure; read path also defensively filters on `expires_at` so correctness never depends on the sweep's timing. | ARCHITECTURE.md §3 |
| 16 | Live `GameSession`/`Participant`/`Answer` state lives **in server process memory**, not the DB, while a game is in progress | Cheapest and fastest option at MVP scale; accepted trade-off is state loss on server restart mid-game. | ARCHITECTURE.md §2 |
| 17 | Backend: Node.js + TypeScript, Fastify (REST) + Socket.IO (realtime, rooms = sessions) | Rooms map directly onto sessions; Socket.IO's built-in reconnect/backoff covers the "phone drops mid-question" requirement without hand-rolling it. | ARCHITECTURE.md §1 |
| 18 | No horizontal scaling / multi-instance session routing in MVP | Would require moving session state out of process memory (e.g. to Redis) and adding sticky routing — real infra cost the PRD asked to avoid; revisit only if actually needed. | ARCHITECTURE.md §8 |
| 19 | Direct pushes to `main`, no PR-gated workflow, for this phase | Explicit project-owner instruction; revisit if the contributor pool grows beyond one. | This doc |
| 20 | Project name: **Pulz** | Chosen by project owner; merges "pulse" (real-time/speed scoring) and "quiz." | — |

## How to add to this log

When a new design/architecture decision gets settled in conversation,
append a row here rather than letting it live only in chat history —
that's the whole point of this file for an agent picking up the project
cold.
