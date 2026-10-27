# Wilderfolk — Human Needs Architecture (PR #62)

**Status:** architecture of the implementation on the PR branch, 27 October 2026. This is not a claim that issue #61's end-to-end acceptance criteria have passed.

**Scope:** player-controlled human settlers. Wildlife, animals, visitors, rivals, caravans and Moon Howler forms keep their existing energy and economy contracts except where an explicit transformation or captive transition applies.

## 1. Architecture rules

1. The serialized `Entity.needs` record is authoritative for player-human nutrition, rest and stamina. `Entity.energy` is a one-way derived stamina projection kept temporarily for old readers.
2. `simulation/humanPhysiology.ts` contains the single parameter set `HUMAN_NEEDS` and updates physiological reserves. Read-only intent/work queries do not latch intentions.
3. `simulation/humanNeeds.ts` owns meal eligibility and the one `spendFood(state, 'meals', amount)` transaction. It credits nutrition only *after* payment.
4. `humanTick.ts` gathers observed activity, calls the physiology owner once before the off-screen early exit, and delegates actions and deaths.
5. Existing specialists retain control of health/treatment, jobs, housing, movement, sleep eligibility, economic production and fatality bookkeeping. Physiology must not silently become a second authority for these domains.

## 2. Source map

| Component | Responsibility | Important entry points |
| --- | --- | --- |
| `src/game/gameTypes.ts` | Serializable `HumanNeedsState` schema, optional `Entity.needs`, saved Moon Howler form state | `HumanNeedsState`, `Entity` |
| `src/game/simulation/humanPhysiology.ts` | Needs configuration, normalization, single time advance, read-only priority, effect application | `HUMAN_NEEDS`, `advanceHumanNeeds`, `resolveHumanNeedsIntent` |
| `src/game/simulation/humanNeeds.ts` | Meals, captive-compatible energy drain, hunger death action, hunt helpers | `canEatColonyMeal`, `tryEatColonyMeal`, `killFromStarvation` |
| `src/game/humanTick.ts` | Realtime observation, action dispatch, off-screen branch, prison and night-shift integration | `tickHumans` |
| `src/game/economyLedger.ts` | Authoritative debit/accounting for meals, with other producers and sinks unchanged | `spendFood` |
| `src/game/workforce.ts`, `src/game/workshopEconomy.ts`, `src/game/dailyBuildingEconomy.ts` | Work rosters, attendance and bounded output multipliers | Existing work/economy entry points |
| `src/game/hospitalCare.ts`, `src/game/simulation/humanLifecycle.ts` | Medical recovery and birth/pregnancy consequences, translated to physiological stamina when applicable | `treatPatientAtHospital`, `tickPregnancyAndBirth` |
| `src/game/saveSchema.ts`, `src/game/saveLoad.ts`, `src/game/entityFactory.ts` | New-spawn initialization, persisted field allow-list and legacy-save normalization | `initialHumanNeeds`, `normalizeHumanNeeds` |
| `src/game/simWorker/simPrep.ts`, `src/game/simBuffers/entityRenderMeta.ts` | Worker snapshots and render metadata copies | `extractSimPrep`, `packEntityRenderMeta`, `buildRenderEntityShim` |
| `src/components/SelectedEntityPanel.tsx`, `src/game/humanStatus.ts` | Inspector numbers and read-only activity status | UI/status selectors |
| `src/game/simulation/decisionRegistry.ts`, `OWNERSHIP_OVERVIEW.md` | Machine-checkable and human-readable ownership inventories | `humanPhysiology`, `humanMeals` registry keys |

## 3. Authoritative realtime flow

    gameTick / tickLayerRealtime
      -> tickHumans (each eligible player human)
         -> observe position, schedule, shift, actual sleep, movement and environment
         -> advanceHumanNeeds(entity, observation) [once per tick; persisted lastAdvancedTick]
              -> nutrition -= elapsed hours × (baseline + work + travel)
              -> rest += verified sleep recovery OR -= awake drain
              -> stamina += sleep/idle recovery OR -= work/walking load
              -> severeHungerTicks, break and night-duty recovery hysteresis
              -> energy = maxEnergy × stamina / 100 [derived only]
         -> resolveHumanNeedsIntent(entity, tick, sleeping) [read-only]
              -> eat? -> tryEatColonyMeal -> spendFood('meals') once
                     -> creditHumanNutritionFromFood -> stamp lastMealTick
              -> sleep/break? -> existing movement/schedule/eligibility action
         -> hasFatalStarvation? -> killFromStarvation -> existing kill/log hooks
         -> prison/deployment/offscreen/focused behavior
         -> work and render facts; eventual save and worker delta

**Ordering:** the simulation observes current activity before calculating the next need-driven action. A meal is only credited following a successful food debit. The `lastAdvancedTick` guard prevents a duplicate physiology advance for the same tick even if a caller is re-entered. Off-screen skipping must not skip the physiology update.

**Observed sleep:** the current caller considers home-sleep rules, hotel lodging, cell proximity at night and near-residence daytime recovery intent. These routes require separate integration checks against actual building/bed occupancy; near-residence recovery must not become a free sleep source.

## 4. State and tuning

The persisted needs schema includes numerical `nutrition`, `rest`, `stamina` (all clamped to 0–100), plus optional `severeHungerTicks`, `lastMealTick`, `lastAdvancedTick`, `breakUntilRecovered`, `nightDutyRecoveryPending` and `sleepRecoveryUntilTick`. Transient statuses such as hungry/exhausted are derived, not independently persisted.

`HUMAN_NEEDS` sets the physiological rates and thresholds. The implementation currently uses baseline nutrition 1.2 per simulated hour (plus work 0.16 and movement 0.12), food credit 10 nutrition per food unit, rest -4/hour while awake or +12/hour in verified sleep, and stamina -9/hour at work, -5/hour moving, +5/hour idle or +13/hour asleep. Starvation becomes lethal only after 48 simulated hours in the severe-hunger band; this is counted in ticks rather than a second energy-death path.

Need decisions use a hunger threshold of 70, a two-hour meal cooldown, a critical rest threshold of 20, a critical stamina threshold of 15 and a break-recovery threshold of 50. Night work records a pending daytime-recovery need. `getHumanNeedsWorkMultiplier` bounds needs-related output reduction (minimum 0.55); existing schedule overload is kept separate.

`Human.DAILY_FOOD_CONSUMPTION` in `gameConstants.ts` remains a *planning estimate* for the virtual player, not a second consumption transaction. The legacy `Human.MEAL_CHECK_INTERVAL_HOURS`, `Human.HUNGER_MEAL_THRESHOLD` and `Human.MEAL_ENERGY_RESTORE` parameters are only used by foreign war captives; the former forwarding aliases in `humanNeeds.ts` are not part of the API.

## 5. Function ownership and registration

Two explicit registrations exist in `SIMULATION_DECISIONS`:

**`humanPhysiology`** — `initialHumanNeeds`, `normalizeHumanNeeds`, `advanceHumanNeeds`, `resolveHumanNeedsIntent`, `getHumanNeedsWorkMultiplier`, `hasFatalStarvation`, `creditHumanNutritionFromFood`, `adjustHumanStaminaFromEnergy`.

**`humanMeals`** — `isMealCheckHour`, `canEatColonyMeal`, `tryEatColonyMeal`, `killForeignCaptiveFromExhaustion`, `killFromStarvation`, `fract`, `freeHuntFoodGain`, `humanEnergyLoss`.

Every exported function in those two files must appear in its decision-registry owner row *and* in `OWNERSHIP_OVERVIEW.md`. `tests/simulation.decisionRegistry.test.ts` verifies this invariant by extracting source exports. Private implementation helpers belong to their enclosing owner and do not receive duplicate global registrations.

No re-export wrapper is needed for meal scheduling constants: callsites read their original `Human` owner directly. The consolidated `adjustHumanStaminaFromEnergy` owns conversion from older point-valued effects to the new stamina reserve; removing a wrapper must not create a second direct `energy` writer.

## 6. Migration and world boundaries

- **Creation:** `entityFactory.ts` initializes player-human needs. Foreign humans without player ownership must not silently take on the colony ledger.
- **Load:** `saveSchema.ts` persists `needs`; `saveLoad.ts` normalizes legacy or malformed values while leaving old saves loadable.
- **Moon Howler:** transformation keeps a copy in saved human form state, then drops the live human-needs field in nonhuman form; reverting restores it and projects stamina into `energy`.
- **Worker/render:** `simPrep.ts` and `entityRenderMeta.ts` clone nested needs rather than sharing writable objects; inspector read paths must not mutate the simulation.
- **Prison:** prisoners may remain employed in the workforce registry; roster restoration on timed release and escape must preserve a valid workplace assignment.
- **Foreign captives:** retain hourly legacy food/energy semantics and exhaustion death. Their meal debit uses the same ledger, but they are intentionally excluded from player physiology.

## 7. Verification and remaining acceptance risks

Relevant regression suites: `tests/humanNeeds.mealRule.test.ts`, `tests/humanNeeds.calibration.test.ts`, `tests/simulation.decisionRegistry.test.ts`, `tests/civicPetition.cadence.test.ts`, `tests/prisonStay.holdsHomeAndPost.test.ts`, `tests/simBatch.prisonEscapes.test.ts` and `tests/workAbsence.reasons.test.ts`.

Standard project commands (run in the repository's supported PowerShell environment):
- `npm run check:source` — source lint and structural checks.
- `npm run test:standard` — standard tests including ownership registration.
- `npm run build` — type checks, lint, duplicate-code checks and production build.
- `npm run test:full-year` — full-year invariant run; inspect the dedicated seeded-colony workflow for measured demand/production, not merely a healthy verdict.

**Still not verified by this documentation:** sustainable 7/30/360-day food balance, every remaining human `energy` reader/writer, a full current-head CI run, real bed occupancy in each sleep path, and worker on-screen/off-screen equivalence. Previous PR notes report a day-120 food stockout and a day-330 workforce invariant failure; those reports are historical evidence, not current-head verification. Keep PR #62 a draft until the issue #61 acceptance matrix and fresh checks pass.

## 8. Maintenance rules

When adding a human need, first amend `HumanNeedsState` and the single `HUMAN_NEEDS` owner. Change `advanceHumanNeeds` for progression, `resolveHumanNeedsIntent` for priorities, and existing action modules for resulting actions; do not add a second tick branch with its own reserve arithmetic. Register new exported ownership functions in both registries and update the regression test. Every food charge must pass through `spendFood` exactly once.
