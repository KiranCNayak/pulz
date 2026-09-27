# Frontend Plan & Progress

Living tracker for the frontend build-out (CLAUDE.md "Likely next steps" #2).
**The full user journey (create quiz → start session → host runs it →
players join/play → results) is manually verified and covered by three
automated Playwright E2E tests** (Decisions #52-53, #58). **One open item:
the E2E suite is currently intermittently flaky** (not yet root-caused) —
see the "⚠️ Open item" section below and `docs/HANDOFF.md` before
assuming a red CI run means a real regression. If you're an agent picking
this up cold:

1. Read `CLAUDE.md` first for overall project orientation.
2. Read `docs/PRD.md` (user flows, roles) and `docs/DESIGN.md` (state
   machine, realtime event catalogue) — the frontend is a client for that
   contract, not a new design.
3. Read `docs/ARCHITECTURE.md` §5 (Frontend Structure) and §6 (Reconnect
   Handling) — route layout and the participant-token reconnect flow are
   already decided.
4. Check `docs/DECISIONS.md` before proposing an alternative to anything
   already settled (e.g. React + Vite, single-app-multi-route structure).
5. Come back to **this file** for what's open, what's decided, and what's
   next. Update it as you go — checklist state and the open-decisions
   section should always reflect reality, not the plan as first written.

## Settled frontend stack decisions

Decided by the project owner; logged as Decisions #39-#46 in
`docs/DECISIONS.md` — treat as settled, don't relitigate without a new
explicit instruction:

- **Styling:** Tailwind CSS.
- **Component layer:** shadcn/ui (Radix-based, source copied in via its
  CLI) for Creator-flow forms/modals/dropdowns.
- **Data layer (REST):** TanStack Query for Creator CRUD and results
  fetch.
- **Routing:** React Router, per the route table in ARCHITECTURE.md §5.
- **Socket.IO client:** a single shared client/hook module — no
  per-view duplication of the participant-token reconnect logic
  (ARCHITECTURE.md §6).
- **Realtime game-loop state:** plain React state/context inside the
  shared Socket.IO hook, not a separate library, for now. **Documented
  fallback:** switch to Zustand later if this gets messy in practice —
  not adopted up front.
- **Testing:** Vitest.
- **Scaffolding tool:** `npm create vite@latest` (react-ts template).

No open frontend stack decisions remain at this point.

## Local dev environment

`docker compose up --build` from the repo root (Decision #50) brings up
Postgres, the backend (migrations run automatically, then `tsx watch`),
and the frontend (`vite --host 0.0.0.0`) each in their own container, with
the repo bind-mounted for live reload. Frontend: `http://localhost:5173`.
Backend: `http://localhost:3000`. This is dev-only — not a production
deployment manifest (see the comment at the top of `docker-compose.yml`).

With the stack running, `cd frontend && npm run test:e2e` runs the
Playwright E2E suite (Decision #52) against it.

## Work breakdown

Roughly in dependency order; check off and annotate as completed. Add new
items here as they're discovered — don't let this list go stale.

- [x] Scaffold `frontend/` via `npm create vite@latest` (react-ts
      template) as a sibling to `backend/` per Decision #26; Tailwind,
      shadcn/ui, React Router, TanStack Query, Vitest all wired in per
      Decisions #39-46. `npm run build`, `npm run test`, and
      `npx oxlint` all pass clean.
- [x] Routing (React Router) set up per ARCHITECTURE.md §5's route
      table — all seven routes exist in `src/App.tsx` as placeholder
      pages under `src/pages/`.
- [x] Shared foundation modules in place, ready for the feature views
      below to build on: `src/lib/socket.ts` (singleton Socket.IO
      client), `src/hooks/useGameSocket.ts` (connect/reconnect hook —
      participant-token re-send on reconnect is a TODO left for
      whichever feature view implements it first),
      `src/components/AnswerGrid.tsx` and `src/components/Podium.tsx`
      (shared cross-view components, unstyled beyond basic Tailwind
      layout), `src/lib/queryClient.ts` (TanStack Query client).
- [x] Creator flows: `/create` (register-if-needed + build a quiz) and
      `/quizzes/:id/edit` (load/edit title, questions, options) against
      the existing Creator CRUD API via TanStack Query. Bearer token
      stored under `pulz:creatorToken` (`frontend/src/lib/creatorAuth.ts`).
- [x] Host controller view: `/host/:sessionId?token=<hostToken>` (manual
      paste fallback if the token isn't in the URL — Decision #47). Full
      lobby → question → lock/reveal/leaderboard → next/end flow per the
      2-click state machine (Decision #33), plus spectator-promotion
      approve/deny.
- [x] Display/cast view: `/display/:sessionId?token=<displayToken>`
      (Decision #47) — read-only, large-format, no click handlers,
      subscribes to the same event stream as Host.
- [x] Join + Player/Spectator gameplay: `/join` → `/play/:sessionId`
      (route param is actually the join code, not the real session UUID
      — Decision #49). Full lobby → question → answer → result → ended
      flow, own-rank-only display, spectator promotion request.
- [x] Results/podium page: `/results/:sessionId`, paginated (ranks 4+),
      graceful expired/missing-snapshot state, `Podium` widened to
      support tied ranks.
- [x] Shared `frontend/src/components/answerStyles.ts` added (client-side
      slot→color/shape mapping, Decision #48) and both Play and Display
      consolidated onto it.
- [x] Creator → session hand-off: a "Start session" action on
      `/quizzes/:id/edit` (`StartSessionPanel` in `EditQuizPage.tsx`)
      calls `POST /quizzes/:id/sessions` via a new `useCreateSession`
      hook, then shows the join code and links to
      `/host/:sessionId?token=<hostToken>` and
      `/display/:sessionId?token=<displayToken>` (opened in new tabs).
      Tokens are held only in that component's state, never persisted —
      they're one-shot per Decision #47.
- [x] End-to-end manual pass (2026-09-23, via `docker compose up` +
      Claude in Chrome): created a quiz, started a session, ran it as
      Host with a live Display tab and one Player tab — join, lobby
      update, question broadcast, answer submit, lock/reveal/leaderboard,
      next→end, results/podium. Confirmed scoring (+20 pts, correct
      answer), own-rank display, and that Play/Display render identical
      colors/shapes for the same option (Decision #48's convergence
      wasn't a fluke). Found and fixed one real bug along the way
      (Decision #51 — bodyless requests were sending
      `Content-Type: application/json`, which broke `POST /auth/register`).
- [x] E2E test automation (Decision #52): `frontend/e2e/full-game-flow.spec.ts`
      (Playwright) automates the manual pass above — Creator/Host/
      Display/Player each in their own browser context, run via
      `npm run test:e2e` from `frontend/` against the docker-compose
      stack (which must already be running — the suite doesn't manage
      that lifecycle). Runs serially (`workers: 1`, all specs share one
      backend/DB); `POST /auth/register`'s 10/hour per-IP limit means
      >5 full-suite runs/hour trips it — restart the backend to reset.
- [x] Reconnect tested against an actual dropped connection (Decision
      #53) — CLAUDE.md's flagged gap. `frontend/e2e/reconnect.spec.ts`
      uses `page.reload()` mid-question and again after lock to simulate
      the ARCHITECTURE.md §6 "page refresh" scenario. Found and fixed a
      real bug: reconnecting mid-game landed back on the lobby screen
      with no question state, and a locked-but-not-yet-reconnected
      player's `answer:result` was silently lost (targeted a stale
      `socketId`). Fixed via a `buildResumeSnapshot` attached to
      `join:accepted`. **Known remaining gap:** only the "page reload"
      reconnect path is tested/fixed — a pure transport-level drop where
      Socket.IO auto-reconnects without a page reload doesn't currently
      re-send `join:request` at all, so that narrower case is still
      untested and likely still broken. Pick up only if it comes up in
      practice; not blocking.
- [x] Creator flow visual polish (Decision #54): `/create`, `/quizzes/:id/edit`,
      and `QuizQuestionForm` redesigned in place (proper Label/Input/Card
      structure, shadcn `radio-group` for the correct-answer selector,
      lucide icons, numbered question headers, a highlighted session-live
      panel with copy-join-code). Purely visual — functionality unchanged,
      re-verified via build/lint/unit/E2E after the change. Broke a few
      placeholder-text-based test/E2E selectors when copy changed; fixed
      by switching to label-based queries (more resilient going forward).
- [x] Dark mode (Decision #55): `useTheme` hook + `ThemeToggle` button,
      toggling the `.dark` class shadcn's already-generated dark theme
      tokens key off. Rendered only on the Creator flow pages for now
      (Create/Edit) — not on gameplay screens (Host/Display/Play), to
      avoid clutter during a live session. Fixed a few pre-existing
      hardcoded gray/red Tailwind classes on Host/Join/Play pages that
      would otherwise look wrong once dark mode existed anywhere in the
      app.
- [x] Backend automated test suite (Decision #56): `backend/` had zero
      tests before this; now has 65 Vitest tests covering the pure
      domain functions (scoring, shuffle, join codes, rate limiter) and
      in-memory/mocked-Prisma service logic (full game-loop state
      machine, join role assignment, results ranking). Real
      Postgres-backed integration tests for the CRUD-heavy services
      (`quiz.service.ts`, `auth.service.ts`, `session.service.ts`) were
      deliberately deferred, not attempted — see Decision #56 for why.
      Run via `npm run test` from `backend/`.
- [x] Dark mode + polish extended to Join and Results (Decision #57) —
      same pattern as Create/Edit, completing coverage for every
      non-gameplay page. Caught a real dark-mode contrast bug in
      `Podium` along the way (medal name text was unreadable in dark
      mode) and fixed it.
- [x] Transport-level reconnect fix (Decision #58) — closes the narrower
      gap Decision #53 left open: a pure network drop that Socket.IO
      auto-recovers from (no page reload) now also re-authenticates
      correctly, via a `connect`-event-driven `onConnect` callback in
      `useGameSocket`. Verified as a real fix via a stash-based
      regression check, not just re-testing the already-fixed reload
      case.

## ⚠️ Open item — E2E suite flakiness (unresolved, needs investigation)

After merging the three pieces above, the Playwright E2E suite
(`full-game-flow.spec.ts`, `reconnect.spec.ts`, `transport-reconnect.spec.ts`)
became intermittently flaky — including in `full-game-flow.spec.ts`, which
has **no reconnect logic at all** and was rock-solid for many runs earlier
in this project's history. Symptom: after a player answers and the host
locks the question, `"Correct!"` sometimes never appears on the player's
screen — as if the answer wasn't scored.

**What's been ruled out:** backend logs show zero errors and no rate-limit
(429) hits on every failing run — every REST call succeeds. This is not a
crash, not the `/auth/register` 10/hour limiter (Decision #38), and (per a
stash-based regression check) not the transport-reconnect fix itself being
broken.

**Working theory, not confirmed:** `answer:submit` has no ack
(DESIGN.md §5 treats it as fire-and-forget), and Player/Host are
independent Socket.IO connections with no ordering guarantee between them.
A script can click "answer" then "lock" milliseconds apart — closer
together than any real human host/player pair ever would — which may let
the host's `lock_question` reach the server before the player's answer
does. A `waitForTimeout(500)` settle buffer was added between answering
and locking in two of the three specs (see the commit "Add settle buffers
to E2E specs..."), which reduced but did **not** fully eliminate the
flakiness (roughly 1-in-3 runs still hit it in local testing).

**This has NOT been root-caused.** Possibilities not yet checked:
- Whether the race is genuinely just answer-vs-lock ordering (the working
  theory above), or something specific to the merged `useGameSocket`
  change affecting the normal (non-reconnect) join flow too.
- Whether increasing the buffer further (it was bumped 300ms → 500ms with
  only partial improvement) would ever fully fix it, or whether that's
  the wrong lever entirely.
- Whether adding a lightweight server-side ack for `answer:submit` (e.g.
  an `answer:ack` event) would be a more robust fix than a client-side
  timing buffer — this would be a small backend + frontend change, not
  just a test change, and hasn't been evaluated.
- Whether this pre-dates today's three merges entirely (it was observed
  once during a manual browser test earlier in the project, before any
  of today's changes existed) and is just now more visible because the
  suite runs the answer/lock sequence more often across more specs.

**See `docs/HANDOFF.md`** for full context and suggested next steps for
whoever picks this up.

## Status

Foundation scaffolded and all seven routes implemented (2026-09-23), built
via five parallel agents each in its own git worktree, then merged
sequentially into `main` (build/lint/test verified clean after each merge
and again after the final consolidation). See Decisions #47-49 for the
interim/gap items that surfaced during that work (host/display token
hand-off via `?token=`, client-side answer color/shape assignment, and the
`/play/:sessionId` route param actually being the join code). The
Creator→session hand-off gap is closed, and the full user journey has been
manually verified end-to-end (2026-09-23) against a real docker-compose
backend, with real bugs found and fixed along the way (Decision #51's
Content-Type bug, Decision #53's reconnect-state gap), and is covered by
three automated Playwright E2E tests (Decisions #52-53, #58). The Creator
flow has had a visual polish pass and dark mode support, now extended to
Join and Results too (Decisions #54-55, #57). The backend went from zero
automated tests to 65 (Decision #56). The narrower transport-level
reconnect gap Decision #53 left open is now also closed (Decision #58).

**One real open item remains: E2E suite flakiness** (2026-09-27, not yet
root-caused) — see the "⚠️ Open item" section above and `docs/HANDOFF.md`
for full context. Everything else that was tracked as a gap on this plan
is closed; further work beyond the flakiness investigation is genuinely
new scope (more polish, more quiz-editing features, extending dark
mode/redesign to the gameplay screens, backend Postgres-integration
tests, etc.), not something tracked here as a gap.
