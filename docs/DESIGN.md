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
  joinCode (4-char alphanumeric, unique among ACTIVE sessions)
  quizId
  status: LOBBY | IN_PROGRESS | ENDED
  currentQuestionIndex
  questionOrder: number[]        // randomized per session, see §4
  createdAt, startedAt?, endedAt?
  resultsExpiresAt               // set at ENDED, default now()+24h, configurable

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
        │  timer expires OR host force-advances
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

All gameplay is push-driven; clients don't poll. Rough event catalogue
(direction: **H**=to Host, **P**=to Player, **S**=to Spectator, **→**=from
client to server):

| Event | Direction | Payload (shape) |
|---|---|---|
| `session:lobby_update` | → H, P | `{participants: [{id, displayName}]}` |
| `join:request` | client → server | `{joinCode, displayName}` |
| `join:accepted` | → joining client | `{participantId, role}` |
| `question:broadcast` | → H, P, S | `{questionId, text, options[shape/color, no correctness], timeLimitSeconds, serverStartTime}` |
| `answer:submit` | P → server | `{participantId, questionId, selectedOptionId, clientTimestamp}` |
| `answer:ack` | → P (submitter only) | `{received: true}` (no correctness yet) |
| `question:locked` | → H, P, S | `{questionId}` |
| `question:reveal` | → H, P, S | `{questionId, correctOptionId, tally per option}` |
| `answer:result` | → P (per player) | `{isCorrect, pointsEarned, myRank, totalPlayers}` |
| `leaderboard:update` (host only, full) | → H | `{ranked: [{participantId, displayName, score}]}` |
| `promotion:request` | S → server | `{participantId}` |
| `promotion:incoming` | → H | `{participantId, displayName}` |
| `promotion:decision` | H → server | `{participantId, approve: bool}` |
| `promotion:result` | → S/new-P | `{approved: bool}` |
| `game:ended` | → H, P, S | `{resultsUrl}` |
| `results:podium` | → all (via resultsUrl) | `{top3, ranks4to10, page metadata}` |

Note: **Players never receive the full leaderboard** — only their own
`{myRank, totalPlayers}` per the PRD's scope-reduction decision. Only the
Host's Controller view receives the full ranked list.

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

## 8. Open Questions for the Architecture Doc

- Transport for realtime sync (WebSocket service choice, or managed
  pub/sub) and how Display/Controller/Player connections are authenticated
  per role.
- Hosting/DB choice driven by "cheapest that satisfies the TTL requirement"
  per PRD §8.
- Reconnect/resume behavior: what state a Player's client needs to
  rehydrate after a dropped connection mid-question.
- Load expectations (max concurrent participants per session) — affects
  whether "recompute ranks by full sort" in §5 needs revisiting.
