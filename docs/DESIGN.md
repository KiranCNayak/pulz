# Design Doc — Pulz (Live Quiz Platform)

**Status:** Draft v1 — functional/domain design. Tech stack & infra choices
are deliberately deferred to a separate architecture doc.
**Last updated:** 2026-09-12

This doc translates the PRD into entities, states, and the event flow
needed to implement it. It does not pick a language/framework/hosting
provider yet — that's the next phase.

## 1. Domain Entities

```
Creator
  id, email, passwordHash/oauthId, createdAt

Quiz
  id, creatorId, title, coverImage?, createdAt, updatedAt
  questions: Question[]  (ordered)

Question
  id, quizId, order, text, mediaUrl?, timeLimitSeconds (default 20, 5-120)
  options: Option[]      (2-4 per question)

Option
  id, questionId, text, isCorrect (exactly one true per question)

GameSession
  id (UUID, internal/unguessable)
  joinCode (6-char alphanumeric, unique among ACTIVE sessions)
  quizId
  status: LOBBY | IN_PROGRESS | ENDED
  currentQuestionIndex
  questionOrder: number[]        // randomized per session, see §4
  createdAt, startedAt?, endedAt?
  resultsExpiresAt               // set at ENDED, default now()+24h, configurable
  failedJoinAttempts             // counter for per-code lockout, see §9

Participant
  id, sessionId, displayName
  role: PLAYER | SPECTATOR
  joinedAt
  promotionStatus?: NONE | REQUESTED | APPROVED | DENIED
  score (non-negative integer, sum of Answer.points)

Answer
  id, participantId, questionId
  selectedOptionId
  serverReceivedAt               // server clock, not client-reported
  timeTakenMs                    // derived: serverReceivedAt - questionBroadcastAt
  isCorrect
  points (non-negative integer, multiple of question's base, see PRD §5)

ResultsSnapshot
  sessionId, generatedAt, expiresAt, payload (podium + paginated ranks)
```

**Invariants enforced at the data layer, not just app code:**
- `Option.isCorrect`: exactly one `true` per question (app-level check on
  write; consider a partial unique index if the DB supports it).
- `Answer.points >= 0` and `Answer.points % question.basePoints == 0` — DB
  `CHECK` constraint.
- `Answer.timeTakenMs` between `0` and `question.timeLimitSeconds * 1000`
  — reject/clamp on write.
- `Participant.score >= 0`, integer type — never float.
- `GameSession.joinCode` unique only among sessions with `status != ENDED`
  — codes can be recycled once a session ends.

## 2. Session State Machine

```
        create session
             │
             ▼
          LOBBY  ──────────────► players join freely (role=PLAYER)
             │
             │ host: start game
             ▼
       IN_PROGRESS ────────────► late joiners default to role=SPECTATOR
             │                   spectators may request promotion;
             │                   host approves/denies (per request)
             │
             │ host: advance through all questions, then "end game"
             ▼
           ENDED
             │
             │ generate ResultsSnapshot, set resultsExpiresAt
             ▼
     (auto-deleted after resultsExpiresAt)
```

Per-question sub-state while `IN_PROGRESS`:

```
QUESTION_ACTIVE (timer running, accepting answers)
        │  timer expires OR host locks OR every connected
        │  player has answered (Decision #63)
        ▼
QUESTION_LOCKED (no more answers accepted, compute scores)
        │  host: next
        ▼
LEADERBOARD_SHOWN (between-question standings, host view only)
        │  host: next
        ▼
next QUESTION_ACTIVE, or → ENDED if last question
```

## 3. Realtime Event Surface

All gameplay is push-driven; clients don't poll. Event catalogue, kept in
sync with `backend/src/sockets/session.socket.ts` and
`backend/src/services/gameLoop.service.ts` (reconciled 2026-09-28, Decision
#66 — earlier drafts listed fields that were never sent). Direction:
**H**=Host, **D**=Display, **P**=Player, **S**=Spectator, **→ server**=from
client. Everything sent to a session's base room reaches H, D, P and S.
Clients never send their own identity or timing: the server knows which
participant a socket is, and times answers on its own clock (§5).

**Connection & auth**

| Event | Direction | Payload |
|---|---|---|
| `host:auth` | H → server | `{sessionId, hostToken}` |
| `host:auth_ok` | → H | `{sessionId, joinCode, status, questionCount, currentQuestionIndex, participants, live}` — `live` restores a mid-game screen (Decision #64) |
| `host:auth_error` / `host:error` | → H | `{error}` |
| `display:auth` | D → server | `{sessionId, displayToken}` |
| `display:auth_ok` | → D | `{sessionId, status, joinCode, participants, live}` |
| `display:auth_error` | → D | `{error}` |
| `join:request` | P/S → server | `{joinCode, displayName?, participantToken?}` — a valid `participantToken` resumes that participant (reconnect, §9) |
| `join:accepted` | → joining client | `{participantId, participantToken, role, resumed?, state?}` — `state` is the resume snapshot (Decision #53) |
| `join:error` | → joining client | `{error}` |
| `connection:error` | → any client | `{error}` — rate-limit refusal, followed by a server disconnect (Decisions #59-60, #66) |
| `session:lobby_update` | → H, D, P, S | `{participants: [{id, displayName, role}]}` (connected only) |

**Game loop**

| Event | Direction | Payload |
|---|---|---|
| `game:start` | H → server | — |
| `question:broadcast` | → H, D, P, S | `{questionId, text, mediaUrl, options: [{id, text}], timeLimitSeconds, serverStartTime, index, total}` — options in this session's shuffled order, no correctness; each slot's color/shape is assigned client-side by position (Decision #48) |
| `answer:submit` | P → server | `{questionId, selectedOptionId}` |
| `answer:ack` | → submitting P | `{received: true}` (no correctness yet) |
| `answer:error` | → submitting P | `{error}` (e.g. already answered, question closed) |
| `host:lock_question` | H → server | — |
| `question:locked` | → H, D, P, S | `{questionId, reason: 'host' \| 'timer' \| 'all_answered'}` (Decision #63) |
| `question:reveal` | → H, D, P, S | `{questionId, correctOptionId, tally: {optionId: count}}` |
| `answer:result` | → each connected P | `{isCorrect, pointsEarned, myRank, totalPlayers}` |
| `leaderboard:update` | → H, D | `{ranked: [{participantId, displayName, score, rank}]}` |
| `host:next_question` | H → server | — (next `question:broadcast`, or `game:ended` after the last) |
| `game:ended` | → H, D, P, S | `{resultsUrl}` — results are then fetched over REST (`GET /results/:sessionId`, paginated), not pushed |

**Spectator promotion**

| Event | Direction | Payload |
|---|---|---|
| `promotion:request` | S → server | — |
| `promotion:incoming` | → H | `{participantId, displayName}` |
| `promotion:decision` | H → server | `{participantId, approve: bool}` |
| `promotion:result` | → requesting S | `{approved: bool}` |

Note: **players' own devices never receive the full leaderboard** — only
their own `{myRank, totalPlayers}` per the PRD's scope-reduction decision.
The full ranked list goes to the Host and to the Display, whose shared
screen shows the top 5 to the room.

## 4. Question/Answer Order Randomization

- On session creation (when moving `LOBBY → IN_PROGRESS` is too late; do it
  at session creation so it's stable for the whole game), generate
  `questionOrder` as a shuffled permutation of the quiz's question indices.
- Per question, also shuffle `Option` display order — computed once when
  the question is broadcast, sent as part of `question:broadcast`, so all
  clients in that session see the same (shuffled) order as each other,
  just different from the quiz's stored/authoring order.
- Shuffling is per-session, not per-player — everyone in the same game
  sees the same order (this matches shared-screen "look at the shape"
  gameplay; per-player shuffling would break the color/shape sync trick).

## 5. Scoring Computation (server-side)

```
on answer:submit(participantId, questionId, selectedOptionId, clientTimestamp):
    if session.currentQuestion != questionId or not QUESTION_ACTIVE:
        reject  // late/invalid submission
    if participant already answered this questionId:
        reject  // one answer per question
    if participant.role != PLAYER:
        reject  // spectators cannot submit

    timeTakenMs = now() - question.broadcastAt          // server clock only
    timeTakenMs = clamp(timeTakenMs, 0, question.timeLimitMs)

    isCorrect = (selectedOptionId == question.correctOptionId)
    if not isCorrect:
        points = 0
    else:
        pctUsed = timeTakenMs / question.timeLimitMs
        multiplier = bracket(pctUsed)   // 5/4/3/2/1 per PRD §5 table
        points = question.basePoints * multiplier   // always integer, >=0

    persist Answer{..., timeTakenMs, isCorrect, points}
    participant.score += points
    recompute ranks for session (cheap: sort participants by score desc)
```

Recomputing full ranks after each answer is fine at MVP scale (dozens to a
few hundred participants); this is the kind of thing that would need
revisiting if we ever supported thousands of concurrent players in one
session — noted as a scale concern, not solved now.

## 6. Host Controller vs. Display Split

Both are just different rendering modes subscribed to the same session
event stream — no separate backend concept needed:

- **Controller**: authenticated-to-this-session (host token from session
  creation), receives all events including `promotion:incoming` and full
  `leaderboard:update`; renders action buttons (advance/skip/end,
  approve/deny promotion).
- **Display**: subscribes read-only to the same session's broadcast events
  (`question:broadcast`, `question:reveal`, `leaderboard:update`), renders
  a large-text/high-contrast layout, no interactive controls. Can be opened
  on a second device (e.g., a TV's browser) using a display-only link
  derived from the session, separate from the host's controller token so
  it's safe to project without exposing controls.

## 7. Ephemeral Results Storage

- `ResultsSnapshot` written once at `game:ended`, keyed by `sessionId`.
- `resultsExpiresAt` defaults to `now() + 24h`; host may configure a
  shorter window at session creation (e.g., 1h, 6h, 24h presets).
- Cleanup: scheduled job sweeps rows past `resultsExpiresAt` — exact
  mechanism (cron, DB-native TTL, etc.) is an infra choice, deferred to the
  architecture doc. Functional requirement here is just: **the row must not
  be readable after `resultsExpiresAt`**, regardless of how deletion is
  physically implemented.

## 8. Abuse Resilience — Functional Design

Requirements are in PRD §8. This section covers the pieces that touch the
domain model / event flow directly; the infra mechanism (edge layer,
in-memory limiter implementation) is in `ARCHITECTURE.md` §11.

- **Per-code join lockout**: `GameSession.failedJoinAttempts` increments on
  each join attempt against that session's code with a name/token that
  doesn't resolve to a valid, currently-open join (wrong code never reaches
  this — code lookup itself is the first filter). After a threshold (e.g.
  20 failed attempts within a short window) against one *specific* code,
  that code is locked out temporarily — this is what actually stops PIN
  brute-forcing, independent of the 6-character space size increase, which
  only raises the cost of a blind guess.
- **Join is idempotent per composite key within a session**: a client
  retrying a join (e.g. flaky network) with the same client id should
  rejoin/resume its existing `Participant`, not create a duplicate — this
  is needed for reconnect (§ below) anyway, and incidentally reduces noise
  that could otherwise look like abuse.
- **`answer:submit` and `promotion:request` abuse is already substantially
  self-limiting** by existing business rules (one answer per question per
  participant, role check) — no new domain logic needed there beyond what
  §5 already specifies; the remaining protection (message-rate capping at
  the socket level) is infra, not domain, and lives in `ARCHITECTURE.md`
  §11.
- **Session creation is out of scope for anonymous-abuse hardening** (PRD
  §8) since it requires an authenticated Creator already.

## 9. Open Questions for the Architecture Doc

- Transport for realtime sync (WebSocket service choice, or managed
  pub/sub) and how Display/Controller/Player connections are authenticated
  per role.
- Hosting/DB choice driven by "cheapest that satisfies the TTL requirement"
  per PRD §9.
- Reconnect/resume behavior: what state a Player's client needs to
  rehydrate after a dropped connection mid-question.
- Load expectations (max concurrent participants per session) — affects
  whether "recompute ranks by full sort" in §5 needs revisiting.
