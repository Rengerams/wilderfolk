# A surplus eviction marked the vacated home visited and blocked rehousing

- Bug: leaving a home through a surplus eviction recorded the old home as visited, so the same run could not seat the evicted household there even after beds freed.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `HEAD`
- Reporter: housing audits (independent workers)
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`relocateHousehold`)
- Related PR/commit: second audit round

## Status history

- 2026-11-02 — resolved: recorded by the audit round.

## Observed behavior

Measured replay: one 6-bed house with 9 people; the first run left 5 unhoused with 2 beds free and only recovered on a second run with a fresh ledger. A deterministic variant with a spare home left the evicted settler outside because their old home was marked visited.

## Expected behavior

A home someone was evicted from is not "already lived in" for the purpose of rehousing in the same run; the fit check still prevents returning to an overfull home.

## Reproduction / evidence

1. Overfill one house and give the colony a spare.
2. Evict a surplus household (to undefined).
3. The evictee cannot be placed back in the old home after later moves free a bed.

## Root cause

`relocateHousehold` added `from` to `visited` for every move, including leaving with no destination.

## Proposed fix

Only record `from` as visited when the move has a destination; surplus leaves are not a residence the household "already had".

## Regression coverage

`tests/housingPlanner.contract.test.ts` — the surplus case asserts the vacated home is not in `visited`.

## Save compatibility

None: in-memory state only.

## Verification

35-file housing suite 170 tests pass.
