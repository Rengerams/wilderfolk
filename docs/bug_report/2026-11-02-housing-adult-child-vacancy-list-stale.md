# The adult-child phase's vacancy list only shrinks

- Bug: the phase builds the set of empty homes once and only removes the chosen one, so a home vacated during the same phase is never offered to later candidates.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `fd63ad00`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable`)
- Related PR/commit: none yet; fix scheduled with P2

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits.
- 2026-11-02 — resolved: the vacancy list is rebuilt after every move. The vacated-home case is latent in this phase (a parent keeps the family home), so the adult-child suites are the regression coverage.

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

Fixed: the 35-file housing suite passes (168 tests); the refresh is code-verified but has no dedicated fixture because the phase cannot vacate a home while the parent stays.
