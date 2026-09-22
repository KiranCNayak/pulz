# Frontend Plan & Progress

Living tracker for the frontend build-out (CLAUDE.md "Likely next steps" #2).
**Foundation is scaffolded (routing/providers/shared modules); the seven
feature views are all still placeholder pages.** If you're an agent picking
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
- [ ] Creator flows: `/create`, `/quizzes/:id/edit` (bearer-token auth
      against the existing Creator CRUD API). **Independent of the
      other feature views below — safe to parallelize.**
- [ ] Host controller view: `/host/:sessionId`. **Independent of the
      other feature views below — safe to parallelize.**
- [ ] Display/cast view: `/display/:sessionId` (read-only, safe to
      project publicly). **Independent of the other feature views
      below — safe to parallelize.**
- [ ] Join + Player/Spectator gameplay: `/join` → `/play/:sessionId`,
      building out `AnswerGrid`. **Independent of the other feature
      views below — safe to parallelize.**
- [ ] Results/podium page: `/results/:sessionId`, backed by the
      existing `GET /results/:sessionId` API, building out `Podium`.
      **Independent of the other feature views above — safe to
      parallelize.**
- [ ] End-to-end manual pass: create a quiz, run a session with a real
      host + multiple player clients, confirm scoring/leaderboard/podium
      match backend-authoritative results. **Do this last, after the
      five feature views above have all landed.**

## Status

Foundation scaffolded (2026-09-23): Vite + React + TypeScript, Tailwind,
shadcn/ui, React Router, TanStack Query, Socket.IO client, and Vitest are
all wired together and verified (`npm run build` / `npm run test` /
`npx oxlint` all pass). The five feature-view items above are independent
of each other (each touches its own route/page file plus, at most, the
already-created shared modules) and are being picked up in parallel by
separate agents — check each item's own commit history for current status
rather than assuming this file is perfectly in sync.
