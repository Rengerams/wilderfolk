# Save load may assign new jobs using the previous world's path grid

- Bug: Save load may assign new jobs using the previous world's path grid.
- Status: resolved (source only; runtime unverified)
- Severity: high
- Date discovered: 2026-11-06
- Version/build: PR #126, V.0.6.5.2 development branch
- Reporter: source review and user-supplied test findings
- Area: saveLoad.ts; pathfinding.ts
- Owner module: saveLoad.ts; pathfinding.ts
- Related PR: https://github.com/Rengerams/wilderfolk/pull/126

## Status history
- 2026-11-06 — reported with static trace or targeted failure; remediation committed to the PR, verification pending.

## Observed behavior
A restored colony can staff a vacant workplace while its live currentGrid is missing or still bound to a prior colony. The read-only grid used for stranded humans does not install a live route map.

## Expected behavior
A valid action must respect the single owner, available resources and staff, persistent established jobs, and existing safety constraints.

## Reproduction steps
Restore a save with a completed House on one side of a fully blocked line and an empty Farm on the other; pre-install a different walkable map with the same seed and dimensions. A valid incumbent must retain the existing job; an idle applicant must remain unemployed.

## Evidence
tests/saveLoad.commuteGrid.test.ts; absent and stale previous-grid cases.

## Root cause
The original decision path did not consider the needed boundary condition described above.

## Fix / proposed fix
saveLoad.loadGameFromParsedOutcome now installs setCurrentPathMap(restored worldMap, buildings) immediately before assignMissingWorkers. pathfinding getPathGrid/getReadOnlyPathGrid also require matching map identity in addition to the old signature.

## Save/migration impact
No save schema changes; existing valid jobs must be preserved.

## Verification result
Targeted tests, type check, lint, build and extended simulation: NOT RUN in this session; CI status is tracked separately.
