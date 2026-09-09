# Wilderfolk Ownership Overview

Authority: `AGENTS.md` + `src/game/simulation/decisionRegistry.ts`  
Purpose: one decision → one owner module → one definition of each function.

## Decision owners (authoritative)

| Decision | True owner | Cadence | Key entry functions |
|---|---|---|---|
| Tick orchestration | `gameTick.ts` | fixed 4 layers | `gameTick` |
| Movement / pathfinding | `tickLayerRealtime.ts` + `humanMovement.ts` | realtime | movement helpers |
| Workforce / jobs | `workforce.ts` + `buildingStaffingActions.ts` | assignment / command | `assignStaffWorkerToBuilding`, `assignMissingWorkers`, … |
| Generic assign/remove command route | `buildingActionRouting.ts` | player-command | `assignIdleWorkerToBuilding`, `removeWorkerFromBuilding` (routes to staffing or residency) |
| Housing / residence | `residencyOccupancy.ts` / `residencySelection.ts` / `residencyReconciliation.ts` / `buildingResidencyActions.ts` | assignment / command | `countResidentsInBuilding`, `syncPartnerResidence`, … |
| Construction progress | `dailyBuildingEconomy.ts` | daily | construction progress in daily economy |
| Economy / resources | `resourceUtils.ts` (add), `economy.ts` (caps/spoilage), `dailyBuildingEconomy.ts` (production) | daily / command | `addResource`, `updateStorageCaps`, `tickWinterHeating` |
| Workshop recipes | `workshops.ts` | — | `canAffordWorkshopRecipe(resources, recipe)` |
| Building config lookup | `buildingConfig.ts` | — | `getBuildingConfig` (with fallback) |
| Village Requests | `groupEvents.ts` | new-calendar-day / command | `tickVillageRequests`, `resolveVillageRequest` |
| Rival settlement day pulse | `rivalEvents.ts` | new-calendar-day | `tickRivalSettlements` |
| Rival schedule wiring | `groupEvents.ts` | daily | `tickWorldRivalSettlements` (callbacks only) |
| Casual social feedback | `humanSocial.ts` / `socialLife.ts` | staggered-social | chat / greeting helpers |
| Youth love | `humanRelationships.ts` | new-calendar-day | `advanceYouthLove` |
| Courtship / marriage | `humanRelationships.ts` | staggered-social | `findCourtshipPartner`, `tryCompleteCourtshipMarriage` |
| Affairs / scandal | `humanRelationships.ts` | daily + staggered + caught-in-act | `tryDailyAffairEncounter`, `canPursueSecretAffair`, `exposeAffair`, … |
| Conception | `humanRelationships.ts` | new-calendar-day | `tryDailyConception` |
| Pregnancy progress / birth | `humanLifecycle.ts` | pregnancy-progress | `tickPregnancyAndBirth` |
| Moon Howler | `moonHowler.ts` | full-moon-event | `tickMoonHowlerCycle`, … |
| Leader residency | `leaderHouse.ts` | daily | `syncLeaderHouseResidency` |
| Blueberry foraging | `blueberryForaging.ts` + `worldGen.ts` (spawn ≤3) | staggered / daily | pick / regrowth / spawn |
| Calendar clock | `dayCycleClock.ts` | — | `TICKS_PER_DAY`, `isNewCalendarDayTick`, hour/day math |
| Calendar constants | `dayCycleConstants.ts` | — | night/moon/adult-age constants |
| RNG salt | `simRng.ts` | — | `hashSalt` |
| Player commands | `simWorker/commands.ts` → domain owners | player-command | `applyWorkerCommand` |

## Protected facades (re-export / schedule only — no new policy)

| Facade | May do | Must not do |
|---|---|---|
| `dayCycle.ts` | re-export clock/schedule/residency | new lifecycle/economy rules |
| `buildingActions.ts` | re-export focused action owners | new command policy |
| `residency.ts` | re-export residency modules | new housing policy |
| `tickLayerDaily.ts` | ordered daily schedule | own winter heating / domain rules |
| `humanTick.ts` | priority / call owners | own affair establishment / marriage finalize |
| `App.tsx` | composition / wiring | simulation mutations |

## Single-definition rule

If two modules export the same function name with the same responsibility:

1. Keep the implementation in the **true owner**.
2. Delete the duplicate body.
3. Rewrite callers to import the owner (facades may re-export, but must not redefine).

## Calendar note

`isNewCalendarDayTick` is **not** a constant. It is calendar-gate arithmetic and lives in **`dayCycleClock.ts`**.  
`dayCycleConstants.ts` holds pure values (night hours, moon cycle, adult age floor).
