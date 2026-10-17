# Wilderfolk Ownership Overview

Authority: `AGENTS.md` + `src/game/simulation/decisionRegistry.ts`  
Purpose: one decision → one owner module → one definition of each function.

## Decision owners (authoritative)

| Decision | True owner | Cadence | Key entry functions |
|---|---|---|---|
| Tick orchestration | `gameTick.ts` | fixed 4 layers | `gameTick` |
| Realtime pulse | `tickLayerRealtime.ts` | realtime (every tick) | `tickLayerRealtime` |
| Assignment pulse | `tickLayerAssign.ts` | assignment (~4×/day) | `tickLayerAssign` |
| Daily pulse | `tickLayerDaily.ts` | daily (once per colony day) | `tickLayerDaily` |
| Human tick pulse | `humanTick.ts` | realtime | `tickHumans` |
| Movement / pathfinding | `humanMovement.ts` | realtime | movement helpers, `applyHumanWalkStep` (the one integration of a walk step) |
| Commute reach: lead hours and assignable distance | `commuteReach.ts` | — (pure rule; read by the movement path, work assignment and the panel) | `commuteWalkSpeed`, `commuteLeadHoursFor`, `isWithinAssignableCommute`, `MAX_ASSIGNABLE_COMMUTE_HOURS`, `MAX_COMMUTE_LEAD_HOURS`, `MAX_COMMUTE_SPEED_MULTIPLIER`, `WORK_COMMUTE_RUSH`, `COMMUTE_CONFIG` |
| Workforce / jobs | `workforce.ts` + `buildingStaffingActions.ts` | assignment / command | `assignStaffWorkerToBuilding`, `assignMissingWorkers`, … |
| Workforce policy preset | `workforcePolicy.ts` | player-command + assignment | `getWorkforcePolicy`, `setWorkforcePolicy`, `jobBuildingPriorityForPolicy` |
| Generic assign/remove command route | `buildingActionRouting.ts` | player-command | `assignIdleWorkerToBuilding`, `removeWorkerFromBuilding` (routes to staffing or residency) |
| Housing / residence | `residencyOccupancy.ts` / `residencySelection.ts` / `residencyReconciliation.ts` / `buildingResidencyActions.ts` | assignment / command | `countResidentsInBuilding`, `syncPartnerResidence`, `isResidenceOccupantEntity` (the rule the inspector reads too), `assignMissingResidences` (with a `sweepTick` it sweeps that pulse's bucket of the day's reassignment work; without one it converges the whole colony immediately), … |
| Construction progress | `dailyBuildingEconomy.ts` | daily | `tickBuildingProgress` (construction progress in daily economy), `logCompletedBuildings` (one completion line per label per day, counted) |
| Economy / resources | `resourceUtils.ts` (add), `economy.ts` (caps/spoilage), `dailyBuildingEconomy.ts` (production) | daily / command | `addResource`, `updateStorageCaps`, `tickWinterHeating` |
| Workshop recipes | `workshops.ts` | — | `canAffordWorkshopRecipe(resources, recipe)` |
| Building config lookup | `buildingConfig.ts` | — | `getBuildingConfig` (with fallback) |
| Village Requests | `groupEvents.ts` | new-calendar-day / command | `tickVillageRequests`, `resolveVillageRequest` |
| Diplomacy card prices | `groupEvents.ts` | — (data read by the card's label, its gate and its charge) | `DIPLOMACY_TRIBUTE_PAY_FOOD`, `DIPLOMACY_TRIBUTE_NEGOTIATE_FOOD`, `DIPLOMACY_ALLIANCE_ACCEPT_GOLD`, `DIPLOMACY_ALLIANCE_COUNTER_FOOD`, `DIPLOMACY_ALLIANCE_COUNTER_GOLD`, `DIPLOMACY_PEACE_SIGN_GOLD`, `DIPLOMACY_PEACE_SIGN_FOOD`, `DIPLOMACY_PEACE_TRIBUTE_FOOD` |
| Rival settlement day pulse | `rivalEvents.ts` | new-calendar-day | `tickRivalSettlements` |
| Rival camp growth | `frontierCombat.ts` (rule) → `rivalEvents.ts` (day pulse) | new-calendar-day | `canRivalCampGrow`, `isRivalGrowthDay`, `getRivalGrowthFoodCost`, `RIVAL_GROWTH_INTERVAL_DAYS` |
| Player-declared hostility | `frontierCombat.ts` | player-command | `provokeRival`, `canProvokeRival` |
| Rival schedule wiring | `groupEvents.ts` | daily | `tickWorldRivalSettlements` (callbacks only) |
| Frontier founding | `groupEvents.ts` | new-calendar-day | `tryFrontierSettlement`, `FIRST_RIVAL_MIN_DAY`, `FIRST_RIVAL_MIN_HUMANS`, `spawnRivalSettlement` (optional founding relationship) |
| Raid growth scaling | `frontierCombat.ts` | raid queue | `getRaidGrowthScale`, `getRaidLootScale`, `raiseRaidLootToFloor`, `rollOutgoingRaidSpoils`, `RAID_GROWTH_BASE_ADULTS`, `RAID_LOOT_MAX_SCALE`, `multiplyRaidLoot` |
| Casual social feedback | `humanSocial.ts` / `socialLife.ts` | staggered-social | chat / greeting helpers |
| Youth love | `humanRelationships.ts` | new-calendar-day | `advanceYouthLove`, `reconcileYouthLove` |
| Courtship / marriage | `humanRelationships.ts` | staggered-social (approach) + new-calendar-day (reconciliation) | `findCourtshipPartner`, `bindCourtship`, `reconcileCourtships`, `tryCompleteCourtshipMarriage` |
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
| Combat tiers, counter-attack / block rolls | `combat.ts` (research data in `gameTypes.ts`; raid outcomes in `frontierCombat.ts`) | combat resolution | `getArmamentSteps`, `getCounterAttackChance`, `getPredatorBlockChance`, `rollCounterAttack`, `rollPredatorBlock` |
| Deaths and yearly statistics | `stats.ts` (the per-tick tally is written by `gameTick.ts`) | per-tick tally + year-rollover record | `recordYearlyStats`, `updateLifetimeStats`, `createEmptyLifetimeStats`, `normalizeLifetimeStats`, `recordResourcesGathered`; `gameTick`'s `deathsThisYear` tally and `largestPopulation` running peak |
| Event log / Chronicle | `eventLog.ts` | event-driven | `logEvent`, `logDeath`, `syncEventLogIdFromState`, `repairEventLogOnLoad`, `resolveCombatLogKind` |
| Big news, notifications, floating text | `simEffects.ts` | event-driven | `addBigNews`, `syncBigNewsIdFromState`, `addNotification`, `addFloatingText` |
| Save / load and timeline migration | `saveLoad.ts` (allow-list: `saveSchema.ts`) | load / player-command | `buildSaveData`, `loadGameFromParsed`, `parseSaveJson`, `loadGameFromFileTextOutcome`, `migrateTickTimeline`, `clearAutoFilledChurches` |
| Worker transport (prep + tick delta) | `simWorker/simPrep.ts` + `simBuffers/simDelta.ts` | per-tick / per-command | `extractSimPrep`, `applySimPrep`, `extractSimTickDelta`, `applySimTickDelta` |
| Session clock, command queue, worker fallback | `gameLoop.ts` | animation-frame / command | `frame`, `applyCommand`, `flushDeferredWorkerCommands`, `fallbackFromWorker` |
| Trade caravans and routes | `tradeCaravans.ts` | systems layer + departure schedule | `tickTradeCaravans`, `spawnCaravan`, `scheduleTradeRouteDeparture`, `getCaravanMoveTarget` |
| Civic petitions / town-hall audience, and the player's Town Hall lookup | `townHall.ts` + `playerTownHall.ts` | daily (resolution) + realtime (greeting only) | `resolveCivicPetition`, `tickTownHallAudiences`, `officialHandlePetitioners`, `wantsCivicAudience`, `findPlayerTownHall` |
| Human age and fertility ladder | `dayCycle.ts` (`dayCycleConstants.ts` for the ages) | daily sync / pure helpers | `HUMAN_FERTILITY_START`, `getFemaleFertility`, `getYouthConceptionMultiplier`, `syncHumanAgeFromCalendar`, `tryGraduateHumanChild` |
| Housing unit composition | `householdComposition.ts` (selection: `residencySelection.ts`) | assignment | `isMinorChild`, `collectOwnHousehold`, `collectMinorHousehold`, `getChildCustodian`, `buildHousingUnits` |
| Medical care | `hospitalCare.ts` + `humanHospitalBehavior.ts` | daily care pass / realtime routing | `needsMedicalCare`, `medicalCareReason`, `treatPatientAtHospital`, `doctorTreatNearby`, `tickHospitalDailyCare`, `getHospitalRoster`, `describeHospitalRoster` |
| Visitor and settler lodging | `hotelStay.ts` | daily + realtime | `tickHotelLodging`, `checkInVisitor`, `checkoutVisitor`, `steerVisitorToHotel`, `needsHotelBed`, `lodgingHotelsFor`, `countHotelSettlerLodgers`, `buildHotelSettlerLodgerCounts`, `isSettlerLodgingAtHotel`, `lodgingHotelFor`, `restAtHotel`, `getHotelRoster`, `describeHotelRoster` |
| Autumn migration and herds | `migration.ts` | new-calendar-day (autumn window) | `tickMigration`, `migrationArrivalDay` |
| Ecosystem health score and its explanation | `dailyEcology.ts` (score, plus the story-driver `adjustEcosystemHealth` / `adjustPollutionLevel`) + `ecoBreakdown.ts` (read-only breakdown) | daily | `tickEcosystemMetrics`, `adjustEcosystemHealth`, `adjustPollutionLevel`, `calculateBiodiversityIndex`, `getEcosystemBreakdown` |
| Village happiness and beauty | `beautyGrid.ts` | daily | `tickBeauty`, `rebuildBeautyGrid`, `computeVillageHappiness`, `pickBeautySpot` |
| Watchtower early warning | `watchtowerDetection.ts` | systems layer | `detectRaidersFromWatchtowers` |
| Wall / road strip topology and replacement | `stripTopology.ts` + `stripBuild.ts` (placement: `buildingPlacementActions.ts`) | player-command | `resolveStripPlan`, `resolveWallStripPlan`, `resolveRoadStripPlan`, `findStripBuildingAt`, `computeStripSegmentCenters` |
| Authored one-time stories (flags, cards, cooldown) | `storyHelpers.ts` (shared contract) + each story owner (`travelingTheatre.ts`, `inventionFair.ts`, `famineDesperation.ts`) | daily / story-card answer | `storyFlag`, `setStoryFlags`, `pushStoryCard`; `maybeOfferTravelingTheatre`, `resolveTravelingTheatre`, `tickTravelingTheatre` |
| Leadership elections, candidacy merit and incumbent record | `villageLeadership.ts` | daily due-date check, year rollover, ceremony ticks | `tryStartVacancyElectionCeremony`, `tryStartTermElectionCeremony`, `tickElectionCeremony`, `tickLeaderVacancy`, `getLeadershipScoreBreakdown`, `getIncumbentRecordAssessment` |
| Tutorial / guided campaign | `guidedCampaign.ts` + `tutorialCampaign.ts` | daily | `tickGuidedCampaign`, `recordGuidedCampaignChoice`, `currentCampaignStep` |
| Pathfinding and the path cache | `pathfinding.ts` | realtime movement | `findPath`, `getPathGrid`, `pathWaypoints`, `steerWithPath`, `setCurrentPathMap`, `distanceToSegment`, `isWalkStepAllowed` (the grid's verdict on one walk step) |
| Sprite preload and lookup (presentation) | `spriteLoader.ts` | boot / render | `preloadAllSprites`, `loadSprite`, `getSprite`, `isSpriteLoaded` |
| Terrain decor stamps (presentation) | `terrainLayer.ts` | render / bake | `stampPropSprite`, `stampMountainPeaks`, `mountainSpritesReady` |
| Staffing eligibility and assignment | `buildingStaffingActions.ts` (eligibility rules in `residencyOccupancy.ts`) | player-command + assignment | `canAssignWorkerToBuilding`, `assignStaffWorkerToBuilding`, `removeStaffWorkerFromBuilding`, `hasWorkAssignment`, `isImprisoned` |
| Storage caps and food spoilage | `economy.ts` (one derivation: `computeStorageMax`, over the `BASE_*_STORAGE` / `WAREHOUSE_IRON_STORAGE` constants), wired daily by `dailyBuildingEconomy.ts`; world gen and the save-load fallback call the same function | daily (first step of `tickStaticDaily`) | `computeStorageMax`, `updateStorageCaps`, `applyFoodSpoilage`, `addResource` |
| Economy ledger history and its day rollover | `economyLedger.ts` | daily | `rollEconomyLedgerForDay`, `getEconomyLedger`, `recordFoodProduced`, `ECONOMY_SOURCE_LABELS` |
| Off-screen wildlife throttle | `simFocus.ts` | wildlife-layer pulse | `isOffscreenWildlifeActive` |
| Moon Howler curse and form lifecycle | `moonHowler.ts` | full-moon nightfall + debug command | `shouldMoonHowlerTransform`, `canBeginMoonHowlerCurse`, `countActiveMoonHowlerCurses`, `transformToWerewolfForm`, `revertToHumanForm`, `tryMoonHowlerChurchCures` |
| Village-request acceptance | `groupEvents.ts` | daily generation + typed player command | `tickVillageRequests`, `resolveVillageRequest`, `getVillageRequestEligibility` |
| Wildlife reproduction snapshot (population caps, scarcity boost) | `simQueries.ts` (`REPRO_WILDLIFE_TYPES`) | wildlife layer | `buildWildlifePopulationSnapshot`, `wildlifeTypePopulation`, `recordWildlifeBirth` |
| Leader office across the Moon Howler form | `villageLeadership.ts` owns the office; `moonHowler.ts` only carries `villageLeaderId` through the revert | full-moon revert / cure / load | `isActingVillageHead`, `RevertToHumanFormOptions.villageLeaderId`, `revertToHumanForm` |
| Simulation randomness: streams, seed and their positions | `simRng.ts` (per-person day rolls: `humanSchedule.personDayRoll`); presentation owners use the separate `getPresentationRng` registry | per draw; positions cross realms via `world.simRng` | `getSimRng`, `getPresentationRng`, `seededRandomForRun`, `snapshotSimRng`, `restoreSimRng`, `parseSimRngSnapshot`, `setSimSeed`, `adoptSimSeedFromWorld`, `stampWorldSimRng`, `adoptWorldSimRngStamp`, `worldSimRngSnapshot` |

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
| Entity spawn/despawn bookkeeping and grid sync | `simulation/simulationEntities.ts` | per entity change (`tickLayerSystems`, `dailyGrassEcology`, hunting, daily economy, birth, immigration) | `pushNewEntity`, `syncEntityGrids`, `markWildlifeDead`, `markGrassDead`, `isValidHuntPrey` |
| Entity id index | `entityIndex.ts` | per add/remove (all spawn and kill paths) | `indexLivingEntity`, `ensureEntityByIdMap`, `unindexEntityFromState`, `indexEntity` |
| Death, removal and family-reference cleanup | `humanLifecycleCleanup.ts` | on death (raids, disasters, mortality, exhaustion, Moon Howler) | `killHuman`, `finalizeHumanDeath`, `reconcileFamilyReferencesAfterRemoval`, `reconcileOrphanedMarriages` |
| Cross-realm cache strip/hydrate | `worldRuntimeCaches.ts` | worker upload, import, prep rollback, display rebuild | `invalidateWorldRuntimeCaches`, `hydrateWorldRuntimeCaches`, `createOptimisticDisplayWorld`, `carryPresentationControls` |
| Worker transport, handshake and session swap | `simWorker/GameWorkerHost.ts` + `simWorker/gameWorker.ts` + `simWorker/gameWorker.node.ts` + `simWorker/protocol.ts` | worker boundary (message channel) | `init`, `requestTick`, `sendCommand`, `importSave`, `exportSave`, `whenReady`, `whenIdle` |
| Work schedule | `workSchedule.ts` | realtime per-hour + player-command | `getWorkSchedule`, `isOnWorkScheduleShift`, `validateWorkSchedule`, `setWorkSchedule` |
| Venue schedule | `venueSchedule.ts` | realtime + player-command; crosses realms in the tick delta | `getVenueSchedule`, `isVenueServiceHour`, `getVenueAutoStaffingTarget`, `setVenueSchedule` |
| Festival keeps a tavern open all day | `venueSchedule.ts` | — (predicate read by the tavern shift and the venue editor) | `isFestivalOverrideActive` |
| Ambient chat and dialogue sessions | `humanChat.ts` | realtime (`tickHumans`); `releaseDialogueSession` when an entity leaves that population | `tickHumanChat`, `sayHumanChatPhrase`, `isDialogueBusy`, `startDialogueTreeChat`, `releaseDialogueSession` |
| Needs: colony meal and exhaustion | `simulation/humanNeeds.ts` | realtime (`tickHumans`, `applySettlerUpkeep`, hunting) | `tryEatColonyMeal`, `isMealCheckHour`, `humanEnergyLoss`, `killFromExhaustion` |
| Skills and job skill effects | `skills.ts` | work (`dailyBuildingEconomy`, workforce transitions, apprenticeships, graduation) | `ensureEntitySkills`, `readSkill`, `gainSkill`, `getWorkerSkillMultiplier`, `rewardProductionSkills`, `rewardBuildingWork` |
| School attendance, credit and graduation | `education.ts` | realtime (`humanTick`) + new-calendar-day credit | `recordChildSchoolTick`, `creditChildSchoolDay`, `applyEducationGraduation`, `buildSchoolRosters` |
| Friendship and feud webs (with their daily energy effects) | `relationships.ts` | new-calendar-day (`tickLayerDaily`) | `advanceSocialRelationships`, `startFeud`, `friendshipScore`, `feudScore` |
| Election promises | `electionPromises.ts` | new-calendar-day (three daily call sites) | `tickElectionPromises`, `recordElectionPromises`, `getPromiseDetail`, `electionPromisesForYear` |
| Wedding diplomacy beat | `weddingDiplomacy.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `maybeOfferWeddingDiplomacy`, `tickWeddingDiplomacy`, `resolveWeddingDiplomacy`, `getWeddingDiplomacyChoiceEligibility` |
| Authored story events (children shelter, winter freeze, grief, welcomes) | `storyEvents.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `offerStoryEvent`, `tickChildrenShelter`, `tickWinterFreezeCheck`, `respondToStoryEvent`, `getStoryChoiceEligibility` |
| Village forge orders | `forge.ts` | daily (`tickBuildingProduction`) + player-command | `tickVillageForge`, `queueForgeOrder`, `isForgeOrderComplete`, `normalizeForgeState` |
| Building adjacency index | `adjacencyIndex.ts` | assignment/daily (production, completion, demolition) | `ensureAdjacencyIndex`, `syncAdjacency`, `unindexAdjacency`, `getAdjacencyMultiplierFromIndex` |
| Valley ecology stage (`ValleyEcology.ENABLED` is the single switch) | `ecologyStage.ts` | daily (`tickDailyWorldEvents`) | `tickValleyEcologyStage`, `valleyStageIndex`, `computeRawEcologyStress`, `getValleyHuntYieldMultiplier` |
| Housing/bed projection for decisions and UI | `populationGrowth.ts` | on demand (auto-play `decide*`, citizen overview, focus hints) | `snapshotPopulation`, `getOpenPlayerBeds`, `getTotalBeds`, `getLivePlayerPopulation` |
| Social proximity queries | `adaptiveSpatialQuery.ts` | — (query helper over the human social grid) | `forEachAdaptiveInRadius`, `findClosestAdaptiveInRadius`, `socialAdaptiveOptions` |
| Citizen identity, display names and chronicle names | `citizenId.ts` | — (formatting/parse, no state) | `humanDisplayName`, `formatCitizenName`, `formatDeathLog`, `findCitizenByQuery` |
| Name pool, census names and marriage surname dissolve | `nameLoader.ts` | boot load + spawn + divorce/remarriage | `loadNames`, `ensureNamesLoaded`, `getRandomName`, `getRandomSurname`, `fixDefaultNames`, `dissolveMarriage` |
| Shared sim helpers (multipliers, reputation, season) | `simHelpers.ts` | — (helper, no cadence of its own) | `getMultiplier`, `addReputation`, `hasTech`, `getSeason` |
| Relationship diagnostics | `relationshipDiagnostics.ts` | dev-only, recorded at each decision roll | `recordRelationshipDiagnostic`, `flushRelationshipDiagnostics`, `setRelationshipDiagnosticsEnabled` |
| Spatial-query metrics and grid A/B switch | `spatialQueryMetrics.ts` | dev-only | `setSpatialQueryMetricsEnabled`, `setSpatialQueryGridMode`, `isSpatialQueryMetricsEnabled` |
| Auto-play decisions and their waiting verdict (dev-gated, N17) | `virtualPlayer.ts` | player-command — one action per in-game hour through the same command door | `decideVirtualPlayerAction` and the `decide*` family, `virtualPlayerWaitingReason`, `buildingBlockReason`, `canSpendKeepingReserve`, `spareBedReserve`, `wantedProducerCount`, `completedProducerCount`, `canStaffUnmannedProducer` |
| Auto-play tuning (buffers, reserves, producers per settler) | `gameConstants.ts` | — (data read by the `decide*` family) | the `VirtualPlayer` block (`SPARE_BED_*`, `SETTLERS_PER_FOOD_PRODUCER`, `SETTLERS_PER_INDUSTRY_PRODUCER`) |
| Player preferences | `preferences.ts` | UI (boot read + toggle write) | `loadAutoSavePreference`, `saveAutoSavePreference`, `loadTutorialsEnabled`, `saveTutorialsEnabled` |
| Camera and view state | `viewState.ts` | render pass + input + session setup | `createInitialView`, `updateView`, `resolveEntity`, `resolveBuilding`, `clampCameraZoom` |
| Building rotation rules | `buildingRotation.ts` | player-command (placement) | `isRotatableBuildingType`, `toggleBuildingRotation` |
| Sprite metrics and class-ladder variants | `humanSprites.ts` | spawn (variant pick) + render pass | `pickHumanVariant`, `getHumanSpritePath`, `getHumanSpriteMetrics`, `getHumanSelectionBounds` |
| Terrain atlas bake and tile picks | `terrainAtlas.ts` | render pass (cached; rebuild on readiness) | `terrainAtlasReady`, `pickAtlasTile`, `pickSandWaterOverlay`, `atlasFamily` |
| Audio direction | `audio/index.ts` + `audio/director.ts` | UI events + time of day | `unlockAudio`, `primeAudioUnlock`, `ensureIntroAudio`, `beginAudio` |
| Building placement validity | `placementUtils.ts` + `grid.ts` | player-command + world gen | `canPlaceBuildingSnapshot`, `isFootprintOnBuildableTerrain`, `isBuildingTechUnlocked`, `isFootprintWithinMapBounds` |
| Research unlocks and progression | `research.ts` | player-command + building completion | `startResearch`, `canStartResearch`, `updateResearch`, `grantResearchProgress`, `syncResearchUnlocks`, `notifyBuildingLocked` |
| Rival temperament/priority profile and its daily action | `rivalProfiles.ts` | daily (rival settlement pulse) | `ensureRivalProfile`, `createRivalProfile`, `normalizeRivalProfile`, `selectRivalDailyAction`, `applyRivalDailyAction` |
| Rival peace state | `rivalPeace.ts` | player-command + daily rival pulse | `isRivalAtPeace` |
| Settler trait rolls and their multipliers | `settlerTraits.ts` | spawn (roll/inherit) + decision rolls | `rollSettlerTraits`, `inheritSettlerTraits`, `traitMultiplier` |
| Dialogue bank load and tree lookup | `dialogueTrees.ts` | boot load + chat/dialogue step | `ensureDialogueBankFromBundle`, `isDialogueBankReady`, `preloadDialogueBank`, `getDialogueTreeById` |
| Entity-layer cache and canvas surfaces | `entityLayer.ts` + `canvasLayer.ts` | render pass (cached per layer key) | `beginEntityLayerPaint`, `entityLayerNeedsRebuild`, `buildEntityLayerKey`, `getCanvasContext`, `createCanvasSurface` |
| Sprite drawing primitives | `renderer/spriteDrawing.ts` + `renderer/shared.ts` + `stripRender.ts` + `decorRender.ts` | render pass | `drawSpriteFrame`, `drawBuildingSprite`, `drawContactShadow`, `drawGroundAO`, `drawProceduralRoad`, `drawProceduralWall`, `drawProceduralDecor`, `isDrawableSpriteFrame` |
| Human, route and hunt line drawing | `renderer/humans.ts` | render pass | `drawHumans`, `drawTradeRouteLines`, `drawRaidMarchLines`, `drawHuntVisuals`, `drawCombatBurst` |
| Audio graph, scheduling and SFX | `audio/graph.ts` + `audio/scheduler.ts` + `audio/session.ts` + `audio/sfx.ts` + `audio/sampleLoader.ts` | UI events + time of day (intro/gameplay gating) | `scheduleTone`, `setIntroAudioAllowed`, `setGameplayAudioActive`, `playClickSound`, `playBirthSound` |
| Disasters, weather effects and storm/earthquake damage | `worldEvents.ts` | realtime weather + daily disasters (`tickLayerSystems`, `tickLayerDaily`) | `updateWeather`, `applyDailyWeatherEffects`, `updateDisasters`, `applyStormDamageToBuildings`, `applyEarthquakeDamageToBuildings` |
| Terrain generation, regions and camp clearing | `terrainGen.ts` | world generation / map setup + camp placement | `generateWorldMap`, `clusterMountainRegions`, `findCampSite`, `ensureCampClearing`, `isFootprintBuildable` |
| Terrain queries (tiles, spawn validity, adjacency multiplier) | `terrainSystems.ts` | world gen + placement + daily economy + immigration | `getTileAt`, `isValidHumanSpawnPosition`, `findHumanSpawnNear`, `isInsideCompletedBuilding`, `getAdjacencyMultiplier`, `getTerrainEfficiencyMultiplier` |
| Defense structures (walls, watchtower, barracks guards) | `defenseStructures.ts` | player-command build + raid resolution | `countCompletedDefenseBuildings`, `getWallSegmentBonus`, `getWatchtowerBonus`, `getBarracksGuardCount`, `getDefenseStructureBreakdown` |
| Militia armament and strength math | `militiaBalance.ts` | raid resolution + UI projection | `computeMilitiaBreakdown`, `getMilitiaSpearTier`, `getMilitiaShieldTier`, `getMilitiaArmamentLabel` |
| Rumour ledger beat | `rumourLedger.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `maybeOfferRumourLedger`, `tickRumourLedger`, `resolveRumourLedger`, `rumourLedgerEligibleDay` |
| Valley chronicle narration | `valleyChronicle.ts` | daily (`tickLayerDaily`) | `advanceValleyChronicle` |
| Recruit / tame / debug settler interactions | `settlerInteractionActions.ts` | player-command (`applyWorkerCommand`) | `recruitSettler`, `tameEntity`, `spawnMoonHowlerDebug`, `getRecruitSettlerEligibility`, `getTameEntityEligibility` |
| Deer parliament beat | `deerParliament.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `maybeOfferDeerParliament`, `tickDeerParliament`, `resolveDeerParliament`, `getDeerParliamentChoiceEligibility` |
| Faction camp wander | `factionWander.ts` | realtime (visitor/faction pulse) + session reset | `tickFactionCampWander`, `nextVisitorActivity`, `clearAllFactionWanderStates`, `pruneFactionWanderStates` |
| Strip/road junction classification | `stripJunction.ts` | player-command (placement) + render | `classifyJunction`, `analyzeStripJunction`, `connectionsAt`, `cornerArms`, `detectBuildingJunction` |
| Alive-entity catalog lookups | `entityCatalog.ts` | per tick / UI lookup | `resolveAliveHumans`, `resolveAliveByType`, `rebuild` |
| Render SoA pack, sidecar and buffer layout | `simBuffers/packRenderSoA.ts` + `simBuffers/entityRenderMeta.ts` + `simBuffers/schema.ts` + `simBuffers/renderSoAEntities.ts` + `simBuffers/renderSoAReader.ts` | per tick (worker packs, host reads) | `packRenderSoA`, `selectRenderEntities`, `packEntityRenderMeta`, `buildRenderEntityShim`, `renderBufferByteLength`, `updateRenderSoABuckets`, `createRenderSoAReader`, `validateRenderBufferLayout` |
| Entity draw cache (viewport) | `renderer/entityCache.ts` | render pass | `updateCachedEntities`, `updateCachedEntitiesFromSoA`, `resetEntityCaches` |
| Weather, season particles and terrain draw caches | `renderer/weather.ts` + `renderer/terrain.ts` | render pass | `drawWeather`, `drawSeasonParticles`, `drawWaterShimmer`, `drawGround`, `resetWeatherCaches`, `planGroundChunks` |
| Ambient beds and track playback | `audio/ambient.ts` + `audio/trackPlayer.ts` + `audio/backgroundMusic.ts` + `audio/introMusic.ts` | UI events + time of day (intro vs gameplay) | `playLoopBed`, `rescheduleOneShot`, `playLoop`, `crossfadeLoop`, `start`, `ensureIntroAudio` |
| Dashboard projections | `dashboardData.ts` | UI (read-only projection) | `collectDashboard`, `explainSettler` |
| Chronicle export and download | `eventLogExport.ts` | UI + autosave | `downloadChronicleLog`, `formatChronicleText`, `formatChronicleJSON`, `buildChronicleFilename` |
| Population and wildlife counts | `entityCounts.ts` | per-tick bookkeeping (`gameTick`, `tickLayerRealtime`) + daily point-of-use snapshot (`tickLayerDaily`) | `computePopulationCounts`, `countLivingPopulation`, `computeWildlifeCounts`, `wildlifeCountsFromPopulation` |
| Rival presence summary | `rivalPresence.ts` | UI projection | `getRivalPresenceSummary`, `getRivalActivityLabel` |
| Renffr star omen and settler gossip | `renffrStar.ts` | realtime (`tickLayerRealtime`, `tickHumans`) + overlay draw | `maybeTriggerRenffrOmen`, `tickRenffrOmen`, `createRenffrOmen`, `beginRenffrSettlerChatter`, `isRenffrGossipActive`, `drawRenffrOmen` |
| Chronicle/log panel presentation | `EventLogPanel.tsx` | UI (read + export only) | `EventLogPanel` |
| Apprenticeships (master/apprentice pairing and skill transfer) | `apprenticeships.ts` | new-calendar-day (`tickLayerDaily`) | `advanceApprenticeships`, `apprenticeSkill` |
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
| App shell, layout and menu composition | `App.tsx` + `GamePlayLayout.tsx` + `GameSidebar.tsx` + `GameHeader.tsx` + `GameOverlays.tsx` + `GameBuildRail.tsx` + `GameInspector.tsx` + `GameMapStage.tsx` + `GameMenu.tsx` + `ShortcutsOverlay.tsx` + `CollapsibleSection.tsx` + `Emoji.tsx` | UI (composition/wiring only) | `App`, `GamePlayLayout`, `GameSidebar`, `GameHeader`, `GameMapStage`, `GameMenu` |
| HUD badges, banners and alerts | `AlertBar.tsx` + `ActiveEventBanner.tsx` + `BigNewsBanner.tsx` + `MomentTitleCard.tsx` + `ResourceBadge.tsx` + `ResourceIcons.tsx` + `ResourceCost.tsx` + `VillageRequestCard.tsx` | UI (read-only presentation) | `AlertBar`, `ActiveEventBanner`, `BigNewsBanner`, `ResourceBadge`, `ResourceCost` |
| Sidebar tabs and read-only panels | `DynastyPanel.tsx` + `FrontierTabPanel.tsx` + `LogTabPanel.tsx` + `MoreTabPanel.tsx` + `NatureTabPanel.tsx` + `ProgressTabPanel.tsx` + `ValleyChroniclePanel.tsx` + `VillageTabPanel.tsx` + `PopulationPanel.tsx` + `StatisticsPanel.tsx` + `VillageLeadershipPanel.tsx` + `FocusPanel.tsx` + `CitizenOverviewScreen.tsx` + `CombatPreviewPanel.tsx` + `CombatLogPanel.tsx` + `VisitorCampPanel.tsx` + `BlacksmithForgePanel.tsx` + `BuildCatalogPanel.tsx` + `WorkSchedulePanel.tsx` + `VenueSchedulePanel.tsx` + `WorkHoursWindow.tsx` + `FamilyTreeWindow.tsx` + `SimulationDiagnosticsPanel.tsx` + `GuidedCampaignPanel.tsx` + `SelectedBuildingPanel.tsx` + `SelectedEntityPanel.tsx` + `MapSetupScreen.tsx` + `IntroScreen.tsx` + `MiniMap.tsx` + `ChallengesPanel.tsx` + `FrontierPanel.tsx` + `TutorialOverlay.tsx` + `TutorialCampaignBanner.tsx` + `ContextualTutorialCard.tsx` | UI (read-only projections; commands go through `App`) | `ProgressTabPanel`, `VillageTabPanel`, `NatureTabPanel`, `MoreTabPanel`, `PopulationPanel`, `SelectedBuildingPanel`, `SelectedEntityPanel`, `MapSetupScreen`, `IntroScreen`, `computeMiniMapViewportRect` |
| Village dashboard projection | `dashboard/GameDashboard.tsx` | UI (read-only) | `GameDashboard` |
| Session, input, persistence and feedback hooks | `useGameSession.ts` + `useCanvasInteractions.ts` + `useKeyboardControls.ts` + `useGamePersistence.ts` + `useTransientGameFeedback.ts` + `useContextualTutorial.ts` + `useGameShellState.ts` + `useFpsMeter.ts` + `useGameAudio.ts` + `useVirtualPlayer.ts` | UI (lifecycle; dispatch only through the command door) | `useGameSession`, `useCanvasInteractions`, `useKeyboardControls`, `useGamePersistence`, `useTransientGameFeedback`, `virtualPlayerStatusText`, `VIRTUAL_PLAYER_IDLE_STATUS` |
| Overlay keyboard and map-pointer gesture contract | `hooks/useOverlayKeyboard.ts` + `hooks/useCanvasInteractions.ts` | UI input; a window claims the keyboard while open and closes on Escape, and a map gesture's travel decides click versus pan | `useOverlayKeyboard`, `useCanvasInteractions`, `pointerMovedRef` |
| Overview subject vocabulary (door names, glyphs, hints) | `hooks/useGameShellState.ts` | UI (read-only projection; the header, the Guide and the shortcut sheet all render it) | `OVERVIEW_SUBJECTS`, `overviewSubjectForTab` |
| Hotkeys, help, alerts and UI-side projections | `hotkeys.ts` + `guideHelp.ts` + `priorityAlerts.ts` + `focusHints.ts` + `rivalDisplay.ts` + `uiSimSummary.ts` + `villagePortrait.ts` + `citizenOverview.ts` + `familyLegacy.ts` + `familyTree.ts` + `buildingProgressDisplay.ts` + `housingDiagnostics.ts` + `scheduleFeedback.ts` + `contextualTutorial.ts` | UI (read-only projections) | `HEADER_DOORS`, `resolveSidebarTabFromKey`, `searchGuideHelp`, `getPriorityAlerts`, `getFocusHints`, `computeVillageStats`, `computeCitizenOverview`, `buildFamilyTree` |
| Wolf scent field (deposit, decay, gradient sampling) | `scentGrid.ts` | realtime (every tick) + render SoA sidecar | `ensureScentGrid`, `tickScentGrid`, `ScentGrid`, `ScentGridReader` |
| Schedule and per-person day rolls | `humanSchedule.ts` | realtime + daily | `personDayRoll`, `isAsleepAtHome`, `prefersHomeTonightFor`, `isFestivalGatheringHour`, `isFestivalGatherer` |
| Tick interpolation for moving entities | `renderer/motionInterpolation.ts` | per frame (presentation) | `interpolatePosition`, `beginMotionFrame`, `presentationPosition`, `resetMotionInterpolation` |
| Per-frame repaint of the movers (animals, humans, particles, trail lines, floating text) | `renderer/entityComposite.ts` | per frame (presentation) | `paintMovingEntities` |
| Hover tint for roads, walls and construction pads | decision `renderer/buildings.ts`, drawn by `renderer/overlay.ts` | per frame (presentation) | `hoverTintKindFor`, `drawHoveredBuildingTint`, `drawStripBuilding`, `drawConstructionBody` |
| Render device-pixel-ratio and canvas fit | `canvasLayer.ts` | per frame (presentation) | `getRenderDpr`, `fitCanvasToDpr` |
| Mini-map frame drawing and repaint cadence | `renderer/miniMapFrame.ts` | per frame (presentation) | `drawMiniMapFrame`, `registerMiniMapFrameDraw`, `shouldRepaintMiniMap` |
| Building command actions (config and maintenance) | `buildingConfigurationActions.ts` + `buildingMaintenanceActions.ts` | player-command | `setWorkshopRecipe`, `setMineMode`, `demolishBuilding`, `repairBuilding`, `upgradeBuilding`, `REPAIR_COST` |
| Spatial grids (mobile, grass, social) and their invariants | `spatialGrid.ts` | realtime (rebuild/reconcile per tick) + query helpers | `syncMobileSimGrid`, `syncSpatialGridEntity`, `assertSpatialGridInvariants`, `EntitySpatialGrid`, `isHumanSocialGridEntity` |
| Systems tick layer | `tickLayerSystems.ts` | systems pulse (`LAYER_SYSTEMS_INTERVAL`) | `tickLayerSystems`, `tickWildlife`, `tickWolfRecruitment`, `isWildlifePredator` |
| Resource types, costs and build catalogue | `resourceTypes.ts` + `resourceCost.ts` + `buildCatalog.ts` | — (data + formatting, no state) | `formatResourceAmount`, `formatResourceAmounts`, `formatResourceCost`, `canAffordResourceCost`, `missingResourceCost`, `categoryForBuildingType` |
| Building configs and mine-mode helper | `buildings.ts` | — / player-command | `mineOreForMode` |
| Daily village schedule fatigue | `scheduleFatigue.ts` + `dailyScheduleFatigue.ts` | realtime record + daily resolve (`tickLayerDaily`) | `recordScheduleWorkTick`, `resolveDailyVillageScheduleFatigue`, `getScheduleProductivityMultiplier` |
| Village challenges | `challenges.ts` + `dailyChallenges.ts` | daily (`tickLayerDaily`) | `tickDailyChallenges`, `isChallengeComplete`, `getChallengeProgress` |
| Grass ecology day pulse | `dailyGrassEcology.ts` | daily (`tickLayerDaily`) | `tickGrassDaily` |
| Daily population reconciliation | `dailyPopulation.ts` | daily (`tickLayerDaily`) | `tickDailyPopulation` |
| Daily world events schedule | `dailyWorldEvents.ts` | daily (`tickLayerDaily`) | `tickDailyWorldEvents` |
| Hunting behaviour and hunting-spot rules | `humanHuntingBehavior.ts` + `huntingSpots.ts` | realtime (`humanTick`) + command validation | `tickHumanHunting`, `isValidHuntingSpotPrey`, `getHuntingSpotPreyOption` |
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
| Renderer facade and entity-layer compositing | `renderer.ts` + `renderer/entityComposite.ts` + `renderer/buildings.ts` + `renderer/animals.ts` + `renderer/trees.ts` + `renderer/grass.ts` + `renderer/particles.ts` + `renderer/markers.ts` + `renderer/scent.ts` + `renderer/nightEffects.ts` + `renderer/overlay.ts` + `renderer/buildPreview.ts` | render pass | `renderGame`, `compositeCachedEntityLayer`, `drawBuildings`, `drawAnimals`, `drawTrees`, `drawGrass`, `drawParticles`, `drawCampMarkers`, `drawScentOverlay`, `drawGameOverlay`, `drawBuildPreview`, `footprintGroundRise`, `targetGroundStep`, `isHighlightableBuilding`, `getBuildingFootprintScreenRect`, `drawBuildingHighlightRing` |
| Animal sprite metrics | `entitySprites.ts` | render pass | `getAnimalSpriteMetrics` |
| Renderer preload, buffer pool and wire-type codes | `rendererLoader.ts` + `simBuffers/renderBufferPool.ts` + `simBuffers/entityTypeCodes.ts` | boot + worker buffer lifecycle | `preloadRenderer`, `entityTypeToCode`, `isKnownEntityTypeCode`, `codeToEntityType` |
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
| Settlement memory / legacy goals | `legacyGoals.ts` | on demand — derived from records the simulation already writes and saves, so no new save field | `collectLegacyGoals`, `LEGACY_GOALS` |
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
| Terrain data model, its four-layer grid and the tile projection | `terrain/terrainGrid.ts` | generation, then read-only | `tileAt`, `tileTypeAt`, `tileTypeAtWorld`, `isTileBuildable`, `setTileOverride`, `rebakeTerrainGrids` |
| Terrain generation pipeline | `terrain/terragen.ts` | world generation, once per map | `generateRawTerrain`, `terrainSeedFor`, `legacyTerrainSeed` |
| Noise and PRNG primitives | `terrain/noise.ts` | generation (pure) | `fbm`, `ridged`, `warp`, `valueNoise`, `mulberry32`, `hash2`, `clamp` |
| River flow routing (the hydrology model) | `terrain/hydrology.ts` | generation, after de-pitting | `computeFlow`, `fillDepressions`, `riverWidthAt` |
| What a terrain type **is** — water, and may anything stand on it | `terrain/terrainTraits.ts` | read-only leaf (breaks the `placementUtils ↔ terrainGrid` cycle) | `isWaterTerrainType`, `isUnbuildableTerrainType` |
| Orographic rain shadow | `terrain/rainShadow.ts` | generation (the moisture field) | `rainShadowField` |
| Ground bake, per-pixel Whittaker | `renderer/whittakerTerrain.ts` | render, cached per viewport | `buildWhittakerFields`, `bakeWhittakerGround`, `bandDetail` |
| Ground props (the L3 decor layer) | `renderer/decor.ts` | render, cached per rect | `bakeDecorInRect` |
| Hunting Spot prey selection, pursuit and the kill | `huntingSpot.ts` | realtime hunter behaviour | `huntingSpotTarget`, `commitHuntingSpotTarget`, `pickHuntingSpotPrey`, `huntingKillReach`, `huntingPursuitPoint`, `isHuntingStrikeLive`, `isHuntingSpotHunter`, `huntingFightBackFate`, `huntingFightBackKillChance` |
| The village anchor (one camp-centre rule, two readers) | `villageAnchor.ts` | command + render, read-only | `getPlayerCampCenter`, `getPlayerCampCenterFromBuildings`, `getPlayerSettlerCenter` |
| Civil status — married **or** expecting | `civilStatus.ts` | read-only predicate | `isMarriedOrExpecting` |
| The one window shell a subject renders into | `components/GameWindow.tsx` | UI (composition/wiring only) | `GameWindow` |
| One subject as an index inside a window | `components/SubjectWindow.tsx` | UI (composition/wiring only) | `SubjectWindow` |
| Work & venue hours editor | `components/WorkHoursWindow.tsx` | UI (read-only editors, commands out) | `WorkHoursWindow` |
| Family tree window | `components/FamilyTreeWindow.tsx` | UI (read-only; the data owner is `game/familyTree.buildFullFamilyTree`) | `FamilyTreeWindow` |
| Test map fixtures | `src/test/worldMapFixtures.ts` | test tier only — never in the app build | `testWorldMap`, `blockedColumn` |

## Owners recorded by the 2026-10-08 audit-remediation session

The long-run gate's housing verdict is the housing owner's, not the harness's; the harness only names
the residence that broke, so a failed gate says which home and which day instead of only a count.
The stall verdict below is the harness's own read of the run it just made: a settlement that broke no
invariant can still have stopped working, and when the shipped default scenario reads as stalled it is
reported as stalled — never softened until it passes.

| Decision | True owner | Cadence / called from | Key entry functions |
|---|---|---|---|
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
| `buildingActions.ts` | re-export focused action owners | new command policy |
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
`dayCycleConstants.ts` holds pure values (night hours, moon cycle, adult age floor).
