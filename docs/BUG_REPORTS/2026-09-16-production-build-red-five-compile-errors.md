# Production build red — five compile errors and two masked `any` casts in the working tree

- **Bug:** `npm run build` could not complete: five TypeScript errors in `src/game`, plus two `as any` casts that had reappeared in `saveLoad.ts`
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous build-repair pass (working-tree build gate)
- **Area:** Truth (build); the five defects are one damaged-revision event, recorded together because they share one root cause and one repair
- **Owner module:** `src/game/frontierCombat.ts`, `src/game/gameLoop.ts`, `src/game/simRng.ts`, `src/game/moonHowler.ts`, `src/game/worldGen.ts`, `src/game/saveLoad.ts`

## Status history

- 2026-09-16 — open (found by running the repository's own `npm run build`; the first error surfaced only when the build output was read without a swallowing pipe)
- 2026-09-16 — resolved (all five errors and both lint warnings removed at their owning files; `npm run build`, `npm run test:types`, `npm run lint` and `npm test` all pass)

## Observed behavior

`npm run build` (`tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.node.json --noEmit && vite build`) exited 1 with:

```text
src/game/frontierCombat.ts(1335,1): error TS1005: '}' expected.
src/game/gameLoop.ts(11,73): error TS1261: Already included file name '.../simWorker/gameWorkerHost.ts' differs from file name '.../simWorker/GameWorkerHost.ts' only in casing.
src/game/moonHowler.ts(325,5): error TS2561: Object literal may only specify known properties, but 'pregnancyDueProgress' does not exist in type '{ ... }'. Did you mean to write 'pregnancyProgress'?
src/game/moonHowler.ts(388,38): error TS2551: Property 'pregnancyDueProgress' does not exist on type '{ ... }'.
src/game/simRng.ts(1,15): error TS6196: 'WorldState' is declared but never used.
src/game/worldGen.ts(481,7): error TS2561: Object literal may only specify known properties, but 'pregnancyDueProgress' does not exist in type 'CreateEntityOptions'.
```

`npm run lint` additionally reported 2 warnings / 0 errors on `src/game/saveLoad.ts:168` and `:176` (`typescript(no-explicit-any)` on `(generateWorldMap as any)(...)`), against the documented 0-warning baseline.

## Expected behavior

The repository's documented gates are green: `npm run build` exits 0, `npm run test:types` exits 0, and Oxlint reports **0 warnings / 0 errors** (`.oxlintrc.json` enables `typescript/no-explicit-any` as a warning, and no other site in the 321-file lint scope uses `any`).

## Reproduction steps

1. `npm run build` (from the repository root) — exits 1 and prints the five errors above.
2. `npm run lint` — prints the two `no-explicit-any` warnings in `saveLoad.ts`.

## Evidence

Per defect, with the untouched side identified:

1. `frontierCombat.ts` ended at line 1334 with `return state;`, missing the closing brace of `export function launchRaidOnRival(...)` (declared line 1252); TS reported `'}' expected` at EOF (1335,1). Every other function in the file ends with `return state;` + `}`.
2. The file on disk is `src/game/simWorker/GameWorkerHost.ts` (class `GameWorkerHost`), and every pre-existing reference — `BUG_TRACKER.md`, the audit reports, `docs/` — spells it that way; only the import specifier in `gameLoop.ts:11` used `./simWorker/gameWorkerHost`. On a case-insensitive filesystem the module still resolves, which is why TS1261 (not a "module not found") is the symptom.
3. `Entity['moonHowlerSaved']` (`gameTypes.ts:291-316`) and `CreateEntityOptions` (`entityFactory.ts:21-41`) do not declare `pregnancyDueProgress`; both files carry a 2026-09-14 timestamp, while `moonHowler.ts` (2026-09-16 12:57) and `worldGen.ts` (2026-09-16 13:56) carry the damaged revision. `MoonHowlerSavedState` (`moonHowler.ts:161-189`) picks `pregnancyDueProgress` from `Entity`, so only the snapshot *literal* was inconsistent with its own type.
4. The production bundle built from the last green revision (`dist/assets/gameWorker-*.js`, built 2026-09-15 09:26) was measured before the repair rebuild replaced it: `transformToWerewolfForm` wrote `moonHowlerSaved` without `pregnancyDueProgress` and `revertToHumanForm` restored without it; `createEntity` always derived the due date itself (`pregnancyDueProgress=Math.round(no*(.85+Yg()*.3))`) and read no option; and the bundle contained exactly four `.85+` due-date formula sites (the entityFactory constructor plus the three `humanRelationships` conception owners) — no `worldGen` site. The damaged revision added references without the declaring side.
5. `saveLoad.ts:168,176` cast `generateWorldMap` to `any` although both calls match the function's declared overloads (`terrainGen.ts:304-306`): `(width: number, height: number, seed?: number, size?: MapSize, preset?: MapPreset)` and `(size: MapSize, preset?: MapPreset, seed?: number)`, with `WorldMap.width/height/seed/size/preset` typed exactly as those parameters require (`gameTypes.ts:995-1003`).

## Root cause

A damaged working-tree revision of six files in `src/game` (written 2026-09-16 12:28–13:56) introduced references that its own type declarations do not declare, dropped the last line of `frontierCombat.ts`, changed one import specifier's casing, left a stale type import in `simRng.ts`, and reintroduced two `as any` casts. The declaring files (`gameTypes.ts`, `entityFactory.ts`, `terrainGen.ts`) were untouched, so the repair belongs on the referencing side: the moon howler snapshot and the world-gen immigrant option are the additions, not the type fields.

## Regression test

No new test file: `tsc -p tsconfig.app.json --noEmit` is the regression guard for the five compile errors (it fails loudly on each), and Oxlint's `no-explicit-any` guards the casts. This matches the existing `BUG_REPORTS/2026-09-08-post-refactor-typescript-build-breakage.md` precedent, which also relied on the typecheck as its regression protection. The two defects this event *masked* behind compile errors — a wrong diplomacy block reason and an unharmed herd growing the remembered size — have the pinned tests named in their own reports.

## Invariants checked

- `tests/simulation.invariants.test.ts` (30 tests) — the §5 pregnancy invariant still holds for every constructor spawn path, because `entityFactory.createEntity` continues to guarantee a finite, positive `pregnancyDueProgress` for `opts.pregnant` females.
- `npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with exit 0 and its invariant assertions satisfied.

## Save/migration impact

None. No save field, key, format or migration changed; the repaired files only removed references to fields that were never persisted, and the load path's `migrateTickTimeline` / `WORLD_STATE_SAVE_KEYS` handling is untouched.

## Verification result

- `npm run build` — passed (tsc app + tsc node + `vite build`, 1101 modules, exit 0).
- `npm run test:types` — passed (exit 0).
- `npm run lint` — passed, **0 warnings / 0 errors on 321 files**.
- `npm test` — passed: `check:source`, `dup` and vitest, **143 files / 796 tests, 0 failures**.
- `npm run test:full-year` — passed (exit 0, 360 days / 25,920 ticks).

## Related commits or files

- `src/game/frontierCombat.ts` — restored the closing brace of `launchRaidOnRival`
- `src/game/gameLoop.ts` — import specifier casing restored to `./simWorker/GameWorkerHost`
- `src/game/simRng.ts` — removed the unused type import
- `src/game/moonHowler.ts` — removed the snapshot write/restore of `pregnancyDueProgress`
- `src/game/worldGen.ts` — removed the `pregnancyDueProgress` option and its now-unused `PREGNANCY_TICKS` import
- `src/game/saveLoad.ts` — removed the two `as any` casts

## Fix

The brace was restored; the import specifier was corrected to the real filename; the unused import was deleted; and the two `pregnancyDueProgress` references were removed on the referencing side, so the moon howler snapshot keeps the behaviour the simulation audit records as an unresolved design question (`BUG_REPORTS/2026-09-13-simulation-logic-audit.md`, "UNRESOLVED / NEEDS A DESIGN DECISION" item 2: a cursed pregnant settler returns pregnant with no due date and the `humanLifecycle` fallback covers it), and `worldGen.createImmigrantSettler` again relies on the constructor guarantee that report 2026-08-20 established. The two `as any` casts were deleted, restoring the documented 0-warning lint baseline.
