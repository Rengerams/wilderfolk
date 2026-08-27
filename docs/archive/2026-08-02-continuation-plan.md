# Wilderfolk — Agent Handoff & Continuation Plan

**Date:** 2026-08-02 · **Branch:** `main` · **Pushed:** `0e3c489` (`feat: sync local work since v0.5.1 — portrait, weather cadence, hunting spot, fixes`)

This document is a handoff for a fresh agent (no prior conversation context). Read it fully before touching code, then verify the repo matches §2.

---

## 1. What this project is

**Wilderfolk** — a cozy frontier colony sim ("Where Beasts and Kin Unite"). Player-facing pitch: `README.md`. Player docs: `README.md` · `CHANGELOG.md` · `ROADMAP.md`. Technical design: `docs/ARCHITECTURE.md`.

**Stack:** React 19 + TypeScript 5.9 (strict) + Vite 7 + Vitest 4, Tailwind CSS 3, Canvas 2D rendering, optional Web Worker sim. **Client-only, no backend.**

**Key doc files:**
| File | Purpose |
|---|---|
| `README.md` | Player pitch, controls, install |
| `docs/ARCHITECTURE.md` | Command/snapshot loop, main-loop diagram |
| `CHANGELOG.md` | Release notes (Keep a Changelog style, `[version] — date` headings) |
| `ROADMAP.md` | Shipped features by version |
| `docs/private/` (gitignored) | `BUGS_TRACKER.md` (bug IDs like `EK-G4`), `OPEN_PROBLEMS.md`, `TECHNICAL.md` — **local only, never commit** |

---

## 2. Repo & git state (verify this first)

- Remote: `https://github.com/Rengerams/wilderfolk`, single branch `main`. Full history + all sync work pushed.
- `git status` must be clean; `git log --oneline -3` tip = `2d7c213`.
- `.gitattributes` (`* text=auto eol=lf` + binary rules): repo is **LF**, working copy on Windows is **CRLF** — never "fix" line endings.
- `.gitignore` hardened: `docs/private/`, `docs/superpowers/`, `.env`, `Wilderfolk.txt` (36 MB local transcript — **not part of the game**), `*.lnk`, `node_modules`, `dist`, `logs`.
- Push with: `git push origin main` (credentials already stored on this machine).

---

## 3. Already done — DO NOT redo

Committed in `0e3c489` (all verified: lint 0/0, build passes, 26 tests pass):

1. **Hunting Spot prey selection** — `setHuntingSpotPrey` command (worker protocol + validation in `src/game/simWorker/commands.ts`), `Building.huntingSpotPrey` field + `HUNTING_SPOT_PREY_OPTIONS` (`src/game/gameTypes.ts`), prey filter in `tickLayerDaily.ts`, prey-picker UI in `SelectedBuildingPanel.tsx`, wired in `App.tsx`.
2. **Hunt visuals now render** — `huntVisuals` added to `RenderSnapshot` + `drawHuntVisuals` (dashed arrow flight) in `renderer.ts`. Before this, the data was created in `tickLayerDaily.ts` but never reached the renderer.
3. **Tutorial re-popup fixed** — dismissed contextual-tip ids persist in `localStorage` (`useContextualTutorial.ts`, key `wilderfolk-contextual-tutorial-seen`).
4. **Sim bug:** `tickWildlife` spliced the bucket while iterating → one entity skipped per in-tick death. Now iterates a copy (`lifeSimulation.ts`).
5. **Lint cleanup:** `FavoriteFollowBanner` extracted as a component (App.tsx), `TutorialOverlay.tsx` export removed, 3 `exhaustive-deps` warnings resolved.

Also committed in `e9bc4df` — **render-loop performance** (verified the same way):

6. **Canvas size cached** (`gameLoop.ts`) — `getBoundingClientRect()` per frame replaced by a `ResizeObserver`-driven size cache.
7. **`RenderSnapshot` cached** (`gameLoop.ts`) — rebuilt only when a dirty-key (tick, camera, selection, build state, transient FX counts) changes; idle/paused frames skip the build.
8. **`UI_UPDATE_MS` 100 → 250** — only paces periodic non-tick polls; sim ticks and clicks/commands notify immediately (no input latency impact).
9. **Entity layer camera-decoupled** (`entityLayer.ts` + `renderer.ts`) — painted against an anchor camera into a 160px-margin-padded surface; panning within the margin reuses the bitmap via blit offset (no per-frame rebake). Zoom still rebakes (pixel-perfect, no bitmap scaling).

Also committed later (each verified the same way):

10. **O(H²) scans killed in `tickHumans`** (`7284eff`) — `workersByWorkplace` index built once per tick (shiftMates/coworkers lookups now O(1)); `nearbyAdults` uses a mobile-grid query instead of an O(H) distance filter per free-roaming human. `collectFamilyMembers` left alone — its only caller `buildFamilyGroups` has no call sites.
11. **`.deepcode` excluded** (`fb407c1`) — the Deep Code CLI's local dir (settings + 16 MB `skills/` plugins) was swept in by `git add -A` and broke `eslint .`; now untracked + gitignored + eslint-ignored.
12. **UX smoothness** (`c4e7b91`) — `getGrazingPressureReport` (O(entities) grass scan) + `getEcosystemBreakdown` moved from every App render into `NatureTabPanel` (run only while the tab is open); build-panel width transition 300ms → 150ms.
13. **Review batch** (`063cc30`) — `assignMissingResidences` builds housing units **once** before its 24-pass loop (was a full rebuild every pass); `recruitSettler` spawns beside a valid building instead of map center (no more recruits on water).
14. **Rival buildings no longer count as player's** (`ef0a972`) — Village tab "Buildings" stat now excludes `faction === 'rival'` (rival camp buildings live in `state.buildings`); hotel "full" toast now fires only when ≥ `HOTEL_GUEST_CAPACITY` guests check in.
15. **Zoom / trees / panel** (`2d7c213`) — `CAMERA_ZOOM_MAX` 3 → **5** (very close zoom); trees under a building's footprint are cleared on placement (`startBuilding` + `placeStripChain`); `SelectedBuildingPanel` split into collapsible **Overview / Workers · Construction / Building actions** sections; hotel even-day gate removed.

---

## 4. Architecture quick map (orientation, not exhaustive)

- **`src/game/gameTick.ts`** — thin orchestrator: calendar → 4 tick layers → post-cleanup. Layer files: `tickLayerRealtime` · `tickLayerSystems` · `tickLayerAssign` · `tickLayerDaily` (the "four layers starting with tick" design). Feature modules own domain logic; `gameEngine.ts` is a compatibility barrel.
- **Command channel:** UI never mutates the world ad hoc. It sends `WorkerCommand` objects → `applyWorkerCommand` (`simWorker/commands.ts`). **To add a player action:** add the op to the union + `WORKER_COMMAND_OPS` + `validateWorkerCommandShape` + dispatch case, then a `buildingActions.ts`-style function.
- **Rendering:** renderer draws a read-only `RenderSnapshot` (`renderSnapshot.ts`). **Any new sim FX data must be added to the snapshot or it will never be drawn** (this was the hunt-visuals bug).
- **Day model:** `TICKS_PER_DAY = 72` (`TICKS_PER_HOUR = 3`). Use `dayTicks()` / `PER_TICK_RATE_SCALE` / `systemsPulsesFromLegacy()` — **never invent local `* TICKS_PER_HOUR` factors** (`dayCycle.ts` has the rules in comments).
- **Saves:** `saveSchema.ts` `WORLD_STATE_SAVE_KEYS` is the whitelist; buildings/entities serialize whole so new optional fields persist automatically. `tutorialSeen` IS saved; `huntVisuals`/grids are transient (not saved).

---

## 5. Action plan for the next agent — what matters most

> The micro-bug-fix wave is done. **Ordered execution plan: [docs/plans/2026-08-03-game-feel-plan.md](./2026-08-03-game-feel-plan.md)** (phases: quick wins → core → depth → QoL → hygiene). The P1 list below mirrors it; follow the phase order in the plan doc.

### P1 — High impact (game feel / product value)

1. **Landscape looks Phase A** (`docs/private/landscape-looks-research.md`) — the map "reads like colored blocks" is the #1 visual complaint. Seamless terrain atlas stamped in `bakeTerrainLayer` (grass/dirt/water), keep the current stack. Research estimates ~0.5–1 day of agent sessions for clearly better ground. Touch: `terrainLayer.ts`, `renderer.ts`, `public/sprites/terrain/`.
2. **App.tsx split** — still ~2700 lines; build warns "chunk > 500 kB" (~587 kB). Extract `VisitorCampPanel`, `SelectedEntityPanel`, `BigNewsBanner`, `ActiveEventBanner`, `ShortcutsOverlay` into `src/components/`. Re-check `npm run build` after each move. (`FavoriteFollowBanner` done; there is a 2026-07-24 repo-cleanup design with a hooks-extraction plan in `docs/superpowers/specs/`.)
3. **Outgoing counter-raid militia sprites** — incoming march lines exist; the war band has no visible sprites on the map (`renderer.ts`). Small, visible win.
4. **Right-menu UX continuation** — `SelectedBuildingPanel` is collapsible now; give `SelectedEntityPanel` (and the entity inspector) the same treatment so panels stay findable.
5. **Visitor quest lines / reputation arc depth** — one small visitor quest chain + rep arc beats another bug fix for player value (`groupEvents.ts` has the hooks).

### P2 — Player-observed issues (need a repro detail before fixing)

- **Citizens standing at the map edge** — investigated: leisure targets are center-weighted, camps are clamped ≥80 from the edge, the mobile grid covers all alive entities. Prime suspects: workers at workplaces the player placed near the edge, and the direct-line commute (no pathfinding) getting stuck on terrain. **Ask the player:** which citizens (workers/builders?), what time of day, which map edge, is there a building nearby?
- **"Talking to no one"** — the visible bubbles are mostly intentional self-talk (grief "I miss them…", weather "Awful storm", elder "My knees…"). Confirm with the player that's what they mean before changing anything.
- **"Too many guests"** — hotel toast spam fixed; the actual visitor spawn cadence is intentionally low (first-week + mid-year + bi-yearly). Recheck only if the player still sees crowds.

### P3 — Cleanups (mechanical; do in one commit each when there's time)

- **`homeBuildingId` is really the workplace id** — rename to `workplaceBuildingId` (`dayCycle.ts`, `workforce.ts`, `buildingActions.ts`, `lifeSimulation.ts`, `App.tsx`). No logic change.
- **`entity.age` dual-use** — humans in life-years, wildlife in days (`getAgeInYears` patches it). Consider renaming to `lifeYears` / `lifeDays`; combine with the werewolf age drift fix (`gameTick.ts:110` calendar-sync only covers `Human`-typed cursed settlers).
- **`gameTick.ts` minor cleanups** — redundant victory-scan condition (~line 236); `state.buildings = updatedBuildings` assigned twice per tick.
- **`structuredClone` per building action** — architectural (immer-style delta) only if actions hitch at huge pop; not urgent.

### P4 — Manual playtest focus (the player tests by playing)

Hunting Spot prey targets, tutorial persistence, favorite-follow banner, hotel over 2–3 nights, **zoom 5 feel** (pixelated terrain?), tree-clearing on build, collapsible building panel.

---

## 6. Verification workflow (always before committing)

```bash
npm run lint     # must be 0 errors, 0 warnings
npm run build    # must pass (chunk-size warning is pre-existing)
npm test         # 26 tests, 6 files — all must pass
```

**Conventions:**
- Commit messages: `feat:` / `fix:` / `docs:` / `chore:` / `release:` prefixes; reference bug IDs when relevant (e.g., `(EK-E6)`).
- Tests: colocated `<module>.<scenario>.test.ts` beside the code; regression tests get a comment header explaining the bug (see `hotkeys.test.ts`).
- Keep PRs/commits focused on one system; update `CHANGELOG.md` for gameplay-affecting changes; bump `GAME_VERSION` per release.

---

## 7. Gotchas for agents working in this repo

- **Shell cwd trap (tooling):** never `cd` into `/tmp`-style paths in the Bash tool — the persisted working directory becomes an invalid Windows path and every later command fails with `spawn bash ENOENT`. Keep `C:\tmp\wilderfolk-github\.keep` in place — it is the recovery shim for this exact failure. If the shell wedges anyway, recreate that directory.
- `.env` was deleted by the user; it is now gitignored. `VITE_USE_GAME_WORKER=1`, `VITE_USE_SPATIAL_GRID=0`, `VITE_SPATIAL_GRID_INVARIANT=1` are optional runtime flags if a `.env` is ever recreated.
- `docs/private/` contains the real bug tracker + open problems — read it locally for context, never commit it.
- Tests and headless sim scripts (`scripts/`) still exist — the user tests by playing, but do not delete them without explicit instruction.
- No `.git` history beyond `0e3c489` locally matters; full history lives on GitHub (`git log` works now that the remote is fetched).
