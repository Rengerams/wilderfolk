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

## Owners recorded by the 2026-09-13 simulation audit

The audit and the fixes that followed touched decisions that had no owner row here. Recorded
now, using the names the modules actually export, so the next change knows which module owns the
behaviour. Nothing here changes the ownership law: one decision, one owner, one definition.

| Decision | True owner | Cadence | Key entry functions |
|---|---|---|---|
| Combat tiers, counter-attack / block rolls | `combat.ts` (research data in `gameTypes.ts`; raid outcomes in `frontierCombat.ts`) | combat resolution | `researchedEffect`, `getCounterAttackChance`, `getPredatorBlockChance`, `rollCounterAttack`, `rollPredatorBlock` |
| Deaths and yearly statistics | `stats.ts` (the per-tick tally is written by `gameTick.ts`) | per-tick tally + year-rollover record | `recordYearlyStats`, `updateLifetimeStats`, `createEmptyLifetimeStats`; `gameTick`'s `deathsThisYear` tally |
| Event log / Chronicle | `eventLog.ts` | event-driven | `logEvent`, `logDeath`, `syncEventLogIdFromState`, `resolveCombatLogKind` |
| Big news, notifications, floating text | `simEffects.ts` | event-driven | `addBigNews`, `syncBigNewsIdFromState`, `addNotification`, `addFloatingText` |
| Save / load and timeline migration | `saveLoad.ts` (allow-list: `saveSchema.ts`) | load / player-command | `buildSaveData`, `loadGameFromParsed`, `parseSaveJson`, `migrateTickTimeline`, `clearAutoFilledChurches` |
| Worker transport (prep + tick delta) | `simWorker/simPrep.ts` + `simBuffers/simDelta.ts` | per-tick / per-command | `extractSimPrep`, `applySimPrep`, `extractSimTickDelta`, `applySimTickDelta` |
| Session clock, command queue, worker fallback | `gameLoop.ts` | animation-frame / command | `frame`, `applyCommand`, `flushDeferredWorkerCommands`, `fallbackFromWorker` |
| Trade caravans and routes | `tradeCaravans.ts` | systems layer + departure schedule | `tickTradeCaravans`, `spawnCaravan`, `scheduleTradeRouteDeparture`, `getCaravanMoveTarget` |
| Civic petitions / town-hall audience | `townHall.ts` | daily (resolution) + realtime (greeting only) | `resolveCivicPetition`, `tickTownHallAudiences`, `officialHandlePetitioners`, `wantsCivicAudience` |
| Human age and fertility ladder | `dayCycle.ts` (`dayCycleConstants.ts` for the ages) | daily sync / pure helpers | `HUMAN_FERTILITY_START`, `getFemaleFertility`, `getYouthConceptionMultiplier`, `syncHumanAgeFromCalendar`, `tryGraduateHumanChild` |
| Housing unit composition | `householdComposition.ts` (selection: `residencySelection.ts`) | assignment | `isMinorChild`, `collectOwnHousehold`, `collectMinorHousehold`, `getChildCustodian`, `buildHousingUnits` |
| Medical care | `hospitalCare.ts` + `humanHospitalBehavior.ts` | daily care pass / realtime routing | `needsMedicalCare`, `treatPatientAtHospital`, `doctorTreatNearby`, `tickHospitalDailyCare` |
| Visitor lodging | `hotelStay.ts` | daily + realtime | `tickHotelLodging`, `checkInVisitor`, `checkoutVisitor`, `steerVisitorToHotel` |
| Autumn migration and herds | `migration.ts` | new-calendar-day (autumn window) | `tickMigration`, `migrationArrivalDay` |
| Ecosystem health score and its explanation | `dailyEcology.ts` (score) + `ecoBreakdown.ts` (read-only breakdown) | daily | `tickEcosystemMetrics`, `calculateBiodiversityIndex`, `getEcosystemBreakdown` |
| Village happiness and beauty | `beautyGrid.ts` | daily | `tickBeauty`, `rebuildBeautyGrid`, `computeVillageHappiness`, `pickBeautySpot` |
| Watchtower early warning | `watchtowerDetection.ts` | systems layer | `detectRaidersFromWatchtowers` |
| Wall / road strip topology and replacement | `stripTopology.ts` + `stripBuild.ts` (placement: `buildingPlacementActions.ts`) | player-command | `resolveStripPlan`, `resolveWallStripPlan`, `resolveRoadStripPlan`, `findStripBuildingAt`, `computeStripSegmentCenters` |
| Authored one-time stories (flags, cards, cooldown) | `storyHelpers.ts` (shared contract) + each story owner (`travelingTheatre.ts`, `inventionFair.ts`, `famineDesperation.ts`) | daily / story-card answer | `storyFlag`, `setStoryFlags`, `pushStoryCard`; `maybeOfferTravelingTheatre`, `resolveTravelingTheatre`, `tickTravelingTheatre` |
| Leadership elections (term + vacancy) | `villageLeadership.ts` | daily due-date check, year rollover, ceremony ticks | `tryStartVacancyElectionCeremony`, `tryStartTermElectionCeremony`, `tickElectionCeremony`, `tickLeaderVacancy` |
| Tutorial / guided campaign | `guidedCampaign.ts` + `tutorialCampaign.ts` | daily | `tickGuidedCampaign`, `recordGuidedCampaignChoice`, `currentCampaignStep` |
| Pathfinding and the path cache | `pathfinding.ts` | realtime movement | `findPath`, `getPathGrid`, `pathWaypoints`, `steerWithPath`, `setCurrentPathMap` |
| Sprite preload and lookup (presentation) | `spriteLoader.ts` | boot / render | `preloadAllSprites`, `loadSprite`, `getSprite`, `isSpriteLoaded` |
| Terrain decor stamps (presentation) | `terrainLayer.ts` | render / bake | `stampPropSprite`, `stampMountainPeaks`, `mountainSpritesReady` |
| Staffing eligibility and assignment | `buildingStaffingActions.ts` (eligibility rules in `residencyOccupancy.ts`) | player-command + assignment | `canAssignWorkerToBuilding`, `assignStaffWorkerToBuilding`, `removeStaffWorkerFromBuilding`, `hasWorkAssignment`, `isImprisoned` |
| Storage caps and food spoilage | `economy.ts`, wired daily by `dailyBuildingEconomy.ts` | daily (first step of `tickStaticDaily`) | `updateStorageCaps`, `applyFoodSpoilage`, `addResource` |
| Economy ledger history and its day rollover | `economyLedger.ts` | daily | `rollEconomyLedgerForDay`, `getEconomyLedger`, `recordFoodProduced`, `ECONOMY_SOURCE_LABELS` |
| Off-screen wildlife throttle | `simFocus.ts` | wildlife-layer pulse | `isOffscreenWildlifeActive` |
| Moon Howler curse and form lifecycle | `moonHowler.ts` | full-moon nightfall + debug command | `shouldMoonHowlerTransform`, `canBeginMoonHowlerCurse`, `countActiveMoonHowlerCurses`, `transformToWerewolfForm`, `revertToHumanForm`, `tryMoonHowlerChurchCures` |
| Village-request acceptance | `groupEvents.ts` | daily generation + typed player command | `tickVillageRequests`, `resolveVillageRequest`, `getVillageRequestEligibility` |
| Wildlife reproduction snapshot (population caps, scarcity boost) | `simQueries.ts` (`REPRO_WILDLIFE_TYPES`) | wildlife layer | `buildWildlifePopulationSnapshot`, `wildlifeTypePopulation`, `recordWildlifeBirth` |
| Leader office across the Moon Howler form | `villageLeadership.ts` owns the office; `moonHowler.ts` only carries `villageLeaderId` through the revert | full-moon revert / cure / load | `isActingVillageHead`, `RevertToHumanFormOptions.villageLeaderId`, `revertToHumanForm` |
| Simulation randomness: streams, seed and their positions | `simRng.ts` (per-person day rolls: `humanSchedule.personDayRoll`) | per draw; positions cross realms via `world.simRng` | `getSimRng`, `seededRandomForRun`, `snapshotSimRng`, `restoreSimRng`, `parseSimRngSnapshot`, `setSimSeed`, `adoptSimSeedFromWorld` |

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
