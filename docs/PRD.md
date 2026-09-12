# PRD — Pulz (Live Quiz Platform)

**Status:** Draft v1
**Owner:** Kiran Nayak
**Last updated:** 2026-09-12

## 1. Summary

A live, real-time quiz platform where a host runs a synchronous trivia session
from a created quiz, and players join from any device (no account required)
using a short join code. Modeled on Kahoot!'s core gameplay loop, scoped down
to an MVP that is cheap to run and simple to operate.

## 2. Goals / Non-Goals

**Goals (MVP)**
- Anyone can create a quiz and host a live game in minutes, no login friction
  for players.
- Real-time synchronized gameplay: host controls pacing, players answer on
  their own device, scores and leaderboard update live.
- A host session can be cast to a shared screen (TV/projector) as a
  clean, readable scoreboard.
- Cheap to operate: no native apps, ephemeral state where possible, minimal
  standing infrastructure.

**Non-Goals (MVP)**
- Native mobile apps (iOS/Android) — mobile is supported via responsive web.
- Rank-based/scarcity scoring (only-the-fastest-wins) — see §5.
- Public quiz discovery/library, remixing others' quizzes.
- Team mode, async/self-paced "challenge" mode.
- Multi-tenant orgs/classes, paid tiers.

## 3. Users & Roles

| Role | Auth required? | Description |
|---|---|---|
| **Creator** | Yes (owns quizzes) | Builds and edits quizzes. |
| **Host** | No | Starts a live game from a quiz, controls pacing, sees full leaderboard. May or may not be the Creator. |
| **Player** | No | Joins with a join code + display name before the game starts; answers questions. |
| **Spectator** | No | Joins with a join code after the game has started; watches but cannot answer, unless promoted by the host. |

## 4. Core User Flows

### 4.1 Quiz creation (Creator)
1. Creator signs up/logs in.
2. Creates a quiz: title + ordered list of questions.
3. Each question: text, 2–4 answer options, exactly one correct answer,
   time limit (default 20s, configurable 5–120s per question).
4. Can edit/reorder/delete questions and quizzes.

### 4.2 Hosting a game (Host)
1. Host selects a saved quiz and starts a game session.
2. System generates:
   - an internal session UUID (unguessable, used for the results link later)
   - a **4-character alphanumeric join code** (what players type)
3. Host sees two synced views:
   - **Controller view** — interactive: advance/skip/end question, see
     incoming spectator promotion requests, see detailed live standings.
   - **Display view** — cast-friendly, read-only, no controls, large
     text/high contrast, meant to be projected/cast to a shared screen.
     Shows the current question, live answer-count ticker, and leaderboard
     transitions.
4. Host advances through questions; game ends after the last question with
   a podium screen.

### 4.3 Joining and playing (Player / Spectator)
1. Player opens the join page, enters the 4-char join code, then a display
   name (no account).
2. **Before game start:** joiner becomes a **Player**.
3. **After game start:** joiner becomes a **Spectator** — same screen layout
   as a player (sees the live question, the color/shape options) but answer
   controls are disabled.
4. A Spectator can tap "Request to join as player." The request appears in
   the Host's Controller view; the Host approves or denies each request
   individually. On approval, the Spectator becomes a Player from that point
   forward — no retroactive points for questions missed while spectating.
5. Player answers land on a color/shape-only button grid, synced to the
   question shown on the Host's Display / their own screen.
6. After each question, Player sees: correct/incorrect, points earned, and
   their own rank as `"<rank> of <total>"` (e.g. "10 of 15") — never the
   full leaderboard list.

### 4.4 End of game
1. Podium screen: top 3 (gold/silver/bronze) with animation + confetti.
2. Results page: ranks 4–10 shown alongside the podium on the first page;
   ranks 11+ paginated.
3. A results snapshot is persisted with a **configurable TTL (default 24h)**,
   after which it is auto-deleted.

## 5. Scoring Model

Server-authoritative, time-bracket based (not rank-based). Points are always
non-negative integers and a multiple of the question's base value.

```
base = 10
bracket = which 20%-slice of the question's time limit the answer landed in
points = correct ? base * multiplier(bracket) : 0
```

| Answered within (% of time limit) | Multiplier | Points (base 10) |
|---|---|---|
| ≤ 20% | 5x | 50 |
| ≤ 40% | 4x | 40 |
| ≤ 60% | 3x | 30 |
| ≤ 80% | 2x | 20 |
| ≤ 100% | 1x | 10 |
| Wrong / no answer | — | 0 |

**Why time-bracket, not rank-based:** rank-based scoring (fastest correct
answer wins the most, decreasing per finishing position) requires the server
to establish a strict global ordering of near-simultaneous answers across
players with varying network latency — a race-condition-prone problem to
get fair. Time-bracket scoring only needs each player's own elapsed time,
computed independently of everyone else, so there's no cross-player
adjudication needed. Multiple players can land in the same bracket and get
identical points.

**Validation rules (server-enforced, never trust client):**
- `timeTaken` clamped to `0 ≤ timeTaken ≤ timeLimit`; out-of-range submissions
  are rejected.
- Client sends only `{questionId, selectedOptionId, clientTimestamp}` —
  never a point value. Server computes `timeTaken` from its own receipt of
  the answer relative to when it broadcast the question, and derives points
  from that.
- All score fields are stored as non-negative integers (DB-level
  `CHECK (score >= 0)`, integer type) — fractional or negative values are
  a schema violation, not just an app-layer bug.
- Running total score is a sum of per-question integer points, so it is a
  non-negative integer by construction.

## 6. Leaderboard & Results Display

- **Player's own screen:** shows only their own rank as `"X of Y"`. No
  full list — keeps per-player payload small (`{myRank, totalPlayers}`)
  and avoids leaking other players' standings.
- **Host Controller/Display:** full live leaderboard between questions.
- **End-of-game podium:** top 3 only, gold/silver/bronze, with
  animation/confetti.
- **Results page:** ranks 4–10 on the first page; 11+ paginated.

## 7. Platform Support

- Responsive web only for MVP — no native iOS/Android app.
- Player and Spectator UI must work well on a phone browser (touch-friendly,
  large tap targets) since that's the expected common device.
- Host Display view must be legible from a distance when cast/projected to
  a shared screen (TV, projector) — treated as a first-class "big screen"
  layout, not just a scaled-down controller view.

## 8. Open Items / Future Decisions

- Bulk "allow all pending spectators" toggle for host (currently: per-request
  approval only).
- Exact bracket thresholds are configuration constants, not hardcoded —
  can be rebalanced post-launch without a schema change.
- Results dashboard access model: currently accessible via the session's
  unguessable link; no additional auth layer in MVP.

## 9. Nice-to-Have (Post-MVP)

- True/false, poll, type-answer, reorder/puzzle, word-cloud question types
- Media in questions (image/video/audio)
- Team mode; async "challenge" (self-paced) mode
- Public quiz library, duplication/remixing, ratings/favorites
- Streak bonuses, bonus questions, custom themes/branding
- Post-game analytics dashboard, CSV/PDF export
- Organizations/classes, bulk invites, homework assignment
- Bulk spectator-approval toggle for host
- PWA / installable web app
- Native mobile apps
