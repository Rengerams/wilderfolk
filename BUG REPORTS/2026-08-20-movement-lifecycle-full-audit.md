# Full audit: movement and lifecycle on connected C:\wilderfolk

- **Status:** fixed pending live play verification
- **Date:** 2026-08-20
- **Version/build:** Wilderfolk 0.6.1.1
- **Area:** Play | Truth | performance

## Scope

Audited the connected project’s human movement, pathfinding, commute routing, Moon Howler proximity lookup, pregnancy progress, birth creation, same-tick entity bookkeeping, invariant checks, and static validation.

## Confirmed movement defect

The project contained two movement modules:

- `src/game/humanMovement.ts`
- `src/game/simulation/humanMovement.ts`

Runtime `humanTick.ts` imports the `simulation/` copy. That copy was stale: it did not export the tested `commutePathCacheKey` helper and still used rounded pixel coordinates in the path-cache key. The root-level copy contained the newer tile-stable implementation, so the files had drifted.

This caused `tests/humanMovement.test.ts` to fail with `TypeError: commutePathCacheKey is not a function` and meant the live runtime retained excessive path-cache churn.

### Repair

The runtime owner now exports `commutePathCacheKey` and uses terrain-tile coordinates through `Math.floor(position / TERRAIN_TILE_SIZE)`. The repair does not change movement speed, cadence, pathfinding rules, or save data.

The governed defect report is `BUG REPORTS/2026-08-20-connected-movement-module-drift.md`.

## Confirmed dialogue API defect exposed during full validation

The connected project’s ambient social selector used `isDialogueBusy`, but the connected `humanChat.ts` snapshot did not export that predicate. This caused six full-suite failures with `TypeError: isDialogueBusy is not a function` during realtime ambient-chat queries.

### Repair

Added the authoritative read-only `isDialogueBusy` predicate to `src/game/humanChat.ts`, treating either active `chatTicks` or an active `chatDialogueSessionKey` as busy. The governed report is `BUG REPORTS/2026-08-20-dialogue-busy-predicate-missing.md`.

## Lifecycle findings

`src/game/simulation/humanLifecycle.ts` remains the single birth owner. It increments only existing pregnancy progress, creates a child only at the due threshold, clears pregnancy state at birth, applies the reproduction cooldown, records a separate completed-birth diagnostic, and routes the newborn through `pushNewEntity` and `rebuildChildrenIds`. No duplicate birth implementation or second pregnancy-progress owner was found in the audited runtime path.

The lifecycle owner still depends on its caller to gate `entity.pregnant` and pregnancy cadence. That boundary is documented in the module and should remain covered by an explicit pregnancy-progress test; the audit found no confirmed defect in the current caller path.

## Validation

| Check | Result |
|---|---:|
| Movement tests | 3/3 passed |
| Pathfinding tests | 5/5 passed |
| Simulation invariant tests | 29/29 passed |
| Full Vitest suite | 51 files / 334 tests passed |
| TypeScript | Passed |
| ESLint | Passed |
| Static `npm run audit` | Failed on existing broad dead-code findings; no movement/lifecycle-specific failure was isolated |

## Remaining risks

The duplicate root-level `src/game/humanMovement.ts` remains in the connected tree. It is not the runtime owner and should either be removed or converted into an explicit compatibility re-export after checking all imports. Leaving two implementations increases future regression risk.

The lifecycle file has no dedicated focused birth test in the connected test list; current lifecycle confidence comes from invariant and relationship-diagnostics tests. A future objective should add direct tests for term completion, stillbirth, Wildkin birth, bastard lineage, same-tick child indexing, and pregnancy-state clearing.

Live play verification remains necessary for commute responsiveness, path reuse, hospital routing, and visible birth events.

## Save/migration impact

None for the repaired movement cache key or dialogue predicate. No persistent lifecycle fields were changed.
