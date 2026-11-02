# Housing refill proposes a home the run already visited, leaving a household homeless

- Bug: after the capacity phase unhouses one member of a split household, the refill picks that same
  home for the reunited household, `relocateHousehold` refuses it as already visited, no alternative
  is tried, and the household stays outside until the next assignment run.
- Status: resolved (T0 commit `95ca783a`)
- Severity: high
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `95ca783a`
- Reporter: generated invariant suite (`tests/housingPipeline.invariants.test.ts`), seed 2
- Area: housing assignment
- Owner module: `src/game/housingPipeline.ts` (assignment and ranking)
- Related PR/commit: none yet; discovered while replacing the housing test suite

## Status history

- 2026-11-02 — open: reproduced on generated colony seed 2. No fix attempted; pinned by the new
  invariant suite.
- 2026-11-02 — resolved in `95ca783a`: the placement retries past a refused destination. Seed 2
  housed the family on the first run and the second run became a no-op under the original fixture;
  the 33 housing suites and the invariant suite passed.

## Impact in current play

Every live residence write is capacity-guarded (`humanLifecycle` birth, `moonHowlerForm` restore,
`assignMissingResidences`), so a fresh colony does not overfill a home and the capacity phase has
nothing to evict. The precondition is therefore an over-capacity state that already exists — a
legacy save, an imported world, or the unguarded `revertToHumanForm` path when called without
buildings/humans (`moonHowlerForm.ts:125`, reachable only from `finalizeMoonHowlerDeath`, whose
death cleanup clears the bed immediately). In those cases the symptom is the same: a household
outside while beds exist, until the next housing run.

## Observed behavior

Starting from `buildHousingColony(2)` (a couple #13/#14 with minor #37; #13 in house #104, #14 in
house #100, #37 unhoused), one `assignMissingResidences` run leaves:

```
13:104  14:-  37:-      # after the first run
```

The first run's report contains exactly one move for this family: the capacity phase unhouses #14
alone (`{ phase: 'capacity', reason: 'family', members: [14], from: 100 }`). Nothing rehouses #13,
#14 or #37 in that run. A second run with the same state then moves all three together:

```
13:100  14:100  37:100  # after the second run
{ phase: 'homeless', reason: 'assignment', members: [13, 14, 37], from: 104, to: 100 }
```

So a second run changes state that the first run left settleable — the pipeline is not idempotent for
this colony, and a family sleeps outside while beds exist.

## Expected behavior

- A household is left unhoused only when no legal home exists (`HOUSING_ARCHITECTURE.md` §5; the
  "no homeless while beds exist" rule).
- A run must be idempotent: a second run on the same state produces no relocations
  (`HOUSING_ARCHITECTURE.md` §3, `tests/housingAuthority.pipeline.test.ts`).
- A proposed destination must be one the writer accepts — the document's "one joint check" claim.

## Reproduction steps

1. `buildHousingColony(2)` from `src/test/housingColony.ts`.
2. `assignMissingResidences(colony.humans, colony.buildings, colony.humans)`.
3. Observe #13 in #104, #14 and #37 unhoused.
4. Repeat the call: all three move to #100.

Minimal script used (scratch, removed after the investigation):

```ts
const c = buildHousingColony(2);
const r1 = assignMissingResidences(c.humans, c.buildings, c.humans);
const r2 = assignMissingResidences(c.humans, c.buildings, c.humans);
```

## Root cause

Confirmed by code trace:

1. The capacity phase evicts #14 from #100 because the unit's whole-family placement fails at that
   moment. `relocateHousehold` records the destination in the run ledger: #14's `visited` set now
   contains #100.
2. The later refill (`fillHomelessAfterEviction` → `assignFamilyToResidence`) asks
   `pickResidenceForFamily` for the whole unit. The scorer prefers the empty, lowest-id home that fits —
   #100 — because the picker has no knowledge of the ledger's `visited` set.
3. `relocateHousehold` → `householdMayMove` refuses the destination because member #14 already held it
   this run. `assignFamilyToResidence` treats the refusal as final: there is no "next-best" attempt.
4. The household stays outside for the rest of the run; the next run allocates a fresh ledger, so the
   same pick is accepted.

The picker and the writer disagree about what a legal destination is — the exact failure the
single-decision contract (`planRelocation`, G1/G3 in the pipeline plan) is meant to make impossible.

## Fix

Implemented in the current code (no planner required): `relocateFamily` ranks the household, applies
it, and on a refusal retries with that destination excluded, up to three attempts, before falling
back to the split path. `pickResidenceForFamily` gained an optional excluded-id set (and `anyOpenBeds`
honours it so the shortage score matches the candidates). The planner's G1/G3 contract keeps the same
guarantee when it lands: a destination the writer refuses is never returned as the decision.

## Regression coverage

- `tests/residenceBestFit.owner.test.ts`: "skips a destination the run has already refused" pins the
  new exclusion capability (the unexcluded pick is asserted first, so ignoring the exclusion fails).
- `tests/housingPipeline.invariants.test.ts`: "houses a family the capacity phase split while beds
  remain" and "leaves a settled colony unchanged on a second run". Both were pinned as `it.fails`
  while the defect was open and passed after the fix, against the generator as it stood then.
- **Known gap:** the generator was afterwards switched to the `simRng` seeded factory
  (`createSeededRng`), which changes the sequence; the original seed no longer reproduces the
  refusal, and a wider seed/shape scan has not yet found a replacement. A focused fixture that
  forces a visited destination (capacity eviction + refill into the same home) is still TODO, so the
  end-to-end retry is currently covered by the owner-level exclusion test and the original
  reproduction, not by a failing-before pipeline case.
- The full housing suite passed on the fixed tree: 34 files / 148 tests with T0 (33 existing
  plus the invariant suite).

## Save compatibility

None: in-memory state only, no schema change. Existing saves are unaffected apart from the same
in-run ordering.

## Verification

- `npx vitest run tests/housingPipeline.invariants.test.ts` — 6/6 pass.
- `npx vitest run tests/residenceBestFit.owner.test.ts` — 5/5 pass, including the exclusion case.
- `npx vitest run <34 housing suites>` — 34 files, 148 tests pass on the T0 tree (33 existing + the
  invariant suite).
- `npm run test:types`, `npm run lint`, `npm run check:source`, `npm run build` — all pass on the
  merged state (the build's semantic-overlap gate included). A concurrent edit by another agent
  (`moveCounter`) landed in the same module during this work and is part of those runs.
