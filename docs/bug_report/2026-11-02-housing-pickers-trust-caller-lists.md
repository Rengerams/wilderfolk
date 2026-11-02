# Housing pickers trust caller-filtered residence lists

- Bug: the pickers filter only the manor and rival buildings, not `completed` or residence type, so a caller passing raw buildings can be given an unfinished site or a non-home.
- Status: open
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree on `508c1f2f`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`pickResidenceForFamily`, `pickLeastCrowdedResidence`)
- Related PR/commit: none yet; fix scheduled with P5

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits; no fix applied.

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

- Scheduled with P5; no test pins it yet.

## Save compatibility

None: in-memory state only.

## Verification

Code-reading evidence; the defect has not been fixed, so nothing is verified as fixed.
