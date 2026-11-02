# `coreCannotFit` is named the opposite of what it computes

- Bug: the guard is true when the guardian has a bed (short circuit) and false only when a guardian exists without a bed and a home fits the core, so its name and the stable-shortage rule disagree.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `4339c94b`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`unitNeedsMove`)
- Related PR/commit: fixed in `4339c94b`

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits; no fix applied.

## Observed behavior

`coreCannotFit = guardian?.residenceBuildingId != null || pickResidenceForFamily(core) === undefined`. With a housed guardian the first operand is true; the second is evaluated only when the guardian has no bed.

## Expected behavior

A predicate whose name states what it decides, so the stable-shortage guard can be reviewed without reconstructing the truth table.

## Reproduction / evidence

Read the expression at `housingUnitNeedsReassignment`; the branch `coreTogether && coreCannotFit && unitFitsNowhere` is the anti-thrash rule.

## Root cause

The condition was grown by OR-ing two different questions into one name.

## Proposed fix

Split into `guardianHoldsHome` and `coreHasNoAlternative`, or fold it into the P5 planner cleanup.

## Regression coverage

- No direct test for the private names; the housing suite pins the stable-shortage outcome through the planner cases.

## Save compatibility

None: in-memory state only.

## Verification

Fixed: types pass and the housing suite is green; the refactor is behaviour-preserving.
