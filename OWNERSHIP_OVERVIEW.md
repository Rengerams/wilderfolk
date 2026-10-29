# Wilderfolk Ownership Overview

Authority: `AGENTS.md` + `src/game/simulation/decisionRegistry.ts`  
Purpose: one decision → one owner module → one definition of each function.

Terrain pipeline design and layer boundaries: [Terrain architecture](docs/TERRAIN_ARCHITECTURE.md).

## Non-gameplay test harness owners

| Responsibility | Sole owner | Invocation |
|---|---|---|
| CI and standard/slow gate routing | `scripts/test.mjs` | `npm run test:standard`, `npm test -- colony-integration`, `npm test -- full` |
| Bounded simulation CI | `.github/workflows/simulation-120-day.yml` | PR simulation-rule changes and manual dispatch; seeded producer bot, 120 days, 30-day invariant checkpoints |
| Incremental function overlap review | `scripts/check-function-overlap.mjs` — `changedLines`, `lex`, `dice`, `overlap`, `checkOverlaps` and internal comparison helpers | Standard CI after `scripts/build-call-graph.mjs`; fingerprints and test-backed exceptions in `docs/tools/semantic-overlap-reviewed.json` |
| PR99 population benchmark workflows | `.github/workflows/perf-population-small.yml`, `perf-population-medium.yml`, `perf-population-large.yml` → `.github/workflows/perf-population-reusable.yml` | Three independent, fixed-seed baseline-vs-PR Actions measurements; no gameplay write authority |
| VirtualPlayer population performance simulation | `scripts/perf-population-colony.mts` | One-time population/housing/work setup through existing owners, then normal gameTick plus hourly bot commands; writes per-citizen and per-job career-day evidence, bot commands and daily snapshots; game decisions remain production-owned |
| Real-colony audit and timing comparison | `scripts/compare-population-colony.mjs` | Validates 12 ticks/hour, fixed day lengths, JSONL per-citizen career workdays, daily snapshots, and VirtualPlayer command counts | 
| Benchmark JSON validation and comparison | `scripts/compare-population-benchmarks.mjs` | Checks seed, population, tick counts and invariants, then publishes comparative CI summary |
| Producer-colony integration | `tests/longRunColony.integration.test.ts` | Independent 90-day scenario |
| DNA legacy-consumer source inventory | `tests/personality.legacyConsumerAudit.test.ts` | Standard Vitest: fails on new unregistered legacy DNA rule sites; PR C must make the known six-owner inventory empty and retain the strict guard |
| Stall-verdict unit regressions | `tests/longRunStallVerdict.test.ts` | Standard Vitest |
| Terrain bake fixture | `tests/groundLook.bands.test.ts` | Pristine cached maps and pixels |
| Save payload fixture | `tests/saveLoad.valueIntegrity.test.ts` | Independent clones of the real payload |

## Decision owners (authoritative)

| Decision | True owner | Cadence | Key entry functions |
|---|---|---|---|
| Tick orchestration | `gameTick.ts` | fixed 4 layers | `gameTick` |
| Realtime pulse and population history sampling | `tickLayerRealtime.ts` | realtime (every tick); sample each 10 ticks | `tickLayerRealtime` — sole writer of rolling `populationHistory`, now sampling gold, food, wood, stone and iron; older entries may omit iron |
| Assignment pulse | `tickLayerAssign.ts` | assignment (~4×/day) | `tickLayerAssign` |
| Daily pulse | `tickLayerDaily.ts` | daily (once per colony day) | `tickLayerDaily` |
| Indoor browser smoke | `scripts/autoplay_playwright_probe.py` | existing browser harness | `run_indoor_smoke`, `run_infrastructure_visual` — normal save-load, observed indoor patient assertion and infrastructure captures through the zoom controls. |
| Settler DNA identity, allocation and inheritance | `settlerTraits.ts` | creation / inheritance / legacy save-load (read-only trait checks on demand) | `SettlerTrait`, `TRAIT_DEFS`, `TRAIT_POOL`, `rollSettlerTraits`, `rollLegacySettlerTraits`, `validSettlerTraits`, `inheritSettlerTraits`, `hasTrait` — the only trait-ID type definition; entity types only import its type |
| Context-specific personality effects | `src/game/personality/traitEffectCatalog.ts` | static read-only data | `TRAIT_EFFECTS`, `TRAIT_OPPOSITIONS`, `TraitContext`, `TraitEffects`, `LegacyExactEffect`, `TraitSubject` — exhaustive positive/negative contexts plus the typed `legacyExact` multipliers, chance, duration, civic voices and the five cross-person clash links the live owners read, for the fourteen canonical genetic traits; no new trait identity or persisted data. |
| Trait influence evaluation | `src/game/personality/traitEvaluation.ts` | on-demand read-only projection | `evaluateTraitInfluence` — sole pure entry point: bounded factor/tendency plus opt-in explanation for ordinary contexts, a typed `exact` result for the six discrete contexts, no mutations, no RNG, no independent scheduler. Phase B consumers multiply the bounded factor alone: `skills.getWorkerSkillMultiplier` (production and `builder`/construction crews), `education.creditChildSchoolDay` and `getEducationResearchMultiplier` (learning, research), `apprenticeships.teach` (training), `militiaBalance.computeMilitiaBreakdown` (each mustered soldier's own `danger`/`defense` factor), the two danger sites `humanHuntingBehavior.tickHumanHunting` and `humanTick.tickHumans` (flight), and `humanPhysiology.advanceHumanNeeds` (physiology/labor work drain). Phase C decides from the same call's exact result: `humanTick.tickHumans` courtship progress, `humanRelationships` married and youth conception, `socialLife` work banter, `humanLifecycleCleanup.finalizeHumanDeath` spousal mourning, `warPrisoners.applyWarCommunityReaction` civic voices and `relationships.advanceSocialRelationships` feud clashes. No legacy DNA multiplier survives beside them. |
| Human tick pulse | `humanTick.ts` | realtime | `tickHumans` (predator flight speed carries the `danger`/escape trait factor; courtship progress reads the catalog's exact-parity courtship factors; foreign-captive energy stays with `humanNeeds`) |
| School enrollment, attendance and hours | `education.ts` | assignment and school-day ticks | `syncSchoolAssignments`, `findSchoolForChild`, `schoolCapacity`, `isSchoolTime`, `recordChildSchoolTick` |
| Movement / pathfinding | `humanMovement.ts` (integration) + `pathfinding.ts` (grid, A*, steering, road mask) | realtime | `enterHumanBuilding`, `commuteHumanToBuilding`, `humanBuildingTarget`, `applyHumanWalkStep`, `steerWithPath`, `walkRoute`, `findPath`, `findRouteCostOutcome`, `isOnWalkableRoadAt`, `isWalkableRoad`, `buildPathGrid`, `buildingSignature`, `stampBuildingFootprint` |
| Commute reach: lead hours and assignable distance | `commuteReach.ts` | — (rule; read by the movement path, work assignment, the housing commute move and the panel; prices routes on the sim's current grid) | `commuteWalkSpeed`, `commuteLeadHoursFor`, `estimatedCommuteHours`, `straightRouteCost` (exact union of paved portions when no grid is available), `routeCommuteHours` (the priced home → destination route inside that budget), `beginCommuteRoutePass`, `isWithinAssignableCommute`, `MAX_ASSIGNABLE_COMMUTE_HOURS`, `MAX_COMMUTE_LEAD_HOURS`, `MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS`, `WORK_COMMUTE_RUSH`, `COMMUTE_CONFIG` |
| Workforce / jobs, manual overrides and automatic transfer cooldown | `workforce.ts` + `buildingStaffingActions.ts` | assignment / command; `evaluateWorkerFit` only in existing eligible idle-loop after squared distance and skill | `assignStaffWorkerToBuilding`, `assignMissingWorkers`, `canAutoChangeWorkplace`, `AUTO_JOB_TRANSFER_COOLDOWN_TICKS`, `assignWorkerTransition`, `transferWorkerBetweenBuildings`, `clearWorkerAssignment`, `detachWorkplaceReference` (the only writers of `human.workerBuildingId`), `prepareWorkforce`, `staffConstructionCrews`, `staffJobBuildings`, `assignBuilderInPlace`, `assignWorkerInPlace`, `restoreWorkerRosterAfterCustody` (restores reserved occupant membership on release or escape, with no new job assignment), `getSmithBonus` (production multiplier counts assigned, non-imprisoned blacksmiths) |
| Workplace release | `workforce.ts` | demolition / rival camp sweep / removal command / save load | `removeWorkerTransition` — releases a settler from every workplace and crew and clears the job fields; a leader keeps the office title. |
| Daily village schedule fatigue | `scheduleFatigue.ts` + `dailyScheduleFatigue.ts` | realtime record + daily resolve (`tickLayerDaily`) | `recordScheduleWorkTick`, `resolveDailyVillageScheduleFatigue`, `getScheduleProductivityMultiplier`; attendance owner records current and last settled workplace and job provenance so an intra-day transfer cannot earn phantom career credit; the existing midnight pass also settles a cursed settler's prior human work while temporarily in Moon Howler form; eligibility shares `playerHuman.isPlayerHuman` |
| Career worked-day history | `careers/careerHistory.ts` | daily economy worker-aggregation event only | `recordCareerWork` (only credited-day writer; uses verified prior shift provenance even when Moon Howler night vacated the current job), `normalizeCareerHistory` (pure load validator) |
| Career milestone progression | `careers/careerProgression.ts` | after accepted work credit or actual apprenticeship graduation | `advanceCareerProgression` (only milestone writer), `normalizeCareerMilestones` (pure load validator) |
| Optional idle-candidate worker fit | `careers/workerFit.ts` | read-only on-demand, workforce exact tie | `evaluateWorkerFit` — compares actual prior work and catalog DNA after commuting distance and skill; workforce owns assignment |
| Workforce policy preset | `workforcePolicy.ts` | player-command + assignment | `getWorkforcePolicy`, `setWorkforcePolicy`, `jobBuildingPriorityForPolicy` |
| Generic assign/remove command route | `buildingActionRouting.ts` | player-command | `assignIdleWorkerToBuilding`, `removeWorkerFromBuilding` (routes to staffing or residency) |
| Housing / residence | `residencyOccupancy.ts` / `residencySelection.ts` / `residencyReconciliation.ts` / `buildingResidencyActions.ts` | assignment / command | `countResidentsInBuilding`, `syncPartnerResidence`, `isResidenceOccupantEntity` (the rule the inspector reads too), `assignMissingResidences` (with a `sweepTick` it sweeps that pulse's bucket of the day's reassignment work; without one it converges the whole colony immediately), `pickCommuteRelocation` (the §12 commute move: a settled household trades its home for a nearer vacant one; helpers `householdCommuteHours`/`cachedCommuteHours`, gates `RELOCATION_MIN_SAVED_HOURS`/`RELOCATION_MIN_IMPROVEMENT_RATIO`/`RELOCATION_MAX_MEMBER_REGRESSION_HOURS`/`MAX_RELOCATIONS_PER_DAY`/`pupilsKeepSchoolReach` (a move must leave every pupil inside the school reach rule and cost no member more than the regression bound)), … |
| Construction progress | `dailyBuildingEconomy.ts` | daily | `tickBuildingProgress` (construction progress in daily economy), `logCompletedBuildings` (one completion line per label per day, counted) |
| Economy / resources | `resourceUtils.ts` (add), `economy.ts` (caps/spoilage), `dailyBuildingEconomy.ts` (production) | daily / command | `addResource`, `updateStorageCaps`, `tickWinterHeating` |
| Workshop recipes | `workshops.ts` | — | `canAffordWorkshopRecipe(resources, recipe)` |
| Building config lookup | `buildingConfig.ts` | — | `getBuildingConfig` (with fallback) |
| Building type identity: the name shown and persisted, and its stable number | `game/buildings.ts` | — (pure registry; filters read the number) | `BuildingType` (persisted name), `BUILDING_TYPE_CODES` (append-only number per type; `isResidenceBuildingType` in `residencyOccupancy.ts` matches homes on the code, never on the name) |
| Village Requests | `groupEvents.ts` | new-calendar-day / command | `tickVillageRequests`, `resolveVillageRequest` |
| Diplomacy card prices | `rivalDiplomacy.ts` | — (data read by the card's label, its gate and its charge) | `DIPLOMACY_TRIBUTE_PAY_FOOD`, `DIPLOMACY_TRIBUTE_NEGOTIATE_FOOD`, `DIPLOMACY_ALLIANCE_ACCEPT_GOLD`, `DIPLOMACY_ALLIANCE_COUNTER_FOOD`, `DIPLOMACY_ALLIANCE_COUNTER_GOLD`, `DIPLOMACY_PEACE_SIGN_GOLD`, `DIPLOMACY_PEACE_SIGN_FOOD`, `DIPLOMACY_PEACE_TRIBUTE_FOOD` |
| Rival settlement day pulse | `rivalEvents.ts` | new-calendar-day | `tickRivalSettlements` — advances strategic records and retires legacy village camp objects; never builds a village camp. |
| Rival camp structure retirement | `rivalEvents.ts` | new-calendar-day + save load | `retireLegacyCampStructures` (also called on save load), `releaseRetiredStructureReferences` — removes every rival-owned structure still standing on the player's map and releases whoever lived, worked or was jailed there. |
| Camp poach target | `rivalEvents.ts` | rival day pulse + visitor camp pulse | `makeNextAliveDeer`, `killWildGameForPoach` — shared live-deer selection and authoritative death cleanup for rival and visitor poaching. |
| Rival camp growth | `frontierCombat.ts` (rule) → `rivalEvents.ts` (day pulse) | new-calendar-day | `canRivalCampGrow`, `isRivalGrowthDay`, `getRivalGrowthFoodCost`, `RIVAL_GROWTH_INTERVAL_DAYS` |
| Player-declared hostility | `frontierCombat.ts` | player-command | `provokeRival`, `canProvokeRival` |
| Rival diplomacy actions and expiring messages | `rivalDiplomacy.ts` | typed player action and rival day pulse | `getRivalGiftEligibility`, `sendRivalGift`, `respondToDiplomacyEvent`, `tickPendingDiplomacyEvents`, `maybeQueueDiplomacyEvent` and related gates; no duplicate implementations in `groupEvents.ts`. |
| Event site sampling | `worldEventSites.ts` | event roll | `pickSite` — the shared deterministic site chooser used by visitors and strategic camp metadata. |
| Rival schedule wiring | `rivalWorldTick.ts` | daily | `tickWorldRivalSettlements` — wires the dedicated rival tick, diplomacy and old camp poaching cleanup. |
| Yearly world event selection | `groupEvents.ts` | yearly event pulse | `rollYearlyWorldEvent` — general events and visitors only; does not establish rival settlements. |
| Frontier map overlay sizing | `CitizenOverviewScreen.tsx` (composes existing `GameWindow.tsx`) | read-only React render when Frontier opens | `CitizenOverviewScreen` — same `max-w-3xl` width and 92vh outer height budget as `App.tsx` battle report; no change to other subjects or simulation state. |
| Strategic frontier map projection | `strategicMapProjection.ts` | read-only React render from `StrategicWorldMap.tsx` | `projectStrategicCamp` — deterministic stable map illustration positions; `rivalInk` and `StrategicWorldMap` draw rivals and raid routes from canonical state and never writes simulation state. |
| Rival settlement record creation | `rivalSettlements.ts` | daily rival pulse / explicit action | `maybeFoundRivalSettlement` — population and calendar gate; `spawnRivalSettlement` — capped at six strategic neighbors with no on-map agents or buildings. |
| Village camp hit testing | `groupEvents.ts` | UI query | `hitTestCamp` — visitor camps only; rival settlements belong to the strategic map. |
| Village camp highlights | `renderer/markers.ts` | render pass | `drawCampHighlightRings` — visitor camp selection only. |
| Raid combat state and resolution | `frontierCombat.ts` | hourly battle / command | `queueRaidDefense`, `resolveIncomingRaidInPlace`, `resolveIncomingRaidCasualties`, `recordIncomingRivalLosses`, `getOutgoingBattleProgressPercent`, `battleReportLeader`, `persistBattleAftermath`, `getRaidParticipants`, `rewardRaidParticipants`, `applyRaidCasualties`, `applyRivalBattleLosses`, `resolveOutgoingRaidCombat`, `releaseRaidSoldiers`, `raidArmy`, `beginTextRaidBattle`, `resolveLiveRaidCasualties`, `finishTextRaidBattle`, `tickPendingRaidEvents`, `tickPendingOutgoingRaidEvents`, `respondToRaidEvent`, `respondToOutgoingRaidEvent`, `launchRaidOnRival`, `resolveRaidVictory` — one resolution owner, persisted milestones, idempotent merit and ordinary Chronicle events via `logEvent`. |
| Raid recovery and valley memory | `raidAftermath.ts` | hourly recovery / combat result | `isSettlementDestroyed`, `beginRaidRecovery`, `tickRaidRecovery`, `rememberRivalDisposition` — explicit last-defense gates, recovery targets and bounded witnessed diplomatic memories. |
| Captive custody history and departure | `warPrisonerCustody.ts` | command / escape / prison removal | `recordWarPrisonerOutcome`, `departWarPrisoner` — identity-linked history and living departures shared without combat/removal import cycles. |
| Captive transitions | `warPrisoners.ts` | combat result / worker command / escape | `captureRaidPrisoners`, `resolveWarPrisoner`, `applyWarCommunityReaction` — real combatant captivity initializes a fresh custody record, voluntary recruitment removes the custody stamp with that record and initializes regular physiology; restraint and severity voices read `evaluateTraitInfluence`'s `civic`/`communityReaction` exact result, never a direct trait check. |
| Warfare state validation | `saveLoad.ts` | load boundary | `findInvalidWarfareState` — reject malformed optional recovery and captivity records while accepting older saves without them. |
| Warfare browser smoke | `scripts/autoplay_playwright_probe.py` | browser harness | `run_warfare_smoke` — loads actual saves through the existing UI and reports observed recovery, terminal export, captive decisions and confirmed razing persisted in an exported save. |
| Warfare status and decisions | `components/WarfareStatus.tsx` | UI | `WarfareStatus` — recovery repairs, terminal historic report/export/navigation and confirmed captive decisions through worker commands. |
| Terminal raid history view model | `game/raidTerminalReport.ts` | on-demand, read-only when a destroyed settlement is displayed | `buildRaidTerminalReport` — derives final leader from persisted genealogy/battle ID, bounded Chronicle highlights and reached chapters; no writes or additional save state. |
| Raze confirmation presentation | `components/RazeConfirmation.tsx` | UI on a persisted pending raid decision | `RazeConfirmation` — neutral explanation of removal, displacement and witnessed diplomacy; delegates confirm/cancel to `App`, never writes world state. |
| Raid growth scaling | `frontierCombat.ts` | raid queue | `getRaidGrowthScale`, `getRaidLootScale`, `raiseRaidLootToFloor`, `rollOutgoingRaidSpoils`, `RAID_GROWTH_BASE_ADULTS`, `RAID_LOOT_MAX_SCALE`, `multiplyRaidLoot` |
| Raid truce and founding cooldown | `frontierCombat.ts` | command (treaty) / rival founding | `applyTruceToRival`, `rollFoundingRaidCooldownDays`, `cancelPendingRaidsForRival`, `cancelPendingOutgoingRaidsForRival` |
| Casual social motive and partner selection | `humanSocial.ts` / `socialLife.ts` | realtime with staggered neighbour query | `simAmbientChatNeighbors`, `simSettlerPairChat`, `pickSocialImpulse`, `tryWorkplaceBanter`, `tryNeighborGreeting` — own eligibility, location and chance, not authored content or chat-state writes; work banter reads canonical trait evaluation. |
| Youth love | `humanRelationships.ts` | new-calendar-day | `advanceYouthLove`, `reconcileYouthLove` |
| Courtship / marriage | `humanRelationships.ts` | staggered-social (approach) + new-calendar-day (reconciliation) | `findCourtshipPartner`, `bindCourtship`, `reconcileCourtships`, `tryCompleteCourtshipMarriage` |
| Affairs / scandal | `humanRelationships.ts` | daily + staggered + caught-in-act | `tryDailyAffairEncounter`, `canPursueSecretAffair`, `exposeAffair`, … |
| Conception | `humanRelationships.ts` | new-calendar-day | `tryDailyConception` — married and youth rolls read `evaluateTraitInfluence`'s `family`/`conception` Lucky multiplier; affair conception stays trait-free |
| Pregnancy progress / birth | `humanLifecycle.ts` | pregnancy-progress | `tickPregnancyAndBirth` |
| Moon Howler | `moonHowler.ts` | full-moon event at its own 22:00 nightfall (`MOON_HOWLER_NIGHT_START` in `daycycleconstants.ts`); ordinary village night starts 23:00 | `tickMoonHowlerCycle`, … |
| Leader-house complex / annex eligibility | `leaderHouseExpansion.ts` | building placement, leader housing | `leaderHouseBuildings` (oldest manor is permanent primary), `canBuildLeaderHouse` (the sole annex unlocks once the main manor exceeds 20 occupants) |
| Leader residency | `leaderHouse.ts` | assignment pulse (first phase) + event | `applyLeaderHousePhase` — the `leader` phase's decision, which the sweep runs on its own ledger; `leaderHousingContext` (the phase's decision context, built from the manor's policy); `evictionHouseholds` (the manor's departing residents grouped as households, so a minor leaves with their custodian); `syncLeaderHouseResidency` runs that phase alone after an election, a succession, a Moon Howler reversion or a completed manor. Who holds the manor is decided through `relocateHousehold` (the manor never counts its bed cap) |
| Leader household membership | `leaderHouse.ts` | daily / query | `collectLeaderHousehold` — who is entitled to the manor |
| Leader descendants walk | `householdComposition.ts` | query | `collectLeaderDescendants` — the family tree every household list is built from |
| Blueberry foraging and rare-tree placement | `blueberryForaging.ts` | new-game spawn / staggered / daily | `isBlueberryTree`, `hasRipeBlueberries`, `clearBlueberryTarget`, `spawnBlueberryTrees`, `tickBlueberryRegrowth`, `tryTickBlueberryForaging` |
| Calendar clock | `dayCycleClock.ts` | — | `TICKS_PER_DAY`, `isNewCalendarDayTick`, hour/day math |
| Calendar constants | `daycycleconstants.ts` | — | night/moon/adult-age constants |
| RNG salt | `simRng.ts` | — | `hashSalt` |
| Player commands | `simWorker/commands.ts` → domain owners | player-command | `isWorkerCommand`, `applyWorkerCommand` |

## Owners recorded by the 2026-09-13 simulation audit

The audit and the fixes that followed touched decisions that had no owner row here. Recorded
now, using the names the modules actually export, so the next change knows which module owns the
behaviour. Nothing here changes the ownership law: one decision, one owner, one definition.

| Decision | True owner | Cadence | Key entry functions |
|---|---|---|---|
| Combat tiers, counter-attack / block rolls | `combat.ts` (research data in `gameTypes.ts`; raid outcomes in `frontierCombat.ts`) | combat resolution | `getArmamentSteps`, `getCounterAttackChance`, `getPredatorBlockChance`, `rollCounterAttack`, `rollPredatorBlock` |
| Deaths and yearly statistics | `stats.ts` (the per-tick tally is written by `gameTick.ts`) | per-tick tally + year-rollover record | `recordYearlyStats`, `updateLifetimeStats`, `createEmptyLifetimeStats`, `normalizeLifetimeStats`, `recordResourcesGathered`; `gameTick`'s `deathsThisYear` tally and `largestPopulation` running peak |
| Ordinary Chronicle (including raid dispatch, combat, casualties, fate and outcomes) | `eventLog.ts` | event-driven | `logEvent`, `logDeath`, `syncEventLogIdFromState`, `repairEventLogOnLoad`, `resolveCombatLogKind`, `resolveCombatLogStage`, `summarizeCombatEvents` — canonical `WorldState.eventLog` history; battle reports are supplementary summaries, not another eventlog. |
| Big news, notifications, floating text | `simEffects.ts` | event-driven | `addBigNews`, `syncBigNewsIdFromState`, `addNotification`, `addFloatingText` |
| Save / load, terrain-revision regeneration, persisted-ID validation and timeline migration | `saveLoad.ts` (allow-list: `saveSchema.ts`) | load / player-command | `compactWorldMapForSave`, `restoreWorldMapFromSave`, `applySavedTerrainOverrides`, `buildSaveData`, `loadGameFromParsed`, `loadGameFromParsedOutcome`, `parseSaveJson`, `loadGameFromFileTextOutcome`, `migrateTickTimeline`, `migrateEntityPersistedFields`, `clearAutoFilledChurches`, `backfillLegacySettlerDNA` (a saved settler with no valid DNA — including one saved in Moon Howler form — gets canonical traits derived from the colony seed and its own id, after the RNG registry is restored and without drawing from a live stream; a valid 1–3 trait set is kept as written), `isUsableId`, `isPersistedId` (saved identifiers must remain below the allocator ceiling), `floorIdAllocators` |
| Worker transport (prep + tick delta) | `simWorker/simPrep.ts` + `simBuffers/simDelta.ts` | per-tick / per-command | `extractSimPrep`, `applySimPrep`, `extractSimTickDelta`, `applySimTickDelta` |
| Session clock, command queue, worker fallback | `gameLoop.ts` | animation-frame / command | `frame`, `applyCommand`, `flushDeferredWorkerCommands`, `fallbackFromWorker` |
| Authoritative save-export barrier | `gameLoop.ts` (snapshot transport: `simWorker/GameWorkerHost.ts`) | on-demand save | `exportAuthoritativeWorld` holds new ticks, awaits pre-save command chain and worker idle, rejects degraded recovery snapshots; `lastExportWasDegraded` reports validity to `useGamePersistence.persistGame` |
| Trade caravans and routes | `tradeCaravans.ts` | systems layer + departure schedule | `tickTradeCaravans`, `spawnCaravan`, `scheduleTradeRouteDeparture`, `getCaravanMoveTarget` |
| Civic petitions / town-hall audience, and the player's Town Hall lookup | `townHall.ts` + `playerTownHall.ts` | daily (resolution) + realtime (greeting only) | `resolveCivicPetition`, `tickTownHallAudiences`, `officialHandlePetitioners`, `wantsCivicAudience`, `findPlayerTownHall` |
| Human age and fertility ladder | `dayCycle.ts` (`daycycleconstants.ts` for the ages) | daily sync / pure helpers | `HUMAN_FERTILITY_START`, `getFemaleFertility`, `getYouthConceptionMultiplier`, `syncHumanAgeFromCalendar`, `tryGraduateHumanChild` |
| Adoption household candidate selection | `residencyReconciliation.ts` | guardianship phase | `livingAdoptiveCustodian`, `listVillageCouples`, `listVillageSingleAdults` (select available adoptive guardians and their households) |
| Housing unit composition | `householdComposition.ts` (selection: `residencySelection.ts`) | assignment | `findLivingHuman` (shared alive-entity lookup), `isMinorChild`, `collectOwnHousehold`, `collectMinorHousehold`, `getChildCustodian`, `buildHousingUnits`, `parentIdsOf` (a settler's biological and adoptive parent ids) |
| Medical care | `hospitalCare.ts` + `humanHospitalBehavior.ts` | daily care pass / realtime routing | `isRestingHospitalPatient` (verified staffed ward admission), `needsMedicalCare`, `medicalCareReason`, `treatPatientAtHospital`, `doctorTreatNearby`, `tickHospitalDailyCare`, `getHospitalRoster`, `describeHospitalRoster` |
| Hospital doctor rota and shift windows | `hospitalShifts.ts` | pure tick/day lookup and inspector projection | `HOSPITAL_SHIFT_HOURS`, `HOSPITAL_SHIFTS_PER_DAY`, `HOSPITAL_SHIFT_WINDOWS`, `hospitalDoctorRoster`, `hospitalDoctorSlotForDay`, `doctorHospitalShift`, `isHospitalDoctorOnShift`, `isHospitalDoctorCommuteTime`, `hospitalCoverageSummary` |
| Visitor and settler lodging | `hotelStay.ts` (also owns `HOTEL_GUEST_CAPACITY = 8`) | daily + realtime | `tickHotelLodging`, `checkInVisitor`, `checkoutVisitor`, `steerVisitorToHotel`, `needsHotelBed`, `lodgingHotelsFor`, `countHotelSettlerLodgers`, `buildHotelSettlerLodgerCounts`, `isSettlerLodgingAtHotel`, `lodgingHotelFor`, `restAtHotel`, `getHotelRoster`, `describeHotelRoster`, `holdsSettlerHotelBed` (reserved settler bed predicate), `repairHotelStayPointers`, `repairAllHotelStayPointers`, `hotelHasVacancy`, `pickHotelForVisitor` |
| Autumn migration and herds | `migration.ts` | new-calendar-day (autumn window) | `tickMigration`, `migrationArrivalDay` |
| Ecosystem health score and its explanation | `dailyEcology.ts` (score, plus the story-driver `adjustEcosystemHealth` / `adjustPollutionLevel`) + `ecoBreakdown.ts` (read-only breakdown) | daily | `tickEcosystemMetrics`, `adjustEcosystemHealth`, `adjustPollutionLevel`, `calculateBiodiversityIndex`, `getEcosystemBreakdown` |
| Village happiness and beauty | `beautyGrid.ts` | daily | `tickBeauty`, `rebuildBeautyGrid`, `computeVillageHappiness`, `pickBeautySpot` |
| Watchtower early warning | `watchtowerDetection.ts` | systems layer | `detectRaidersFromWatchtowers` |
| Wall / road topology, snapping and batch demolition selection | `stripTopology.ts` + `stripBuild.ts` (placement: `buildingPlacementActions.ts`; removal: `buildingMaintenanceActions.ts`) | player-command | `buildStripPlanFromDrag`, `buildStripPlanFromStroke`, `resolveStripPlan`, `resolveWallStripPlan`, `resolveRoadStripPlan`, `findStripBuildingAt`, `computeStripSegmentCenters`, `collectStripDemolitionIds`, `collectRoadEntranceSnapPoints` (front-of-building road anchor), `demolishStripBuildingsInPlace`, `stripCrossingIsTheOnlyOverlap` (`placementUtils.ts`) |
| Authored one-time stories (flags, cards, cooldown) | `storyHelpers.ts` (shared contract) + each story owner (`travelingTheatre.ts`, `inventionFair.ts`, `famineDesperation.ts`) | daily / story-card answer | `storyFlag`, `setStoryFlags`, `pushStoryCard`; `maybeOfferTravelingTheatre`, `resolveTravelingTheatre`, `tickTravelingTheatre` |
| Leadership elections, candidacy merit and incumbent record | `villageLeadership.ts` | daily due-date check, year rollover, ceremony ticks | `tryStartVacancyElectionCeremony`, `tryStartTermElectionCeremony`, `tickElectionCeremony`, `tickElectionGossip`, `selectElectionGossip`, `tickLeaderVacancy`, `getLeadershipScoreBreakdown`, `getIncumbentRecordAssessment` |
| Tutorial / guided campaign | `guidedCampaign.ts` + `tutorialCampaign.ts` | daily | `tickGuidedCampaign`, `recordGuidedCampaignChoice`, `currentCampaignStep` |
| Pathfinding and the path cache | `pathfinding.ts` | realtime movement | `findPath`, `findRouteCost` (the same search's step cost), `findRouteCostOutcome` (that cost plus the budget verdict), `searchRoute` (the one A* both search APIs read), `isRoadSurfacePoint` (exact shared footprint eligibility), `walkRoute` (bounded movement route), `collapseStraightWaypoints`, `beginPathSearch`, `resetPathGridCaches`, `getPathGrid`, `getCurrentPathGrid`, `pathWaypoints`, `steerWithPath`, `setCurrentPathMap`, `distanceToSegment`, `isWalkStepAllowed` (the grid's verdict on one walk step) |
| Road/wall sprite painter | `stripRender.ts` | render | `paintStripSprite`, `paintRpgPavementPattern`, `paintRpgStoneStrip`, `drawProceduralRoad`, `drawProceduralWall`, `drawStripJunctionOverlay` |
| Sprite preload and lookup (presentation) | `spriteLoader.ts` | boot / render | `preloadAllSprites`, `loadSprite`, `getSprite`, `isSpriteLoaded` |
| Terrain decor stamps (presentation) | `terrainLayer.ts` | render / bake | `stampPropSprite`, `stampMountainPeaks`, `mountainSpritesReady` |
| Staffing eligibility and assignment | `buildingStaffingActions.ts` (eligibility rules in `residencyOccupancy.ts`) | player-command + assignment | `autoStaffAllWorkers` (enable Auto-fill colony-wide and staff; worker-owned commands mutate the authoritative world without a second deep clone, isolated calls retain copy semantics), `canAssignWorkerToBuilding`, `assignStaffWorkerToBuilding`, `removeStaffWorkerFromBuilding`, `hasWorkAssignment`, `isImprisoned` |
| Storage caps and food spoilage | `economy.ts` (one derivation: `computeStorageMax`, over the `BASE_*_STORAGE` / `WAREHOUSE_IRON_STORAGE` constants), wired daily by `dailyBuildingEconomy.ts`; world gen and the save-load fallback call the same function | daily (first step of `tickStaticDaily`) | `computeStorageMax`, `updateStorageCaps`, `applyFoodSpoilage`, `addResource` |
| Economy ledger history and its day rollover | `economyLedger.ts` | daily | `rollEconomyLedgerForDay`, `getEconomyLedger`, `getRecentFoodFlow` (contiguous completed-day production/consumption history), `recordFoodProduced`, `ECONOMY_SOURCE_LABELS` |
| Off-screen wildlife throttle | `simFocus.ts` | wildlife-layer pulse | `isOffscreenWildlifeActive` |
| Moon Howler curse and form lifecycle | `moonHowler.ts` | full-moon nightfall + debug command | `shouldMoonHowlerTransform`, `canBeginMoonHowlerCurse`, `countActiveMoonHowlerCurses`, `transformToWerewolfForm`, `revertToHumanForm`, `tryMoonHowlerChurchCures` |
| Village-request acceptance | `groupEvents.ts` | daily generation + typed player command | `tickVillageRequests`, `resolveVillageRequest`, `getVillageRequestEligibility` |
| Wildlife reproduction snapshot (population caps, scarcity boost) | `simQueries.ts` (`REPRO_WILDLIFE_TYPES`) | wildlife layer | `buildWildlifePopulationSnapshot`, `wildlifeTypePopulation`, `recordWildlifeBirth` |
| Leader office across the Moon Howler form | `villageLeadership.ts` owns the office; `moonHowler.ts` only carries `villageLeaderId` through the revert | full-moon revert / cure / load | `isActingVillageHead`, `RevertToHumanFormOptions.villageLeaderId`, `revertToHumanForm` |
| Simulation randomness: streams, seed and their positions | `simRng.ts` (including stateless per-person daily rolls: `personDayRoll`); presentation owners use the separate `getPresentationRng` registry | per draw; positions cross realms via `world.simRng` | `getSimRng`, `getPresentationRng`, `personDayRoll`, `seededRandomForRun`, `snapshotSimRng`, `restoreSimRng`, `parseSimRngSnapshot`, `setSimSeed`, `adoptSimSeedFromWorld`, `stampWorldSimRng`, `adoptWorldSimRngStamp`, `worldSimRngSnapshot` |

## Owners recorded by the 2026-09-16 ownership pass

Recorded from the call graph (`npm run graph:calls` → `docs/tools/call-graph.html`). Every row below is
a module whose functions no earlier row mentioned, while the graph shows other modules calling it from
a tick layer, the command boundary, the worker/save boundary or the render pass. The owner is the module
that **decides**; helpers inside an owned module inherit that module's row and need none of their own.
Cadence and the calling layer are taken from the observed call sites, not from intent.

| Decision | True owner | Cadence / called from | Key entry functions |
|---|---|---|---|
| Player-settler identification | `playerHuman.ts` | — (predicate on every human query) | `isPlayerHuman`, `playerHumanCount` |
| Entity construction and spawn defaults | `entityFactory.ts` | on spawn (world gen, birth, immigration, groups, foraging) | `createEntity`, `finalizeSettlerAge` |
| Immigration party composition (lone youth 12–17, couple with children, single adult) | `worldGen.ts` | on arrival (daily immigration, `tickImmigration`) | `createImmigrantSettler` |
| New-world spawns, version-3 jittered biome-weighted tree groves and wildlife replenishment | `worldGen.ts` | world init and ecology events | `simRandom`, `getRandomInt`, `getTileAtWorld`, `isPassableWildlifePosition`, `registerSpawnedWildlife`, `maxRingRadiusFromCenter`, `spawnWildlifeAtRandomPassable`, `setEntityBirthDate`, `createBuilding`, `spawnGrassPatch`, `spawnWildlifeRing`, `replenishDepletedWildlife`, `initGame` |
| Entity spawn/despawn bookkeeping and grid sync | `simulation/simulationEntities.ts` | per entity change (`tickLayerSystems`, `dailyGrassEcology`, hunting, daily economy, birth, immigration) | `pushNewEntity`, `syncEntityGrids`, `markWildlifeDead`, `markGrassDead`, `isValidHuntPrey` |
| Entity id index | `entityIndex.ts` | per add/remove (all spawn and kill paths) | `indexLivingEntity`, `ensureEntityByIdMap`, `unindexEntityFromState`, `indexEntity` |
| Death, removal and family-reference cleanup | `humanLifecycleCleanup.ts` | on death (raids, disasters, mortality, exhaustion, Moon Howler) | `killHuman`, `finalizeHumanDeath`, `reconcileFamilyReferencesAfterRemoval`, `reconcileOrphanedMarriages` — the spousal mourning window comes from `evaluateTraitInfluence`'s `family`/`spousalBereavement` duration |
| Cross-realm cache strip/hydrate | `worldRuntimeCaches.ts` | worker upload, import, prep rollback, display rebuild | `invalidateWorldRuntimeCaches`, `hydrateWorldRuntimeCaches`, `createOptimisticDisplayWorld`, `carryPresentationControls` |
| Worker transport, handshake and session swap | `simWorker/GameWorkerHost.ts` + `simWorker/gameWorker.ts` + `simWorker/gameWorker.node.ts` + `simWorker/protocol.ts` | worker boundary (message channel) | `init`, `requestTick`, `sendCommand`, `importSave`, `exportSave`, `stopProfiling`, `whenReady`, `whenIdle` |
| Work schedule | `workSchedule.ts` | realtime per-hour + player-command | `getWorkSchedule`, `isOnWorkScheduleShift`, `validateWorkSchedule`, `setWorkSchedule` |
| Venue schedule | `venueSchedule.ts` | realtime + player-command; crosses realms in the tick delta | `getVenueSchedule`, `isVenueServiceHour`, `getVenueAutoStaffingTarget`, `setVenueSchedule` |
| Festival keeps a tavern open all day | `venueSchedule.ts` | — (predicate read by the tavern shift and the venue editor) | `isFestivalOverrideActive` |
| Speech session executor and sole simulated chat-state writer | `humanChat.ts` | realtime (`tickHumans`), forced interruption, cleanup/reset | `tickHumanChat`, `startDialogueTreeChat`, `prepareScriptedDialogue`, `isDialogueBusy`, `releaseDialogueSession`, `cleanupEntityDialogueState`, `resetDialogueSessions` — sole owner of `chatPhrase`, `chatTicks`, `chatPartnerId`, `chatDialogueSessionKey`; live pair references enable immediate atomic release when interrupted, and cleanup rejects absent actors and missing keys; render-buffer serialization is a transport mirror. |
| Seeded-colony Virtual Player execution | `scripts/colonyHealth.ts` | scenario harness / acceptance tests | `applyColonyBotAction` — calls the live Virtual Player and worker-command gateway, preserving replacement worlds. |
| Physiology calibration scenario fixture | `tests/humanNeeds.calibration.test.ts` | deterministic scenario tests | `runNeedsScenario` — time-stepped standalone 7/30-day nutrition, sleep, work and famine budgets. |
| Serialized human-needs state | `gameTypes.ts` | type boundary for spawn, save/load, simulation worker and UI | `HumanNeedsState` — authoritative per-player-human numeric reserves and recovery metadata, carried on `Entity.needs` and saved moon-form snapshots. |
| Human physiology and need decisions | `simulation/humanPhysiology.ts` (`humanPhysiology` registry key) | player human tick, spawn, save and form transitions | `HUMAN_NEEDS`, `hasNearbyWell` (400 px radius), `HumanNeedsObservation`, `HumanNeedsIntent`, `initialHumanNeeds`, `normalizeHumanNeeds`, `advanceHumanNeeds`, `resolveHumanNeedsIntent`, `getHumanNeedsWorkMultiplier`, `hasFatalStarvation`, `creditHumanNutritionFromFood`, `adjustHumanStaminaFromEnergy`, `rebaseHumanNeedsClockAfterFormRestore` — single rule/config owner and single reserve-mutator contract; `advanceHumanNeeds` divides negative stamina rates by the catalog's physiology/labor factor. |
| Needs: meal transactions, prison rations and starvation death | `simulation/humanNeeds.ts` (`humanMeals` registry key) | realtime; prison ration at 08:00 daily per captive | `tryEatColonyMeal`, `canEatColonyMeal`, `isMealCheckHour`, `killFromStarvation`, `fract`, `freeHuntFoodGain` — sole writer of `warCaptive.lastRationDay` after successful ledger debit; one ration per calendar day, persisted through save/load, no captive physiology |
| Skills and job skill effects | `skills.ts` | work (`dailyBuildingEconomy`, workforce transitions, apprenticeships, graduation) | `ensureEntitySkills`, `readSkill`, `gainSkill`, `getWorkerSkillMultiplier` (crew skill × the catalog factor for the crew's own work context: the site trade for production, `builder`/construction for a build crew — including a site with no production job, whose skill baseline is Builder; a supplied occupant index is authoritative and a missing or dead id counts neutral), `rewardProductionSkills`, `rewardBuildingWork` |
| School attendance, credit and graduation | `education.ts` | realtime (`humanTick`) + new-calendar-day credit | `hasTeacherPresent`, `recordChildSchoolTick`, `creditChildSchoolDay` (class time needed scaled by the `school`/learning trait factor), `applyEducationGraduation`, `getEducationResearchMultiplier` (education share times the adults' averaged `school`/research DNA factor, applied once), `buildSchoolRosters` |
| Friendship and feud webs (with their daily energy effects) | `relationships.ts` | new-calendar-day (`tickLayerDaily`) | `advanceSocialRelationships`, `startFeud`, `friendshipScore`, `feudScore` — cross-person incompatibility counts come from `evaluateTraitInfluence`'s `social`/`feudClash` count over the catalog's `TRAIT_OPPOSITIONS`, never a local pair table |
| Election promises | `electionPromises.ts` | new-calendar-day (three daily call sites) | `tickElectionPromises`, `recordElectionPromises`, `getPromiseDetail`, `electionPromisesForYear` |
| Wedding diplomacy beat | `weddingDiplomacy.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `maybeOfferWeddingDiplomacy`, `tickWeddingDiplomacy`, `resolveWeddingDiplomacy`, `getWeddingDiplomacyChoiceEligibility` |
| Authored story events (children shelter, winter freeze, grief, welcomes) | `storyEvents.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `offerStoryEvent`, `tickChildrenShelter`, `tickWinterFreezeCheck`, `respondToStoryEvent`, `getStoryChoiceEligibility` |
| Village forge orders | `forge.ts` | daily (`tickBuildingProduction`) + player-command | `tickVillageForge`, `queueForgeOrder`, `isForgeOrderComplete`, `normalizeForgeState` |
| Building adjacency index | `adjacencyIndex.ts` | assignment/daily (production, completion, demolition) | `ensureAdjacencyIndex`, `syncAdjacency`, `unindexAdjacency`, `getAdjacencyMultiplierFromIndex` |
| Valley ecology stage (`ValleyEcology.ENABLED` is the single switch) | `ecologyStage.ts` | daily (`tickDailyWorldEvents`) | `tickValleyEcologyStage`, `valleyStageIndex`, `computeRawEcologyStress`, `getValleyHuntYieldMultiplier` |
| Housing/bed projection for decisions and UI | `populationGrowth.ts` | on demand (auto-play `decide*`, citizen overview, focus hints) | `snapshotPopulation`, `getOpenPlayerBeds`, `getTotalBeds`, `getLivePlayerPopulation` |
| Social proximity queries | `adaptiveSpatialQuery.ts` | — (query helper over the human social grid) | `forEachAdaptiveInRadius`, `findClosestAdaptiveInRadius`, `socialAdaptiveOptions` |
| Citizen identity, display names and chronicle names | `citizenId.ts` | — (formatting/parse, no state) | `humanDisplayName`, `formatCitizenName` (identified labels), `citizenFullName` (prose), `formatDeathLog` (prose with death-age detail), `findCitizenByQuery` |
| Name pool, census names and marriage surname dissolve | `nameLoader.ts` | boot load + spawn + divorce/remarriage | `loadNames`, `ensureNamesLoaded`, `getRandomName`, `getRandomSurname`, `fixDefaultNames`, `dissolveMarriage` |
| Shared sim helpers (multipliers, reputation, season) | `simHelpers.ts` | — (helper, no cadence of its own) | `getMultiplier`, `addReputation`, `hasTech`, `getSeason` |
| Relationship diagnostics | `relationshipDiagnostics.ts` | dev-only, recorded at each decision roll | `recordRelationshipDiagnostic`, `flushRelationshipDiagnostics`, `setRelationshipDiagnosticsEnabled` |
| Spatial-query metrics and grid A/B switch | `spatialQueryMetrics.ts` | dev-only | `setSpatialQueryMetricsEnabled`, `setSpatialQueryGridMode`, `isSpatialQueryMetricsEnabled` |
| Auto-play decisions and their waiting verdict (dev-gated, N17) | `virtualPlayer.ts` | player-command — one action per in-game hour through the same command door | `decideVirtualPlayerAction` and the `decide*` family, `virtualPlayerWaitingReason`, `observeIndoorPatients` (read-only live patient state), `buildingBlockReason`, `canSpendKeepingReserve`, `spareBedReserve`, `wantedProducerCount`, `completedProducerCount`, `isMeasuredFoodDeficit` (reads recorded supply, never invents output), `firstUnstaffedFoodProducer`, `decideUnstaffedFoodProducer` (repair auto-managed food staffing before new construction) |
| Auto-play tuning (buffers, reserves, producers per settler) | `gameConstants.ts` | — (data read by the `decide*` family) | the `VirtualPlayer` block (`SPARE_BED_*`, `SETTLERS_PER_FOOD_PRODUCER`, `SETTLERS_PER_INDUSTRY_PRODUCER`) |
| Player preferences | `game/preferences.ts` | UI (boot read + toggle write) | `loadAutoSavePreference`, `saveAutoSavePreference`, `loadTutorialsEnabled`, `saveTutorialsEnabled` |
| Camera and view state | `viewState.ts` | render pass + input + session setup | `createInitialView`, `createInitialViewForWorld`, `updateView`, `resolveEntity`, `resolveBuilding`, `clampCameraZoom` |
| Building rotation rules | `buildingRotation.ts` | player-command (placement) | `isRotatableBuildingType`, `toggleBuildingRotation` |
| Sprite metrics and class-ladder variants | `humanSprites.ts` | spawn (variant pick) + render pass | `pickHumanVariant`, `getHumanSpritePath`, `getHumanSpriteMetrics`, `getHumanSelectionBounds`, `humanRenderDetail`, `getHumanMarkerRadius` |
| Terrain atlas bake and tile picks | `terrainAtlas.ts` | render pass (cached; rebuild on readiness) | `terrainAtlasReady`, `pickAtlasTile`, `pickSandWaterOverlay`, `atlasFamily` |
| Terrain height-sampling compatibility and mesh vertex heights | `terrainAtlas.ts` | render / terrain query | `supportsTerrainHeightMesh`, `meshVertexRise`, `terrainRiseAt` — single height interpolation owner for projected ground and sprites. |
| Audio direction | `audio/index.ts` + `audio/director.ts` | UI events + time of day | `unlockAudio`, `primeAudioUnlock`, `ensureIntroAudio`, `beginAudio` |
| Building placement validity | `placementUtils.ts` + `grid.ts` | player-command + world gen | `canPlaceBuildingSnapshot`, `isFootprintOnBuildableTerrain`, `isBuildingTechUnlocked`, `isFootprintWithinMapBounds` |
| Research unlocks and progression | `research.ts` | player-command + building completion | `startResearch`, `canStartResearch`, `updateResearch`, `grantResearchProgress`, `syncResearchUnlocks`, `notifyBuildingLocked` |
| Rival temperament/priority profile and its daily action | `rivalProfiles.ts` | daily (rival settlement pulse) | `ensureRivalProfile`, `createRivalProfile`, `normalizeRivalProfile`, `selectRivalDailyAction`, `applyRivalDailyAction` |
| Rival peace state | `rivalPeace.ts` | player-command + daily rival pulse | `isRivalAtPeace` |
| Settler trait rolls and inheritance | `settlerTraits.ts` | spawn (roll/inherit) + save-load DNA backfill | `rollSettlerTraits` (optional injected `RngStream`; the live path draws the `settlerTraits` stream), `rollLegacySettlerTraits` (seed + citizen id, called only by `saveLoad.backfillLegacySettlerDNA`), `validSettlerTraits`, `inheritSettlerTraits`, `hasTrait` |
| Canonical JSON dialogue catalog, routing and presentation validation | `dialogueTrees.ts` | startup index; on-demand requests at existing domain cadence (no new tick) | `buildCanonicalDialogueBank`, `freezeDialogueTree`, `indexDialogueBank`, `ensureDialogueBankFromBundle`, `preloadDialogueBank`, `requestDialogue`, `dialogueHoursFromNominalTicks`, `tickDialogue`, `maybeDialogueChat`, `pickRandomChatContext`, `tryAmbientRandomDialogue`, `contextualAmbientScene`, `getDialogueTreeById`, `readPresentationDialogue`, `bindNumberedPresentationSpeakers` — 94 registered exact event keys; compiled/worker-installed scenes and lines are frozen; no direct Entity field writes; all gathered 6–10 actors must speak in group presentations; PR #91 overlay hookup is deferred. |
| Entity-layer cache and canvas surfaces | `entityLayer.ts` + `canvasLayer.ts` | render pass (cached per layer key) | `beginEntityLayerPaint`, `entityLayerNeedsRebuild`, `buildEntityLayerKey`, `getCanvasContext`, `createCanvasSurface` |
| Sprite drawing primitives | `renderer/spriteDrawing.ts` + `renderer/shared.ts` + `stripRender.ts` + `decorRender.ts` | render pass | `drawSpriteFrame`, `drawBuildingSprite`, `drawContactShadow`, `drawGroundAO`, `drawProceduralRoad`, `drawProceduralWall`, `drawProceduralDecor`, `isDrawableSpriteFrame` |
| Human, route and hunt line drawing | `renderer/humans.ts` | render pass | `drawHumans`, `drawTradeRouteLines`, `drawRaidMarchLines`, `drawHuntVisuals`, `drawCombatBurst` |
| Audio graph, scheduling and SFX | `audio/graph.ts` + `audio/scheduler.ts` + `audio/session.ts` + `audio/sfx.ts` + `audio/sampleLoader.ts` | UI events + time of day (intro/gameplay gating) | `scheduleTone`, `setIntroAudioAllowed`, `setGameplayAudioActive`, `playClickSound`, `playBirthSound` |
| Disasters, weather effects and storm/earthquake damage | `worldEvents.ts` | realtime weather + daily disasters (`tickLayerSystems`, `tickLayerDaily`) | `updateWeather`, `applyDailyWeatherEffects`, `updateDisasters`, `applyStormDamageToBuildings`, `applyEarthquakeDamageToBuildings` |
| Camp-site selection and buildable clearing | `terrainGen.ts` | new-game generation and old-save regeneration | `generateWorldMap`, `isCoastalPreset`, `rectAroundTile`, `findCampSite`, `ensureCampClearing`, `clearStartAreaForest`, `isFootprintBuildable` |
| Terrain queries (tiles, spawn validity, adjacency multiplier) | `terrainSystems.ts` | world gen + placement + daily economy + immigration | `getTileAt`, `isValidHumanSpawnPosition`, `findHumanSpawnNear`, `isInsideCompletedBuilding`, `getAdjacencyMultiplier`, `getTerrainEfficiencyMultiplier` |
| Defense structures (walls, watchtower, barracks guards) | `defenseStructures.ts` | player-command build + raid resolution | `countCompletedDefenseBuildings`, `getWallSegmentBonus`, `getWatchtowerBonus`, `getBarracksGuardCount`, `getDefenseStructureBreakdown` |
| Militia armament and strength math | `militiaBalance.ts` | raid resolution + UI projection | `computeMilitiaBreakdown` (base priced per mustered soldier by that soldier's own `danger`/`defense` factor), `getMilitiaSpearTier`, `getMilitiaShieldTier`, `getMilitiaArmamentLabel` |
| Rumour ledger beat | `rumourLedger.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `maybeOfferRumourLedger`, `tickRumourLedger`, `resolveRumourLedger`, `rumourLedgerEligibleDay` |
| Valley chronicle narration | `valleyChronicle.ts` | daily (`tickLayerDaily`) | `advanceValleyChronicle` |
| Recruit / tame / debug settler interactions | `settlerInteractionActions.ts` | player-command (`applyWorkerCommand`) | `recruitSettler`, `tameEntity`, `spawnMoonHowlerDebug`, `getRecruitSettlerEligibility`, `getTameEntityEligibility` |
| Deer parliament beat | `deerParliament.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `maybeOfferDeerParliament`, `tickDeerParliament`, `resolveDeerParliament`, `getDeerParliamentChoiceEligibility` |
| Faction camp wander and visitor speech trigger | `factionWander.ts` | realtime (visitor/faction pulse) + session reset | `tickFactionCampWander`, `nextVisitorActivity`, `clearAllFactionWanderStates`, `pruneFactionWanderStates` — visitor POI and performer occurrence decision only; captions requested from dialogueTrees JSON, never direct chat field writes. |
| Strip/road junction classification | `stripJunction.ts` | player-command (placement) + render | `classifyJunction`, `analyzeStripJunction`, `connectionsAt`, `cornerArms`, `detectBuildingJunction`, `collectStripCenters` |
| Alive-entity catalog lookups | `entityCatalog.ts` | per tick / UI lookup | `resolveAliveHumans`, `resolveAliveByType`, `rebuild` |
| Render SoA pack, sidecar and buffer layout | `simBuffers/packRenderSoA.ts` + `simBuffers/entityRenderMeta.ts` + `simBuffers/schema.ts` + `simBuffers/renderSoAEntities.ts` + `simBuffers/renderSoAReader.ts` | per tick (worker packs, host reads) | `packRenderSoA`, `selectRenderEntities`, `packEntityRenderMeta`, `buildRenderEntityShim`, `renderBufferByteLength`, `updateRenderSoABuckets`, `createRenderSoAReader`, `validateRenderBufferLayout` |
| Entity draw cache (viewport) | `renderer/entityCache.ts` | render pass | `updateCachedEntities`, `updateCachedEntitiesFromSoA`, `resetEntityCaches` |
| Weather and seasonal particles | `renderer/weather.ts` | render pass | `drawWeather`, `drawSeasonParticles`, `drawWaterShimmer`, `resetWeatherCaches` |
| Height mesh projection, affine triangle paint and inverse ground picking | `renderer/heightMesh.ts` | chunk bake / UI hit testing | `expand`, `paintTriangle`, `bakeHeightMeshSurface`, `unprojectTerrainY` — clip expansion prevents antialias cracks; shared mesh geometry reads `terrainRiseAt` from `terrainAtlas.ts`; no duplicate height owner. |
| Ground chunk caching and composition | `renderer/terrain.ts` | viewport render (cached) | `targetGroundStep`, `disposeGroundChunk`, `planGroundChunks`, `resetTerrainCaches`, `seasonTerrainShift`, `getTerrainColor`, `buildTerrainCache`, `chunkGeometry`, `ensureChunk`, `bakeChunkDecor`, `drawSimpleGreenGround`, `voidGradient`, `sunGradient`, `drawProceduralGround`, `drawReinforcedSoil`, `drawGround` |
| Ambient beds and track playback | `audio/ambient.ts` + `audio/trackPlayer.ts` + `audio/backgroundMusic.ts` + `audio/introMusic.ts` | UI events + time of day (intro vs gameplay) | `playLoopBed`, `rescheduleOneShot`, `playLoop`, `crossfadeLoop`, `start`, `ensureIntroAudio` |
| Dashboard projections | `dashboardData.ts` | UI (read-only projection) | `collectDashboard`, `explainSettler`, `deriveDashboardBuildings` (the village building table's rows) |
| Chronicle export and download | `eventLogExport.ts` | UI + autosave | `downloadChronicleLog`, `formatChronicleText`, `formatChronicleJSON`, `buildChronicleFilename` |
| Population and wildlife counts | `entityCounts.ts` | per-tick bookkeeping (`gameTick`, `tickLayerRealtime`) + daily point-of-use snapshot (`tickLayerDaily`) | `computePopulationCounts`, `countLivingPopulation`, `computeWildlifeCounts`, `wildlifeCountsFromPopulation` |
| Rival presence summary | `rivalPresence.ts` | UI projection | `getRivalPresenceSummary`, `getRivalActivityLabel` |
| Renffr star omen and settler gossip | `renffrStar.ts` | realtime (`tickLayerRealtime`, `tickHumans`) + overlay draw | `maybeTriggerRenffrOmen`, `tickRenffrOmen`, `createRenffrOmen`, `beginRenffrSettlerChatter`, `isRenffrGossipActive`, `drawRenffrOmen` |
| Chronicle/log panel presentation | `EventLogPanel.tsx` | UI (read + export only) | `EventLogPanel` |
| Apprenticeships (master/apprentice pairing and skill transfer) | `apprenticeships.ts` | new-calendar-day (`tickLayerDaily`) | `advanceApprenticeships`, `apprenticeSkill`, and the trade's `work`/training trait factor inside the daily teach credit |
| Tamed-animal care and feeding | `animalCare.ts` | daily (`tickDailyWorldEvents`) + wildlife layer | `tickAnimalCare`, `tamedAnimalsFedToday`, `countTamedAnimals`, `getAnimalCareStatus` |
| Grazing pressure and grass growth multipliers | `grassEcology.ts` | per tick + daily production | `getGrassGrowthMultiplier`, `getGrazerDailyDemand`, `getWinterEnergyPenalty`, `getWeatherFarmMultiplier` |
| Settler activity status projection (inspector/UI) | `humanStatus.ts` | UI (read-only projection) | `getHumanActivityStatus`, `getHumanActivityProjection` |
| Speech-bubble, name-label and status-badge layout | `renderer/overheadLayout.ts` (layout and decisions) + `renderer/humans.ts` (badge and facts painting) | render pass | `resolveSpeechBubbleRect`, `getSpeechBubbleFontSize`, `getSpeechBubbleHeadClearance`, `shouldDrawHumanNameLabel`, `formatHumanNameLabel`, `getStatusBadgeLayout`, `getNamePlateLayout`, `resolveStatusBadgeKind`, `getStatusBadgeShape`, `getStatusBadgeColor`, `combatTokenStatusKind`, `HUMAN_STATUS_KINDS`, `HumanStatusKind`, `StatusBadgeShape`, `HumanStatusFacts`, `getStatusFacts`, `paintStatusGlyph`, `drawStatusBadge` |
| Render clock and canvas motion preference | `renderer/shared.ts` | render pass (once per frame) | `tickRenderClock`, `resetRenderClock`, `renderTime`, `motionTime`, `prefersReducedMotion`, `effectiveScreenShake` |

### Presentation, UI and remaining simulation owners (2026-09-16 work-list sweep)

The explorer's second pass listed every module still without a row. UI and render modules are owners
too — they may read simulation state and must not write it — so they are named here rather than left
unowned. Grouped rows keep this list readable; the owner cell is what the explorer matches on.

| Decision | True owner | Cadence / called from | Key entry functions |
|---|---|---|---|
| App shell, layout and menu composition | `App.tsx` + `GamePlayLayout.tsx` + `GameHeader.tsx` + `GameOverlays.tsx` + `GameBuildRail.tsx` + `GameInspector.tsx` + `GameMapStage.tsx` + `GameMenu.tsx` + `ShortcutsOverlay.tsx` + `CollapsibleSection.tsx` + `Emoji.tsx` | UI (composition/wiring only) | `App`, `GamePlayLayout`, `GameHeader`, `GameMapStage`, `GameMenu` |
| HUD badges, banners and alerts | `AlertBar.tsx` + `ActiveEventBanner.tsx` + `BigNewsBanner.tsx` + `MomentTitleCard.tsx` + `ResourceBadge.tsx` + `ResourceIcons.tsx` + `ResourceCost.tsx` + `VillageRequestCard.tsx` | UI (read-only presentation) | `AlertBar`, `ActiveEventBanner`, `BigNewsBanner`, `ResourceBadge`, `ResourceCost` |
| Sidebar tabs and read-only panels | `DynastyPanel.tsx` + `FrontierTabPanel.tsx` + `LogTabPanel.tsx` + `MoreTabPanel.tsx` + `NatureTabPanel.tsx` + `ProgressTabPanel.tsx` + `ValleyChroniclePanel.tsx` + `VillageTabPanel.tsx` + `PopulationPanel.tsx` + `StatisticsPanel.tsx` + `VillageLeadershipPanel.tsx` + `FocusPanel.tsx` + `CitizenOverviewScreen.tsx` + `CombatPreviewPanel.tsx` + `CombatLogPanel.tsx` + `VisitorCampPanel.tsx` + `BlacksmithForgePanel.tsx` + `BuildCatalogPanel.tsx` + `WorkSchedulePanel.tsx` + `VenueSchedulePanel.tsx` + `WorkHoursWindow.tsx` + `FamilyTreeWindow.tsx` + `SimulationDiagnosticsPanel.tsx` + `GuidedCampaignPanel.tsx` + `SelectedBuildingPanel.tsx` + `SelectedEntityPanel.tsx` + `MapSetupScreen.tsx` + `IntroScreen.tsx` + `MiniMap.tsx` + `ChallengesPanel.tsx` + `FrontierPanel.tsx` + `StrategicWorldMap.tsx` + `TutorialOverlay.tsx` + `TutorialCampaignBanner.tsx` + `ContextualTutorialCard.tsx` | UI (read-only projections; commands go through `App`) | `ProgressTabPanel`, `VillageTabPanel`, `NatureTabPanel`, `MoreTabPanel`, `PopulationPanel`, `SelectedBuildingPanel`, `SelectedEntityPanel`, `MapSetupScreen`, `IntroScreen`, `computeMiniMapViewportRect` |
| Village dashboard projection | `dashboard/GameDashboard.tsx` | UI (read-only) | `GameDashboard`, `BuildingsTable` (the building list's rows and header) |
| Session, input, persistence and feedback hooks | `useGameSession.ts` + `useCanvasInteractions.ts` + `useKeyboardControls.ts` + `useGamePersistence.ts` + `useTransientGameFeedback.ts` + `useContextualTutorial.ts` + `useGameShellState.ts` + `useFpsMeter.ts` + `useGameAudio.ts` + `useVirtualPlayer.ts` | UI (lifecycle; dispatch only through the command door) | `useGameSession`, `useCanvasInteractions`, `useKeyboardControls`, `useGamePersistence`, `useTransientGameFeedback`, `virtualPlayerStatusText`, `VIRTUAL_PLAYER_IDLE_STATUS` |
| Overlay keyboard and map-pointer gesture contract | `hooks/useOverlayKeyboard.ts` + `hooks/useCanvasInteractions.ts` | UI input; a window claims the keyboard while open and closes on Escape, and a map gesture's travel decides click versus pan | `useOverlayKeyboard`, `useCanvasInteractions`, `pointerMovedRef` |
| Overview subject vocabulary (door names, glyphs, hints) | `hooks/useGameShellState.ts` | UI (read-only projection; the header, the Guide and the shortcut sheet all render it) | `OVERVIEW_SUBJECTS`, `overviewSubjectForTab` |
| Hotkeys, help, alerts and UI-side projections | `hotkeys.ts` + `guideHelp.ts` + `priorityAlerts.ts` + `focusHints.ts` + `rivalDisplay.ts` + `uiSimSummary.ts` + `villagePortrait.ts` + `citizenOverview.ts` + `familyLegacy.ts` + `familyTree.ts` + `buildingProgressDisplay.ts` + `housingDiagnostics.ts` + `scheduleFeedback.ts` + `contextualTutorial.ts` | UI (read-only projections) | `HEADER_DOORS`, `resolveSidebarTabFromKey`, `searchGuideHelp`, `getPriorityAlerts`, `getFocusHints`, `computeVillageStats`, `computeCitizenOverview`, `buildFamilyTree` |
| Wolf scent field (deposit, decay, gradient sampling) | `scentGrid.ts` | realtime (every tick) + render SoA sidecar | `ensureScentGrid`, `tickScentGrid`, `ScentGrid`, `ScentGridReader` |
| Schedule and home preferences | `humanSchedule.ts` | realtime + daily | `isAsleepAtHome`, `prefersHomeTonightFor`, `isFestivalGatheringHour`, `isFestivalGatherer` |
| Tick interpolation for moving entities | `renderer/motionInterpolation.ts` | per frame (presentation) | `interpolatePosition`, `beginMotionFrame`, `presentationPosition`, `resetMotionInterpolation` — samples confirmed positions; `gameLoop.ts` owns the worker tick acknowledgement timestamp and per-frame interpolation fraction (no simulation writes) |
| Per-frame repaint of the movers (animals, humans, particles, trail lines, floating text) | `renderer/entityComposite.ts` | per frame (presentation) | `paintMovingEntities` |
| Hover tint for roads, walls and construction pads | decision `renderer/buildings.ts`, drawn by `renderer/overlay.ts` | per frame (presentation) | `hoverTintKindFor`, `drawHoveredBuildingTint`, `drawStripBuilding`, `drawConstructionBody` |
| Render device-pixel-ratio and canvas fit | `canvasLayer.ts` | per frame (presentation) | `getRenderDpr`, `fitCanvasToDpr` |
| Mini-map frame drawing and repaint cadence | `renderer/miniMapFrame.ts` | per frame (presentation) | `drawMiniMapFrame`, `registerMiniMapFrameDraw`, `shouldRepaintMiniMap` |
| Building command actions (config and maintenance) | `buildingConfigurationActions.ts` + `buildingMaintenanceActions.ts` | player-command | `setWorkshopRecipe`, `setMineMode`, `demolishBuilding`, `demolishBuildingInPlace`, `toggleWallGate` (persisted open/closed gate state), `demolishBuildingsInPlace`, `clearAssignmentsForDemolishedBuilding`, `removeBuildingFromState`, `removeBuildingsFromState` (demolition rehomes only displaced households with a bounded housing sweep; workforce reconciles when staff or crews are displaced; raid destruction skips refunds), `repairBuilding`, `upgradeBuilding`, `REPAIR_COST` |
| Spatial grids (mobile, grass, social) and their invariants | `spatialGrid.ts` | realtime (rebuild/reconcile per tick) + query helpers | `syncMobileSimGrid`, `syncSpatialGridEntity`, `assertSpatialGridInvariants`, `EntitySpatialGrid`, `isHumanSocialGridEntity` |
| Systems tick layer | `tickLayerSystems.ts` | systems pulse (`LAYER_SYSTEMS_INTERVAL`) | `tickLayerSystems`, `tickWildlife`, `tickWolfRecruitment`, `isWildlifePredator` |
| Resource types, costs and build catalogue | `resourceTypes.ts` + `resourceCost.ts` + `buildCatalog.ts` | — (data + formatting, no state) | `formatResourceAmount`, `formatResourceAmounts`, `formatResourceCost`, `canAffordResourceCost`, `missingResourceCost`, `categoryForBuildingType` |
| Building configs and mine-mode helper | `game/buildings.ts` | — / player-command | `mineOreForMode` |

| Village challenges | `challenges.ts` + `dailyChallenges.ts` | daily (`tickLayerDaily`) | `tickDailyChallenges`, `isChallengeComplete`, `getChallengeProgress` |
| Grass ecology day pulse | `dailyGrassEcology.ts` | daily (`tickLayerDaily`) | `tickGrassDaily` |
| Daily population reconciliation | `dailyPopulation.ts` | daily (`tickLayerDaily`) | `tickDailyPopulation` |
| Daily world events schedule | `dailyWorldEvents.ts` | daily (`tickLayerDaily`) | `tickDailyWorldEvents` |
| Hunting behaviour and hunting-spot rules | `humanHuntingBehavior.ts` + `huntingSpots.ts` | realtime (`humanTick`) + command validation | `tickHumanHunting` (hunt range and chase speed carry the `danger`/hunting trait factor in place of the old Brave-only multiplier), `isValidHuntingSpotPrey`, `getHuntingSpotPreyOption` |
| Patrol and raider detection | `humanPatrolBehavior.ts` | realtime (`humanTick`) | `detectRaidersForPatrol` |
| Leisure motives (children and adults) | `humanLeisureBehavior.ts` | realtime (`humanTick`) | `tickHumanChildLeisure`, `tickAdultLeisureMotive` |
| Venue service (tavern, civic venues) | `humanVenueBehavior.ts` | realtime (`humanTick`) | `tickTavernService`, `tickHumanCivicVenueService` |
| Map-bounds clamp | `mapBounds.ts` | realtime + systems | `clampToMapBounds` |
| Election vote simulation | `electionVotes.ts` | election ceremony | `simulateElectionVotes` |
| Visitor quest | `visitorQuest.ts` | daily + player-command | `tickVisitorQuest`, `maybeStartVisitorQuest`, `deliverVisitorQuest` |
| Prison guard duty and post presence | `prisonGuardDuty.ts` + `prisonShifts.ts` | daily (`tickDailyWorldEvents`) + hourly (`tickLayerRealtime`) | `tickPrisonGuardDuty`, `tickPrisonPresence`, `prisonGuardIds`, `prisonRoster`, `prisonShiftForGuard`, `unguardedPrisonHours` |
| Settler work reasons and workplace duty labels | `workAbsence.ts` | read-only UI projection | `getSettlerWorkReason`, `getWorkplaceRosterReasons`, `getUnstaffedPostNote`, `workplaceDutyLabel` |
| Simulation invariant collection and assertion | `simulationInvariants.ts` + `simInvariants.ts` | dev/daily check (`gameTick`) | `collectSimulationInvariantErrors`, `assertSimInvariants` |
| Decision-registry accessors | `simulation/decisionRegistry.ts` | — (static table accessors) | `getDecisionOwner`, `getDecisionsByCadence`, `isPropertyWritePermitted` |
| Species configuration | `speciesConfig.ts` | — (data) | `getSpeciesConfig`, `getPreyEnergyGain` |
| Ecosystem pressure and temperature projections | `ecosystemPressure.ts` + `temperature.ts` | daily + UI projection | `getGrazingPressureReport`, `computeDailyTemperatureC` |
| Wildkin chronicle and its place descriptions | `wildkinChronicle.ts` | birth (`humanLifecycle`) + death (`simulationEntities.markWildlifeDead`) + daily sighting (`tickLayerDaily`) | `logWildkinBirth`, `logWildkinDeath`, `tickWildkinChronicle`, `describeWildkinPlace`, `biomeNameAt`, `isWildkinNearSettlement` |
| Workshop gold projection | `workshopEconomy.ts` | UI projection | `estimateWorkshopGold` |
| Juice particles and hunt visuals | `juiceEffects.ts` + `huntvisuals.ts` | presentation, spawned by sim events | `pushTransientParticle`, `spawnBuildCompleteParticles`, `addHuntVisual`, `pruneHuntVisuals` |
| Entity-type cache | `entityTypeCache.ts` | per tick (`gameTick`) and per invalidation; `getCachedEntityByType` validates the cached bucket set against the caller's own entity list and drops a disagreeing entry | `getCachedEntityByType`, `invalidateCachedEntityByType`, `cacheEntityByType` |
| Render snapshot and catalog animation patch | `renderSnapshot.ts` + `simBuffers/applyKinematics.ts` | per frame | `buildRenderSnapshot`, `patchCatalogKinematicsFromRenderSoA`, `colonyHasBlacksmith` |
| Worker UI-patch merge | `simWorker/uiPatch.ts` | worker boundary (`patchUi`) | `applyWorkerUiPatch` |
| Renderer facade, entity-layer compositing and living-tree sprite variants | `renderer.ts` + `renderer/entityComposite.ts` + `renderer/buildings.ts` + `renderer/animals.ts` + `renderer/trees.ts` + `renderer/grass.ts` + `renderer/particles.ts` + `renderer/markers.ts` + `renderer/scent.ts` + `renderer/nightEffects.ts` + `renderer/overlay.ts` + `renderer/buildPreview.ts` | render pass | `renderGame`, `compositeCachedEntityLayer`, `drawBuildings`, `drawAnimals`, `drawTrees`, `drawGrass`, `drawParticles`, `drawCampMarkers`, `drawScentOverlay`, `drawGameOverlay`, `drawBuildPreview`, `footprintGroundRise`, `isHighlightableBuilding`, `getBuildingFootprintScreenRect`, `drawBuildingHighlightRing` |
| Animal sprite metrics | `entitySprites.ts` | render pass | `getAnimalSpriteMetrics` |
| Render buffer pool and wire-type codes | `simBuffers/renderBufferPool.ts` + `simBuffers/entityTypeCodes.ts` | worker buffer lifecycle | `entityTypeToCode`, `isKnownEntityTypeCode`, `codeToEntityType` |
| Node/Tauri runtime helpers | `nodeRuntime.ts` | boot (`nameLoader`, `dialogueTrees`) | `isNodeRuntime`, `readUtf8RelativeToModule` |
| Audio bootstrap, activity detection and HTML sync | `audio/bootstrap.ts` + `audio/interactionDetect.ts` + `audio/interactionSfx.ts` + `audio/workDetect.ts` + `audio/workSfx.ts` + `audio/tracks.ts` + `audio/htmlAudioSync.ts` | UI/audio events | `bootstrapIntroAudio`, `detectInteractionSounds`, `detectWorkActivity`, `playFootstepSfx`, `syncHtmlAudioMute`, `htmlAudioVolumeForPreset`, `syncHtmlAudioVolume` |

## Owners recorded by the 2026-09-20 audit and fix campaign

Recorded from the call graph (`npm run graph:calls` → `docs/tools/call-graph.html`), the same way as
the 2026-09-16 pass. Every row below is a module the graph shows owning functions no earlier row
named, or a rule whose owner moved during the campaign. Cadence is taken from the observed call
sites. Two conventions worth stating once:

- **Row order is precedence.** The graph matches a function to the first row that names **its
  file** in the owner cell. A name in the entry-functions cell only attaches to a function that
  lives in that row's modules — `add` in `resourceUtils.ts` is not `add` in `householdComposition.ts`.
  A file mentioned only in `scheduledFrom` does not become that decision's module.
- **A re-export does not move ownership.** `buildingGeometry.ts` owns the centre/footprint
  convention; `placementUtils.ts` re-exports its pair so the existing consumers keep their import
  path, and `logisticsOverlayData.ts` reads it through that re-export.
- **The centre convention has one owner.** `building.x/y` **is** the footprint centre, whatever the
  rotation — the pad, the sprite and every footprint check are drawn and evaluated from it. Anything
  new that needs a centre or a ground rectangle reads it from `buildingGeometry.ts` rather than
  recomputing `x + width/2`.

| Decision | True owner | Cadence / called from | Key entry functions |
|---|---|---|---|
| Building centre and ground rectangle | `buildingGeometry.ts` | read at every placement, hit-test and camera call site | `getBuildingCenter`, `getBuildingFootprintRect` |
| Velocity steering: "normalise the delta, set velocity, face it" | `simulation/movementSteering.ts` | realtime, at every steering behaviour; a leaf module so `pathfinding` and `humanMovement` can both use it | `steerEntityToward`, `setVelocityToward`, `faceVelocity` |
| Pathfinder A\* counters and their report | `pathfindingMetrics.ts` (`pathfinding.ts` is the only writer) | dev/perf only — opt-in by env flag, and every recorder returns immediately while disabled | `recordFindPathCall`, `recordPathCacheHit`, `recordGridRebuild`, `getPathfinderReport`, `formatPathfinderReport`, `setPathfindingMetricsEnabled` |
| Infrastructure / logistics overlay projection (road networks, access, commute pressure) | `logisticsOverlayData.ts` | UI toggle; read-only projection — nothing here writes to the world | `computeLogisticsOverlay` |
| Logistics overlay painting | `renderer/logistics.ts` | render pass, in the per-frame overlay pass rather than the tick-keyed entity layer | `drawLogisticsOverlay` |
| Overlay keyboard ownership | `keyboardOwnership.ts` | overlay open/close; `useKeyboardControls` ignores every key while any overlay holds it | `claimKeyboard`, `releaseKeyboard`, `isKeyboardClaimed` |
| Overlay keyboard contract — ownership and the Escape handler together | `hooks/useOverlayKeyboard.ts` | overlay open/close (`GameMenu`, `TutorialOverlay`, `GameDashboard`, `CitizenOverviewScreen`) | `useOverlayKeyboard` |
| Modal overlay behaviour, and the one focusable-element query | `hooks/useModalFocus.ts` | overlay open/close | `useModalFocus`, `getFocusableElements` |
| Map canvas keyboard cursor — placement and selection without a pointer | `components/useMapKeyboardCursor.ts` | UI, on the canvas's own `keydown`; it never claims the keyboard — it reads `keyboardOwnership.isKeyboardClaimed` and replays the pointer's own events so the two paths cannot drift | `useMapKeyboardCursor`, `resolveMapCursorIntent`, `describeMapCursor`, `mapCursorBounds`, `moveMapCursor`, `initialMapCursorPoint` |
| Typed "can the player do this right now?" answer | `actionOutcome.ts` | player-command / card resolution — shapes the gate's answer and never re-words it | `actionOutcomeFromGate`, `storyChoiceReasonCode`, `diplomacyChoiceReasonCode` |
| Placement failure wording (the reason itself stays with the placement owner) | `buildingPlacementLabels.ts` | render pass for the placement ghost | `getPlaceBuildingFailureLabel`, `PLACEMENT_FAILURE_LABELS` |
| Chronicle filter categories and their labels | `eventLogFilters.ts` | UI, read-only — the dropdown and the "Showing N of M" header read one label | `getEventLogFilterLabel`, `EVENT_LOG_FILTER_OPTIONS` |
| Workforce policy preset panel | `components/WorkforcePolicyPanel.tsx` | UI, read-only — restates no ordering and no preset copy | `WorkforcePolicyPanel` |
| Test fixture factories | `src/test/factories.ts` | test tier only — excluded from the app build, type-checked by the vitest project | `human`, `building`, `finishedBuilding`, `stubHuman`, `byType` |
| Moon Howler saved-form shape | `gameTypes.ts` (declared beside `Entity`, which carries it) | load, full-moon transform and revert | `MoonHowlerSavedState` |
| Transient-feedback dismissal ledgers and their caps | `hooks/useTransientGameFeedback.ts` | UI events; the ledgers cross the worker boundary and are saved, so the caps are what keep them bounded | `MAX_DISMISSED_NOTIFICATION_IDS`, `MAX_DISMISSED_BIG_NEWS_IDS`, `MAX_DISMISSED_ACTIVE_EVENT_IDS` |
| Opt-in CPU section profiler across worker + renderer | `game/performanceProfiler.ts` + `components/PerformanceProfilerPanel.tsx` | instrumentation at existing simulation and drawing call sites, off by default | `profileStart`, `profileEnd`, `setPerformanceProfilingEnabled`, `getPerformanceSnapshot`, `PerformanceProfilerPanel` |
| Player HUD pop-up preference | `game/preferences.ts` | local preference storage; display-only | `loadHudNotificationsEnabled`, `saveHudNotificationsEnabled` |
| Read-only village newspaper | `game/weeklyGazette.ts` | Chronicle-only projection, on Log open/week change | `gazetteWeekForTick`, `buildWeeklyGazette` |
| Valley Chronicle chapter moment shown as the title card, and its dismissal | `hooks/useTransientGameFeedback.ts` + `components/MomentTitleCard.tsx` | UI, read-only; the pending chapter is derived from `world.chronicleChapters` and the dismissal is the hook's own ledger | `getPendingChapterMoment`, `dismissChapterCard`, `MomentTitleCard` |
| Log window's sub-tab and category intent, and the handover that sets them | `hooks/useGameShellState.ts` | UI navigation; a concern or hint opens the log on the history it is about | `openLog`, `LogFilter` |

## Owners recorded by the 2026-09-21 call-graph pass

`docs/tools/call-graph.json` (generated 2026-09-21T00:05:33) reported 2614/2614 functions with a recorded owner. That number was produced by matching a **bare function name** to the first row that mentioned it, anywhere: `scheduledFrom`, the decision key, or a sibling file. Twelve names were stolen across files. The ones that mattered:

- `start` — `gameLoop.ts` / `App.tsx` sat under "Ambient beds and track playback"
- `tick` — `scentGrid.ts` / `IntroScreen.tsx` / `renderSoAReader.ts` sat under **housing**
- `add` — `householdComposition.ts` sat under "Economy / resources"
- `rebuild` — `adjacencyIndex.ts` / `spatialGrid.ts` sat under "Alive-entity catalog lookups"
- `draw` — `gameLoop.ts` / `MiniMap.tsx` sat under "Entity draw cache"

The explorer now attaches an entry-function name only when the function lives in a module named in that row's **owner** cell. `scheduledFrom` is the scheduler, not the owner. Registry owner cells are `module.ts — function list`; only the prefix before the em dash is the module list, so "progress advance executes from humanTick.ts" does not make `humanTick.ts` a courtship module. One function, one owner.

`tickLayerAssign.ts` was the only `src/` module in that snapshot with **no** owner-cell mention (it appeared only as `tickLayerAssign.syncResidenceOccupants` in registry `scheduledFrom` strings). After the matcher stopped reading `scheduledFrom`, `tickLayerDaily.ts` was in the same boat: it lived only in the facade table (which the explorer does not parse) and in other rows' cadence notes. Both pulse files are now rows in the first table, schedule facades like each other. `tickLayerRealtime.ts` moved out of the Movement row into its own Realtime pulse row for the same reason: the file schedules owners, it does not own movement policy.

## Owners recorded by the 2026-10-01 call-graph pass

`docs/tools/call-graph.json` (generated 2026-10-01T00:21:45) reported **2657/2767** functions with a
recorded owner. The 110 without an owner were not strays: **76 of them are the terrain subsystem**, which
had no row here at all, plus the Hunting Spot's target/kill behaviour, the window shells every subject now
renders into, and three single-purpose leaves. Every entry below is named the way the module actually
exports it.

| Decision | True owner | Cadence / called from | Key entry functions |
|---|---|---|---|
| Smooth v4 ecotone climate and tree recruitment weights | `terrain/ecotones.ts` | new-world generation / pure terrain queries | `smooth`, `sampleEcotone`, `treeEcotoneAt` — climate-derived visual probabilities only; tile classification and pathfinding stay owned by `terrainGrid.ts`. |
| Terrain data model, tile projection and sparse overrides | `terrain/terrainGrid.ts` | generation, path/build updates and queries | `sampleElev`, `classifyTile`, `biomeEdgeDither`, `hasContinuousFields`, `worldToTile`, `tileToWorld`, `isInsideTileGrid`, `tileAt`, `tileTypeAt`, `tileTypeAtWorld`, `projectTile`, `setTileOverride`, `patchTile`, `isWalkableTerrainType`, `isTileBuildable`, `rebakePathCell`, `rebakeBuildCell`, `rebakeTerrainGrids` |
| Versioned terrain generation, hydrological river geometry, riparian moisture and biome-aligned detail | `terrain/terragen.ts` | world generation, once per map | `latitudeCooling`, `spreadHeights`, `moistureCuts`, `arabianSpringCenters`, `shapePresetRelief`, `buildHeight`, `carveRivers`, `buildWaterField`, `flagRiverCells`, `assignBiomes`, `pickDecor`, `decorBiomeForTile`, `placeDecorations`, `legacyTerrainSeed`, `terrainSeedFor`, `generateRawTerrain` |
| Terrain preset acceptance-test helpers | `tests/terrain.presetIdentity.test.ts` | test tier only | `make`, `terrainShare`, `waterShare` — construct seeded preset maps and measure classified terrain and water shares. |
| Terrain material visual regression pixel capture | `tests/terrain.landformGraphics.test.ts` | test tier only | `lastPixels` — extracts the simulated Canvas image for terrain material assertions. |
| Noise and PRNG primitives | `terrain/noise.ts` | generation (pure) | `hashString`, `mulberry32`, `hash2`, `smoothstep`, `valueNoise`, `fbm`, `ridged`, `warp`, `clamp`, `lerp`, `smoothRange`, `ridgedMulti` |
| River flow routing (the hydrology model) | `terrain/hydrology.ts` | generation, after de-pitting | `computeFlow`, `fillDepressions`, `riverWidthAt` |
| What a terrain type **is** — water, and may anything stand on it | `terrain/terrainTraits.ts` | read-only leaf (breaks the `placementUtils ↔ terrainGrid` cycle) | `isWaterTerrainType`, `isUnbuildableTerrainType` |
| Orographic rain shadow | `terrain/rainShadow.ts` | generation (the moisture field) | `rainShadowField` |
| CC0 terrain albedo decoding and world-aligned Cethiel/rubberduck material sampling | `renderer/grassTextures.ts` | sprite-preload / each chunk bake (decoded once per image) | `GRASS_TEXTURE_PATHS`, `DIRT_TEXTURE_PATHS`, `TERRAIN_MATERIAL_PATHS`, `decodeTerrainAlbedo`, `loadedGrassTextures`, `loadedDirtTextures`, `loadedTerrainMaterials`, `smooth01`, `grassDetailAt`, `sampleTerrainMaterial` — one decode cache, mean-preserving RGB material detail; biome logic stays in `whittakerTerrain.ts`. |
| Ground bake, v3+ flow-aligned river surfaces/rapids, wet banks, render-only grassland clearing masks and height-field 2.5D lighting | `renderer/whittakerTerrain.ts` | map-cache prepass and budgeted chunk render (read-only) | `lc`, `bandDetail`, `darken`, `buildWhittakerLut`, `whittakerColor`, `groundColor`, `coldGroundAt`, `snowAmountAt`, `getInlandColor`, `sampleF`, `sampleRiverPhase`, `buildRiverSurfaceFields`, `buildWhittakerFields`, `bakeWhittakerGround` |
| Ground props (the L3 decor layer) | `renderer/decor.ts` | render, cached per owner rect | `parseColor`, `tinted`, `drawProp`, `decorIndexFor`, `bakeDecorInRect` |
| Hunting Spot prey selection, pursuit and the kill | `huntingSpot.ts` | realtime hunter behaviour | `huntingSpotTarget`, `commitHuntingSpotTarget`, `pickHuntingSpotPrey`, `huntingKillReach`, `huntingPursuitPoint`, `isHuntingStrikeLive`, `isHuntingSpotHunter`, `huntingFightBackFate`, `huntingFightBackKillChance` |
| The village anchor (one camp-centre rule, two readers) | `villageAnchor.ts` | command + render, read-only | `getPlayerCampCenter`, `getPlayerCampCenterFromBuildings`, `getPlayerSettlerCenter` |
| Civil status — married **or** expecting | `civilStatus.ts` | read-only predicate | `isMarriedOrExpecting` |
| The one window shell a subject renders into | `components/GameWindow.tsx` | UI (composition/wiring only) | `GameWindow` |
| One subject as an index inside a window | `components/SubjectWindow.tsx` | UI (composition/wiring only) | `SubjectWindow` |
| Work & venue hours editor | `components/WorkHoursWindow.tsx` | UI (read-only editors, commands out) | `WorkHoursWindow` |
| Family tree window | `components/FamilyTreeWindow.tsx` | UI (read-only; the data owner is `game/familyTree.buildFullFamilyTree`) | `FamilyTreeWindow` |
| Test map fixtures | `src/test/worldMapFixtures.ts` | test tier only — never in the app build | `testWorldMap`, `blockedColumn` |
| Social test human fixture | `tests/phase7.social.test.ts` | test tier only | `addHuman` — create humans with age and childhood status consistent. |
| Company-following movement fixture | `tests/low-8-humans.test.ts` | test tier only | `runCompanyFollow` — compare velocities in independently cloned worlds. |
| Rival growth fixture | `tests/frontierCombat.hostility.test.ts` | test tier only | `growWorld` — advances strategic population while retiring legacy local actors. |
| Full-year integration diagnostics | `tests/fullYear.integration.test.ts` | test tier only | `runFullYear`, `printCheckpoint`, `writeFullYearDebug`, `fullYearEntitySnapshot`, `fullYearResidentRecords`, `printFullYearFailure`, `traceFullYearTick` — observe lifecycle and housing changes without repairing simulation state. |
| Hot-path equivalence settler fixture | `tests/audit.hotPathScans.equivalence.test.ts` | test tier only | `settler` — create housed humans at the requested calendar age. |

## Owners recorded by the 2026-10-08 audit-remediation session

The long-run gate's housing verdict is the housing owner's, not the harness's; the harness only names
the residence that broke, so a failed gate says which home and which day instead of only a count.
The stall verdict below is the harness's own read of the run it just made: a settlement that broke no
invariant can still have stopped working, and when the shipped default scenario reads as stalled it is
reported as stalled — never softened until it passes.

| Decision | True owner | Cadence / called from | Key entry functions |
|---|---|---|---|
| Simulation residence-move diagnostics | `scripts/run-full-year.mts` | full-year checkpoint and movement measurement | `countResidenceMoves` |
| Housing benchmark statistics | `scripts/benchmark-housing-pipeline.mts` | housing performance comparison | `median` |
| Naming the residence behind a failed housing verdict | `scripts/run-full-year.mts` | both the per-checkpoint and the final housing assertion | `describeHousingFailure` |
| Housing consistency verdict (over-capacity, orphaned references, occupant-list mismatches) | `housingDiagnostics.ts` | read-only, sampled per checkpoint | `collectHousingDiagnostics`, `isHousingDiagnosticsHealthy` |
| A home's beds, and whether one is free | `residencyOccupancy.ts` | every residence write | `getResidenceCapacity`, `residenceRoomFor` |
| Spreading one day's reassignment work across the assignment pulses | `residencyReconciliation.ts` (bucket key: `residencySelection.ts`) | assignment pulse when a tick is supplied; a load, a player command or an event converges immediately and takes no tick | `RESIDENCE_SWEEP_BUCKETS` (must equal the layer's pulses per day), `assignMissingResidences` (optional `sweepTick`), `housingUnitBucket` |
| Colony stall verdict — whether a run that broke no invariant still works (beds full with settlers outside them and nothing raised, an empty larder still eating more than it grows, a woodpile at nothing with no building raised) | `scripts/colonyHealth.ts` | read-only, per checkpoint and once at the end of a run; a stalled verdict fails the run | `assessColonyStall`, `assertColonyNotStalled`, `formatColonyStallVerdict` |
| Sent-in save ground audit — what blocks each settler's own tile (water, a completed wall's footprint, or reserved decor) and whether anyone walks onto blocked ground over `--days=N` | `scripts/inspect-save.mts` | read-only, when a save is inspected; `--days` runs the sim forward in-process | `reportGroundAudit` |
| Sent-in save attendance census — per trade, whether the loaded colony credited work hours in that trade's own duty window, one row per day over `--shifts` | `scripts/inspect-save.mts` | read-only, when a save is inspected; `--shifts` runs one week forward in-process | `reportShiftAttendanceCensus`, `CENSUS_TRADES` |

## Protected facades (re-export / schedule only — no new policy)

| Facade | May do | Must not do |
|---|---|---|
| `dayCycle.ts` | re-export clock/schedule/residency | new lifecycle/economy rules |
| `tickLayerRealtime.ts` | ordered realtime schedule | own movement / moon-howler / grid rules |
| `tickLayerAssign.ts` | ordered assignment schedule | own housing / workforce rules |
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
`daycycleconstants.ts` holds pure values (night hours, moon cycle, adult age floor).

## Housing architecture completion (23 October 2026)

| Functions | Sole owner | Responsibility |
|---|---|---|
| `assignMissingResidences` (the single decision pipeline, taking the manor hold as its `leaderPhase` decision), `HOUSING_PHASE_ORDER`, `createHousingLedger`, `runHousingPhase` (one phase on the run's ledger) with `beginHousingPhase` / `endHousingPhase` (the wrapper that snapshots the run's `before` map and then logs what the phase moved) and `snapshotResidences` (that snapshot), `isHousingUnitProtected`, `standaloneMoveContext` (the decision context a phase caller outside the sweep builds for one run), `relocateHousehold` (the joint check every household relocation passes: the manor hold, homeless placement, capacity rehousing, sibling guardianship, couple formation, adult-child and commute) with `householdMayMove` (the checks it applies), `custodianTravelsAlong` (a minor's custodian must hold a bed at the destination) and `applyHouseholdMove` (the validated write itself), `residenceMoveRefused` (the one member-level guard, shared by `moveResident` and the household pre-check) and `writeResidence` (the unchecked write a rollback restores through), `moveResident`, `reassignDivorcedResidences`, `ensureOrphanAdoption`, `placeOrphanInHouse`, `relocateChildToCustodian` (after a death, a minor follows the custodian who holds a bed), `collectHousingInvariantViolations` (the post-pass audit that fills `report.violations`), `restoreCustodyAfterRelease` (a released parent takes back the minors a jail sentence lent to a stand-in) with `freeParent` (a jailed parent is away, not a custodian) | `game/residencyReconciliation.ts` | One ordered decision process — the leader manor hold, integrity, guardianship, capacity, homeless, then the optional adult-child and commute phases — over a per-run ledger (`docs/HOUSING_ARCHITECTURE.md`). `relocateHousehold` validates the whole household before any member moves, refuses a household when one member may not move, rolls back a partial write, and a mandatory phase settles a household so an optional phase cannot undo it. `moveResident` stays the only residence write and is kept for single-settler decisions (birth, death, departure, demolition, prison, Moon Howler form, a child following a placed custodian). |
| `tryMoveOutOfFamilyHome`, `rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable`, `relocateHouseholdsForCommute`, `rebalanceOvercrowdedResidences` (targets from `evictionTargets`: completed player homes only, never the manor) | `game/residencyReconciliation.ts` | Pipeline steps: each runs only from `assignMissingResidences`, never on its own schedule; the optional ones take the run's ledger and skip a household an earlier phase settled. |
| `familyFitsInResidence`, `buildCommuteRelocationIndex`, `collectFamilyHousingShortages`, `memberCommuteHours` (one member's work-plus-school travel from a candidate home, read by `householdCommuteHours`) | `game/residencySelection.ts` | Pure capacity, per-sweep commute indexes and derived family-shortage warnings. |
| `areCloseKin` | `game/householdComposition.ts` | Close family living apart: a parent/child link or a shared parent. |
| `unitIdSet`, `residencePreferenceTier` | `game/residencySelection.ts` | Stable housing-unit membership lookup and ordered own-home/family/outsider preference scoring. |
| `residenceHostsUnrelatedCouple`, `residenceHostsKin` | `game/residencySelection.ts` | Score a candidate home by the family a couple would live with and the couple it refuses to share with. |
| `benchmarkRelocation` | `scripts/perf-at-pop.ts` | Measure the real daily sweep against the unindexed reference on isolated, repeatable work-and-school fixtures. |
| `family` | `tests/housingArchitecture.completion.test.ts` | Build related parents and dependents for shortage, guardianship and commute regressions. |

## Workplace reference consolidation (23 October 2026)

| Functions | Sole owner | Responsibility |
|---|---|---|
| `clearWorkerAssignment` | `game/workforce.ts` | The one door for leaving work: drop the workplace pointer, the roster entry it pointed at and the job labels, keeping an office title. Every clear site (arrest, death, demolition/legacy retirement, stale leader post, caravan departure, legacy invalid-job cleanup) calls it. |
| `detachWorkplaceReference` | `game/workforce.ts` | Drop the workplace pointer alone, for the moon forms, which keep their saved trade labels and re-attach the reference themselves. |
| `workerBuildingId` writers | `game/workforce.ts` (owner) | The only modules writing the pointer directly are the owner, the save boundary (`saveLoad.ts`, including the nested moon-form migration), and the moon-form owner (`moonHowler.ts`, `moonHowlerForm.ts`) where a form transform or the Church rite restores or displaces a post. `tests/workplaceReference.singleOwner.test.ts` pins that set. |

## CPU profiler integration lifecycle

| Functions | Sole owner | Responsibility |
|---|---|---|
| `GameLoop.setPerformanceProfiling`, `GameLoop.getPerformanceProfiling`, `GameLoop.registerWorkerHandlers`, `GameLoop.stop`, `GameLoop.frameBody` | `game/gameLoop.ts` | Control profiling, retain worker samples and measure main-thread work. |
| `GameWorkerHost.setProfilingEnabled`, `GameWorkerHost.stopProfiling`, `GameWorkerHost.getPerformanceSnapshot`, `GameWorkerHost.settleProfilingStop`, `GameWorkerHost.dispose`, `GameWorkerHost.rejectInFlight`, `GameWorkerHost.handleMessage` | `game/simWorker/GameWorkerHost.ts` | Transport samples and settle final-sample requests on response, failure or disposal. |
| `packAndPostTickResult`, `self.onmessage` | `game/simWorker/gameWorker.ts` | Publish tick samples and acknowledge Stop with the final unthrottled sample. |

## Roadmap performance pass (20 October 2026)

| Function | Owner | Responsibility |
|---|---|---|
| `ProfileTable`, `DevPerformanceProfilerPanel` | `components/PerformanceProfilerPanel.tsx` | Display opt-in timing percentiles and control profiling. |
| `tickLayerRealtime` | `game/tickLayerRealtime.ts` | Synchronize entity grids before realtime AI, using the human bucket for social indexing. |
| `percentile`, `showComparison`, `countPlayerHumans`, `bench`, `loadSave`, `main` | `scripts/perf-at-pop.ts` | Seed repeatable population tiers or load real saves; measure timings, stage profiles and final delta fingerprints. |
| `buildWorkforceAssignmentIndex`, `pickOverstaffedDonor`, `findOverstaffedDonorBuilding`, `rebalanceJobWorkers` | `game/workforce.ts` | Reuse assignment counts during rebalancing, updating them after each transfer without changing donor ranking or cooldowns. |
| `canPreviewWorkerCommand`, `GameLoop.rebuildOptimisticDisplay`, `GameLoop.applyCommand` | `game/gameLoop.ts` | Keep colony-wide commands on the worker; preview bounded edits and defer actions through recovery. |
| `housingUnitNeedsReassignment` | `game/residencySelection.ts` | Protect an already housed manor household before ordinary capacity validation; leave incomplete household repair eligible; send a couple out of a house it shares with an unrelated couple into its own family's. |

## PR #59 — function-level ownership supplement (2026-10-27)

The functions below belong exclusively to the module shown. They supplement the existing ownership entries rather than moving ownership or creating forwarding exports. Scope: production modules modified by PR #59; independently registered functions are not repeated. Inline callbacks are implementation details of their owning module, not independent owners.

| Owning module | Additional named functions |
|---|---|
| `src/game/buildingMaintenanceActions.ts` | `buildingTypeHasLevelBenefit`, `getRepairBuildingEligibility`, `getRepairBuildingEligibilityFor`, `repairBuildings`, `getBuildingUpgradeCost`, `getBuildingUpgradeEligibility`, `refundBuildingCost` |
| `src/game/buildingPlacementActions.ts` | `isStripSegmentTechUnlocked`, `canPlaceBuilding`, `isUniqueBuildingAlreadyBuilt`, `getPlaceBuildingFailureReason`, `clearTreesUnderFootprint`, `startBuilding`, `buildStripPreview`, `worstStripRefusal`, `placeStripChain` |
| `src/game/pathfinding.ts` | `isBlockingWall`, `pathGridCacheKey`, `getReadOnlyPathGrid`, `nearestWalkableWorldPoint`, `findNearestWalkable`, `hasLineOfSight`, `lineCrossesBlocked`, `invalidateCommutePathsForWalker`, `getRouteObstruction`, `isGroundWalkableAt`, `h` |
| `src/game/placementUtils.ts` | `footprintTileIndices`, `overlapsAnyBuilding`, `getBuildingOccupancyIndex`, `overlapsAnyBuildingIndexed` |
| `src/game/stripTopology.ts` | `isWallStripType`, `isRoadStripType`, `stripFamilyFor`, `cellKey`, `getStripSegmentEndpoints`, `collectSnapPoints`, `nearestSnapPoint`, `snapStripDragEndpoints`, `findEnclosedWallAreas`, `markBlocked`, `push`, `emit` |
| `src/game/stripJunction.ts` | `dist`, `countConnections`, `cornerRotationFromConnections`, `straightRotationFromConnections`, `resolveJunctionCenter`, `findStripBuildingNear`, `familyMembers`, `pushBuilding` |
| `src/game/stripRender.ts` | `paintPavementPattern`, `seeded`, `beginRotatedStripFrame`, `strokePalisadeRails`, `drawPalisadeArm`, `drawProceduralFence`, `drawPalisadePosts`, `drawProceduralWallCorner`, `drawProceduralRoadJunction`, `drawProceduralWallJunction`, `drawProceduralStripBuilding` |
| `src/game/gameLoop.ts` | `catchUpBudgetFor`, `pageHidden`, `extractUiPatch`, `idsPatchChanged`, `uiPatchChanged` |
| `src/game/hotelStay.ts` | `buildingFrom`, `centreDistance`, `hoursUntilSleep`, `findStaffedHotels`, `isHotelierAtHotel`, `findGuest`, `isLiveVisitor`, `guestCount`, `pruneHotelGuests`, `hotelCheckoutTick`, `hotelierGreetGuests` |
| `src/game/humanTick.ts` | `getAffairTrystTarget`, `livingHumanAt`, `playerResidencesFor`, `completedPoolOf`, `pickSocialBuilding`, `resolveChatPartner`, `ambientChatNeighbors`, `getCampAnchor`, `advancePregnancy`, `steerTo`, `pickCompleted`, `steerToShop` |
| `src/game/renderer/buildPreview.ts` | `previewGlowGradient`, `drawStripBuildPreview` |
| `src/game/renderer/buildings.ts` | `completedDepthSortedBuildings`, `getBuildingScreenRect` |
| `src/game/simWorker/commands.ts` | `getBuildingTypeValues`, `getForgeOrderIds`, `getVisitorTradeActions`, `isFiniteNumber`, `isNonEmptyString`, `isBuildingType`, `isBuildingRotation`, `isStripSegment`, `validateWorkerCommandShape`, `extractCommandDelta`, `safeExtractCommandDelta` |
| `src/game/simulation/humanMovement.ts` | `walkableStandPoint`, `crowdGatherPosition`, `venueGatherPosition`, `homeStandPosition`, `commuteDistanceToBuilding`, `commuteDistanceFromResidence`, `commutePathCacheKey`, `nearestActiveMoonHowler` |
| `src/game/spriteLoader.ts` | `getSpriteFrame`, `isHumanSpritesReady`, `loadHumanWalkSheets` |
| `src/game/stripBuild.ts` | `isStripBuildType`, `inferStripRotation` |
| `src/game/virtualPlayer.ts` | `pickChoice`, `pickAffordableDiplomacyChoice`, `pickEligibleRaidChoice`, `pickEligibleStoryChoice`, `foodNeedPerDay`, `hasFoodMargin`, `canAffordKeepingRepair`, `findPlacementSpot`, `huntingSpotHasSafePrey`, `siteCondition`, `isUnderConstruction`, `hasFoodProducer`, `answerOpenCard`, `decideLeaderHouse`, `decideHousing`, `decideFood`, `neededResearch`, `decideResearch`, `decideFestival`, `decideCivic`, `decideUnstaffedProducer`, `decideIndustry`, `decideRepairs`, `decideForgeOrders`, `huntingSpotPreyFor`, `bestAffordableWorkshopRecipe`, `decideBuildingTuning`, `decideRecruitment`, `chooseVisitorTrade`, `decideVisitorRelations`, `chooseRefugeeChoice`, `decideWorkSchedule`, `decideVenueSchedules`, `decideSurplusWorkers`, `hasRoadNearby`, `findRoadTarget`, `corridorCorners`, `buildRoadChain`, `decideRoads`, `decideUpkeep`, `decideUpgrades`, `findRedundantOutbuilding`, `decideDemolish`, `ownsBuildingOfType`, `hasCompletedBuildingOfType`, `adultSettlerCount`, `hasJuvenileSettler`, `storageNearlyFull`, `decideCommunity`, `canAffordUpgradeWithReserve`, `decideRivalRelations`, `buildPerimeterRun`, `decidePerimeter` |
| `src/hooks/useCanvasInteractions.ts` | `stripChainCommand`, `findBuildingAt`, `resetDrag` |
| `src/App.tsx` | `SaveToastBanner`, `GatedChoiceButton`, `RivalFocusButton`, `FavoriteFollowBanner`, `refreshSaveSlot`, `onWheel`, `openSubject`, `pending`, `liveArmy` |
| `src/components/SelectedBuildingPanel.tsx` | `RaidChoiceButtons`, `ownerOutputHint`, `canAffordRecipe`, `refusal`, `pendingForRival`, `raidsForRival`, `outgoingRaidsForRival` |
| `scripts/perf-at-pop.ts` | `change` |
| `scripts/colonyHealth.ts` | `isScenarioName`, `createCompletedBuilding`, `placeStarterHousing`, `spoilageRateForSilos`, `placeStorage`, `placeProducers`, `prepareColonyWorld`, `livingHumans`, `countLivingEntitiesByType`, `summarizeLivingPopulation`, `countRelationships`, `emptyEventTotals`, `createEventCounter`, `sampleDelta`, `captureConsoleVolume`, `safeInspect`, `transitionKeys`, `countChanged`, `createColonyObserver`, `collectInvariantErrors`, `wrap`, `observe`, `sum` |
| `scripts/inspect-save.mts` | `countType`, `livingSettlers`, `waterAt`, `footprintHasWater`, `blockerAt`, `blockedAt`, `distanceToCentre`, `unguardedReason`, `imprisonForWatch`, `reportPrisonEscapeWatch`, `prisons` | Save-inspection-only audit and prison-escape diagnostic helpers; never game-state authority |

## PR #59 — scoped test fixture and browser-harness helper ownership

Each helper below belongs to its **own test file or existing browser harness**. Repeated local fixture names (for example `makeMap`) are lexically scoped to separate tests, not shared production APIs; there is no forwarding helper or cross-file re-export.

| Sole owning file | Locally defined named helper functions |
|---|---|
| `tests/fullYear.integration.test.ts` | `expectFiniteNumber`, `expectNonNegative`, `expectEntitySanity`, `expectBuildingSanity`, `summarizeRelationships` |
| `tests/infrastructure.acceptance.test.ts` | `at` |
| `tests/low-7-sim-geometry.test.ts` | `entity`, `militiaWorld`, `realtimeContext`, `keyOf` |
| `tests/medium-A-movement.test.ts` | `makeMap`, `pixel`, `hotel`, `hospital`, `makeState`, `findQualifyingTreatmentDay` |
| `tests/pathfinding.test.ts` | `makeMap` |
| `tests/rpgArt.integration.test.ts` | `localAsset` |
| `tests/stripDemolition.workerProtocol.test.ts` | `cmd` |
| `tests/stripPlacement.crossings.test.ts` | `worldFor`, `crossingSpot`, `completedStrip` |
| `tests/stripPreview.emptyGuard.test.ts` | `source` |
| `tests/stripTopology.connections.test.ts` | `strip`, `stateWith` |
| `tests/visualsAudit.renderWiring.test.ts` | `readSrc`, `child`, `snapshot`, `preFixKey` |
| `tests/wallGate.rendering.test.ts` | `spyCanvas` |
| `tests/workCommute.leadHour.test.ts` | `workplace`, `tickAtHourOnWorkDay`, `workerAtHome` |
| `scripts/autoplay_playwright_probe.py` | `selected_preset_label`, `choose_preset`, `set_camera_zoom`, `run_ground_look`, `click_text`, `wait_for` |

### World-copy optimization ownership

| Function | Sole owning module | Responsibility |
| --- | --- | --- |
| `setBuildingStaffingMode`, `setHuntingSpotPrey` | `game/buildingConfigurationActions.ts` | Validate and copy only the changed building; unchanged settings return the input. |
| `assignResidentToBuilding` | `game/buildingResidencyActions.ts` | Isolated or explicitly owned residency command transition. |
| `buildingFingerprint` | `game/simBuffers/simDelta.ts` | Serialize a building once for the next acknowledged delta baseline. |
| `resetWorkerSession` | `game/simWorker/gameWorker.ts` | Reset runtime state and transport baselines at full-world boundaries. |


## Missing source-module registrations (27 October 2026)

The original owner tables cover 356 of 373 source modules.
The entries below register only the 17 previously unlisted modules. Re-exports do not
take ownership away from their leaf implementations. Module-qualified names keep same-basename files distinct.

| Scope | Sole owning module | Cadence | Responsibility |
|---|---|---|---|
| Audio: constants.ts | `src/audio/constants.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Audio: preferences.ts | `src/audio/preferences.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| UI: resourceLabels.ts | `src/components/resourceLabels.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Game: buildingActions.ts | `src/game/buildingActions.ts` | module-local | Compatibility exports only; implementation ownership stays with leaf modules |
| Game: combatTech.ts | `src/game/combatTech.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Game: ecologyTypes.ts | `src/game/ecologyTypes.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Game: gameEngine.ts | `src/game/gameEngine.ts` | module-local | Compatibility exports only; implementation ownership stays with leaf modules |
| Game: genealogyRegistry.ts | `src/game/genealogyRegistry.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Game: genealogyTypes.ts | `src/game/genealogyTypes.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Game: introTimeline.ts | `src/game/introTimeline.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Game: moonHowlerForm.ts | `src/game/moonHowlerForm.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Simulation: simulationTypes.ts | `src/game/simulation/simulationTypes.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Terrain: biomes.ts | `src/game/terrain/biomes.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Game: version.ts | `src/game/version.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Game: weatherVisualPreferences.ts | `src/game/weatherVisualPreferences.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Application: main.tsx | `src/main.tsx` | module-local | Local functions and methods defined in this module, not re-exported definitions |
| Test support: setup.ts | `src/test/setup.ts` | module-local | Local functions and methods defined in this module, not re-exported definitions |

## PR #72 — food-deficit test fixture ownership (28 October 2026)

| Sole owning file | Named helper | Responsibility |
|---|---|---|
| `tests/virtualPlayerHealthVerdict.test.ts` | `deficitVillage` | Local regression fixture for measured food deficits; sets up a colony with fully upgraded staffed farms and controlled food-flow history for Mill, Silo, Greenhouse, Hunting Spot, Farm and spare-housing decision tests. This is test-only setup, not a production decision owner. |
