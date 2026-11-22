# Predator breeding and restocking overwhelm prey

- **Status:** investigating — corrective patch proposed in PR #172; long-run ecology not verified
- **Severity:** medium (visible game degradation)
- **Discovered:** 2026-11-22 in simulation-logic audit
- **Source:** passive 90-day runs at seeds 12345 and 777
- **Owner:** `wildlifePopulationPolicy.ts` (all population limits), `worldGen.replenishDepletedWildlife` (restock), `tickLayerSystems.tickWildlife` (breeding/predation), `tickWolfRecruitment` (rare migration)
- **Version:** 0.6.5.1 development toward 0.6.5.2

## Observed / expected

Both passive 90-day audit runs ended with **rabbits 0 / wolves 25**, even without hunters. The prey base should recover naturally and remain available for ecology and hunting, while apex predators cannot exceed what the valley feeds.

## Root cause

Wolf breeding previously had a local cap of 25 but three-day restocking targeted 10. Rabbit refill targeted 150 while breeding stopped at 120. Predator restock had unconditional low-population branches that ignored prey, and occasional wolf migration could also bypass a low food supply. Scarce rabbits were not protected from wild and tamed predator catches.

## Fix proposed (PR #172, consolidated from #173)

- `wildlifePopulationPolicy.ts` owns all nominal breeding caps, refill floors and refill targets; `getWildlifeCarryingCapacity` additionally bounds predators by live rabbit/deer/fox supply.
- Rabbit ceiling and refill target: 150; rabbit scarcity refuge: 35. Wolf ceiling: 6, refill target: 4; fox ceiling: 8, refill target: 6. Both predator refill, natural breeding and rare wolf migration use the same prey-supported capacity.
- Initial predator groups now count the camp ring inside policy targets rather than spawning 14 foxes and 6 wolves on day zero.
- Predator catches (including tamed assistance) respect the live rabbit refuge count, including natural deaths earlier in the pulse; a wolf gains more energy from a rabbit to discourage repeat kills.
- The existing daily/tick pipeline, save compatibility, and canonical source owners remain unchanged. No second policy/scheduler was added.

## Verification

Focused regressions in `tests/wildlife.populationPolicy.test.ts` cover nominal target/ceiling consistency, predator carrying capacity, zero-prey refill, initial groups, natural-death rabbit scarcity boundaries and wolf energy.

```bash
npx vitest run tests/wildlife.populationPolicy.test.ts
npm run build
npx tsx scripts/run-full-year.mts --days=90 --seed=12345
npx tsx scripts/run-full-year.mts --days=90 --seed=777
npx tsx scripts/run-full-year.mts --days=360 --seed=12345
```

**Verification status:** the 90-day baseline is supported by the earlier audit only. The consolidated code has been committed, but *post-fix 90/360-day outcomes are not yet verified*; quantitative ecosystem calibration remains required. This report is not marked resolved until rabbits survive and predators remain sustainable on the comparable seeded scenarios.

## Save compatibility

No new serialized fields or migrations. Existing saves with oversized predator packs are not truncated; breeding/restock/recruitment respect the lower carrying capacity and ordinary population changes reduce excess numbers over time.

## Status history

- 2026-11-22: discovered through simulation audit, reproduced at two seeds (pre-fix).
- 2026-11-22: patch from PR #173 folded into #172 with a single wildlife policy owner; CI/ecology outcome under verification.
