# Bug: Wildlife deer count diverges from authoritative population

- Status: resolved — live verification pending
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 development working tree
- Reporter: Automated one-year invariant harness
- Area: Truth | simulation
- Owner module: Wildlife population accounting and simulation invariant reconciliation
- Cadence: Systems / lifecycle cadence

## Status history

- 2026-08-22 — open (one-year invariant harness reproduced a deer-count mismatch)
- 2026-08-22 — investigating (current working tree did not reproduce the family orphan-ID finding from the external audit, but exposed this separate invariant failure)
- 2026-08-22 — resolved — live verification pending (daily wildlife insertion and post-daily index refresh repaired; see `2026-08-22-wildlife-index-consistency.md`)

## Observed behavior

The one-year invariant run fails at tick 17,496, calendar day 243, with:

`wildlifeCounts.deer 60 != actual 70`

The cached or diagnostic deer count is ten lower than the number of living deer entities in the authoritative entity collection.

## Expected behavior

`state.wildlifeCounts.deer` must match the number of living deer entities at every invariant check. Wildlife population counters must be updated by the authoritative wildlife lifecycle owner whenever deer are spawned, removed, migrated, or otherwise cease to count as living population.

## Reproduction steps

1. From `C:\Wilderfolk`, run `$env:SIM_YEARS='1'; npx --no-install tsx scripts/sim-invariants.ts`.
2. Use the current working tree and the default simulation seed/configuration.
3. Observe the invariant failure at tick 17,496 / day 243.

## Evidence

The current run exited with code 1 and reported:

`INVARIANT VIOLATION at tick 17496 (day 243): wildlifeCounts.deer 60 != actual 70`

The attached audit report previously described a different family-reference failure at tick 4,208. That exact failure did not reproduce in the current working tree during this run.

## Root cause

Not yet determined. Candidate causes include a deer spawn path that appends entities without incrementing `wildlifeCounts.deer`, a cleanup path that decrements the counter incorrectly, or a population reconciliation path that updates the entity collection without rebuilding the cached count.

## Fix

Daily wildlife replenishment now enters through the authoritative `pushNewEntity()` path, and final population counters are recomputed after daily simulation work. The detailed implementation and combined verification evidence are recorded in `2026-08-22-wildlife-index-consistency.md`.

## Regression test

Pending. Add a focused test for every supported deer spawn and removal path, plus a long-run invariant assertion that the cached deer count equals living deer entities.

## Invariants checked

- Every living entity has a valid identity and position.
- `wildlifeCounts.deer` equals the number of living deer entities.
- The invariant must remain true across spawn, death, cleanup, and long-run simulation boundaries.

## Save/migration impact

Unknown pending root-cause analysis. If `wildlifeCounts` is persisted or restored from saves, verify that load reconciliation rebuilds it from authoritative living entities rather than trusting a stale cached value.

## Verification result

The original one-year run failed at tick 17,496 / day 243. After the repair, a fresh one-year run completed with zero invariant violations. Live browser verification and deterministic seeded long-run coverage remain pending.

## Related commits or files

- `scripts/sim-invariants.ts`
- `src/game/simulation/simInvariants.ts`
- Wildlife population owner modules to be identified
- `tests/simulation.invariants.test.ts`
- Attached full audit report supplied on 2026-08-22

## Simulation Change Record

- Owner module: To be identified; likely wildlife lifecycle/population accounting
- Decision changed: None yet; investigation only
- Cadence: Systems / wildlife lifecycle
- State fields written: `wildlifeCounts.deer` and authoritative deer entities, pending confirmation
- Why the change is needed: Cached wildlife counts diverge from authoritative living population during long play
- Player-visible behavior before: Potentially incorrect wildlife diagnostics, ecology pressure, or spawn balancing after long runs
- Player-visible behavior after: Pending repair
- Performance impact: Pending measurement; prefer authoritative reconciliation at existing wildlife cadence, not a new tick layer
- New or updated tests: Pending
- Invariants checked: Deer cache equals living deer entities
- Save/migration impact: Pending confirmation
- Rollback plan: Revert the focused wildlife accounting change while retaining the regression test and report
