# Wilderfolk — supplementary simulation audit (2026-11-11)

**Audit basis:** `Rengerams/wilderfolk`, main `926eb5fb73e7600326db72bde7ac7723867d1278`; follow-up implementation in [PR #141](https://github.com/Rengerams/wilderfolk/pull/141).  
**Scope:** authoritative tick clock and layer order, physiology, navigation/commute, seeded repeatability, worker/main parity and long-run verification.  
**Method:** source and existing regression/CI-log review. This is *not* a fresh interactive playtest, a full 720-day continuous simulation, or a 2,500-settler full-year run. Only the CI jobs explicitly named below were observed.

## Verified structural contracts

| Area | Current contract | Evidence / limits |
|---|---|---|
| Clock | `Time.TICKS_PER_HOUR=12`; `TICKS_PER_DAY=288`; `DAYS_PER_YEAR=360`. | `gameConstants.ts`, `dayCycleClock.ts` |
| Layer order | Realtime every tick → systems every four ticks → assignment at 03:00/09:00/15:00/21:00 → daily phase gate at 00:00/06:00/12:00/18:00. Noon has no daily owners. | `gameTick.ts`, `tickLayerAssign.ts`, `tickLayerDaily.ts`, `tests/gameTick.layerOrder.test.ts` |
| Daily ownership | Visitors/idle skill decay/year boundary at 00:00; relationships and apprenticeships at 06:00; production then population/world events at 18:00. Election promises are called from `dailyWorldEvents` only after production. | `tickLayerDaily.ts`, `dailyWorldEvents.ts`, required calendar scheduler CI |
| Human physiology | Sleep recovery `100/7` stamina and rest points per in-game hour; baseline work drain 6/h, walking 5/h, awake leisure 2/h, genuine stationary break +5/h. `advanceHumanNeeds` is the mutation owner. | `simulation/humanPhysiology.ts`, `humanTick.ts`, `tests/humanNeeds.calibration.test.ts`; population-wide bedtime distribution was not measured here |
| Building navigation | Validated facade candidates from `buildingAccessPoints`; single arrival predicate `isAtBuildingReach`; commuter retains a selected facade to avoid oscillation and routes via pathfinding. | `buildingAccess.ts`, `simulation/humanMovement.ts`; no fresh player-save path trace in this audit |
| Worker transport | The existing worker-vs-main test compares live RNG streams and serialized saves, but uses `skipTerrain: true`. | `tests/workerMainThread.parity.test.ts`; full terrain/navigation worker parity remains a separate coverage requirement |

## New findings and audit corrections

| ID | Severity | Finding | Change in PR #141 | Validation |
|---|---|---|---|---|
| SIM-AUD-01 | P1 (test reliability) | The `SIM_SEED` harness argument did not seed `initGame`. The initializer used `nativeRandom()`, which captures the original `Math.random` before the harness override. This invalidated seed-based reproducibility claims. | Pass `seed: SEED` to `initGame` in `scripts/sim-invariants.ts`. [Bug report](../bug_report/2026-11-11-invariant-harness-ignores-sim-seed.md) | Source-confirmed; re-run required |
| SIM-AUD-02 | P2 (coverage) | Worker/main parity advertised five days but ran only 240 ticks (20 hours at the canonical 288 ticks/day). | Run two actual days (`TICKS_PER_DAY * 2`) and explicitly assert two calendar-day crossings before payload/RNG parity checks. [Bug report](../bug_report/2026-11-11-worker-parity-covers-only-20-hours.md) | Source-confirmed; re-run required |

Neither correction changes gameplay, migration, persisted data, domain decision owners or simulation balance.

## Existing CI evidence available at audit time

- [Node.js CI for PR #141](https://github.com/Rengerams/wilderfolk/actions/runs/42998430757): **success** on the preceding head before the two SIM-AUD corrections: 505 test files passed, 3,276 tests passed, 2 skipped, followed by a successful production Vite build. This result does **not** validate the new expanded parity test.
- [Required calendar scheduler](https://github.com/Rengerams/wilderfolk/actions/runs/42998430812): **success**, including the real `gameTick` calendar-boundary checks and `SIM_START_DAY=720 SIM_DAYS=3`. This is a three-day simulation *starting near* Year-2, not 720 consecutive days.
- [120-day producer simulation](https://github.com/Rengerams/wilderfolk/actions/runs/42998430770): **success**, seed 12345, 34,560 ticks, 0 reported invariant violations and 0 stalled ticks; final count 89 settlers. This runner uses the main-thread simulation: its `workerFallbacks: 0` does **not** establish worker transport health.
- The 250, 750 and 1,800-settler [population-performance CI workflows](https://github.com/Rengerams/wilderfolk/actions) passed on that same preceding PR head. These are bounded scenarios and cannot establish multi-year survival at 2,500 population.

## Remaining verification gaps — not claimed fixed

1. **Worker parity on real terrain**: the current test sets `skipTerrain: true`. Extend with a small deterministic terrain fixture if a source-proven divergence appears; keep a bounded CI horizon.
2. **Population-wide sleep and duty balance**: the `~30% stamina at bedtime` calibration has unit coverage, but this audit did not measure real distribution by worker shift length, commute, hospital night shifts, or leisure.
3. **Governance invariants during the short long-sim gate**: `scripts/sim-invariants.ts` calls `assertSimInvariants`; the richer `collectSimulationInvariantErrors` check is separate. Before requiring both on every tick, measure the cost and verify there are no false positives at real day boundaries.
4. **Actual 2,500-person, multi-day performance**: the earlier audit's 60-tick 2,500-person benchmark and the successful 1,800-tier CI do not prove the proposed long-run target on a player's save.
5. **Captive needs and stamina under extreme configured shifts**: existing master-audit items SIM-20/GAME-13 and SIM-21/GAME-16 are gameplay decisions. Do not silently change these contracts in a test-only PR.

## Reproducible commands

```sh
npm test -- unit tests/workerMainThread.parity.test.ts
SIM_SEED=12345 SIM_START_DAY=720 SIM_DAYS=3 npx tsx scripts/sim-invariants.ts
npm test -- calendar-scheduler
npm test -- standard
```

**Exit criteria for this audit amendment:** (1) canonical seed passes into world generation; (2) worker parity crosses two real midnights and compares RNG/save payloads; (3) full PR CI succeeds on the amended head. Any failed check stays a confirmed follow-up and may not be marked green by this document.
