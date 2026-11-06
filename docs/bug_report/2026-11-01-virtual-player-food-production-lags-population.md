# Virtual Player underplans food production and cannot recover a short-handed Farm

- Bug: The Virtual Player plans a two-worker Farm for nine residents despite only 22 nominal daily food output and can leave a food site unstaffed while all other posts are occupied.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-01
- Version/build: PR #118 at be16be23478342c38101ad2e243b2e6b37c7ff16 (also reproduced on 3ac1fda02b9975f22a0efb4e92c3442144efc84e)
- Reporter: 100-day producer-colony GitHub CI, seed 12345, bot enabled
- Area: Virtual Player food decisions and workforce recovery
- Owner module: src/game/virtualPlayer.ts (proposals), src/game/gameConstants.ts (policy parameters); existing workforce owner applies all job transitions
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/118

## Status history
- 2026-11-01 — open: GitHub CI independently reproduced identical starvation on the prior and current PR heads.
- 2026-11-01 — investigating: policy and focused regressions committed; complete run and CI verification not established.
- 2026-11-06 — investigating: reproduced locally through the Vitest 90-day colony gate on seed 12345; day-90 food exhausted with the same checkpoint economics as CI.

## Observed behavior
The producers scenario ran without refilling stores and failed at day 90. Population rose from 50 on day 30 to 91 on day 60 and 124 on day 90. In the final 30 days, food produced was 5,429 and food consumed was 8,835, leaving zero food. Ten Farms had 20 assigned workers; 86 people were working with no idle workers. CI on 2026-10-29 and 2026-11-01 shows the same day-90 food, population, worker totals and output, so the GameLoop catalog work did not introduce this failure.

Local run on 2026-11-06 (`tests/longRunColony.integration.test.ts`, seed 12345, 90 days): day 30 stored 3538, day 60 stored 2638, day 90 stored 0, with the last 30 days producing 5432 against 8278 consumed and 108 settlers — the same exhaustion, reproduced twice.

## Expected behavior
Auto-play should plan food capacity against achievable daily throughput, prioritize food work during a measured supply deficit, respect manual staffing, avoid no-op hourly actions, and not continue recruiting while food supply is shrinking. The 100-day seeded producer scenario should keep its no-restocking starvation assertion.

## Reproduction steps
1. Run `npx tsx scripts/run-full-year.mts --scenario=producers --days=100 --bot --verbose` with seed 12345.
2. Read the day-30, day-60, and day-90 checkpoint fields `health.food.last30Days` and `health.workforce`.
3. Observe `Producer-colony food exhaustion at day 90`, despite 20 assigned Farm workers.

## Evidence
`gameConstants.VirtualPlayer.SETTLERS_PER_FOOD_PRODUCER` was 9, based on an obsolete 27-food fully staffed Farm assumption. `dailyBuildingEconomy.tickBuildingProduction` actually uses `12 + workers * 5` (22 with the Farm's two-worker cap), multiplied by real attendance and environmental effects. `workforce.rebalanceJobWorkers` can transfer only from overstaffed donors while respecting essential staffing and cooldowns, so an empty Farm cannot reliably draw a worker from a single-worker noncritical job. The long-run failure is deterministic in two independent GitHub CI runs.

## Root cause
Verified: normal producer sizing uses a nominal output incompatible with the real production formula, while workforce recovery cannot fill a needed Farm if other auto-managed workplaces are each at minimum coverage. Further starvation causes (available placement space, actual attendance, and growth dynamics) require a new full simulation trace and are not yet ruled out.

## Fix / proposed fix
- Plan a Farm for no more than six residents under nominal throughput (not a promise of real yield); the deficit target remains stricter at five.
- Treat partially staffed Farms as possible targets for the existing auto-staff pass.
- During a genuine sustained food deficit, switch the automated staffing preset to survival before moving workers.
- If no legal overstaffed donor exists and food stores are critically short, release one movable worker from a noncritical automatic job through the normal `removeWorker` command, which allows the workforce owner to refill food sites. Never reassign from a manual job.
- Add focused tests for smaller producer capacity, staffing an empty Farm from a lower-priority job, preserving manual jobs, and restoring survival policy.
- Keep the full-year producer-colony acceptance test and food exhaustion failure unchanged.

## Save/migration impact
No save schema changes. Only Virtual Player decisions and tuning are changed; ordinary gameplay economy/physiology are not altered.

## Verification result
- PASS (source trace): production formula, farm cap, staffing and decision priorities inspected.
- PASS (prior reproduction): 2026-10-29 and 2026-11-01 GitHub Actions both failed on day 90 with identical food economics.
- PASS (local reproduction, 2026-11-06): `npx vitest run tests/longRunColony.integration.test.ts` — FAIL, day-90 `stalled(food-exhausted)`.
- NOT RUN: new focused Vitest tests or the updated full-year seed since code changes (connected GitHub environment, no local test checkout).
- NOT RUN: new head TypeScript, lint and build at documentation time.
