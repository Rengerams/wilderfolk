# Ten UI defects in the UI-logic audit slice F26–F37 — and one finding that is not a defect

- Bug: ten presentation defects confirmed against the current tree, plus one audit finding proven unreachable
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, findings F26–F37)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F26–F37). F26–F37 re-verified line by line against the tree on 2026-09-17 before any edit; the fix pass is this report.
- Area: UI
- Owner module: `components/SelectedBuildingPanel.tsx`, `components/WorkSchedulePanel.tsx`, `components/VenueSchedulePanel.tsx`, `game/venueSchedule.ts`, `components/SimulationDiagnosticsPanel.tsx`, `hooks/useTransientGameFeedback.ts`, `components/resourceLabels.ts`, `game/resourceCost.ts`, `App.tsx`, `components/dashboard/GameDashboard.tsx`, `components/CitizenOverviewScreen.tsx` (new `hooks/useModalFocus.ts`), `game/viewState.ts`, `game/IntroScreen.tsx`
- Cadence: presentation (per render / per frame / per key event); no simulation-tick behaviour changed

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; none of the twelve had been filed as reports)
- 2026-09-17 — resolved (ten repaired; F36 closed as not-a-defect with the reachability proof below)

## Observed behavior

Twelve audit findings, verified one by one against the current tree. Line numbers in the audit had
drifted (`SelectedBuildingPanel` +7, `GameDashboard` +10, `App.tsx` +3 and then further under
concurrent work) and one cited path had moved (`components/GameDashboard.tsx` →
`components/dashboard/GameDashboard.tsx`), but every mechanism was still present:

| # | Defect | Site |
|---|---|---|
| F26 | The staffing toggle read `'Handmatig'` (Dutch) in an English UI | `SelectedBuildingPanel.tsx` (`mode === 'auto' ? 'Auto-fill' : 'Handmatig'`) |
| F27 | The Workshop card advertised `~0 gold / 2 days` on a completed, unstaffed shop, because `estimateWorkshopGold(state, building)` omits the `{ previewUnstaffed: true }` option the owner provides for exactly that preview — and listed each recipe's raw `baseGold` beside the fully multiplied estimate | `SelectedBuildingPanel.tsx` (`estimateWorkshopGold` call, `… → {r.baseGold}g`) |
| F28 | `"Unchanged — no command will be sent."` was unreachable in **both** schedule panels: `validateWorkSchedule(startHour, endHour)` was called without its optional `currentSchedule`, so `status` was never `'unchanged'` while a disabled Apply button said "Accepted by bounds — ready to apply"; `validateVenueSchedule` had no current-schedule parameter at all | `WorkSchedulePanel.tsx`, `VenueSchedulePanel.tsx`, `game/venueSchedule.ts` |
| F29 | The diagnostics panel polled `getDiagnostics()` every 250 ms regardless of the collapsed section, committing a fresh object 4×/s for a panel nobody was looking at | `SimulationDiagnosticsPanel.tsx` |
| F30 | `dismissedNotificationIds` grew one entry per dismissed toast and was never trimmed — persisted in the save and copied + diffed in every UI patch | `hooks/useTransientGameFeedback.ts` |
| F31 | A second resource-emoji map (`resEmoji`) lived in `App.tsx` beside the owner `RESOURCE_METAS`, and `ResourceKey` was declared twice (with the game layer importing the type from the components layer) | `App.tsx`, `components/resourceLabels.ts`, `game/resourceCost.ts` |
| F32 | `hasSave()` — a `localStorage` read plus a full `JSON.parse` of the save — ran in the **render body** at two call sites, and the `useState(hasSave())` initializer re-ran it on every render | `App.tsx` |
| F33 | Neither full-screen overview moved or trapped focus: the dashboard had no `role`/`aria-modal` either, while `CitizenOverviewScreen` declared itself a dialog but did nothing about focus | `components/dashboard/GameDashboard.tsx`, `components/CitizenOverviewScreen.tsx` |
| F34 | `createViewFromSave` parsed `buildGhost` from a save key nothing ever wrote (`mergeForSave` persists `buildMode` but not `buildGhost`) | `game/viewState.ts` |
| F35 | The intro's ambient-particle effect is keyed on `auroraVisible` and pushed 60 more particles into the ref that outlives the run, so the aurora beat doubled the field | `game/IntroScreen.tsx` |
| F37 | Loading a save did not reset the session-scoped shell state the new-game path resets, so the loaded colony inherited a placement mode and the quick-start overlay with the forced pause it applies | `App.tsx` |
| F36 | **Not a defect.** The audit suspected that a refused load leaves process-global RNG/seed/faction-wander state swapped, because those mutations sit inside the `try` before `createViewFromSave` and the `catch` returns `null` without restoring them | `game/saveLoad.ts` |

## Expected behavior

- One English label; one emoji/label source per resource; no storage access in the render body.
- A preview that shows what the building will produce once staffed, and says so.
- A message that matches the button state it sits next to.
- Hidden panels and unmounted work cost nothing per frame.
- Persisted ledgers stay bounded.
- A full-screen overlay announces itself, takes focus and holds Tab.
- Save parsing reads only keys that can be written.
- A loaded colony starts from the loaded colony's state, not the previous session's.

## Reproduction steps

1. Open a job building's inspector → the staffing toggle reads "Handmatig" (F26).
2. Finish a Workshop and select it before staffing it → "Uses: 5 Wood → ~0 gold / 2 days", with
   "→ 4g" on the recipe row below (F27).
3. Open the work-hours or Tavern/Hotel panel and leave the window untouched → "Accepted by bounds —
   ready to apply." next to a disabled Apply button (F28).
4. Collapse Simulation diagnostics and watch React commit a new diagnostics object 4×/s (F29).
5. Dismiss a few toasts and inspect the save → `dismissedNotificationIds` keeps every id (F30).
6. Open the dashboard (☰ → dashboard) or the People overview with the keyboard: focus stays on the
   header button behind the overlay and Tab walks the game UI (F33).
7. Enable tutorials, clear `wilderfolk-tutorial-done`, boot, and press "Load saved game" on the
   new-settlement screen → the quick-start overlay and its forced pause land on the loaded colony,
   and a placement mode armed before the load survives it (F37).
8. F36: the audit asked for a forced failure. Forcing one is not possible — see Root cause.

## Evidence

- `tests/venueSchedule.test.ts` (8) — the new `'unchanged'` case pins that the owner reports an
  unchanged window only when it is given the current one, and stays `'accepted'` without it.
- `tests/workshopEconomy.previewUnstaffed.test.ts` (1) — an unstaffed completed Workshop returns
  `0` from `estimateWorkshopGold` and `> 0` with `{ previewUnstaffed: true }`, which is what the
  inspector now passes. Written against a real `initGame` world (seed 20 260 917).
- Gates for the whole pass: `test:types` 0 · `lint` **0 warnings / 0 errors** · `build` ok ·
  `npm test` **173 files / 925 tests passed**.
- No browser-tier run: the tier's own gates (`test:browser` / `test:accept`) were not executed, so
  the two keyboard/focus behaviours (F33, F37) are code-verified with the shared trap pattern, not
  observed in a browser. That limitation is carried in **Verification result**.

## Root cause

Each defect is a small local mistake; the shared theme is a second copy of a rule or a value
(F26/F27/F28/F31/F34) or work done where nothing is observing it (F29/F30/F32).

**F36 — why it is closed as not-a-defect.** The audit was right about the code shape: at
`saveLoad.ts:586-589` the `try` block calls `clearAllFactionWanderStates()`,
`rebuildEntityByIdMap(world)`, `adoptSimSeedFromWorld(world)` and `restoreSimRng(parsed.simRng)` —
three of them process-wide — and the `catch` at `:592` returns `null` without restoring them. But
that only matters if something after them can throw, and nothing can:

- `createViewFromSave` is total. `parseFiniteNumber` / `parseEntityId` / `parseBoolean` /
  `parseCampKey` / `parseBuildRotation` all fall back on any non-conforming value,
  `resolveEntity`/`resolveBuilding` guard `null` and the missing-collection case, and
  `sanitizeCamera` treats a non-object `data.camera` as absent — the audit's own "finite-number
  guards, `Array.isArray` guards, lazy enum set" reading is correct.
- `restoreSimRng` is total: `parseSimRngSnapshot` returns `null` on anything malformed (skipping
  bad entries individually) and the body uses optional chaining; `adoptSimSeedFromWorld` is two
  writes and a `Math` call; `clearAllFactionWanderStates()` is a `Map.clear()`.
- `world.entities` is already iterated at `:472` (`for (const entity of world.entities)`) long
  before `:586`, so a non-iterable entities collection would have thrown *before* the globals were
  touched.

There is therefore no reachable throw between the global mutations and the `return`, so a refused
load cannot leave the live colony on the failed save's seed. The audit marked F36 SUSPECTED and
asked for exactly this check; the check is negative. No code was changed for F36 — the ordering is
recorded here so a future reader who adds a throwing step after `:589` knows what to restore.

## Regression test

- `tests/workshopEconomy.previewUnstaffed.test.ts` — new (F27).
- `tests/venueSchedule.test.ts` — extended with the `'unchanged'` contract (F28).
- The remaining eight fixes are UI wiring or dead-key removal with no pure-logic seam: this tier has
  no DOM (`jsdom`/testing-library are not dependencies), so F26, F29, F30, F31, F32, F33, F34, F35
  and F37 are guarded by the type/lint/build gates and by the reasoning in this report rather than
  by a test. `lint` at **0 warnings** is a real gate here: the `react(set-state-in-effect)` and
  `react(preserve-manual-memoization)` rules rejected the first versions of F32 and F28 and both
  were rewritten until the baseline was clean again.

## Invariants checked

- No simulation roll, cadence, tick-layer or save-shape change: the two new tests and the full
  1047-test suite pass unchanged.
- F30 trims only the persisted ledger, and the trim is provably safe rather than merely small. The
  ledger is not inert: `simDelta.preserveNotificationDismissals` filters every incoming worker
  `notifications` list by it (`simDelta.ts:472-475`), which is what stops a dismissed toast
  reappearing on the next delta. The cap may therefore only drop ids whose notification can no
  longer arrive — and the simulation's own list holds at most 20 entries
  (`simEffects.addNotification` shifts past 20, `simEffects.ts:82`), while every notification lands
  in the ledger once (the 12 s auto-dismiss timer routes through `dismissNotification`), so
  dismissals ≥ notifications created and a 50-entry tail always covers the worker's last 20.
  Dropping the cap below the simulation's 20 would resurrect old toasts; the constant's comment
  records that bound.
- F34 removes a *read* of a key that had no writer, so the parsed view is byte-identical to before
  (`buildGhost` was always `null` after a load).
- F37 clears only session-scoped shell state; `buildPanelOpen` (a persisted preference) and
  `firstNightWarningDismissed` (already gated on the loaded world's tick) are deliberately untouched.

## Save/migration impact

None. No key is added, removed or reinterpreted. A save written before this pass still loads exactly
as it did: `dismissedNotificationIds` is simply capped at 50 entries from the next dismissal onward,
and `buildGhost` was never written in the first place.

## Verification result

A second adversarial pass re-checked every fix against the tree (which a concurrent writer was
still editing) and re-ran the gates on the frozen result.

- `npx tsc -p tsconfig.app.json --noEmit` — passed (exit 0).
- `npm run test:types` — passed (exit 0).
- `npm run lint` — passed, **0 warnings / 0 errors** (the first pass introduced 5 warnings; both
  causes were fixed rather than accepted).
- `npm run build` — passed (exit 0).
- `npm run test:standard` — passed: **208 files / 1047 tests** (+3 skipped) on the final tree.
- `npm run audit:deps:cycles:strict` — passed, 325 modules, no runtime cycle.
- `npm run audit:knip` — **fails, pre-existing and untouched**: 92 unused exports, 12 unused exported
  types, 2 unused dependencies. None of the files this pass changed appears in any of those lists
  (checked name by name; the only mentions of touched files are `isVenueServiceTick`,
  `zoomCameraView` and `followFavoriteEntity`, all long-standing exports this pass never wrote).
  `audit:knip` is not part of `test:all`, so it does not gate this change.
- `npm run graph:calls` — the call-graph ownership coverage the 2026-09-16 pass recorded as 100% was
  down to 2461/2467: three functions from the concurrent keyboard-ownership change
  (`keyboardOwnership.ts`) and three from this pass's new `useModalFocus.ts`. An
  `OWNERSHIP_OVERVIEW.md` row now covers `useModalFocus.ts`, taking coverage to **2464/2467**; the
  remaining three are the other pass's module and are left to its author.
- `npm run test:browser` / `test:accept` — **not run** (the lead owns the browser tier). F33 and
  F37 are the two items where a player-facing confirmation would still add value: open each overlay
  with the keyboard and confirm focus lands inside it and Tab is contained, and load a save on the
  setup screen with tutorials enabled and confirm the overlay and pause do not appear.

## Related commits or files

`src/components/SelectedBuildingPanel.tsx`, `src/components/WorkSchedulePanel.tsx`,
`src/components/VenueSchedulePanel.tsx`, `src/game/venueSchedule.ts`,
`src/components/SimulationDiagnosticsPanel.tsx`, `src/hooks/useTransientGameFeedback.ts`,
`src/hooks/useModalFocus.ts` (new), `src/components/resourceLabels.ts`, `src/game/resourceCost.ts`,
`src/App.tsx`, `src/components/dashboard/GameDashboard.tsx`,
`src/components/CitizenOverviewScreen.tsx`, `src/game/viewState.ts`, `src/game/IntroScreen.tsx`,
`tests/venueSchedule.test.ts`, `tests/workshopEconomy.previewUnstaffed.test.ts`.
Audit: `docs/private/audits/2026-09-16/ui-logic.md` F26–F37.

## Fix

1. **F26** — `'Handmatig'` → `'Manual'`.
2. **F27** — `estimateWorkshopGold(state, building, { previewUnstaffed: workers === 0 })`, the
   unstaffed line now says "(preview with 1 worker — output is 0 until staffed)", and the recipe row
   reads "… → {r.baseGold}g base" so the two bases can no longer be confused.
3. **F28** — `validateVenueSchedule` gained the optional `currentSchedule` third parameter its
   sibling already had (returning `'unchanged'` on a match); both panels pass their current window
   and drive the message and the disabled Apply button from `validation.status`, deleting the
   panels' own duplicate comparison. The `useMemo` wrappers were dropped in favour of deriving each
   render, because the memo keys came from a `WorldState` React cannot track and the React Compiler
   rule rejected them.
4. **F29** — the diagnostics poll returns early when the section is closed and `open` is in its
   dependency array; it now polls only while the section is open (the panel is mounted even when the
   whole inspector is collapsed, so the gate is the section's own state).
5. **F30** — a named `MAX_DISMISSED_NOTIFICATION_IDS = 50` cap, applied as
   `Array.from(dismissed).slice(-MAX_DISMISSED_NOTIFICATION_IDS)` at the single writer.
6. **F31** — the local `resEmoji` map is gone; the visitor-quest card reads
   `RESOURCE_METAS[q.goalResource].emoji`. `components/resourceLabels.ts` no longer declares
   `ResourceKey`; it re-exports the owner's type (`game/resourceTypes.ts`) and
   `game/resourceCost.ts` imports from the game layer, removing the components-layer inversion.
7. **F32** — the slot is tracked as `saveSlotPresent`: read once on mount (lazy initializer, so the
   old `useState(hasSave())` per-render parse is gone as well), refreshed by `storage`/`focus`
   events, and cleared beside `deleteSave()` in `beginNewGameSession`; both render sites use
   `canLoadSavedGame`. The first version synced it in an effect keyed on `hasSavedGame` and was
   rewritten after `react(set-state-in-effect)` flagged it.
8. **F33** — a shared `useModalFocus` hook (focus `[data-autofocus]` on mount, trap Tab in the
   container) is used by both overviews; the dashboard gained
   `role="dialog" aria-modal="true" aria-label="Village overview"` and both overlays mark their
   close button `data-autofocus`. `ShortcutsOverlay`/`GameMenu` keep their inline traps (out of
   scope).
9. **F34** — `parseBuildGhost` and its call are deleted; `createViewFromSave` sets `buildGhost: null`
   with a comment recording that the ghost is live cursor state.
10. **F35** — a `particlesSeededRef` guard seeds the 60 ambient particles once; the aurora re-run
    only rebuilds the canvas context and loop.
11. **F37** — `applyLoadedSession` now clears `selectedBuildingType`, the tutorial overlay and step,
    and the campaign banner flag alongside its world/view swap.
12. **F36** — no change; proven unreachable (Root cause above).
