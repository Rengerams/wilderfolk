# `coreCannotFit` is named the opposite of what it computes

- Bug: the guard is true when the guardian has a bed (short circuit) and false only when a guardian exists without a bed and a home fits the core, so its name and the stable-shortage rule disagree.
- Status: open
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree on `508c1f2f`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`housingUnitNeedsReassignment`)
- Related PR/commit: none yet; fix scheduled with P5

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

- Scheduled with P5; no test pins it yet.

## Save compatibility

None: in-memory state only.

## Verification

Code-reading evidence; the defect has not been fixed, so nothing is verified as fixed.
