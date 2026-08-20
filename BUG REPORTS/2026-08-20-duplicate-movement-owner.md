# Bug: Duplicate human-movement implementations can drift

- Status: verified
- Date discovered: 2026-08-20
- Version/build: Wilderfolk 0.6.1.1
- Reporter: Full-codebase audit using `wilderfolk-simulation-audit`
- Area: Truth | performance
- Owner module: `src/game/simulation/humanMovement.ts`
- Cadence: realtime

## Status history

- 2026-08-20 — open (static audit found two movement implementations with only one runtime owner)
- 2026-08-20 — verified (root module converted to compatibility re-export; 51 files / 335 tests, TypeScript, and lint passed)

## Observed behavior

The connected project contains both `src/game/humanMovement.ts` and `src/game/simulation/humanMovement.ts`. The runtime `humanTick.ts` and movement tests use the `simulation/` module, while the root module contains a parallel implementation with the same commute, snapping, path-cache, and Moon Howler helpers. The static audit reports the root file as unused.

## Expected behavior

Human movement must have one authoritative implementation. Any compatibility import should resolve to that implementation rather than maintain a second copy.

## Reproduction steps

1. Search `src` and `tests` for `humanMovement` imports.
2. Observe runtime and tests import `src/game/simulation/humanMovement.ts`.
3. Compare both files and observe duplicate exported movement helpers.
4. Run `npm run audit:knip` and observe `src/game/humanMovement.ts` under unused files.

## Evidence

- `src/game/humanTick.ts` imports `./simulation/humanMovement`.
- `tests/humanMovement.test.ts` imports `../src/game/simulation/humanMovement`.
- `src/game/humanMovement.ts` has no executable imports in `src` or `tests`.
- `npm run audit:knip` reports `src/game/humanMovement.ts` as unused.

## Root cause

A prior module extraction left the original root-level file in place while the runtime owner moved under `src/game/simulation/`. The duplicate implementation was not removed or converted into a re-export.

## Fix

After confirming all imports, replace the root-level implementation with an explicit compatibility re-export from `./simulation/humanMovement`. This preserves any external import path while ensuring one implementation.

## Regression test

Keep the runtime movement tests importing the authoritative simulation owner and add a compatibility-import test that verifies the root module exports the same helper behavior.

## Invariants checked

- Movement remains owned by `tickLayerRealtime.ts` and its helper.
- No movement speed or cadence changes.
- Path cache remains tile-stable.
- No second simulation mutation path is introduced.

## Save/migration impact

None.

## Verification result

Verified. The root module is now a compatibility re-export. Focused movement/pathfinding/invariant tests passed 38/38; the full suite passed 51 files / 335 tests; TypeScript and lint passed. The post-fix static audit no longer reports `src/game/humanMovement.ts` as unused; it reports the separate legacy `src/game/simulation/simInvariants.ts` duplicate for Objective A follow-up.

## Related commits or files

- `src/game/humanMovement.ts`
- `src/game/simulation/humanMovement.ts`
- `src/game/humanTick.ts`
- `tests/humanMovement.test.ts`
- `docs/OBJECTIVE_PLAN_FULL_AUDIT_2026-08-20.md`
