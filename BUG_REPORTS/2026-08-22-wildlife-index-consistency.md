# Bug: Daily wildlife changes left denormalized indexes stale

- Status: resolved — live verification pending
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 development working tree
- Reporter: Automated one-year invariant harness
- Area: Truth | worker | simulation
- Owner module: `gameTick.ts`, wildlife spawn bookkeeping, entity-type index maintenance
- Cadence: Systems / daily / post-tick reconciliation

## Status history

- 2026-08-22 — open (the one-year harness first reported a deer population-count mismatch)
- 2026-08-22 — investigating (daily wildlife replenishment was traced to direct entity-list mutation)
- 2026-08-22 — resolved — live verification pending (focused repair applied; one-year run completed with zero invariant violations)

## Observed behavior

The first current-tree one-year run failed at tick 17,496 with `wildlifeCounts.deer 60 != actual 70`. After routing daily wildlife spawns through the authoritative insertion path, the next run exposed a second stale-index failure at tick 18,000: `entityByType has 613 entities but 611 alive`.

## Expected behavior

Wildlife population counts and `entityByType` must reflect the authoritative living entity collection after every tick, including daily replenishment and same-tick deaths.

## Reproduction steps

1. From `C:\Wilderfolk`, run `$env:SIM_YEARS='1'; npx --no-install tsx scripts/sim-invariants.ts`.
2. Use the current working tree and default harness setup.
3. Before the repair, observe either the deer-count or stale-type-index violation during the long run.

## Evidence

Before the repair:

- `wildlifeCounts.deer 60 != actual 70` at tick 17,496 / day 243.
- `entityByType has 613 entities but 611 alive` at tick 18,000 after the first insertion-path repair.

After the repair:

- TypeScript check passed.
- Focused invariant/wildlife tests passed.
- One-year harness completed `OK — 1y (25920 ticks) sim clean, 0 invariant violations`.

## Root cause

Daily `replenishDepletedWildlife()` called spawn helpers that appended directly to `state.entities` after `gameTick()` had built its pre-daily `allAlive` array and population snapshot. This left denormalized counts one daily update behind. The subsequent fix merged same-tick entities into the final array but did not force a fresh type-index rebuild after daily lifecycle work, allowing stale buckets to survive.

## Fix

Daily replenishment now accepts an insertion callback and uses `pushNewEntity(state, ctx, entity)`, preserving the existing Simulation Authority insertion path and `ctx.newEntities`. `gameTick()` merges same-tick entities before final state assignment, recomputes final population counts, and rebuilds the type index whenever the daily layer ran.

## Regression test

The existing invariant and wildlife tests pass. The one-year invariant harness is the long-run regression evidence. A future deterministic seeded harness should preserve this coverage against repeatable lifecycle profiles.

## Invariants checked

- `wildlifeCounts` equals the living wildlife population.
- `entityByType` contains living entities only and matches the authoritative population.
- Same-tick daily wildlife spawns are retained exactly once.
- Wildlife removals update the entity map and indexes.
- No new tick layer or second mutation owner was introduced.

## Save/migration impact

No save schema change. The repair changes same-tick authoritative bookkeeping only. Save-load already recomputes wildlife counts from entities; no migration is required.

## Verification result

Automated verification is complete for the current run. A live browser check and a deterministic seeded long-run harness remain pending.

## Related commits or files

- `src/game/worldGen.ts`
- `src/game/tickLayerDaily.ts`
- `src/game/gameTick.ts`
- `src/game/simulation/simInvariants.ts`
- `src/game/simulation/simulationEntities.ts`
- `scripts/sim-invariants.ts`
- `tests/simulation.invariants.test.ts`
- `tests/huntingSpot.cleanup.test.ts`
- `tests/migration.herds.test.ts`

## Simulation Change Record

- Owner module: Wildlife insertion and game-tick post-reconciliation
- Decision changed: Daily wildlife spawns now enter through the existing authoritative context path; final denormalized indexes refresh after daily work
- Cadence: Systems/daily with post-tick reconciliation
- State fields written: `ctx.newEntities`, `state.entities`, `state.wildlifeCounts`, `state.entityByType`
- Why the change is needed: Prevent stale population caches and type buckets after same-tick wildlife lifecycle changes
- Player-visible behavior before: Long-play ecology counters and wildlife-related systems could diverge from the animals actually present
- Player-visible behavior after: Wildlife bookkeeping remains synchronized after replenishment and daily lifecycle changes
- Performance impact: One final population/type pass on daily-layer ticks only; no new tick layer
- New or updated tests: Existing focused invariant/wildlife suite plus one-year harness evidence
- Invariants checked: Wildlife counts, type buckets, living entity identity, same-tick insertion
- Save/migration impact: No schema impact
- Rollback plan: Revert the callback and post-daily reconciliation changes together with this regression report
