# Wilderfolk — Next version roadmap (v0.6.2) & agent handoff

*Written 2026-08-17 · after v0.6.1 shipped (adaptive social perf, story system, sim-feel).*
Serves as the working plan for the next version and the next coding agent.

---

## 1. Where we are (v0.6.1, shipped)

- **Perf:** 1,200 settlers 192 → 38 ms/tick; capacity ceiling **2,600** ACCEPTABLE / 2,800 WATCH (`scripts/perf-all.ts`, dynamic sweep)
- **Refactor:** `lifeSimulation.ts` split into domain modules; `gameEngine` remains the pre-existing cycle hub (depcruise ~57–63 warnings, EI-tracked)
- **Stories:** `storyEvents.ts` system + first-session arc — welcome → wolf choice → ranger memory → Kaia's winter test → grief beat → howler rumor → election debate
- **Sim-feel:** pregnancy variance, stillbirth 1:1000, famine hunting ("hunger wins"), Moon-Howler fear scan gated
- **Gates:** 37 files / 222 tests · lint 0 · build ✓ · jscpd 0 clones

## 2. v0.6.2 themes

1. **Make the first 15 minutes great** (expert guidance: accessible, consequence-driven, ends with curiosity)
2. **Let systems emerge from consequences** (no announcements; events introduce systems)
3. **Ecology as memory** (the valley remembers — visible traces, not just numbers)
4. **Polish + close the open loops** (tracked bugs, economy sink decision, browser playtest)

## 3. Work items (priority order)

### P0 — Validate the first session in a browser
- **Browser playtest of the opening arc** (welcome → house → farm → wolf choice → ranger → winter test): the external review's deferred item "browser E2E for first 15 min" is now the #1 risk.
- Entry: `.deepcode/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 -- python scripts/playtest*.py`; screenshots → `playtest/`.
- **Success:** no console errors; all six story cards appear in order; choices resolve; screenshots tell the intended story.

### P1 — Valley memory (ecology leaves traces)
- After the wolf choice resolves, the valley *remembers*: e.g., if the player thins the pack, a Chronicle entry + a named location ("The Empty Grove") or fewer tracks; a second ranger beat references it. Cheap, high-impact (originality doc #1/#9).
- Entry: `storyEvents.ts` resolvers + `logEvent`; add a `valleyMemory` record if more traces are wanted.

### P1 — Chronicle retrospective entries
- At year boundaries, generate 1–2 line retrospective entries from real state (survivors, first winter, marriages, elections, ecological changes): "The first winter was survived with twelve people and no storehouse…" (originality doc #10 — "inexpensive, makes the game personal").
- Entry: `valleyChronicle.ts` (`advanceValleyChronicle` exists) — extend with retrospective generation.

### P1 — Caravan hunting-concession story
- Spec'd but not built: a trader group offers short-term food for a hands-off-the-deer covenant. Reuses `storyEvents` (`offerStoryEvent`), hook: `groupEvents.ts` trader arrival.
- Success: accept → food + eco; decline → rep; one test each.

### P2 — Tracked bugs (`docs/private/BUGS_TRACKER.md`, open)
- Pregnant settler still walks/works · off-screen camp does not drain food · welcome-refugee camp-size ghosts · full-moon job reassign · married 16–17 · Mill passive-or-staffable.
- Pick any with a reproduction; file under a new batch letter.

### P2 — Economy sink decision
- Open design: gold snowballs with no recurring sink. Options: do nothing (sandbox) / flat upkeep `gold -= ceil(pop/5)·k` per day (no per-settler ledger). Per-settler wages are **explicitly rejected** (user: too complex, not the game's focus).
- Decision recorded in `docs/private/OPEN_PROBLEMS.md`.

### P3 — Perf headroom
- Ceiling 2,600; next costs at 2,800: social candidates 149k/tick + hunt/flee. `ADAPTIVE_QUERY_CONFIG.hunt` (0.85/1.1) is spec'd but on hold (user: "good for now").
- `App.tsx` still ~2,335 lines — split only if UI hitch shows.

### P3 — Content backlog
- Outgoing counter-raid militia sprites · reputation arc depth / visitor quest lines · wall/gate sprite replacement (user-deferred).

## 4. Agent handoff (start here)

1. **Read first:** `README.md` (systems + commands), `CHANGELOG.md` (recent), `src/game/storyEvents.ts` (the new story pattern), `docs/private/OPEN_PROBLEMS.md` + `BUGS_TRACKER.md`.
2. **Gates before/after any change:** `npm test` (222) · `npm run lint` (0) · `npx tsc -b` · `npx vite build` · `npm run dup` (0 clones). Never `git add -A`.
3. **Start with P0** (browser playtest of the first session) — it decides whether the arc works before adding more.
4. **Follow the conventions:** conventional commits with scope; story beats go through `storyEvents.ts` (not ad-hoc notifications); sim changes scale with `PER_TICK_RATE_SCALE`, never local `*TICKS_PER_HOUR`; version bumps + CHANGELOG only for gameplay-affecting releases (0.6.2).
5. **Avoid the known trap:** `storyEvents.ts` must import only leaf modules (`resourceUtils`, `playerHuman`, `dayCycle`, `simEffects`, `eventLog`) — importing `economy`/`gameEngine` re-creates the X-1 cycle that breaks the election-gossip mock.
6. **Open decisions to respect:** no per-settler wages; sandbox (no victory paths); save policy is exact-version only.
