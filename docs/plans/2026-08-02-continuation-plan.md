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
| `private/` (gitignored) | `BUGS_TRACKER.md` (bug IDs like `EK-G4`), `OPEN_PROBLEMS.md`, `TECHNICAL.md` — **local only, never commit** |

---

## 2. Repo & git state (verify this first)

- Remote: `https://github.com/Rengerams/wilderfolk`, single branch `main`. **116 commits of history + 1 local sync commit.**
- `git status` must be clean; `git log --oneline -3` tip = `0e3c489`.
- `.gitattributes` (`* text=auto eol=lf` + binary rules): repo is **LF**, working copy on Windows is **CRLF** — never "fix" line endings.
- `.gitignore` hardened: `private/`, `docs/superpowers/`, `.env`, `Wilderfolk.txt` (36 MB local transcript — **not part of the game**), `*.lnk`, `node_modules`, `dist`, `logs`.
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

---

## 4. Architecture quick map (orientation, not exhaustive)

- **`src/game/gameTick.ts`** — thin orchestrator: calendar → 4 tick layers → post-cleanup. Layer files: `tickLayerRealtime` · `tickLayerSystems` · `tickLayerAssign` · `tickLayerDaily` (the "four layers starting with tick" design). Feature modules own domain logic; `gameEngine.ts` is a compatibility barrel.
- **Command channel:** UI never mutates the world ad hoc. It sends `WorkerCommand` objects → `applyWorkerCommand` (`simWorker/commands.ts`). **To add a player action:** add the op to the union + `WORKER_COMMAND_OPS` + `validateWorkerCommandShape` + dispatch case, then a `buildingActions.ts`-style function.
- **Rendering:** renderer draws a read-only `RenderSnapshot` (`renderSnapshot.ts`). **Any new sim FX data must be added to the snapshot or it will never be drawn** (this was the hunt-visuals bug).
- **Day model:** `TICKS_PER_DAY = 72` (`TICKS_PER_HOUR = 3`). Use `dayTicks()` / `PER_TICK_RATE_SCALE` / `systemsPulsesFromLegacy()` — **never invent local `* TICKS_PER_HOUR` factors** (`dayCycle.ts` has the rules in comments).
- **Saves:** `saveSchema.ts` `WORLD_STATE_SAVE_KEYS` is the whitelist; buildings/entities serialize whole so new optional fields persist automatically. `tutorialSeen` IS saved; `huntVisuals`/grids are transient (not saved).

---

## 5. Known issues & recommended next work (priority order)

### A. Remaining O(H²) scans (perf, matters at 200+ pop)
`lifeSimulation.ts` still scans all humans per human in several spots:
- `nearbyAdults` filter (≈line 2788, free-roam leisure)
- `shiftMates` / `coworkers` filters (≈lines 2599, 2880)
- `collectFamilyMembers` inner `for (const other of humans)` (≈line 894)
- `countGuardsAtPrison` / `hasStaffedPrison` (lines ~1072-1086)
**Approach:** reuse the existing mobile-grid queries (`simQueries.ts`) and the `residenceOccupants` index instead of `allHumans.filter`. Verify with a high-pop playtest; no automated perf gate exists anymore.

### B. App.tsx is 2761 lines; build warns "chunk > 500 kB" (game chunk ~587 kB)
Extract remaining inline sub-components (`VisitorCampPanel`, `SelectedEntityPanel`, `BigNewsBanner`, `ActiveEventBanner`, `ShortcutsOverlay`) into `src/components/`. Already extracted: `FavoriteFollowBanner`. Re-check `npm run build` output after each move.

### C. `homeBuildingId` is actually the **workplace** id (footgun)
`dayCycle.ts` `hasWorkAssignment()` returns `homeBuildingId != null`; `App.tsx:2663` shows "Works at" from it. Rename to `workplaceBuildingId` across `dayCycle.ts`, `workforce.ts`, `buildingActions.ts`, `lifeSimulation.ts`, `App.tsx`. Mechanical, no logic change — do it in one commit.

### D. Werewolf-form age drift (low)
Cursed settlers in Werewolf form get `entity.age++` from the wildlife tick, but `gameTick.ts:110` only calendar-syncs `Human`-typed cursed settlers, so `entity.age` drifts from calendar age while transformed. Self-heals on revert. Fix: include `moonHowlerCursed` Werewolf entities in the calendar-sync pass.

### E. Minor cleanups
- `gameTick.ts:236` victory-scan condition is redundant with `LAYER_ASSIGN_INTERVAL` dividing the day — comment/code mismatch (cosmetic).
- `state.buildings = updatedBuildings` is assigned twice per tick in `gameTick.ts` (lines 222 & 265).

### F. Suggested playtest focus (manual — the player tests by playing)
Hunting Spot with each prey target (wolf fights back 35%, damages the building), tutorial dismissal across reload/new game, favorite-follow banner, weather cadence (should re-roll ~every 2.8 days now).

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
- `private/` contains the real bug tracker + open problems — read it locally for context, never commit it.
- Tests and headless sim scripts (`scripts/`) still exist — the user tests by playing, but do not delete them without explicit instruction.
- No `.git` history beyond `0e3c489` locally matters; full history lives on GitHub (`git log` works now that the remote is fetched).
