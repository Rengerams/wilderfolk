# Housing trait `pairs` counts each couple twice

- Bug: adding the second partner increments `pairs` once for the mover and once for the existing occupant, so a house with one couple reads 2 while its comment says "occupants whose partner is a housemate".
- Status: open
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree on `508c1f2f`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`addResidenceOccupant`)
- Related PR/commit: none yet; fix scheduled with P5

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits; no fix applied.

## Observed behavior

Removal is symmetric, and every reader tests `> 0`, so behaviour is currently unaffected. Any future use that sums `pairs` would double the couples.

## Expected behavior

The field means what its comment says, or is renamed to say it counts links.

## Reproduction / evidence

Add a mutual couple to one residence and read `pairs`: it is 2.

## Root cause

Both directions of the pair are counted as links.

## Proposed fix

Count each couple once (or rename to `pairLinks` and document it).

## Regression coverage

- Scheduled with P5; no test pins it yet.

## Save compatibility

None: in-memory state only.

## Verification

Code-reading evidence; the defect has not been fixed, so nothing is verified as fixed.
