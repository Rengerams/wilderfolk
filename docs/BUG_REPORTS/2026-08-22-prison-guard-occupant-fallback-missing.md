# Bug: Prison Guard occupant fallback is documented but not implemented

- Status: resolved — developer decision 2026-08-24: prison custody is institutional after admission; the occupants-only guard fallback is intentionally not implemented (active guard coverage would be a separate feature)
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 development working tree
- Reporter: Simulation-role audit and updated Festivals en venues responsibility document
- Area: Truth | Play | worker
- Owner module: `src/game/simulation/humanRelationships.ts`, `src/game/workforce.ts`
- Cadence: Scandal arrest eligibility and prison staffing checks

## Status history

- 2026-08-22 — open (PDF/code cross-check found a documented fallback absent from the inspected implementation)
- 2026-08-24 — resolved (dev decision: institutional custody; active guard coverage deferred)

## Observed behavior

The updated responsibility document states that `countGuardsAtPrison(...)` first checks a worker assigned to the Prison and then falls back to a living, non-imprisoned player Prison Guard in the Prison occupants list. The inspected runtime implementation counts living, non-imprisoned player Prison Guards assigned through `homeBuildingId === prison.id`; an occupants-only fallback was not found.

## Expected behavior

The code and document must agree. If occupant-list fallback is the intended recovery rule, a valid Prison Guard in the Prison occupants list should satisfy the prison staffing check even when the worker assignment field is stale or missing. If that fallback is not intended, the PDF must be corrected and the stricter assignment rule must be documented.

## Reproduction steps

1. Build and complete a Prison.
2. Create a living, non-imprisoned player Prison Guard.
3. Place the Guard ID in the Prison occupants list without a matching `homeBuildingId` assignment.
4. Trigger a staffing/arrest eligibility check.
5. Observe whether the runtime accepts the Guard as the documented fallback.

## Evidence

- Updated `Festivals en venues` PDF, Prison section: describes workplace-first and occupants-list fallback.
- `src/game/simulation/humanRelationships.ts`: inspected `countGuardsAtPrison(...)` implementation.
- `src/game/workforce.ts`: Prison occupant synchronization and assignment paths.
- `BUG_REPORTS/Readme.md`: required bug-report fields and status history.

## Root cause

The document describes a two-path staffing selector, while the runtime selector and assignment invariants appear to rely on assignment fields. The source of truth for the fallback was not established.

## Fix

Pending owner decision. Either implement the fallback through one prison staffing selector and maintain bidirectional assignment invariants, or remove the fallback claim from the PDF. Do not add an independent arrest rule inside the command handler.

## Regression test

Test a valid assigned Guard, a valid occupants-only Guard if approved, an invalid role, an imprisoned Guard, a rival Guard, a dead Guard, an uncompleted Prison, and a full Prison. Verify no partial arrest mutation on rejection.

## Invariants checked

- Only living player Guards can staff a player Prison.
- Prisoners cannot satisfy guard staffing.
- Rival and imprisoned entities are excluded.
- Prison staffing ownership remains in the prison/relationship selector.
- Occupants and assignment fields are either synchronized or the fallback is explicitly supported.

## Save/migration impact

No save change is required if the fix is selector-only. If assignment reconciliation changes, review legacy Prison occupant arrays and save migration behavior.

## Verification result

Open. The discrepancy is documented from source inspection; no code fix has been applied.

## Related commits or files

- `src/game/simulation/humanRelationships.ts`
- `src/game/workforce.ts`
- `src/game/gameTypes.ts`
- `docs/PRISON_FUNCTION_AUDIT.md`
- Updated `Festivals en venues` PDF
- `BUG_REPORTS/Readme.md`

## Unique ID

`2026-08-22-prison-guard-occupant-fallback-missing`

## Audit change references

- Change 4: define prison acceptance versus active custody coverage.
- Change 6: resolve guard/prisoner capacity and staffing semantics.
- Change 10: strengthen prison invariants.

## Practical advice

Do not silently implement a fallback merely to make the PDF pass. First decide whether Prison occupants are authoritative for staffing or only a derived display list. Then enforce that choice in one named selector and add the invariant that prevents the two representations from drifting.

