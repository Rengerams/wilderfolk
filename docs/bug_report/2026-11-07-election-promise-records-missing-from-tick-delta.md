# Election promise records are missing from the tick delta and rollback

- Bug: A worker-side election ceremony writes promise records the display world never receives, and a failed tick cannot roll them back.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit simulation pass (SIM-10)
- Area: simulation delta / rollback
- Owner module: `simBuffers/simDelta.ts`, `simWorker/simPrep.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: delta and prep lacked the saved field.
- 2026-11-07 — resolved: shipped and snapshotted like `chronicleChapters`.
- 2026-11-07 — follow-up: the snapshot and delta also normalised an absent field to an empty list, which the worker rollback closure check rejected; absence is now preserved.

## Observed behavior
`electionPromiseRecords` was written worker-side and saved, but absent from `SimTickDelta` and `SimPrepKeys`, so the display kept the pre-election list until a reload and a failed tick did not restore the records.

## Expected behavior
Promise records round-trip with the tick that rewrites them and roll back with that tick.

## Reproduction steps
1. Set promise records on a world, extract a prep snapshot, then replace them.
2. Apply the prep snapshot; before the fix the new records stayed.
3. Extract a delta into an empty world; before the fix the records were absent.

## Evidence
`tests/simPrep.rollbackFields.test.ts` and `tests/simDelta.storyRoundtrip.test.ts`.

## Root cause
The field was added to the save allow-list and writer without following the existing `chronicleChapters` transport pattern.

## Fix / proposed fix
Added the field to the delta type, extract/apply, `SimPrepKeys`, and prep extract/apply.

## Save/migration impact
None; the save shape was already correct.

## Verification result
- `npx vitest run tests/simPrep.rollbackFields.test.ts tests/simDelta.storyRoundtrip.test.ts` — PASS.
- `npm run test:types` — PASS.
- Follow-up: `npx vitest run tests/workerBoundary.closure.test.ts tests/simPrep.rollbackFields.test.ts tests/simDelta.storyRoundtrip.test.ts tests/simPrep.rollbackClosure.test.ts` — PASS (19); the closure suite failed with `electionPromiseRecords: undefined` versus `[]` before the shape fix.
