# Virtual Player underplans food production and cannot recover a short-handed Farm

- Bug: The Virtual Player plans a two-worker Farm for nine residents despite only 22 nominal daily food output and can leave a food site unstaffed while all other posts are occupied.
- Status: resolved
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
- 2026-11-06 — resolved: full trace showed attendance-limited yield (~11 food/site/day, not 22) and a serial food-build gate that fell behind population growth. Capacity is now planned at 5 mouths/site (4 in a measured deficit), a measured deficit keeps two food sites rising, and the deficit switches the staffing preset before touching workers. Both the 90-day colony gate and the 100-day producers run finish healthy with food in store.

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
Verified by a full 90-day trace (seed 12345, producers scenario, bot active) rather than inference.
- **The yield the plan assumed was not the yield the colony got.** `12 + workers × 5` is 22 food a day for a two-worker Farm only before attendance: `getWorkplacePresenceShare` pays the crew for hours actually spent on post, and the traced farms produced ~11 food a day, about `5.7` per food worker, while a settler eats ~2.7 a day. Break-even is therefore ~4 mouths per site, not the six the old `SETTLERS_PER_FOOD_PRODUCER` planned (and not the nine before that).
- **Capacity grew slower than the mouths.** `decideFood` refused to start another food site while any food site was still under construction or below its crew cap, so the colony built roughly one site every five days while population grew ~1.5 a day. The trace shows the stores falling steadily from day 39 even though the bot wanted more capacity, and the plan target was reached at about six mouths per site while the real break-even was four.
- **The deficit never re-prioritized staffing unless a site was already short.** The survival switch sat behind `firstUnstaffedFoodProducer`, so a colony whose sites were fully crewed but under-producing kept its old policy.
- Placement space was **not** a limiter: a legal Farm spot stayed within search ring 7 of 8 for the whole run.

## Fix / proposed fix
- `VirtualPlayer.SETTLERS_PER_FOOD_PRODUCER` is 5 and the measured-deficit target 4, matching the attendance-limited yield (and the four-mouth break-even) instead of the nominal 22-food Farm.
- `decideFood` caps construction at the plan in every mode, so a shortage cannot build forever, but real hunger (`shortOnFood`) still outranks the plan.
- During a measured deficit the bot keeps **two** food sites going up at once and no longer waits for an already-finished site to be crewed before raising the next one; outside a deficit the one-site-at-a-time rule is unchanged.
- The survival-preset switch now runs on any measured deficit, not only when a food site is already short of a crew; it still precedes every worker move.
- Existing rules kept: partially staffed Farms are auto-staffing targets, manual posts are never overridden, and a critically short larder releases one movable worker from a noncritical automatic job through the normal `removeWorker` command.
- Focused tests added for parallel deficit building, the two-site cap, the plan cap, the unchanged one-at-a-time rule and the deficit policy switch; the producer-colony acceptance tests are unchanged.

## Save/migration impact
No save schema changes. Only Virtual Player decisions and tuning are changed; ordinary gameplay economy/physiology are not altered.

## Verification result
- PASS (local reproduction, 2026-11-06, before the fix): `npx vitest run tests/longRunColony.integration.test.ts` — FAIL, day-90 `stalled(food-exhausted)`, stored 0.
- PASS (trace): seeded 90-day producers trace measured the real yield, the build gates and the policy order; placement stayed legal through ring 7 of 8.
- PASS (90-day colony gate, after the fix): `npx vitest run tests/longRunColony.integration.test.ts` — PASS, `healthy`, day-90 stored 2293 with 102 settlers.
- PASS (100-day producers run, after the fix): `npx tsx scripts/run-full-year.mts --scenario=producers --days=100 --bot` — PASS, `colony=healthy`, no food-exhaustion checkpoints; day 30/60/90/100 stored 3501/3436/2013/1589.
- PASS (focused): `npx vitest run tests/virtualPlayer.test.ts tests/virtualPlayerHealthVerdict.test.ts` — 130 passed.
- PASS (checks): `npm run test:types`, `npm run lint`, `npm run build:ci` — all clean.
- Residual risk: the last 30 days still consume slightly more than they produce (day 100 net ≈ −38 a day against 1589 in store), so a materially longer or faster-growing run would need the same yield review again; the 100-day gate itself is met.
