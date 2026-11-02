# Housing settlement depends on the order settlers are supplied

- Bug: the same colony, in the same state, settles into different homes when the settler array is
  supplied in a different order — 18–30 settlers per generated colony changed home.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `d37efff9`
- Reporter: generated invariant suite (`tests/housingPipeline.invariants.test.ts`)
- Area: housing assignment
- Owner module: `src/game/housingPipeline.ts` (unit ordering)
- Related PR/commit: none yet

## Status history

- 2026-11-02 — open: reproduced on generated colonies 1–8 by reversing the settler array.
- 2026-11-02 — resolved: units now carry a lowest-member-id key as the final sort tie-break; 0
  differences on 12 seeds and the property is pinned in the invariant suite.

## Observed behavior

`buildHousingColony(seed)` settles one way; the identical colony passed through
`assignMissingResidences([...humans].reverse(), ...)` settles differently:

| seed | settlers with a different home |
| ---: | ---: |
| 1 | 28 |
| 2 | 26 |
| 3 | 27 |
| 4 | 18 |
| 5 | 30 |
| 6 | 20 |
| 7 | 24 |
| 8 | 30 |

The colony is the same set of entities, relationships and homes; only the array order differs.

## Expected behavior

Settlement should depend on the set of settlers and the world state, not on the order they are
supplied. That is the determinism rule the simulation relies on for worker hand-off, save/load and
rollback: a reordered entity list must not reshuffle who sleeps where.

## Reproduction steps

1. `const first = buildHousingColony(1); assignMissingResidences(first.humans, first.buildings, first.humans);`
2. `const second = buildHousingColony(1); assignMissingResidences([...second.humans].reverse(), second.buildings, second.humans);`
3. Compare each settler's `residenceBuildingId`: 28 of them differ.

## Root cause

`sortHousingUnitsForAssignment` ordered units by need (needs reassignment first) and then by size,
but had no final tie-break. Equal-need, equal-size units therefore kept the order in which
`buildHousingUnits` produced them, which follows the input array. Competing households then claimed
the same limited homes in arrival order.

## Fix

`residencySelection.lowestMemberId` (lowest member id, a stable key) is now the final sort tie-break,
and `housingUnitBucket` reuses it (it previously carried its own copy of the same loop). The
processing order — and therefore the settlement — is now a function of the units, not of the caller's
array order.

## Regression coverage

- `tests/housingPipeline.invariants.test.ts`: "settles the same colony the same way whatever order
  the settlers arrive in", six seeds. Fails without the tie-break (28 differing settlers on seed 1),
  passes with it.
- The owner-level picker tests (`tests/residenceBestFit.owner.test.ts`) still pin the id tie-break.

## Save compatibility

None: no schema change. Saves already store the settled homes; a load re-runs reconciliation and now
converges to the same assignment regardless of entity order.

## Verification

- `npx vitest run <34 housing suites>` — 34 files, 149 tests pass (the invariant file gained the
  order property).
- Manual order check — 0 differing settlers on seeds 1–12 after the fix.
- `npm run test:types`, `npm run lint`, `npm run build` (semantic-overlap gate included) — pass.
