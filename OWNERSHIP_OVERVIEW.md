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
| Simulation randomness: streams, seed and their positions | `simRng.ts` (per-person day rolls: `humanSchedule.personDayRoll`); presentation owners use the separate `getPresentationRng` registry | per draw; positions cross realms via `world.simRng` | `getSimRng`, `getPresentationRng`, `seededRandomForRun`, `snapshotSimRng`, `restoreSimRng`, `parseSimRngSnapshot`, `setSimSeed`, `adoptSimSeedFromWorld` |

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
| Ambient chat and dialogue sessions | `humanChat.ts` | realtime (`tickHumans`) | `tickHumanChat`, `sayHumanChatPhrase`, `isDialogueBusy`, `startDialogueTreeChat` |
| Needs: colony meal and exhaustion | `simulation/humanNeeds.ts` | realtime (`tickHumans`, `applySettlerUpkeep`, hunting) | `tryEatColonyMeal`, `isMealCheckHour`, `humanEnergyLoss`, `killFromExhaustion` |
| Skills and job skill effects | `skills.ts` | work (`dailyBuildingEconomy`, workforce transitions, apprenticeships, graduation) | `ensureEntitySkills`, `readSkill`, `gainSkill`, `getWorkerSkillMultiplier` |
| School attendance, credit and graduation | `education.ts` | realtime (`humanTick`) + new-calendar-day credit | `recordChildSchoolTick`, `creditChildSchoolDay`, `applyEducationGraduation`, `buildSchoolRosters` |
| Friendship and feud webs (with their daily energy effects) | `relationships.ts` | new-calendar-day (`tickLayerDaily`) | `advanceSocialRelationships`, `startFeud`, `friendshipScore`, `feudScore` |
| Election promises | `electionPromises.ts` | new-calendar-day (three daily call sites) | `tickElectionPromises`, `recordElectionPromises`, `getPromiseDetail`, `electionPromisesForYear` |
| Wedding diplomacy beat | `weddingDiplomacy.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `maybeOfferWeddingDiplomacy`, `tickWeddingDiplomacy`, `resolveWeddingDiplomacy`, `getWeddingDiplomacyChoiceEligibility` |
| Authored story events (children shelter, winter freeze, grief, welcomes) | `storyEvents.ts` | new-calendar-day (`tickDailyWorldEvents`) + story command | `offerStoryEvent`, `tickChildrenShelter`, `tickWinterFreezeCheck`, `respondToStoryEvent`, `getStoryChoiceEligibility` |
| Village forge orders | `forge.ts` | daily (`tickBuildingProduction`) + player-command | `tickVillageForge`, `queueForgeOrder`, `isForgeOrderComplete`, `normalizeForgeState` |
| Building adjacency index | `adjacencyIndex.ts` | assignment/daily (production, completion, demolition) | `ensureAdjacencyIndex`, `syncAdjacency`, `unindexAdjacency`, `getAdjacencyMultiplierFromIndex` |
| Valley ecology stage (parked, `ValleyEcology.ENABLED = false`) | `ecologyStage.ts` | daily (`tickDailyWorldEvents`) | `tickValleyEcologyStage`, `valleyStageIndex`, `computeRawEcologyStress`, `getValleyHuntYieldMultiplier` |
| Housing/bed projection for decisions and UI | `populationGrowth.ts` | on demand (auto-play `decide*`, citizen overview, focus hints) | `snapshotPopulation`, `getOpenPlayerBeds`, `getTotalBeds`, `getLivePlayerPopulation` |
| Social proximity queries | `adaptiveSpatialQuery.ts` | — (query helper over the human social grid) | `forEachAdaptiveInRadius`, `findClosestAdaptiveInRadius`, `socialAdaptiveOptions` |
| Citizen identity, display names and chronicle names | `citizenId.ts` | — (formatting/parse, no state) | `humanDisplayName`, `formatCitizenName`, `formatDeathLog`, `findCitizenByQuery` |
| Name pool, census names and marriage surname dissolve | `nameLoader.ts` | boot load + spawn + divorce/remarriage | `loadNames`, `ensureNamesLoaded`, `getRandomName`, `getRandomSurname`, `fixDefaultNames`, `dissolveMarriage` |
| Shared sim helpers (multipliers, reputation, season) | `simHelpers.ts` | — (helper, no cadence of its own) | `getMultiplier`, `addReputation`, `hasTech`, `getSeason` |
| Relationship diagnostics | `relationshipDiagnostics.ts` | dev-only, recorded at each decision roll | `recordRelationshipDiagnostic`, `flushRelationshipDiagnostics`, `setRelationshipDiagnosticsEnabled` |
| Spatial-query metrics and grid A/B switch | `spatialQueryMetrics.ts` | dev-only | `setSpatialQueryMetricsEnabled`, `setSpatialQueryGridMode`, `isSpatialQueryMetricsEnabled` |
| Auto-play decisions (dev-gated, N17) | `virtualPlayer.ts` | player-command — one action per in-game hour through the same command door | `decideVirtualPlayerAction` and the `decide*` family |
| Player preferences | `preferences.ts` | UI (boot read + toggle write) | `loadAutoSavePreference`, `saveAutoSavePreference`, `loadTutorialsEnabled`, `saveTutorialsEnabled` |
| Camera and view state | `viewState.ts` | render pass + input + session setup | `createInitialView`, `updateView`, `resolveEntity`, `resolveBuilding`, `clampCameraZoom` |
| Building rotation rules | `buildingRotation.ts` | player-command (placement) | `isRotatableBuildingType`, `toggleBuildingRotation` |
| Sprite metrics and class-ladder variants | `humanSprites.ts` | spawn (variant pick) + render pass | `pickHumanVariant`, `getHumanSpritePath`, `getHumanSpriteMetrics`, `getHumanSelectionBounds` |
| Terrain atlas bake and tile picks | `terrainAtlas.ts` | render pass (cached; rebuild on readiness) | `terrainAtlasReady`, `pickAtlasTile`, `pickSandWaterOverlay`, `atlasFamily` |
| Audio direction | `audio/index.ts` + `audio/director.ts` | UI events + time of day | `unlockAudio`, `primeAudioUnlock`, `ensureIntroAudio`, `beginAudio` |
| Building placement validity | `placementUtils.ts` + `grid.ts` | player-command + world gen | `canPlaceBuildingSnapshot`, `isFootprintOnBuildableTerrain`, `isBuildingTechUnlocked`, `isFootprintWithinMapBounds` |
| Research unlocks and progression | `research.ts` | player-command + building completion | `startResearch`, `canStartResearch`, `updateResearch`, `syncResearchUnlocks`, `notifyBuildingLocked` |
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
| Pixi terrain paint | `renderer/pixiTerrain.ts` | render pass (cached) | `renderPixiTerrain`, `resetPixiTerrain` |
| Weather, season particles and terrain draw caches | `renderer/weather.ts` + `renderer/terrain.ts` | render pass | `drawWeather`, `drawSeasonParticles`, `drawWaterShimmer`, `drawGround`, `resetWeatherCaches` |
| Ambient beds and track playback | `audio/ambient.ts` + `audio/trackPlayer.ts` + `audio/backgroundMusic.ts` + `audio/introMusic.ts` | UI events + time of day (intro vs gameplay) | `playLoopBed`, `rescheduleOneShot`, `playLoop`, `crossfadeLoop`, `start`, `ensureIntroAudio` |
| Dashboard projections | `dashboardData.ts` | UI (read-only projection) | `collectDashboard`, `explainSettler` |
| Chronicle export and download | `eventLogExport.ts` | UI + autosave | `downloadChronicleLog`, `formatChronicleText`, `formatChronicleJSON`, `buildChronicleFilename` |
| Population and wildlife counts | `entityCounts.ts` | per-tick bookkeeping (`gameTick`, `tickLayerRealtime`) | `computePopulationCounts`, `computeWildlifeCounts`, `wildlifeCountsFromPopulation` |
| Rival presence summary | `rivalPresence.ts` | UI projection | `getRivalPresenceSummary`, `getRivalActivityLabel` |
| Renffr star omen and settler gossip | `renffrStar.ts` | realtime (`tickLayerRealtime`, `tickHumans`) + overlay draw | `maybeTriggerRenffrOmen`, `tickRenffrOmen`, `createRenffrOmen`, `beginRenffrSettlerChatter`, `isRenffrGossipActive`, `drawRenffrOmen` |
| Chronicle/log panel presentation | `EventLogPanel.tsx` | UI (read + export only) | `EventLogPanel` |
| Apprenticeships (master/apprentice pairing and skill transfer) | `apprenticeships.ts` | new-calendar-day (`tickLayerDaily`) | `advanceApprenticeships`, `apprenticeSkill` |
| Tamed-animal care and feeding | `animalCare.ts` | daily (`tickDailyWorldEvents`) + wildlife layer | `tickAnimalCare`, `tamedAnimalsFedToday`, `countTamedAnimals`, `getAnimalCareStatus` |
| Grazing pressure and grass growth multipliers | `grassEcology.ts` | per tick + daily production | `getGrassGrowthMultiplier`, `getGrazerDailyDemand`, `getWinterEnergyPenalty`, `getWeatherFarmMultiplier` |
| Settler activity status projection (inspector/UI) | `humanStatus.ts` | UI (read-only projection) | `getHumanActivityStatus`, `getHumanActivityProjection` |
| Speech-bubble and name-label layout | `renderer/overheadLayout.ts` | render pass | `resolveSpeechBubbleRect`, `getSpeechBubbleFontSize`, `getSpeechBubbleHeadClearance`, `shouldDrawHumanNameLabel` |

### Presentation, UI and remaining simulation owners (2026-09-16 work-list sweep)

The explorer's second pass listed every module still without a row. UI and render modules are owners
too — they may read simulation state and must not write it — so they are named here rather than left
unowned. Grouped rows keep this list readable; the owner cell is what the explorer matches on.

| Decision | True owner | Cadence / called from | Key entry functions |
|---|---|---|---|
| App shell, layout and menu composition | `App.tsx` + `GamePlayLayout.tsx` + `GameSidebar.tsx` + `GameHeader.tsx` + `GameOverlays.tsx` + `GameBuildRail.tsx` + `GameInspector.tsx` + `GameMapStage.tsx` + `GameMenu.tsx` + `ShortcutsOverlay.tsx` + `CollapsibleSection.tsx` + `Emoji.tsx` | UI (composition/wiring only) | `App`, `GamePlayLayout`, `GameSidebar`, `GameHeader`, `GameMapStage`, `GameMenu` |
| HUD badges, banners and alerts | `AlertBar.tsx` + `ActiveEventBanner.tsx` + `BigNewsBanner.tsx` + `MomentTitleCard.tsx` + `ResourceBadge.tsx` + `ResourceIcons.tsx` + `ResourceCost.tsx` + `VillageRequestCard.tsx` | UI (read-only presentation) | `AlertBar`, `ActiveEventBanner`, `BigNewsBanner`, `ResourceBadge`, `ResourceCost` |
| Sidebar tabs and read-only panels | `DynastyPanel.tsx` + `FrontierTabPanel.tsx` + `LogTabPanel.tsx` + `MoreTabPanel.tsx` + `NatureTabPanel.tsx` + `ProgressTabPanel.tsx` + `ValleyChroniclePanel.tsx` + `VillageTabPanel.tsx` + `PopulationPanel.tsx` + `StatisticsPanel.tsx` + `VillageLeadershipPanel.tsx` + `RoadmapPanel.tsx` + `FocusPanel.tsx` + `CitizenOverviewScreen.tsx` + `CombatPreviewPanel.tsx` + `CombatLogPanel.tsx` + `VisitorCampPanel.tsx` + `BlacksmithForgePanel.tsx` + `BuildCatalogPanel.tsx` + `WorkSchedulePanel.tsx` + `VenueSchedulePanel.tsx` + `FamiliesTreePanel.tsx` + `SimulationDiagnosticsPanel.tsx` + `GuidedCampaignPanel.tsx` + `SelectedBuildingPanel.tsx` + `SelectedEntityPanel.tsx` + `MapSetupScreen.tsx` + `IntroScreen.tsx` + `MiniMap.tsx` + `ChallengesPanel.tsx` + `FrontierPanel.tsx` + `TutorialOverlay.tsx` + `TutorialCampaignBanner.tsx` + `ContextualTutorialCard.tsx` | UI (read-only projections; commands go through `App`) | `ProgressTabPanel`, `VillageTabPanel`, `NatureTabPanel`, `MoreTabPanel`, `PopulationPanel`, `SelectedBuildingPanel`, `SelectedEntityPanel`, `MapSetupScreen`, `IntroScreen` |
| Village dashboard projection | `dashboard/GameDashboard.tsx` | UI (read-only) | `GameDashboard` |
| Session, input, persistence and feedback hooks | `useGameSession.ts` + `useCanvasInteractions.ts` + `useKeyboardControls.ts` + `useGamePersistence.ts` + `useTransientGameFeedback.ts` + `useContextualTutorial.ts` + `useGameShellState.ts` + `useFpsMeter.ts` + `useGameAudio.ts` + `useVirtualPlayer.ts` | UI (lifecycle; dispatch only through the command door) | `useGameSession`, `useCanvasInteractions`, `useKeyboardControls`, `useGamePersistence`, `useTransientGameFeedback` |
| Hotkeys, help, alerts and UI-side projections | `hotkeys.ts` + `guideHelp.ts` + `priorityAlerts.ts` + `focusHints.ts` + `raidUtils.ts` + `rivalDisplay.ts` + `uiSimSummary.ts` + `villagePortrait.ts` + `citizenOverview.ts` + `familyLegacy.ts` + `familyTree.ts` + `buildingProgressDisplay.ts` + `housingDiagnostics.ts` + `scheduleFeedback.ts` + `roadmapContent.ts` + `contextualTutorial.ts` | UI (read-only projections) | `resolveSidebarTabFromKey`, `searchGuideHelp`, `getPriorityAlerts`, `getFocusHints`, `computeVillageStats`, `computeCitizenOverview`, `buildFamilyTree` |
| Wolf scent field (deposit, decay, gradient sampling) | `scentGrid.ts` | realtime (every tick) + render SoA sidecar | `ensureScentGrid`, `tickScentGrid`, `ScentGrid`, `ScentGridReader` |
| Schedule and per-person day rolls | `humanSchedule.ts` | realtime + daily | `personDayRoll`, `isAsleepAtHome`, `prefersHomeTonightFor` |
| Building command actions (config and maintenance) | `buildingConfigurationActions.ts` + `buildingMaintenanceActions.ts` | player-command | `setWorkshopRecipe`, `setMineMode`, `demolishBuilding`, `repairBuilding`, `upgradeBuilding` |
| Spatial grids (mobile, grass, social) and their invariants | `spatialGrid.ts` | realtime (rebuild/reconcile per tick) + query helpers | `syncMobileSimGrid`, `syncSpatialGridEntity`, `assertSpatialGridInvariants`, `EntitySpatialGrid`, `isHumanSocialGridEntity` |
| Systems tick layer | `tickLayerSystems.ts` | systems pulse (`LAYER_SYSTEMS_INTERVAL`) | `tickLayerSystems`, `tickWildlife`, `tickWolfRecruitment`, `isWildlifePredator` |
| Resource types, costs and build catalogue | `resourceTypes.ts` + `resourceCost.ts` + `buildCatalog.ts` | — (data + formatting, no state) | `createEmptyResources`, `hasEnough`, `formatResourceCost`, `categoryForBuildingType` |
| Building configs and mine-mode helper | `buildings.ts` | — / player-command | `mineOreForMode` |
| Daily village schedule fatigue | `scheduleFatigue.ts` + `dailyScheduleFatigue.ts` | realtime record + daily resolve (`tickLayerDaily`) | `recordScheduleFatigue`, `resolveDailyVillageScheduleFatigue`, `getScheduleProductivityMultiplier` |
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
| Prison guard duty | `prisonGuardDuty.ts` | daily (`tickDailyWorldEvents`) | `tickPrisonGuardDuty` |
| Simulation invariant collection and assertion | `simulationInvariants.ts` + `simInvariants.ts` | dev/daily check (`gameTick`) | `collectSimulationInvariantErrors`, `assertSimInvariants` |
| Decision-registry accessors | `simulation/decisionRegistry.ts` | — (static table accessors) | `getDecisionOwner`, `getDecisionsByCadence`, `isPropertyWritePermitted` |
| Species configuration | `speciesConfig.ts` | — (data) | `getSpeciesConfig`, `getPreyEnergyGain` |
| Ecosystem pressure and temperature projections | `ecosystemPressure.ts` + `temperature.ts` | daily + UI projection | `getGrazingPressureReport`, `computeDailyTemperatureC` |
| Workshop gold projection | `workshopEconomy.ts` | UI projection | `estimateWorkshopGold` |
| Juice particles and hunt visuals | `juiceEffects.ts` + `huntvisuals.ts` | presentation, spawned by sim events | `pushTransientParticle`, `spawnBuildCompleteParticles`, `addHuntVisual`, `pruneHuntVisuals` |
| Entity-type cache | `entityTypeCache.ts` | per tick (`gameTick`, cache invalidation) | `getCachedEntityByType`, `invalidateCachedEntityByType`, `cacheEntityByType` |
| Render snapshot and kinematics patch | `renderSnapshot.ts` + `simBuffers/applyKinematics.ts` | per frame | `buildRenderSnapshot`, `patchCatalogKinematicsFromRenderSoA` |
| Worker UI-patch merge | `simWorker/uiPatch.ts` | worker boundary (`patchUi`) | `applyWorkerUiPatch` |
| Renderer facade and entity-layer compositing | `renderer.ts` + `renderer/entityComposite.ts` + `renderer/buildings.ts` + `renderer/animals.ts` + `renderer/trees.ts` + `renderer/grass.ts` + `renderer/particles.ts` + `renderer/markers.ts` + `renderer/scent.ts` + `renderer/nightEffects.ts` + `renderer/overlay.ts` + `renderer/buildPreview.ts` | render pass | `renderGame`, `compositeCachedEntityLayer`, `drawBuildings`, `drawAnimals`, `drawTrees`, `drawGrass`, `drawParticles`, `drawCampMarkers`, `drawScentOverlay`, `drawGameOverlay`, `drawBuildPreview` |
| Animal sprite metrics | `entitySprites.ts` | render pass | `getAnimalSpriteMetrics` |
| Renderer preload, buffer pool and wire-type codes | `rendererLoader.ts` + `simBuffers/renderBufferPool.ts` + `simBuffers/entityTypeCodes.ts` | boot + worker buffer lifecycle | `preloadRenderer`, `entityTypeToCode`, `isKnownEntityTypeCode`, `codeToEntityType` |
| Node/Tauri runtime helpers | `nodeRuntime.ts` | boot (`nameLoader`, `dialogueTrees`) | `isNodeRuntime`, `readUtf8RelativeToModule` |
| Audio bootstrap, activity detection and HTML sync | `audio/bootstrap.ts` + `audio/interactionDetect.ts` + `audio/interactionSfx.ts` + `audio/workDetect.ts` + `audio/workSfx.ts` + `audio/tracks.ts` + `audio/htmlAudioSync.ts` | UI/audio events | `bootstrapIntroAudio`, `detectInteractionSounds`, `detectWorkActivity`, `playFootstepSfx`, `syncHtmlAudioMute` |

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
