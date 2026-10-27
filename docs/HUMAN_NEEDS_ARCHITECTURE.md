# Wilderfolk — Human Needs Architecture

**Issue:** #61 | **PR:** #62 | **Reviewed:** 2026-10-27 | **State:** draft, acceptance incomplete.

## 1. Purpose and invariants

Replace the single human energy bar with independent, serialized **nutrition**, **rest**, and **stamina**, and enforce **one owner per rule and function**. Human `energy` is a derived compatibility projection from stamina, not a second mutable needs state. Nonhuman creatures and foreign enemy captives deliberately retain their legacy energy semantics.

- The physiology owner advances reserves exactly once per tick, before camera/off-screen throttling; `lastAdvancedTick` prevents duplicates.
- No meal or food relief credits nutrition without a successful, ledger-recorded debit.
- Sleep earns rest only when actual eligible sleep is observed at the correct location.
- Zero stamina/rest is not instant death; fatal starvation requires sustained severe nutritional deprivation.
- Worker, save, Moon Howler and render projections preserve needs without independently mutating rules.
- `scheduleFatigue` tracks attendance/roster fatigue; it is not sleep debt.

## 2. Domain schema and owner map

`src/game/gameTypes.ts` owns `HumanNeedsState`, carried by `Entity.needs` and saved in `MoonHowlerSavedState.needs`.

| Field | Contract |
| --- | --- |
| `nutrition` | food reserve, clamped to 0–100 |
| `rest` | sleep reserve, clamped to 0–100 |
| `stamina` | short-term exertion, clamped to 0–100 |
| `severeHungerTicks` | continuous exposure below starvation threshold |
| `lastMealTick` | last successful food transaction tick |
| `lastAdvancedTick` | physiology idempotence / elapsed time |
| `breakUntilRecovered` | hysteresis latch for rest breaks |
| `nightDutyRecoveryPending` | overnight duty completed and owed daytime recovery |
| `sleepRecoveryUntilTick` | bounded recovery attempt deadline |

**One authoritative rule owner:** `src/game/simulation/humanPhysiology.ts`, exporting `HUMAN_NEEDS`, `HumanNeedsObservation`, `HumanNeedsIntent`, `initialHumanNeeds`, `normalizeHumanNeeds`, `advanceHumanNeeds`, `resolveHumanNeedsIntent`, `getHumanNeedsWorkMultiplier`, `hasFatalStarvation`, `creditHumanNutritionFromFood`, and `adjustHumanStaminaFromEnergy`.

| Owner | Responsibilities |
| --- | --- |
| `humanTick.ts` | Observe actual duty/sleep/movement; call physiology; route meal and starvation actions |
| `simulation/humanNeeds.ts` | `canEatColonyMeal`, `tryEatColonyMeal`, foreign captive exhaustion, starvation mortality |
| `economyLedger.ts` | Atomic food debit and consumption categories |
| `workforce.ts` | Jobs and roster restoration after imprisonment/release |
| `townHall.ts` | Petitions; only credit nourishment after `spendFood('petition')` |
| `hospitalCare.ts`, `relationships.ts`, `education.ts`, `humanLeisureBehavior.ts` | Positive/negative stamina effects through physiological owner |
| `simWorker/simPrep.ts`, `saveLoad.ts`, `saveSchema.ts`, `moonHowler*.ts` | Clone, migrate, persist and restore authoritative needs |
| `simBuffers/entityRenderMeta.ts`, `humanStatus.ts`, `SelectedEntityPanel.tsx` | Read-only worker metadata, activity and reserve display |
| `scripts/colonyHealth.ts` | Seeded colony setup, `applyColonyBotAction`, health measurements |
| `scripts/run-full-year.mts` | Long-run scenario execution and health assertions |

The register of record is `OWNERSHIP_OVERVIEW.md`: exported new functions, `HUMAN_NEEDS`, `HumanNeedsState`, `HumanNeedsObservation`, and `HumanNeedsIntent` are registered there. Local private helpers inherit their module owner.

## 3. Runtime pipeline

```text
GameLoop / Worker -> gameTick -> humanTick (every player human)
  read prior movement, schedule, real sleep location, environment
  -> advanceHumanNeeds(entity, observation)
       update reserves and time-based hunger/recovery state exactly once
       project energy = maxEnergy * stamina / 100
  -> resolveHumanNeedsIntent [read-only]
       eat -> humanNeeds.tryEatColonyMeal
              -> economyLedger.spendFood('meals')
              -> creditHumanNutritionFromFood(actualAmount)
       sleep/break -> pre-existing schedule, movement and leisure owners
  -> hasFatalStarvation -> killFromStarvation through death cleanup
  -> other behavior / off-screen throttle / worker-render projections
```

**No duplicate rule implementation:** `resolveHumanNeedsIntent` reads latches; only `advanceHumanNeeds` advances time and latches. Hunger rescue resets `severeHungerTicks` only after a paid meal moves nutrition above the starvation boundary.

## 4. Current balancing constants

All numbers below come from `HUMAN_NEEDS` (simulation-hour units) rather than from a second configuration table.

| Parameter | Value |
| --- | ---: |
| nutrition: base / additional work / walking cost per hour | 1.2 / 0.16 / 0.12 |
| nutrition restored per food unit | 10 |
| eat when below / cooldown | 70 / 2 hours |
| rest: awake loss / verified sleep gain per hour | 4 / 12 |
| stamina: work loss / walk loss / idle gain / sleep gain per hour | 9 / 5 / 5 / 13 |
| critical rest / recovery target | 20 / 85 |
| stamina break begins below / ends at | 15 / 50 |
| starving nutrition threshold / fatal duration | 8 / 48 hours |
| famine desperation nutrition threshold | 30 |

Juvenile nutrition-cost factor: 0.85. Well/hospital modifiers lower negative stamina drain. An adult working nine hours consumes ~30.24 nutrition/day before walking, equivalent to ~3 food units/day **if food is available**; this is a model estimate, not proof of sustainable production.

## 5. Work, sleep and imprisonment

The work observation covers normal jobs, staffed venues, hospital shifts, prison watches, Town Hall officials, daytime priests and Moon-priest duty. Real nighttime or daytime sleep requires an eligible residence, hotel lodging, or actual nighttime cell position. Overnight work sets a pending recovery state and permits daytime recovery while off duty. Low stamina latches a break until meaningful recovery without discarding existing duty/emergency restrictions.

During imprisonment, a settler's bed and workplace pointer remain reserved, while ordinary active rosters exclude the jailed employee. `workforce.restoreWorkerRosterAfterCustody` restores the previously reserved workplace membership immediately on release/escape, including when the jail and workplace differ. A prison guard who works in their own prison retains their unique roster entry.

Production uses `getHumanNeedsWorkMultiplier` alongside schedule-fatigue factors without multiplying two full fatigue penalties. Food production, consumption, spoilage, attendance and replenishment remain separately auditable.

The Virtual Player now checks for a **completed, auto-managed food producer with zero assigned workers** before ordering more Farms during a shortage. It proposes the existing `autoStaffWorkers` command only when the workforce owner identifies a legal donor and transferrable worker. If an existing auto-managed Farm has no such workers, additional idle food buildings are not proposed as a false solution. Manual staffing settings remain untouched. This fixes a construction/staffing feedback loop, **not** the still-unproven full-colony food balance.

## 6. Persistence and compatibility

Older saves are normalized with `normalizeHumanNeeds`. `saveSchema.ENTITY_PERSISTED_FIELDS` stores `needs`. Moon Howler form transitions preserve nested saved human needs. `simWorker/simPrep.ts` deep-copies state (including nested saved needs), while `simBuffers/entityRenderMeta.ts` copies reserve values for display without owning or mutating them.

Foreign `warCaptive` feeding intentionally remains on legacy energy and canonical `gameConstants.Human` constants. Visitor/rival humans without custody do not use colony food. Other human legacy-energy consumers remain an explicit migration audit area.

## 7. Removed redundant aliases

- Dropped the pass-through `creditHumanStaminaFromEnergy`; callers use `adjustHumanStaminaFromEnergy` directly.
- Removed `asleepAtHome = sleepingForNeeds`: it misnamed hotel/cell sleep as sleeping at home.
- Removed local meal-interval and hunger-threshold aliases from `humanNeeds.ts`; foreign-captive logic reads `gameConstants.Human` directly.
- Retained meaningful boundaries: source needs versus derived energy, player nutrition versus captive energy, and roster fatigue versus sleep rest.

## 8. Verification and merge policy

| Gate | Test or evidence | Current status |
| --- | --- | --- |
| New symbol ownership and alias cleanup | `OWNERSHIP_OVERVIEW.md` + targeted source audit | Updated; repo-wide completeness still requires check |
| Nutrition/meal/captive behaviors | `tests/humanNeeds.mealRule.test.ts` | Tests authored; final-head result needed |
| 7/30/360-day physiology scenarios | `tests/humanNeeds.calibration.test.ts` | Tests authored; final-head result needed |
| Civic aid, famine desperation and prison release | `tests/civicPetition.cadence.test.ts`, `tests/famineDesperation.test.ts`, `tests/prisonStay.holdsHomeAndPost.test.ts`, `tests/simBatch.prisonEscapes.test.ts` | Regression coverage authored |
| Camera-focus vs off-screen equivalence and worker delta | seeded A/B observables | Not yet accepted |
| Medical, duty, actual sleep and other legacy-energy paths | scoped audit + targeted integration tests | Not yet accepted |
| 360-day un-restocked producer colony | `run-full-year.mts --scenario=producers --days=360 --bot` | Prior day-330 failure; revalidation required |
| Food supply/demand, spoilage and attendance | checkpoints days 7, 30, 120, 180, 330, 360 | Prior food zero at day 120; not accepted |
| Final typecheck, lint, build and CI | Node.js + human needs calibration + housing CI | Await final-head checks |

**No merge until the evidence is complete.** Do not conceal starvation with artificial food replenishment, weaken invariant checks or claim success based on a previous commit. Re-run acceptance against the latest head after any change.

**References:** `AGENTS.md`, `OWNERSHIP_OVERVIEW.md`, `docs/plans/human-needs-issue-61-2026-10-26.md`, `CHANGELOG.md`, `roadmap_V.0.6.6.0.md`.