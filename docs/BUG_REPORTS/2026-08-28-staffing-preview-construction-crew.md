# Name of file: 2026-08-28

- Bug: Staffing previews offered active construction crew members as job candidates
- Status: resolved
- Date discovered: 2026-08-28
- Version/build: 0.6.4 development
- Reporter: Manus AI
- Area: Play | Truth
- Owner module: `buildingStaffingActions.ts` / workforce assignment transitions
- Cadence: player-command

## Status history

- 2026-08-28 — open (discovered while mapping the serial `buildingActions.ts` staffing extraction).
- 2026-08-28 — investigating (the prospective-worker query and assignment eligibility checks were compared).
- 2026-08-28 — resolved (one shared normal-job eligibility predicate now governs assignment, previews, and availability; focused and full automated validation passed).

## Observed behavior

`listAssignableWorkersForBuilding()` and the completed-job branch of `canAssignWorkerToBuilding()` could consider a player settler already assigned to an unfinished construction crew as available for a normal job. The later assignment transition correctly rejected that same settler, so the UI could show an available candidate or enabled action that failed when selected.

## Expected behavior

Every staffing preview, enabled-state query, and assignment action must use the same eligibility criteria. An active construction-crew member is unavailable for a normal job until released from the unfinished building.

## Reproduction steps

1. Assign an otherwise idle adult player settler to an unfinished building's construction crew.
2. Select a completed job building with an open worker slot.
3. Inspect assignable workers or attempt to choose the builder for the job.

## Evidence

The inline normal-job assignment predicate excluded `isOnConstructionCrew(...)`, while `listAssignableWorkersForBuilding()` and `canAssignWorkerToBuilding()` did not. Existing staffing tests passed before the extraction because this cross-path disagreement had no dedicated regression.

## Root cause

Three independently maintained eligibility predicates had drifted: the assignment action checked construction-crew membership, but the candidate-list and availability-preview paths did not.

## Regression test

`tests/buildingStaffingActions.test.ts` constructs an active construction-crew member and an open completed job building, then verifies the member is absent from the candidate list and does not make the normal-job action available.

## Invariants checked

- A living human appears in at most one building `occupants` list.
- A building occupant has `homeBuildingId` equal to that building only for a workplace assignment.
- Construction-crew membership cannot be treated as concurrent normal-job availability.
- The worker-command boundary continues to invoke the same domain action.

## Save/migration impact

Not applicable — the correction changes no stored state shape, migration, or persistence path.

## Verification result

Focused staffing and construction-crew regression tests, TypeScript checking, linting, the complete test suite, and the production build passed. No dedicated interactive browser smoke check was required for this command-domain correction.

## Related commits or files

- `src/game/buildingActions.ts`
- `src/game/buildingStaffingActions.ts`
- `tests/workforce.transitions.test.ts`
- `tests/workerAssignment.test.ts`

## Fix

Normal-job eligibility is centralized in `buildingStaffingActions.ts` and used for manual assignment, sorted candidate previews, and completed-job availability checks. Construction-builder eligibility remains intentionally separate because unfinished-building assignment has different rules.
