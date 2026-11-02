# Housing traits and beds disagree about a cursed Moon Howler

- Bug: the trait map counts occupants with `isPlayerHuman` while beds and rosters count `isResidenceOccupantEntity`, so a cursed Moon Howler is invisible to couple/singles scoring and can enter the threaded map without a fresh build ever containing them.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree on `508c1f2f`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`buildResidenceTraits`, `residenceTraitMove`, `writeResidence`)
- Related PR/commit: fixed in P5 (`b99458c3`, `3743c065`); regression and closure 2026-11-02

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits; no fix applied.
- 2026-11-02 — resolved: `buildResidenceTraits` and `residenceTraitMove` now use `isResidenceOccupantEntity`, the same rule as the beds and rosters; a cursed Moon Howler counts in both.

## Observed behavior

`buildResidenceTraits` skips non-player humans; `writeResidence` calls `residenceTraitMove` for whoever moves; `countResidentsInBuilding` counts `isResidenceOccupantEntity`. A cursed settler relocated by the leader phase is added to the run's trait map but omitted by a fresh build, so the same house reads differently after the run.

## Expected behavior

One occupant rule for beds, rosters and traits (the `isResidenceOccupantEntity` owner), so a house's couple/singles state cannot disagree with its bed count.

## Reproduction / evidence

1. A cursed Moon Howler holds a residence.
2. Relocate them through a phase that writes residence.
3. Compare the threaded `buildResidenceTraits` map with a fresh build: they differ.

## Root cause

Three callers answer "who occupies this house" with two different predicates.

## Proposed fix

Use `isResidenceOccupantEntity` in `buildResidenceTraits` and in the trait move, and add a cursed-settler regression.

## Regression coverage

- `tests/housingArchitecture.completion.test.ts`: "counts a cursed Moon Howler in the traits exactly as in the beds" — the same one cursed settler and one human are counted by `buildResidenceTraits` and `countResidentsInBuilding`.

## Save compatibility

None: in-memory state only.

## Verification

Verified: `npx vitest run tests/housingArchitecture.completion.test.ts` — 17 passed.
