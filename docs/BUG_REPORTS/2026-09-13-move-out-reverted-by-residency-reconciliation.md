# Bug: moveOutOfFamilyHome is reverted by residency reconciliation

- Bug: A grown child's move-out is undone inside the same command call
- Status: resolved
- Date discovered: 2026-09-13
- Version/build: Wilderfolk 0.6.4.1 working tree
- Reporter: Developer (found while adding the upkeep / agency step to Auto-play)
- Area: Truth | Play
- Owner module: `src/game/buildingResidencyActions.ts` (`moveOutOfFamilyHome`), reconciliation in `src/game/residencyReconciliation.ts`, unit composition in `src/game/residencySelection.ts` / `src/game/householdComposition.ts`
- Cadence: Per command — and therefore every in-game hour when Auto-play proposes it

## Status history

- 2026-09-13 — open: discovered while wiring `moveOutOfFamilyHome` into the Auto-play ladder; the proposed command was accepted by the owner and the world came back unchanged.
- 2026-09-13 — resolved by removing the manual path: the inspector button, the `onMoveOut` prop, the `moveOutOfFamilyHome` worker command, and the `buildingResidencyActions.moveOutOfFamilyHome` owner (with its `buildingActions.ts` / `gameEngine.ts` re-exports) were deleted. Housing is fully automatic, so the residency owner keeps the behaviour: `assignMissingResidences` already runs `rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable` for an adult child whenever an empty house is free, so a grown child moves out on their own and no manual surface competes with the reconciler. The reconciler itself was not changed; the root cause below is kept as history of the failed manual path.

## Observed behavior

`moveOutOfFamilyHome(humanId)` finds a legal adult child and an empty house, moves the
household, and then returns a state in which the child is living with their parent again.
The command reports success (no failure floater) and has no lasting effect.

Measured with the `tests/virtualPlayer.test.ts` fixture shape (mother #1 and adult child #2
in house 1, empty house 3, the leader in the manor):

```
PROBE tryMoveOut true childResidence 3
PROBE after assignMissingResidences child 1 mother 1
PROBE decision {"proto":1,"op":"moveOutOfFamilyHome","humanId":2}
PROBE residences 1:1,2:1,9:90
PROBE occupants 90(leaderHouse):9 | 1(house):1/2 | 3(house):
```

`tryMoveOutOfFamilyHome` really moves the child into house 3; the `assignMissingResidences`
call that `moveOutOfFamilyHome` runs immediately afterwards moves them back into house 1.

## Expected behavior

A move-out the owner accepts should persist: the grown child (and their own household) stay
in the empty house, and the parent's household keeps the family home.

## Reproduction steps

1. Create a colony with an adult child (18+) living in the same completed residence as a
   living parent, and a second completed residence standing empty.
2. Dispatch `{ proto: 1, op: 'moveOutOfFamilyHome', humanId: <child> }` through
   `applyWorkerCommand`.
3. Observe that `child.residenceBuildingId` is unchanged after the call.

## Evidence

- `residencySelection.tryMoveOutOfFamilyHome` sets `residenceBuildingId` on the household and
  returns `true` (probe line 1), so the failure is not in target selection.
- `residencyReconciliation.assignMissingResidences` ends with a convergence loop that calls
  `housingUnitNeedsReassignment(unit, …)` per housing unit and re-homes any unit that fails
  `isFamilyHousingValid` (probe line 2).
- `residencySelection.buildHousingUnits` → `householdComposition.collectOwnHousehold(seed, …)`
  adds **every** id in `seed.childrenIds`, minors and adults alike, to the parent's unit, and
  `assignMissingResidences` rebuilds those links from `motherId`/`fatherId`
  (`rebuildChildrenIds`) before the loop — so the parent's unit always contains the adult child.
- `rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable` does not rescue the move: it runs
  before the convergence loop and only considers humans who are *currently* `isAdultChildAtHome`
  (sharing a residence with a parent), which the child no longer is.

## Root cause

Housing units are composed from `childrenIds` without an age filter, while both the automatic
move-out rebalancer and the player-facing move-out treat an adult child as a separate unit.
The split unit therefore fails `isFamilyHousingValid` on the next reconciliation pass and is
merged back, so a move-out cannot survive the command that performed it.

## Regression test

None yet — the fix belongs in the residency owner and is out of scope for the Auto-play pass
that found it. A regression test should assert that after `moveOutOfFamilyHome`, the child's
`residenceBuildingId` is the empty house and stays there through one
`assignMissingResidences` pass.

## Invariants checked

- `tryMoveOutOfFamilyHome` and `canMoveOutOfFamilyHome` are unchanged; the defect is in what
  happens after them.
- No save field is written by the failed move (the child's residence is simply re-set), so
  there is no save corruption — only a command that does nothing.

## Save/migration impact

None.

## Verification result

Measured, not assumed: reproduction is the probe above, run against the 0.6.4.1 working tree.
Auto-play deliberately does not propose a move-out until this is fixed.

## Related commits or files

- `src/game/buildingResidencyActions.ts` (`moveOutOfFamilyHome`)
- `src/game/residencyReconciliation.ts` (`assignMissingResidences`)
- `src/game/residencySelection.ts` (`buildHousingUnits`, `housingUnitNeedsReassignment`, `tryMoveOutOfFamilyHome`)
- `src/game/householdComposition.ts` (`collectOwnHousehold`)
- `src/game/virtualPlayer.ts` (`decideUpkeep` — the step that found it and omits it)

## Fix

Not made in this pass (out of scope). Candidate directions: exclude non-minor children from the
parent's housing unit in `buildHousingUnits`/`collectOwnHousehold`, or have the convergence loop
treat `isAdultChildAtHome` members as their own unit, then re-run the move-out and its regression
test.

**Resolution (2026-09-13, separate pass).** None of the candidate directions was taken: the manual
path was deleted instead, because housing is fully automatic and the reconciler is the owner of
this behaviour. `residencyReconciliation.assignMissingResidences` runs every day from
`tickLayerAssign.ts` and `dailyPopulation.ts` and already rebalances an adult child into a free
house of their own (`rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable`), so the manual
command was a second, conflicting path that the same call's reconciliation undid inside the
command and could never stick. The new owner of the move-out is therefore the automatic rebalance
— nothing else was added. `residencySelection.canMoveOutOfFamilyHome` and `tryMoveOutOfFamilyHome`
are unchanged and `dayCycle.ts` keeps its compatibility re-exports; no save field was touched, so
there is no migration. Auto-play still proposes nothing here, and its `decideUpkeep` doc now
records that housing is automatic rather than citing the deleted command.
