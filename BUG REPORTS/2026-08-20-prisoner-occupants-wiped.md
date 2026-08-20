# Bug: Prisoners are wiped from prison occupants on every assign pass

- Status: verified
- Date discovered: 2026-08-20
- Version/build: 0.6.1 (0.6.1-line development)
- Reporter: Deep Code (Objective 7 — caught by the demolition round-trip test)
- Area: Truth
- Owner module: workforce.ts (syncJobBuildingOccupants) — prison owner
- Cadence: assignment (4×/day) + after player commands

## Status history
- 2026-08-20 — open (discovered in Objective 7 — caught by the demolition round-trip test)
- 2026-08-20 — fixed (`syncJobBuildingOccupants` special-cases Prison: occupants = guards + prisoners)
- 2026-08-20 — verified (prison occupant regression tests + full suite green)

## Observed behavior

`workforce.syncJobBuildingOccupants` rebuilds the occupants of every job
building (including Prison) from `homeBuildingId` alone, filtering out
`prisonBuildingId != null` humans. Prisoners — who the arrest/scandal owner
and the Moon Howler restore explicitly push into `prison.occupants` — are
therefore **wiped from the prison occupants list on every assign pass**,
oscillating between present (after arrest/restore) and absent (after any
`assignMissingWorkers` run). The Objective 1 invariant
"prison occupant must be a prisoner or guard" flags the wiped state as
inconsistent.

## Expected behavior

Prison occupants = guards (`homeBuildingId`) + prisoners (`prisonBuildingId`),
preserved across every reconciliation pass (matches the arrest push and the
BuildingConfig role comment: prison guard + prisoner slots share the cap).

## Reproduction steps

1. Arrest a scandal offender (humanRelationships pushes them into
   `prison.occupants`).
2. Run any `assignMissingWorkers` pass (assign layer ~4×/day, or a
   demolish/remove/recruit command).
3. Observe the prisoner removed from `prison.occupants` while still holding
   `prisonBuildingId`.

## Evidence

- `src/game/simulation/humanRelationships.ts:896` — arrest pushes the
  offender into `prison.occupants`.
- `src/game/moonHowler.ts:452` — werewolf restore pushes into
  `prison.occupants`.
- `src/game/workforce.ts` (before fix) — `syncJobBuildingOccupants` filter
  `homeBuildingId === building.id && prisonBuildingId == null` excludes
  prisoners from the rebuild.
- Caught by `tests/demolish.roundtrip.test.ts` (prisoner + invariant
  assertion after a demolish-triggered reconciliation).

## Root cause

The occupants rebuild was written for workplace staff only; the Prison's
guards+prisoners role was not special-cased when prisoner occupancy was
introduced.

## Fix

`syncJobBuildingOccupants` special-cases completed Prisons: occupants = guards
(`homeBuildingId === prison.id`) + prisoners (`prisonBuildingId === prison.id`).
Released prisoners (field cleared) drop out naturally. Other job buildings
still exclude imprisoned humans.

## Regression test

`tests/workforce.transitions.test.ts` — "keeps prisoners in prison occupants
across syncJobBuildingOccupants" and "drops a released prisoner from prison
occupants"; plus the demolish round-trip test that first caught it.

## Invariants checked

- Prison occupants are always guards or prisoners (never strangers).
- A prisoner with `prisonBuildingId` appears in that prison's occupants.

## Save/migration impact

None (reconciliation only; no save shape change).

## Verification result

Focused tests pass; full suite green.

## Related commits or files

- `src/game/workforce.ts`
- `tests/workforce.transitions.test.ts`
- `tests/demolish.roundtrip.test.ts`
