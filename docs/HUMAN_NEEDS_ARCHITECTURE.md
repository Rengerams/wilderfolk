# Wilderfolk — Human Needs Architecture

**Issue:** #61 | **PR:** #62 | **Reviewed:** 2026-10-27 | **State:** merged into `main` and accepted on 2026-10-27; additional verification is tracked as post-merge hardening. **Known debt:** the player-human `energy` migration is incomplete — see §1a; `energy` is not a second need and must not drive player decisions.

## 1a. Legacy energy compatibility — unfinished

`Entity.energy` / `maxEnergy` are **not** part of `HumanNeedsState`. They remain for four distinct reasons, only one of which is a migration concern:

- **Intentional current users:** foreign war captives (no `needs` state) and nonhuman creatures (their own energy pool).
- **Form bridge:** a Moon Howler form saves/restores `energy` alongside `needs`.
- **Old-save fallback:** a human saved before `needs` existed seeds `stamina` from `energy` in `normalizeHumanNeeds`.
- **Unfinished player-human migration:** old readers/writers still use the mirror.

Migrated so far: `hospitalCare.needsMedicalCare`, `medicalUrgency`, `medicalCareReason` and the `humanHospitalBehavior` treatment gate now read `getHumanStaminaRatio`; the hospital no longer calls a settler exhausted from a stale mirror.

Remaining player-human `energy` paths (the actual acceptance list):

| Owner | Path | Target |
| --- | --- | --- |
| `hospitalCare.treatPatientAtHospital` | heal sizing from `maxEnergy - energy` | stamina via `adjustHumanStaminaFromEnergy` (the conversion bridge) |
| `simulation/humanRelationships.ts` | married/youth conception thresholds | `getHumanStaminaRatio` |
| `humanTick.ts` | courtship eligibility thresholds | `getHumanStaminaRatio` |
| `socialLife.ts` | exhausted/vulnerable/critical impulse ratios | `getHumanStaminaRatio` |
| `hotelStay.ts` | direct `energy +=` rest | `adjustHumanStaminaFromEnergy` |
| `simulation/humanLifecycle.ts` | maternal energy cost and birth recovery | stamina |
| `animalCare.ts` | tamer owner energy bonus | `adjustHumanStaminaFromEnergy` |
| `warPrisoners.ts` | recruited captive seeds needs from energy | one-time transition conversion |
| `humanHuntingBehavior.ts` | no-`needs` fallback | keep the fallback only |
| `humanEnergy` display/worker metadata | read-only projection | read `needs` for settlers, energy only for captives/nonhumans |

Rules for new code:

1. Player-human decisions read `needs.stamina` / `needs.rest` (or `getHumanStaminaRatio`), never `Entity.energy`.
2. Legacy-sized effects write through `adjustHumanStaminaFromEnergy`; do not assign `Entity.energy` directly.
3. `energy` is never a second authority for a rule that stamina already owns.
4. Captives and nonhuman creatures remain excluded from this rule; their energy is their own model.

There is no source gate yet. The table above is the migration checklist; a future `*.legacyEnergyAudit.test.ts` should fail when a player-human module adds a new `energy` read outside the allowlist.


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

**One authoritative rule owner:** `src/game/simulation/humanPhysiology.ts`, exporting `HUMAN_NEEDS`, `HumanNeedsObservation`, `HumanNeedsIntent`, `initialHumanNeeds`, `normalizeHumanNeeds`, `advanceHumanNeeds`, `resolveHumanNeedsIntent`, `getHumanNeedsWorkMultiplier`, `hasFatalStarvation`, `creditHumanNutritionFromFood`, `adjustHumanStaminaFromEnergy`, and `rebaseHumanNeedsClockAfterFormRestore`.

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
| stamina: work loss / walk loss / ordinary awake loss / actual rest-break gain / sleep gain per hour | 6 / 5 / 2 / 5 / 100÷7 |
| critical rest / recovery target | 20 / 85 |
| stamina break begins below / ends at | 15 / 50 |
| starving nutrition threshold / fatal duration | 8 / 48 hours |
| famine desperation nutrition threshold | 30 |

Juvenile nutrition-cost factor: 0.85. Well/hospital modifiers lower negative stamina drain. An adult working nine hours consumes ~30.24 nutrition/day before walking, equivalent to ~3 food units/day **if food is available**; this is a model estimate, not proof of sustainable production.

## 5. Work, sleep and imprisonment

The 24-hour baseline is 17 hours awake and seven hours of sleep: nine hours of work at −6/h plus eight hours of ordinary awake time at −2/h leave 30 stamina at bedtime; eight work hours leave 34, ten leave 26. Player-configured shift lengths are observed directly; existing `scheduleFatigue` separately owns the longer-shift production penalty and is not multiplied into physiological drain. A real stationary needs break recovers 5/h and ordinary leisure does not count as one. Seven actual sleep hours restore the reserve to 100.\n\nThe work observation covers normal jobs, staffed venues, hospital shifts, prison watches, Town Hall officials, daytime priests and Moon-priest duty. Real nighttime or daytime sleep requires an eligible residence, hotel lodging, or actual nighttime cell position. Overnight work sets a pending recovery state and permits daytime recovery while off duty. Low stamina latches a break until meaningful recovery without discarding existing duty/emergency restrictions.

During imprisonment, a settler's bed and workplace pointer remain reserved, while ordinary active rosters exclude the jailed employee. `workforce.restoreWorkerRosterAfterCustody` restores the previously reserved workplace membership immediately on release/escape, including when the jail and workplace differ. A prison guard who works in their own prison retains their unique roster entry.

Production uses `getHumanNeedsWorkMultiplier` alongside schedule-fatigue factors without multiplying two full fatigue penalties. Food production, consumption, spoilage, attendance and replenishment remain separately auditable.

The Virtual Player now checks for a **completed, auto-managed food producer with zero assigned workers** before ordering more Farms during a shortage. It proposes the existing `autoStaffWorkers` command only when the workforce owner identifies a legal donor and transferrable worker. If an existing auto-managed Farm has no such workers, additional idle food buildings are not proposed as a false solution. Manual staffing settings remain untouched. This fixes a construction/staffing feedback loop, **not** the still-unproven full-colony food balance.

## 6. Persistence and compatibility

Older saves are normalized with `normalizeHumanNeeds`. `saveSchema.ENTITY_PERSISTED_FIELDS` stores `needs`. Moon Howler form transitions preserve nested saved human needs; reverting rebases `lastAdvancedTick` to the tick preceding restoration, so the seven-hour nonhuman interval cannot be replayed as human hunger, sleep loss or stamina drain. `simWorker/simPrep.ts` deep-copies state (including nested saved needs), while `simBuffers/entityRenderMeta.ts` copies reserve values for display without owning or mutating them.

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

**Historical pre-merge gate:** this section records verification that was requested before PR #62 was merged. **PR #62 is now merged and accepted.** Continue these tests as post-merge release-hardening checks. Do not conceal starvation with artificial replenishment, weaken invariant checks or claim a passing current run based on an earlier commit.

**References:** `AGENTS.md`, `OWNERSHIP_OVERVIEW.md`, `docs/plans/human-needs-issue-61-2026-10-26.md`, `CHANGELOG.md`, `roadmap_V.0.6.5.2.md`.
## 9. Producer-colony remediation and measured failures (27 October 2026)

GitHub Actions job `121955079228`, seed 12345, 30 simulated days, **before** the remediation:
- 47 settlers (32 working), 9 Farms, 6 unstaffed job buildings, food **0**.
- Completed-day food history: **1,569 produced** versus **2,757 consumed** (net **-1,188**).
- The event trace shows a discretionary taming burst (20 animals, days 15–19) and ecosystem collapse at day 23; the first extra Farm was placed on day 18.
- The assertion correctly failed with `stalled(food-exhausted)`. Zero invariant violations do not mean an economically viable colony.

The 360-day run on the same older head (job `121955079542`) also failed, at **day 240**, because a human was listed in Lumber Mill `occupants` with an unset `workerBuildingId`. Its intermediate food balances were negative for days 30, 60, 90, 120 and 210, despite a temporary recovery during days 150–180. These are observed failures, not a passing acceptance baseline.

**Source changes committed since that run:**
- `virtualPlayer.ts` targets food producers against the **entire player-human population**; the old adult-only numerator understated demand from children.
- When recorded food flow shows sustained deficit, the bot prefers a genuinely staffed and eligible Farm upgrade to another potentially unstaffable building. Upgrade prices and bounds still belong to `buildingMaintenanceActions.ts`.
- Optional taming is suppressed when measured food flow is negative or known ecology is under the existing healthy threshold. The bot also verifies the canonical species food cost will leave its configured meal reserve **after** payment.
- `workforce.assignWorkerTransition` no longer treats an occupant-list entry alone as idempotence: it repairs the worker pointer/job if those fields were unset, rather than accepting an inconsistent workplace roster.
- `colonyHealth.ts` checkpoints now include completed-day seven-day food flow, count of completed Farms, staffed Farms and assigned farmhands. These complement the existing thirty-day flow and colony invariant checks, without changing the food ledger or artificial restocking.

**New regression coverage:** `tests/virtualPlayerHealthVerdict.test.ts`, `tests/virtualPlayer.test.ts`, `tests/workforce.transitions.test.ts`. At the time of this recorded remediation, the new code had not yet passed a full current-head Node.js CI or 7/30/360-day producer-colony suite. PR #62 subsequently **merged and was accepted on 27 October 2026**. Keep the strict food-stockout and workplace-roster assertions, and obtain fresh current-`main` evidence as a separate follow-up.
