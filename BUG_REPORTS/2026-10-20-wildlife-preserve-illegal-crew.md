# 2026-10-20 — Wildlife Preserve lists illegal construction occupant

## Symptom
Development invariant: `building #1128 (wildlifePreserve) should have no occupants but lists 14611` in `gameTick.ts:367`.

## Cause
`workforce.staffConstructionCrews` selected every incomplete player building for its donor-rebalance pass, including buildings with `maxOccupants: 0`. The donor transfer moved builder IDs directly between `occupants` arrays without invoking `assignBuilderInPlace`'s capacity guard. Wildlife Preserve is a passive zero-worker building and is classified as `none` by simulation invariants.

## Fix
- `d5b1ad8`: construction workforce considers only unfinished player buildings with positive worker capacity. During routine workforce preparation, clear stale occupants on *completed non-residential, non-job* buildings. Do not touch housing, workplace or prison occupant records.
- `6340ae7`: regression tests for unauthorized Preserve crew transfers and existing stale Preserve occupant cleanup.

## Status
Code committed. Run `npx vitest run tests/workforce.zeroCapacityConstruction.test.ts`, `npm run build`, and reload the affected settlement. No actual save/Chronicle deletion involved; static review only, tests have not been executed here.
