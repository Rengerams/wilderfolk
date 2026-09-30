# Bug: Generated JavaScript in `src/` shadows authoritative TypeScript modules

- **Status:** resolved 
- **Date discovered:** 2026-08-23
- **Version/build:** v0.6.3 development working tree
- **Reporter:** F2 Festival-policy validation
- **Area:** Truth | Tooling | Test integrity
- **Owner module:** TypeScript source tree and test/build resolution boundary
- **Cadence:** Development-time module resolution

## Status history

- **2026-08-23 — open:** F2 source edits were correct in a direct `tsx` runtime probe, but Vitest continued to execute old Festival behavior.
- **2026-08-23 — investigating:** Inventory found 129 untracked generated `.js` files under `src/`, each beside a same-named `.ts` file. Vitest resolves these stale JavaScript siblings before the intended TypeScript modules.
- **2026-08-23 — resolved with focused validation:** Removed all 129 untracked shadow artifacts after confirming none were tracked. Added a source-integrity guard to the standard test commands; F1 and F2 regressions then executed the current TypeScript behavior successfully.
- **2026-08-24 — open (recurrence):** `npm run build` / `npx tsc -b` regenerated the same shadow artifacts: 136 `.js` files under `src/` and generated `.js` files under `scripts/`. The game worker then loaded `src/game/simWorker/commands.js` instead of `commands.ts`, so player commands were not recognized by the worker.
- **2026-08-24 — investigating:** `tsconfig.node.json` had no `noEmit` and included `scripts/**/*`. Scripts import from `../src/game/...`, so TypeScript pulled the imported `src` modules into the program and emitted `.js` output beside the `.ts` sources.
- **2026-08-24 — resolved:** Added `"noEmit": true` to `tsconfig.node.json`; removed all generated shadow artifacts from `src/` and `scripts/`; extended the source-integrity guard to scan `scripts/` and to catch `.mjs`/`.mts` pairs. Verified `npx tsc -b` and `npm run build` no longer emit into source directories, and the full suite passes.
- **2026-08-25 — verified after checkout:** the working tree had lost `scripts/check-source-shadow-files.mjs` and the `check:source-integrity` script entry (a later `git checkout` removed uncommitted work). Re-added the guard, wired `check:source-integrity` and `test` in `package.json`; guard passes with 0 shadow files.

## Observed behavior

A TypeScript source edit can be present on disk and execute correctly through a direct TypeScript runtime probe, while Vitest imports an older generated JavaScript sibling instead. Focused F2 tests therefore asserted pre-edit behavior even after cache clear and caching-disabled retries.

## Expected behavior

The source tree must contain one authoritative implementation per module path. Tests and development builds must resolve the current TypeScript module, not stale generated JavaScript emitted into `src/`.

## Reproduction steps

1. Place a generated `src/game/dayCycle.js` beside `src/game/dayCycle.ts`.
2. Change `isOnInnkeeperShift()` in the TypeScript file.
3. Execute a direct TypeScript runtime probe and confirm it sees the change.
4. Execute the relative-import Vitest regression and observe it imports the stale JavaScript behavior instead.

## Evidence

- 129 untracked `.js` files under `src/` have same-named `.ts` siblings.
- The artifacts were written in two adjacent batches on 2026-08-22 at 23:34 and 23:35.
- `src/game/dayCycle.js`, `groupEvents.js`, and `humanTick.js` contained the pre-F2 code path.
- No `src/**/*.js` files are tracked by Git.
- A direct `tsx` probe of `src/game/dayCycle.ts` returned the corrected result while Vitest returned the stale generated result.

## Root cause

The emitter is `tsconfig.node.json`. It had no `"noEmit": true` and included `scripts/**/*`. Scripts import from `../src/game/...`, so TypeScript pulled those imported `src` modules into the program and emitted `.js` output beside the `.ts` sources (and `.js` beside the `.ts` scripts). Every `tsc -b` / `npm run build` therefore regenerated the shadow artifacts. Vite/Vitest module resolution then selected the `.js` siblings for extensionless relative imports before the intended `.ts` modules — including `src/game/simWorker/commands.js`, which made the game worker fail to recognize player commands.

## Fix

1. Added `"noEmit": true` to `tsconfig.node.json` so `tsc -b` can no longer emit JavaScript beside TypeScript sources.
2. Removed all generated shadow artifacts from `src/` and `scripts/` (the 136 `src/**/*.js` files plus generated `scripts/*.js` / `.mjs` files that had `.ts` / `.mts` siblings).
3. Extended `scripts/check-source-shadow-files.mjs` to scan both `src/` and `scripts/` and to catch `.js`/`.ts` and `.mjs`/`.mts` pairs, so the guard fails visibly if the problem ever recurs.
4. Confirmed `npx tsc -b` and `npm run build` no longer write JavaScript into source directories.

## Regression test

1. `npm run check:source-integrity` reports zero shadow pairs under `src/` and `scripts/`.
2. Run `npx tsc -b` and `npm run build`, then re-run `npm run check:source-integrity` — still zero shadow pairs (the emitter no longer regenerates artifacts).
3. Focused worker round-trip tests pass: `tests/gameWorker.transport.test.ts`, `tests/workerCommand.roundtrip.test.ts`, `tests/gameLoop.commandDispatch.test.ts` — **3 files / 20 tests**.
4. Full Vitest suite passes: **88 files / 496 tests**.
5. TypeScript check passes: `npm run test:types`.

## Invariants checked

- A source module path has one authoritative implementation in `src/`.
- Tests execute the current TypeScript behavior.
- No generated output is committed or silently ignored in the source tree.

## Save/migration impact

None. This is a development-time source-resolution repair; no simulation or save fields change.

## Verification result

Verified on 2026-08-24: `npm run check:source-integrity` passes, `npx tsc -b` and `npm run build` no longer emit shadow artifacts, `npm run test:types` passes, focused worker tests pass (**3 files / 20 tests**), and the full Vitest suite passes (**88 files / 496 tests**).

## Change Record

- **Decision changed:** None. This repair restores one authoritative source implementation per module path.
- **Cadence:** Development-time module resolution and validation only.
- **State/save impact:** None.
- **Performance impact:** A bounded filesystem walk before test commands; no runtime-game cost.
- **Rollback plan:** Remove the guard and restore stale generated files only to reproduce the invalid prior resolution behavior; no game-data rollback is needed.

## Related files

- `src/**/*.js` paired with `src/**/*.ts`
- `scripts/**/*.js` / `.mjs` paired with `scripts/**/*.ts` / `.mts`
- `tsconfig.node.json` (missing `noEmit` was the emitter root cause)
- `scripts/check-source-shadow-files.mjs`
- `vitest.config.ts`
- `package.json`
- `tests/dayCycle.tavern.test.ts`
- `tests/festival.behavior.test.ts`
- `tests/gameWorker.transport.test.ts`

## Unique ID

`2026-08-23-stale-javascript-shadows-typescript`
