# Frontend Plan & Progress

Living tracker for the frontend build-out (CLAUDE.md "Likely next steps" #2).
**All seven routes now have real implementations, not placeholders.** The
biggest remaining gap is that no UI yet actually *creates* a session and
hands off to Host/Display — see "Open gap" below. If you're an agent
picking this up cold:

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
- [ ] **Open gap — Creator → session hand-off.** Nothing in the frontend
      yet calls `POST /quizzes/:id/sessions` or links a Creator from
      `/quizzes/:id/edit` to `/host/:sessionId?token=...` /
      `/display/:sessionId?token=...`. Right now Host/Display can only be
      reached by hand-constructing the URL with a token captured some
      other way (e.g. from a manual API call). This is the next real
      piece of work — a "Start session" action on the Edit Quiz page that
      creates the session and surfaces both links (and the join code).
- [ ] End-to-end manual pass: create a quiz, start a session, run it with
      a real host + multiple player clients across Host/Display/Play/
      Results, confirm scoring/leaderboard/podium match
      backend-authoritative results. Blocked on the gap above.

## Status

Foundation scaffolded and all seven routes implemented (2026-09-23), built
via five parallel agents each in its own git worktree, then merged
sequentially into `main` (build/lint/test verified clean after each merge
and again after the final consolidation). See Decisions #47-49 for the
interim/gap items that surfaced during that work (host/display token
hand-off via `?token=`, client-side answer color/shape assignment, and the
`/play/:sessionId` route param actually being the join code). The
Creator→session hand-off gap above is the next thing to pick up.
