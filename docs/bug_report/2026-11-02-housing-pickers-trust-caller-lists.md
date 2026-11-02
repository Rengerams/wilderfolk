# Housing pickers trust caller-filtered residence lists

- Bug: the pickers filter only the manor and rival buildings, not `completed` or residence type, so a caller passing raw buildings can be given an unfinished site or a non-home.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree on `508c1f2f`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`pickResidenceForFamily`, `pickLeastCrowdedResidence`)
- Related PR/commit: fixed in P5 (`b99458c3`, `3743c065`); regression and closure 2026-11-02

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits; no fix applied.
- 2026-11-02 — resolved: both pickers apply `isAssignableHome`, so a completed player residence is the only kind of building they can return and the rival/manor literals are gone.

## Observed behavior

`pickResidenceForFamily`/`pickLeastCrowdedResidence` check `isLeaderHouseResidence` and `faction === 'rival'` only; the pipeline happens to pass `listPlayerResidences`, but the exported API does not require it.

## Expected behavior

Selection accepts a validated player-residence list, or applies the one eligibility rule itself.

## Reproduction / evidence

Call either picker with a completed Farm and an unfinished House: the unfinished House can be returned.

## Root cause

Eligibility is assumed at the call site instead of owned by the picker.

## Proposed fix

Route both pickers through `isCompletedPlayerBuilding` + `isResidenceBuildingType`, or take a validated list type.

## Regression coverage

- `tests/housingPlanner.contract.test.ts`: "never plans an unfinished home", "never plans the manor for an ordinary household", and "lists completed player residences, not venues or unfinished sites".

## Save compatibility

None: in-memory state only.

## Verification

Verified: `npx vitest run tests/housingPlanner.contract.test.ts` — passed as part of the 34-file / 170-test housing set.
