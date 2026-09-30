# Bug: Hunting Spot kills bypass shared wildlife cleanup

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: Hunting logic audit
- Area: Truth | ecology | performance
- Owner module: `src/game/tickLayerDaily.ts` Hunting Spot production transition
- Cadence: Daily production tick

## Observed behavior

A successful staffed Hunting Spot directly sets `targetPrey.alive = false`, deletes the prey from `entityById`, and linearly scans every indexed entity to clear `huntTargetId`. It does not use the shared wildlife death transition.

## Expected behavior

Every deer, rabbit, or wolf removed by a Hunting Spot must use the same authoritative cleanup as other wildlife deaths: remove the prey from the current tick’s entity/type indexes, clear stale spatial-grid entries, and clear hunters through the existing prey-to-hunters index. Population snapshots remain start-of-tick snapshots and are refreshed by their existing owner.

## Reproduction steps

1. Staff a Hunting Spot with reachable wild prey.
2. Advance to its daily production tick until a shot succeeds.
3. Inspect the daily code path: the prey is manually marked dead instead of passing through `markWildlifeDead()` and `clearHuntersTargetingPrey()`.

## Evidence

`tickLayerDaily.ts` lines 406–412 manually write prey death state and perform an O(entity-count) hunt-target cleanup. `simulationEntities.ts` owns `markWildlifeDead()` for entity/type indexes, `syncEntityGrids()` removes stale spatial entries, and `clearHuntersTargetingPrey()` uses the tick-local reverse index when available.

## Root cause

The Hunting Spot implementation predates the shared `TickContext` entity-death and hunt-target index helpers, leaving a duplicate partial cleanup path in the daily layer.

## Fix

A successful Hunting Spot kill now calls `markWildlifeDead()`, `clearHuntersTargetingPrey()`, and `syncEntityGrids()` after banked-food success. Prey selection, success probability, yield calculation, and event/visual output are unchanged.

## Regression test

`tests/huntingSpot.cleanup.test.ts` forces a successful daily deer hunt through `gameTick()` and verifies that the shared wildlife-death and prey-to-hunter cleanup transitions are invoked and the hunter’s target is cleared.

## Invariants checked

- Wildlife death must have one cleanup transition.
- Living entity indexes and spatial queries must not retain a killed prey.
- Hunt target references must not retain a killed prey.
- Hunting Spot economy/yield behavior must remain unchanged.

## Save/migration impact

None expected; no persistent schema changes are required.

## Simulation Change Record

- Owner module: `src/game/tickLayerDaily.ts` Hunting Spot production transition, delegating to the existing `simulationEntities.ts` cleanup owner.
- Decision changed: a successful staffed Hunting Spot kill now uses the shared wildlife-death, hunter-target-clear, and spatial-index synchronization transitions.
- Cadence: Daily production tick; no cadence change.
- State fields written: prey `alive` and `energy`, tick-local entity/type indexes, hunter `huntTargetId`, and spatial-grid membership, through existing helpers.
- Why the change is needed: the old local path duplicated only part of the authoritative wildlife cleanup.
- Player-visible behavior before/after: prey selection, chance, yield, floating text, event log, and hunt-arrow behavior are unchanged; internal cleanup is now consistent with other wildlife deaths.
- Performance impact: replaces a daily full indexed-entity scan for target cleanup with the existing reverse target index when available.
- New or updated tests: `tests/huntingSpot.cleanup.test.ts`.
- Invariants checked: one wildlife-death transition; no stale prey target; no stale spatial entry.
- Save/migration impact: none.
- Rollback plan: restore the prior direct daily cleanup only if the shared transition proves incompatible; retain the regression as a failing reproducer until a compliant replacement exists.
- Acknowledgment: I have read the simulation authority, identified the owner and cadence, preserved the authoritative worker-state boundary, and introduced no second mutation path.

## Verification result

Focused Hunting Spot and Hunt Visual regressions passed (3 tests). TypeScript validation, focused linting, the full suite (54 files / 344 tests), and the production build all passed on 2026-08-21. The existing circular-chunk and large-bundle build warnings remain unrelated.

## Related files

- `src/game/tickLayerDaily.ts`
- `src/game/simulation/simulationEntities.ts`
- `src/game/simulation/simulationTypes.ts`
- `tests/huntingSpot.cleanup.test.ts`
