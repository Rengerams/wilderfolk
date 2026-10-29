# Demolition triggers an unrelated colony-wide housing and staffing sweep

- Bug: every demolition schedules full population reconciliation even when removing an unused road, wall, or empty building
- Status: investigating — targeted patch committed; CI and live large-colony verification pending
- Severity: high
- Date discovered: 2026-10-29
- Version/build: `main` at `ef0c44d6` (inspected through GitHub)
- Reporter: owner (game briefly freezes on every building deletion and becomes difficult to play)
- Area: player commands, demolition, housing, workforce and performance
- Owner module: `src/game/buildingMaintenanceActions.ts`
- Related: `docs/BUG_REPORTS/2026-10-20-command-preview-and-worker-recovery-freezes.md` (different worker-preview problem), `docs/BUG_REPORTS/2026-10-02-day-rollover-residency-assignment-freeze.md` (housing solver's measured cost)
- Proposed branch: `fix/demolition-reconcile-stall-20261029`

## Status history

- 2026-10-29 — investigating: static code trace shows unconditional housing and workforce reconciliation after every demolition, irrespective of assignments; fix committed, tests authored but not executed locally

## Observed behavior

The owner reports a noticeable freeze when deleting *any* building. The demolition handler calls `reconcileAssignmentsAfterBuildingRemoval` for all removed structures. Its original implementation always called `assignMissingResidences` without a sweep tick (the unbounded, up-to-24-pass branch) and then `assignMissingWorkers`. The previous large-colony housing profile establishes that a full sweep is costly, although no current demolition latency has been measured.

## Expected behavior

Removing an unused building or infrastructure segment must update topology, resources and counters without allocating housing or staffing across unrelated settlers. Actual evictions, displaced staff and construction crews must still be reconciled through their established owners.

## Reproduction steps

1. Load a settlement with vacant housing and an unemployed settler, plus an unused road or wall.
2. Demolish that road through the normal `demolishBuilding` worker command.
3. On the original code, the unrelated settler is assigned housing and the worker-assignment pipeline runs; on a large colony this can delay command completion. The focused regression checks that demolition no longer causes unrelated assignment.

## Evidence

`demolishBuildingsInPlace` called `reconcileAssignmentsAfterBuildingRemoval` unconditionally. The callee used `assignMissingResidences(humans, state.buildings, state.entities)` without `sweepTick`, engaging the 24-pass path in `residencyReconciliation.ts` whenever a home remained. A previous 982-settler save profile in the day-boundary report measured tens of seconds spent in this solver; it is supporting context, not a measurement of this particular action.

## Root cause

A broad, expensive dependency refresh was treated as a mandatory demolition side effect even when no housing, worker or construction-crew reference needed repair.

## Fix / proposed fix

Problem: non-residential demolition performs full-colony decision work. Minimal change: collect affected housing/workforce flags during the existing assignment-clear pass, include unfinished construction crews, and run only the relevant owner; housing reconciliation receives the current simulation tick to bound the sweep. Risk-impact: assignment timing differs for settlers unrelated to demolition, which is intentional; displaced residents and workers still reconcile immediately.

## Save/migration impact

None. WorldState, entity and building save formats are unchanged.

## Verification result

- PASS (static): single-owner removal and command routing preserved, with no new owner or alias.
- NOT RUN: `npx vitest run tests/demolish.roundtrip.test.ts` (remote source editing; no local repository/dependencies in this session).
- NOT RUN: `npm run test:types`, `npm run lint`, `npm run build`.
- PENDING: CI and browser replay on a large save, including occupied-house, staffed-workplace and empty-road demolition.
