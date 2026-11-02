# Capacity surplus evicts a whole household for a one-bed excess

- Bug: when a residence is over capacity, the phase unhouses the whole selected unit instead of only the members above the cap, leaving empty beds and more homeless settlers than necessary.
- Status: open
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree
- Reporter: housing audits (independent workers)
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`rebalanceOvercrowdedResidences`)
- Related PR/commit: second audit round

## Status history

- 2026-11-02 — open: recorded by the audit round.

## Observed behavior

Fixture: one 6-bed house with kin groups of 4 and 3 (7 occupants) ends with 3 unhoused and the house at 4/6 — two beds empty.

## Expected behavior

Evict only the excess (least-disruptive members first), or re-plan after the loop so freed beds are reused.

## Reproduction / evidence

1. Put 7 related settlers in a 6-bed house with no spare.
2. Run the capacity rebalance.
3. Three are unhoused while the house keeps two free beds.

## Root cause

The surplus subset is the whole unit in the overfull home; there is no partial selection.

## Proposed fix

Select only `occupancy - cap` members (adults before custodial minors), then let the homeless phase seat them.

## Regression coverage

Scheduled with P5; no dedicated fixture yet.

## Save compatibility

None: in-memory state only.

## Verification

Not fixed; measured in the capacity audit.
