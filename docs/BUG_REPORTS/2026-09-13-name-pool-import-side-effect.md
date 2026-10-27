# Bug: Name pool marked `full` on import, racing the boot-fallback contract

- Bug: `nameLoader` starts a full load as a module import side effect
- Status: resolved
- Date discovered: 2026-09-13
- Version/build: Wilderfolk 0.6.4.1 working tree
- Reporter: found while verifying the Auto-play task (`tests/nameLoader.poolUpgrade.test.ts` red)
- Area: Truth | performance
- Owner module: `src/game/nameLoader.ts`
- Cadence: module import (no tick coupling)

## Status history

- 2026-09-13 — open: `expect(before.full).toBe(false)` failed — the census pool was already loaded before the test body ran.
- 2026-09-13 — resolved: the import-time kick is gone; every real entry point already awaits `loadNames()`.

## Observed behavior

`tests/nameLoader.poolUpgrade.test.ts` fails with:

```text
AssertionError: expected true to be false   // getNamePoolInfo().full
```

The result depended on how quickly a background disk read resolved, so the
"boot fallback is in place" state was not observable at a defined point — the
same file could pass or fail on timing.

## Expected behavior

`ensureNamesLoaded()` installs the embedded fallback and the pool only becomes
`full` when `loadNames()` completes — the contract the test asserts and the
function's doc comment states ("Sync fallback pool — used until `loadNames()`
finishes or if disk read fails").

## Reproduction steps

1. `node node_modules/vitest/vitest.mjs run tests/nameLoader.poolUpgrade.test.ts`.

## Root cause

The working tree added a module-level side effect at the end of the loader:

```ts
// Automatically start background loading on module import
loadNames().catch(() => {});
```

Importing anything that reaches `nameLoader` therefore began an async disk read.
In Node the read resolved before the first test body, so `poolSource` was already
`'full'`; in a browser the same call competes with the boot sequence.

## Fix

Removed the import-time call. Both real entry points already load names
explicitly and await them:

- `App.tsx` boot: `Promise.all([preloadAllSprites(), loadNames(), …])`, plus
  `if (!areNamesLoaded()) await loadNames();` before `initGame`;
- `simWorker/gameWorker.ts`: `loadNames()` on worker start.

So no path depended on the import-time kick, while importing the module for any
other reason no longer triggers a file/network read.

## Regression test

`tests/nameLoader.poolUpgrade.test.ts` (2 cases, unchanged): boot fallback is not
`full` and ≤20 male names, then `await loadNames()` makes it full (>20) and the
one-time upgrade still rewrites boot and legacy defaults.

## Save/migration impact

None — name pools are runtime state and are not persisted.

## Verification result

The file's 2 tests pass, and the full local suite passes with `tsc -b` 0 and
`oxlint --type-aware --type-check` 0 warnings / 0 errors.

## Related commits or files

- `src/game/nameLoader.ts`
- `src/App.tsx`, `src/game/simWorker/gameWorker.ts` (the awaited callers)
- `tests/nameLoader.poolUpgrade.test.ts`
