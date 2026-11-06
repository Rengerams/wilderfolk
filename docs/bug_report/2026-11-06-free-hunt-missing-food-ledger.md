# Free-roaming hunting food is missing from the food-flow ledger

- Bug: `tickHumanHunting` added free-hunt food with `addResource` but never called `recordFoodProduced`, so the daily ledger and recent food-flow calculations under-reported hunting.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding)
- Area: Human hunting / economy ledger
- Owner module: `humanHuntingBehavior.ts` (`tickHumanHunting`); ledger in `economyLedger.ts`
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review found the missing ledger write.
- 2026-11-06 — resolved: the actual accepted amount is recorded against `hunting`.

## Observed behavior
Hunting Spot production recorded its accepted food amount, but a successful free-roam kill only called `addResource(state, 'food', foodGain)`. The ledger's `produced.hunting` stayed at zero for that kill.

## Expected behavior
All food that actually enters storage is attributed to its source, including free-roaming hunting. A capped/refused amount must not be recorded.

## Reproduction steps
1. Put an adult hunter near a deer with low stamina or an empty colony larder.
2. Let `tickHumanHunting` kill the prey.
3. Compare `state.resources.food` with `state.economyLedger.produced.hunting`.

## Evidence
Before the fix the kill branch called `addResource` and immediately continued to floating text. `addCappedResource` returns the accepted amount, while `recordFoodProduced` is the ledger owner.

## Root cause
The free-hunt path was written before the ledger integration and was not updated with Hunting Spot production.

## Fix / proposed fix
Capture the return of `addResource` and pass it to `recordFoodProduced(state, 'hunting', added)`.

## Save/migration impact
None.

## Verification result
PASS: new `tests/humanHunting.ledger.test.ts`; `npm run test:types`, `npm run lint`, targeted suites and build.
