# Wilderfolk — Repo cleanup, dependency audit, CI, and App.tsx wiring extraction

**Date:** 2026-07-24  
**Scope:** Repo-root hygiene, `app/package.json` audit, GitHub Actions CI, docs reconciliation, and extracting the remaining stateful wiring from `App.tsx` into focused hooks.

---

## Goals

1. Stop shipping a committed root `node_modules/` entry and remove the stale root `package.json`.
2. Clean `app/package.json` of unused/dead dependencies (`react-router`, `kimi-plugin-inspect-react`, and the four dep-graph tools).
3. Convert the current manual quality claims into a verified CI workflow.
4. Reconcile docs with the post-cleanup tree.
5. Decompose the remaining monolithic wiring in `App.tsx` into hooks under `src/hooks/`, mirroring the existing `gameEngine.ts` barrel-refactor pattern.

Out of scope (per session logs and user direction):
- Simulation/benchmark scripts — already removed and not to be touched.
- `lifeSimulation.ts` / tick-layer internals — not part of this cleanup.
- Local session notes in `private/` and at repo root — already ignored or untracked; left untouched.

---

## 1. Root hygiene

Current state:
- `C:/wilderfolk/package.json` exists and only contains `npx@^10.2.2`.
- `node_modules/.package-lock.json` is committed at repo root.
- Untracked root `node_modules/.bin/` and `node_modules/npx/` are present on disk.

Changes:
1. Delete `C:/wilderfolk/package.json`.
2. `git rm --cached node_modules/.package-lock.json` to untrack it.
3. Update `C:/wilderfolk/.gitignore`:
   - Add `/node_modules/` (anchored to root so `app/node_modules/` keeps being governed by `app/.gitignore`).
   - Add `/package-lock.json` (anchored to root).
4. Delete the stray root `node_modules/` directory on disk.

Result: `app/` becomes the effective command root; the clone no longer carries a root `node_modules/` entry.

---

## 2. `app/package.json` audit

Remove:
- `react-router` dependency.
- `kimi-plugin-inspect-react` devDependency.
- `ts_dependency_graph` dependency.
- `typescript-graph` dependency.
- `ts-call-graph` devDependency.

Keep:
- `madge` as the single remaining dependency-graph utility.

Script changes:
- Remove the `graph` script that calls `ts_dependency_graph`.
- Remove the generated `src/graph.md` artifact, which was produced by the removed tool and will no longer be reproducible.

The `npx` package only existed in the root `package.json`; it disappears automatically when that file is deleted.

---

## 3. Remove dead code wiring

Because `react-router` and `kimi-plugin-inspect-react` are being removed, clean up their call sites:

- `src/main.tsx`: remove `BrowserRouter` import and wrapper; render `<App />` directly under `StrictMode`.
- `vite.config.ts`: remove `import { inspectAttr } ...`, remove `inspectAttr()` from the plugins array, and remove the `react-router` manual-chunk branch.

---

## 4. GitHub Actions CI

Add `.github/workflows/ci.yml` at the repo root.

Behavior:
- Trigger on `push` to `main` and on pull requests.
- Use `actions/checkout@v4`.
- Use `actions/setup-node@v4` with Node 20, `cache: npm`, and `cache-dependency-path: app/package-lock.json`.
- Set `defaults.run.working-directory: app`.
- Run:
  1. `npm ci`
  2. `npm run test:all`
  3. `npm run lint`
  4. `npm run build`

This replaces the manual "build + lint green" notes with an automated gate.

---

## 5. Docs reconciliation

`README.md` (root):
- Remove the `npm run simulate:20year PASS` bullet from the v0.5.0 highlights table.

`ROADMAP_0.5.0.md`:
- Remove the `simulate:20year` row from the half-done registry.
- Remove the `npm run simulate:20year PASS` exit criterion.
- Remove or reword the `simulate:20year` full-run next action.

`TECHNICAL.md`:
- Remove the description of root `package.json` forwarding scripts (`npm --prefix app ...`).
- State that all commands run from `app/` (`cd app && npm install && npm run dev/build/test/lint`).
- Update the repository layout block to reflect that there is no root `package.json`.

The player-facing install steps in `README.md` already say `cd app`; leave those.

---

## 6. `App.tsx` decomposition

Extract the remaining stateful wiring into four focused hooks under `src/hooks/`. The UI panels (`VillageTabPanel`, `FrontierTabPanel`, etc.) are already split; this work only moves wiring out of `App.tsx`.

### 6.1 `useGameCamera`

Responsibilities:
- Own camera zoom functions (`applyZoom`, `resetZoom`, `setZoomLevel`).
- Register the canvas wheel-zoom listener.
- Expose `applyZoomRef` so `useKeyboardControls` can reuse it without extra re-renders.

Inputs:
- `canvasRef: RefObject<HTMLCanvasElement | null>`
- `loopRef: RefObject<GameLoop | null>`
- `spritesLoaded: boolean`
- `showIntro: boolean`
- `showMapSetup: boolean`

Outputs:
- `applyZoom(factor, screenX?, screenY?)`
- `resetZoom()`
- `setZoomLevel(zoom: number)`
- `applyZoomRef: RefObject<...>`

### 6.2 `useGameSession`

Responsibilities:
- Own save/load/new-game session logic.
- Manage `saveToast`, `hasSavedGame`, and the 30-second auto-save interval.
- Provide `persistCurrentGame` and its ref for keyboard-triggered saves.

Inputs:
- `loopRef`, `worldRef`, `viewRef`
- `selectedMapSize`, `selectedMapPreset`, `tutorialsEnabled`
- Required state setters from `App.tsx` (`setWorld`, `setView`, `setSelectedBuildingType`, `setHasPlacedHouse`, `setShowTutorial`, `setTutorialStep`, `setShowMapSetup`, `setFirstNightWarningDismissed`, `setHiddenBigNewsIds`, `setHiddenActiveEventIds`)

Outputs:
- `saveToast`, `setSaveToast`
- `hasSavedGame`, `setHasSavedGame`
- `persistCurrentGame`, `persistCurrentGameRef`
- `handleSave`, `handleLoad`, `handleLoadFromSetup`
- `applyLoadedSession`
- `beginNewGameSession`, `startNewGame`
- `toggleAutoSave`

### 6.3 `useFrontierEvents`

Responsibilities:
- Derive pending raids, outgoing raids, diplomacy events, and selected visitor camp.
- Compute `frontierAlertCount` and active-event banner state.
- Provide event-response callbacks used by the raid/diplomacy banners and the visitor camp panel.

Inputs:
- `world: WorldState`
- `view: ViewState`
- `hiddenBigNewsIds: ReadonlySet<string>`
- `hiddenActiveEventIds: ReadonlySet<string>`
- `focusCampOnMap`
- `applyGameAction`

Outputs:
- `pendingRaids`, `pendingOutgoingRaids`, `pendingDiplomacy`
- `selectedVisitorCamp`
- `frontierAlertCount`
- `activeEventForBanner`, `showActiveEventBanner`
- `dismissActiveEvent`, `dismissBigNewsItem`
- `activeBigNews`
- Callbacks for raid/diplomacy/visitor responses.

### 6.4 `useAudioSession`

Responsibilities:
- Wrap the existing `useGameAudio` hook.
- Handle gameplay audio lifecycle (`beginAudio` when gameplay starts, `stopIntroSong` when leaving intro/map setup).

Inputs:
- `world: WorldState`
- `gameplayActive: boolean`
- `showIntro: boolean`

Outputs:
- `muted`, `volumePreset`
- `toggleMute`, `setVolumePreset`

### 6.5 `App.tsx` after extraction

`App.tsx` will:
- Keep state declarations and the render/layout.
- Import and call the four new hooks.
- Pass returned values/callbacks into panels, banners, and canvas event handlers.
- Remaining inline callbacks (tab toggling, building selection, priority alerts, hint actions, etc.) stay because they are generic UI orchestration, not camera/save/raid/audio wiring.

---

## Verification

After all changes, run from `app/`:

```bash
npm run test:all
npm run lint
npm run build
```

All three must pass before the work is considered complete.

---

## Affected files

- `C:/wilderfolk/package.json` — delete
- `C:/wilderfolk/.gitignore` — edit
- `C:/wilderfolk/node_modules/` — delete stray directory
- `.github/workflows/ci.yml` — create
- `app/package.json` — edit
- `app/package-lock.json` — regenerate via `npm install` after edits
- `app/src/main.tsx` — edit
- `app/vite.config.ts` — edit
- `app/src/graph.md` — delete
- `README.md` — edit
- `ROADMAP_0.5.0.md` — edit
- `TECHNICAL.md` — edit
- `app/src/App.tsx` — edit
- `app/src/hooks/useGameCamera.ts` — create
- `app/src/hooks/useGameSession.ts` — create
- `app/src/hooks/useFrontierEvents.ts` — create
- `app/src/hooks/useAudioSession.ts` — create
