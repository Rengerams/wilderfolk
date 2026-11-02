# Custody repair and adoption were gated by the housing-move heuristic

- Bug: routing custody through the homeless planner tied a minor following their custodian, and an orphan completing adoption, to whether the housing unit needed a move.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `185f6205`+
- Reporter: housing audits (independent workers)
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`relocateChildToCustodian`, `ensureOrphanAdoption`, `planRelocation`)
- Related PR/commit: second audit round

## Status history

- 2026-11-02 — resolved: recorded by the audit round.

## Observed behavior

`relocateChildToCustodian` asked `planPlacement`, whose `housingUnitNeedsReassignment` gate returns settled for a lone minor in the family home, so a child stayed apart from a custodian with a free bed. `ensureOrphanAdoption` returned false when the plan was settled, so an orphan already living with their guardian was never adopted and the phase retried daily.

## Expected behavior

Custody repair moves a minor to the custodian whenever that bed is free; adoption completes when the household is already together, and rolls back only on a genuine refusal.

## Reproduction / evidence

1. Father lives in home B, his minor child alone in home A, no empty home.
2. Run the guardianship repair: before the fix the child stays in A.
3. An orphan already housed with the guardian returns false forever.

## Root cause

One move-or-stay predicate was reused for a custody rule it does not encode.

## Proposed fix

A `custodian` need that targets `pickResidenceFromChildCustodian` without the settled gate; adoption treats `settled` and an all-at-destination plan as success, rolling back only on refusal.

## Regression coverage

`tests/housingPlanner.contract.test.ts` — the lone-minor custodian case; the adoption suites.

## Save compatibility

None: in-memory state only.

## Verification

35-file housing suite 170 tests pass; the custodian case fails without the new need.
