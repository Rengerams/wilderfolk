# Bug: Relationship diagnostics counters conflate interval, active, and completed state

- Status: verified
- Date discovered: 2026-08-20
- Version/build: 0.6.1 (0.6.1-line development)
- Reporter: Deep Code (Objective 8; originally flagged in reggresion_proofing_plan.md)
- Area: Truth
- Owner module: relationshipDiagnostics.ts (+ recorders in humanRelationships.ts / humanLifecycle.ts)
- Cadence: flush (once per colony day)

## Status history
- 2026-08-20 — open (discovered in Objective 8; originally flagged in reggresion_proofing_plan.md)
- 2026-08-20 — fixed (truthful counter set + `activePregnancies` computed at flush + gate funnel)
- 2026-08-20 — verified (conception→birth lifecycle tests + full suite green)

## Observed behavior

`pregnanciesStarted` was an interval counter (reset on the daily flush) but its
name reads like active state; a value of 0 was interpreted as "no pregnancy
exists". There was no counter for completed births, no way to see an existing
or seeded pregnancy except the interval counter, and `conceptionRejected`
lumped every gate failure (eligibility, energy, proximity, roll) into one
bucket — so diagnostics could not tell WHY conception was rare.

## Expected behavior

Each counter means exactly what its name says:
- `conceptionCandidates`, `conceptionEligibilityRejected`,
  `conceptionProximityBlocked`, `conceptionEnergyBlocked`,
  `conceptionRollFailed` — interval gate funnel;
- `pregnanciesStartedThisInterval` — new pregnancies created this interval ONLY;
- `activePregnancies` — current pregnant count from the authoritative state
  (never derived from the interval counters);
- `birthsCompletedThisInterval` — completed births, counted separately.

## Reproduction steps

1. Enable relationship diagnostics.
2. Run a sim with a seeded pregnancy that predates the current day.
3. Read the daily snapshot: no field reports the existing pregnancy; after a
   birth, no field reports the completed birth.

## Evidence

- `relationshipDiagnostics.ts` (before fix): snapshot had only interval
  counters (`pregnanciesStarted`, `conceptionRejected`); no active/completed
  fields.
- The original concern is recorded in `reggresion_proofing_plan.md`:
  "`pregnanciesStarted: 0` was interpreted as 'no pregnancy exists'."

## Root cause

The diagnostics were written before active state and gate separation existed;
interval counters were the only vocabulary.

## Fix

Rewrote `relationshipDiagnostics.ts`: renamed interval counters to the
truthful set, added `birthsCompletedThisInterval` (recorded by
`humanLifecycle` at term completion) and `activePregnancies` (computed at
flush from the authoritative world by the flush caller). `tryDailyConception`
now records the FIRST gate that blocked each candidate (behavior-preserving
restructure — probabilities untouched).

## Regression test

`tests/relationshipDiagnostics.test.ts` (8 tests): the conception gate funnel
(eligibility / energy / proximity / roll / success), active-vs-interval
separation (seeded pregnancy visible only via `activePregnancies`), flush
reset semantics, and a full start→advance→birth lifecycle asserting births are
counted separately from new conceptions.

## Invariants checked

- A conception counter never means "active pregnancies".
- A birth is never inferred from `pregnanciesStartedThisInterval`.
- Seeded/earlier pregnancies are visible through `activePregnancies`.

## Save/migration impact

None (diagnostics only; no save state).

## Verification result

Focused tests pass; full suite green.

## Related commits or files

- `src/game/relationshipDiagnostics.ts`
- `src/game/simulation/humanRelationships.ts`
- `src/game/simulation/humanLifecycle.ts`
- `src/game/humanTick.ts`
- `tests/relationshipDiagnostics.test.ts`
