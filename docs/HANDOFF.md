# Handoff — E2E suite flakiness investigation

**One-time handoff doc, written 2026-09-27.** This is not a permanent
living doc like `docs/FRONTEND_PLAN.md`/`docs/DECISIONS.md` — it exists so
a fresh agent (or a human) can pick up exactly where this session left
off without re-deriving context. Once the issue below is resolved, fold
the resolution into `docs/DECISIONS.md` (a new numbered entry) and
`docs/FRONTEND_PLAN.md` (remove its "⚠️ Open item" section), and this
file can be deleted.

## Orientation — read in this order

1. `CLAUDE.md` — overall project orientation.
2. `docs/FRONTEND_PLAN.md`, specifically the **"⚠️ Open item — E2E suite
   flakiness"** section — the same problem summarized there, in the
   plan's own voice.
3. `docs/DECISIONS.md` Decisions #52, #53, #58 — the three Playwright E2E
   specs and the transport-reconnect fix that was being merged when this
   flakiness first appeared.
4. This file, for the blow-by-blow of what was tried during the
   investigation and why it wasn't concluded.

## What just happened (context for how we got here)

Three independent pieces of work were built in parallel (separate git
worktrees, separate agents) and merged into `main` one after another:

1. Backend test suite (Decision #56) — `backend/` only, no frontend
   changes.
2. Dark mode + polish for Join/Results (Decision #57) — `JoinPage.tsx`,
   `ResultsPage.tsx`, `Podium.tsx` only.
3. Transport-level Socket.IO reconnect fix (Decision #58) —
   `useGameSocket.ts`, `HostPage.tsx`, `DisplayPage.tsx`, `PlayPage.tsx`,
   plus a new `frontend/e2e/transport-reconnect.spec.ts`.

All three merged cleanly (no git conflicts — they were scoped to avoid
touching the same files). Backend tests (65, all in `backend/`) pass
reliably. Frontend unit tests (12, Vitest) pass reliably. Frontend
build and lint are clean. **The E2E suite (Playwright, 3 specs) is what's
flaky.**

## The symptom

After a player answers a question and the host locks it, the player's
screen sometimes never shows the "Correct!"/"Not quite." result screen —
as if the `answer:submit` was never scored. This has been observed in
**all three** E2E specs at different points, including
`full-game-flow.spec.ts`, which has **no reconnect logic at all** and was
rock-solid across many runs earlier in this project's history (before
today's three merges).

Rough observed failure rate during investigation: about 1-in-3 to 1-in-2
runs of the full 3-spec suite hit this somewhere, after adding a 500ms
settle buffer (see below) — worse before the buffer was added.

## What's been ruled out

- **Not a crash or server error.** `docker compose logs backend` shows
  zero errors across every failing run.
- **Not the `/auth/register` rate limiter** (Decision #38, 10/hour/IP).
  This *did* cause failures earlier in the investigation (visible as
  `429` responses in backend logs, and `"Create quiz"` not navigating to
  the edit page) — those are a red herring from running the suite too
  many times in one hour. `docker compose restart backend` resets its
  in-memory state. Always check backend logs for `429` before assuming a
  failure is the bug under investigation — grep with:
  `docker compose logs backend --tail=100 --no-log-prefix | grep -i 429`
- **Not stray/leftover processes.** Checked `ps aux | grep ms-playwright`
  — zero orphaned Playwright-launched Chromium processes during the
  investigation.
- **Not duplicate `node_modules` module resolution** (a real, separate
  issue that *was* found and fixed — see below).
- **Not the transport-reconnect fix being broken.** The agent that built
  it did a stash-based regression check: reverting `useGameSocket.ts`
  broke even the *initial* (non-reconnect) join, proving the fix is
  load-bearing and correct for what it does. Also, the flakiness shows
  up in `full-game-flow.spec.ts`, which never touches the reconnect path
  at all — so the bug (if it's a bug and not purely a test-timing issue)
  isn't specific to the reconnect code path.

## A real, separate bug that WAS found and fixed along the way

Immediately after merging, all three specs failed with:
```
Error: Requiring @playwright/test second time
```
This was **not** related to the actual flakiness — it was because the
three agents' git worktrees (each with their own `node_modules`) were
still present on disk under `.claude/worktrees/`, and Node's module
resolution was picking up multiple physical copies of `@playwright/test`
by walking up parent directories. Fixed by removing the merged worktrees:
```
git worktree remove .claude/worktrees/<name>   # for each
git branch -d worktree-agent-<id>              # for each
```
**If you see this exact error, check `git worktree list` first** before
assuming it's related to the flakiness below.

## Working theory (NOT confirmed)

`answer:submit` (see `backend/src/sockets/session.socket.ts` and
`backend/src/services/gameLoop.service.ts`'s `submitAnswer`) has no ack —
DESIGN.md §5 documents it as fire-and-forget. The Player and Host in each
E2E test are **two independent browser contexts with two independent
Socket.IO connections** and no ordering guarantee between them. A script
can click "answer" then (on a *different* connection) click "lock"
milliseconds apart — far closer together than any real human host/player
pair ever would manage — which may let the host's `host:lock_question`
reach the server and run `lockQuestion()` (which computes the tally and
emits `question:reveal`/`answer:result` based on whatever's been recorded
so far) *before* the player's `answer:submit` has actually been processed
server-side.

If this theory is right, it's a **test realism problem, not an app bug**:
real users always have human reaction time between "player answers" and
"host clicks lock." But it hasn't been confirmed — see next section.

### What would confirm or refute this theory

The most direct way to know for sure: add server-side logging (temporary,
just for debugging) in `submitAnswer` and `lockQuestion`
(`backend/src/services/gameLoop.service.ts`) that logs a timestamp and
the participant/question ids, then correlate against a failing run's
timing. If `lockQuestion` runs before the matching `submitAnswer` log
line, the theory is confirmed. If `submitAnswer` always runs first and
the answer is still lost, the bug is somewhere else entirely (e.g. a
stale `session.current.question.id` check rejecting a valid answer, or
the socket the answer arrives on not being the one the server thinks is
mapped to that participant — check `socketContexts` and
`session.participantTokens` bookkeeping in `session.socket.ts` for that).

## What was tried already (didn't fully fix it)

`frontend/e2e/full-game-flow.spec.ts` and
`frontend/e2e/transport-reconnect.spec.ts` both got:
1. An explicit `await expect(answerButton).toBeDisabled()` after the
   click (proves the click landed client-side).
2. A `await playerPage.waitForTimeout(500)` after that, before the host's
   lock click (an attempt to give the answer time to reach the server).

This measurably reduced the failure rate but did **not** eliminate it.
See the commit "Add settle buffers to E2E specs to reduce (not fully
eliminate) answer/lock race" for the exact diff and reasoning.

`frontend/e2e/reconnect.spec.ts` was **not** modified — it has a real
`page.reload()` between answering and locking, which provides much more
natural buffer time than a fixed `waitForTimeout`, and was not observed
failing at this specific step during the final rounds of testing (though
it did fail once earlier, but that occurrence coincided with a rate-limit
hit — see above).

## Suggested next steps, roughly in order of how much they'd tell you

1. **Add the temporary timestamped logging described above** and run the
   suite until it fails, then read the actual event ordering. This is
   the highest-value next step — everything below is guessing without it.
2. If the race is confirmed: consider adding a lightweight ack for
   `answer:submit` (e.g. the server emits `answer:ack` back to the
   submitting socket once `submitAnswer()` returns, and the E2E test
   `await`s that specific event instead of a fixed timeout — same pattern
   already used successfully in `transport-reconnect.spec.ts`'s
   `forceTransportDropAndWaitForRejoin` helper, which arms a listener for
   a specific event *before* triggering the action, rather than guessing
   with `waitForTimeout`). This would be a small, real product
   improvement (a deterministic client-side "your answer was received"
   signal), not just a test hack — worth doing regardless of whether it's
   the actual root cause, since fire-and-forget answer submission is a
   legitimate UX gap (a player never currently knows if their tap actually
   registered before lock, only after reveal).
3. If the race is *not* confirmed (submitAnswer always logs first): dig
   into whether `lockQuestion`'s scoring logic or the socket/participant
   bookkeeping has an actual bug — start with
   `backend/src/services/gameLoop.service.ts`'s `submitAnswer` and
   `lockQuestion`, and `backend/src/sockets/session.socket.ts`'s
   `answer:submit` handler.
4. Either way, once fixed, run the full suite **at least 10 times** in a
   row (a simple shell loop) before considering it resolved — the
   observed failure rate makes 2-3 clean runs not meaningfully
   informative.

## How to run things

```bash
# From repo root — brings up Postgres + backend + frontend
docker compose up --build -d
docker compose ps                    # confirm all 3 healthy/up

# If you suspect the /auth/register rate limiter (429s in backend logs):
docker compose restart backend       # resets its in-memory state

# From frontend/
npm run build && npx oxlint && npm run test   # build/lint/unit — should always be clean
npm run test:e2e                              # the flaky suite; workers:1, run serially
```

Backend logs: `docker compose logs backend --tail=100 --no-log-prefix`
(the `--no-log-prefix` flag matters — without it, container-name
prefixes make grepping harder).

## Current repo state as of this handoff

All work described above (backend tests, dark mode extension, transport
reconnect fix, and the partial E2E settle-buffer fix) is **merged to
`main` locally**. Check `git status` / `git log origin/main..main` to see
whether it's been pushed yet in your session — if `git status` shows
`ahead` of `origin/main`, push it (this repo's convention is direct
pushes to `main`, no PR gating — see Decision #19) before or after your
investigation, your call, but don't leave it stranded locally.
