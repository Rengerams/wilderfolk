# Predator breeding and restocking overwhelm prey

- **Status:** investigating — corrective patch proposed; gameplay balance unverified
- **Severity:** medium (visible game degradation)
- **Discovered:** 2026-11-22
- **Source:** simulation-logic audit on `audit-simulation-logic` at `5722a330`
- **Owner:** `speciesConfig.ts` (population policy); `worldGen.replenishDepletedWildlife` (refill); `tickLayerSystems.tickWildlife` (breeding); `tickWolfRecruitment` (occasional recruitment)
- **Version:** 0.6.5.1 development toward 0.6.5.2

## Observed / expected

The passive 90-day seeded full-year harness produced **0 rabbits / 25 wolves** at day 90 for both seeds 12345 and 777, leaving hunting and prey-based ecology depleted. Grazers should have a sustainable chance to recover; predators should not automatically restock or reproduce beyond the available prey base.

## Root cause

Breeding used local constants (rabbit cap 120; wolf cap 25) while `worldGen` independently replenished rabbits toward 150 and wolves toward 10. The predator refill logic had unconditional low-count branches, allowing predators to reappear even with no prey. The rare `tickWolfRecruitment` spawner did not gate against prey supply.

## Implemented proposal

- `speciesConfig.WILDLIFE_POPULATION_POLICY` is the common source for reproductive caps, restock floors and restock targets.
- `getWildlifeCarryingCapacity` limits foxes by rabbit availability and wolves by the mixed rabbit/deer/fox base; the three spawn/reproduction paths reuse it.
- Reduced initial and replenished predator targets; retained original ecology/tick cadence, save layout and existing spawn owners.
- Added `tests/wildlifePopulation.policy.test.ts` for target-cap consistency, prey-dependent capacity and zero-prey refill behavior.

## Reproduce and verify

```bash
npx vitest run tests/wildlifePopulation.policy.test.ts
npx tsx scripts/run-full-year.mts --days=90 --seed=12345
npx tsx scripts/run-full-year.mts --days=90 --seed=777
npx tsx scripts/run-full-year.mts --days=360 --seed=12345
npm run build
```

**Verification status:** the original failing 90-day numbers are from the supplied audit, not a new run. The regression tests and implementation are committed, but full-year post-fix outcomes and CI checks still require verification. Do not mark this bug resolved until rabbits survive and predators remain bounded across the comparable seeds.

## Save compatibility

No serialized fields or migrations were changed. Existing high predator populations are not truncated on load; breeding and replenishment stop exceeding the new carrying capacity and natural attrition must bring existing packs down.

## Status history

- 2026-11-22: Reported from passive 90-day runs (rabbits 0 / wolves 25); patch proposed on `fix/wildlife-prey-predator-balance-20261122`; verification pending.
