# Auto-play staffing routes handle manual workplaces inconsistently

- Bug: Food and non-food staffing decisions use different command policies when manually staffed workplaces exist.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: main at 6e9dd6bfcd525cb1df3d8960a636069f5aa240c7
- Reporter: static source audit; no runtime reproduction
- Area: Virtual Player / workforce
- Owner module: `src/game/virtualPlayer.ts` for proposal; `src/game/workforce.ts` for authoritative staffing
- Related implementation: `docs/plans/persistent-automatic-workforce-2026-11-06.md`

## Status history
- 2026-11-06 — investigating: PR #126 removes manual staffing filters and player job selectors, normalizes legacy mode to auto, and retains persistent job IDs. Runtime not tested; event-driven optimization remains planned.
- 2026-11-06 — investigating: source paths differ; runtime impact not verified. Player requests removing manual assignment altogether.

## Observed behavior
`decideUnstaffedFoodProducer` checks whether manually staffed buildings exist and avoids proposing `autoStaffWorkers` in that case, instead proposing targeted `removeWorker`. `decideUnstaffedProducer` can propose `autoStaffWorkers` without an equivalent guard. This is a source-level policy inconsistency, **not proof** that the worker command overwrites any manual assignment.

## Expected behavior
One authoritative workforce policy and action path. Under the newly requested design, the game has no manual staffing mode; settled employment persists and daily attendance never triggers unnecessary reassignment.

## Reproduction steps
1. Inspect `decideUnstaffedFoodProducer` and `decideUnstaffedProducer` in `src/game/virtualPlayer.ts` at the pinned commit.
2. Compare proposed commands for an unstaffed food versus industrial workplace when a manually staffed workplace is present.
3. To establish runtime impact, inspect and exercise `autoStaffWorkers` through the workforce command owner; **not executed** in this documentation task.

## Evidence
`decideUnstaffedFoodProducer` contains `state.buildings.some(isManualStaffingBuilding)` before its command decision. `decideUnstaffedProducer` proposes `autoStaffWorkers` without that check. Both use `findOverstaffedDonorBuilding`.

## Root cause
Confirmed duplicated policy branching in the proposal layer. Whether the differing commands result in different actual assignments is not yet established.

## Fix / proposed fix
Implementation committed on PR #126: the workforce owner keeps existing jobs, manual-only policy branches are gone, and the legacy manual mode is migrated on the workforce pass. Completed job posts cannot be individually assigned through the old player command. Validation was not run.

Replace both special-case proposals with a single workforce reconciliation policy as part of removing manual assignment. Keep `workerBuildingId` persistent. Prefer vacant and unassigned workers first; transfer occupied workers only for validated urgent needs or worthwhile opportunities. Assign through the existing workforce owner and typed command boundary; remove obsolete manual-only checks and UI after tracing references. Avoid per-day complete rebalance.

## Save/migration impact
Existing saved assignments must be preserved. Any saved manual-staffing preference should migrate safely to automatic without dropping existing employment. No save-version decision has been made yet.

## Verification result
- Source inspection — completed; differing command policy confirmed.
- Runtime reproduction — NOT RUN, at user request.
- Tests, TypeScript, lint, build and CI — NOT RUN, at user request.
