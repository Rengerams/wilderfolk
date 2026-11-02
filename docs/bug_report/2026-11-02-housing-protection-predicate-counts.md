# Housing protection predicate counts what it is asked

- Bug: a query mutates `report.protectedUnits`, so asking twice about the same household double-counts and a read-only call changes the report.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree on `508c1f2f`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`isHousingUnitProtected`)
- Related PR/commit: fixed in P5 (`b99458c3`, `3743c065`); regression and closure 2026-11-02

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits; no fix applied.
- 2026-11-02 — resolved: `isHousingUnitProtected` now only reads the ledger and returns a verdict; `protectedUnits` is counted once in `relocateHousehold`, where the move is withheld.

## Observed behavior

`isHousingUnitProtected` increments `protectedUnits` before returning. Current callers query each unit at most once, so the number is right today by luck; the pipeline contract test calls the predicate directly and changes the ledger it asserts on.

## Expected behavior

A predicate returns a verdict; counting belongs to the phase that withholds the move, once per household.

## Reproduction / evidence

Call `isHousingUnitProtected(ledger, [settler], 'commute')` twice and read `ledger.report.protectedUnits`: it is 2.

## Root cause

The counter was attached to the query instead of the decision.

## Proposed fix

Return a boolean and count in the caller/phase, deduplicated per household.

## Regression coverage

- `tests/housingAuthority.pipeline.test.ts`: "does not count a protection query as a withheld move" — querying the predicate twice leaves `report.protectedUnits` at 0.

## Save compatibility

None: in-memory state only.

## Verification

Verified: `npx vitest run tests/housingAuthority.pipeline.test.ts` — 8 passed.
