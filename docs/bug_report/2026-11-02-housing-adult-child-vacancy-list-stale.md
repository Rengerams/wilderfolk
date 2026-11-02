# The adult-child phase's vacancy list only shrinks

- Bug: the phase builds the set of empty homes once and only removes the chosen one, so a home vacated during the same phase is never offered to later candidates.
- Status: open
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree on `508c1f2f`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable`)
- Related PR/commit: none yet; fix scheduled with P2

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits; no fix applied.

## Observed behavior

`emptyHomeIds` is computed at entry and removed from on each move; the phase returns when it is empty even though a move earlier in the loop may have emptied another home.

## Expected behavior

A home vacated by a departing household is available to the next candidate in the same phase.

## Reproduction / evidence

Two adult children at home, one empty home that fits each; after the first move frees a second home, the second candidate is not considered because the list is empty.

## Root cause

A mutable candidate list that is never replenished.

## Proposed fix

Recompute the empty set per move, or append the vacated home after each relocation.

## Regression coverage

- Scheduled with P2; no test pins it yet.

## Save compatibility

None: in-memory state only.

## Verification

Code-reading evidence; the defect has not been fixed, so nothing is verified as fixed.
