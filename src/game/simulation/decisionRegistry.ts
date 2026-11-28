/**
 * Simulation Decision Registry — one entry per major gameplay decision: owner, cadence, permitted
 * writes, scheduler and tests. A static table the test runners and architecture linters enforce.
 */

export const DECISION_CADENCES = [
  'realtime',
  'assignment',
  'work',
  'daily',
  'systems',
  'staggered-social',
  'new-calendar-day',
  'pregnancy-progress',
  'full-moon-event',
  'player-command',
  'render',
  'on-demand',
] as const;

export type DecisionCadence = (typeof DECISION_CADENCES)[number];

export interface DecisionOwner {
  /** Authoritative owner module + entry function(s). */
  readonly owner: string;
  /** Primary cadence (authority §4). Secondary cadence in `cadenceNote`. */
  readonly cadence: DecisionCadence;
  /** When the authority declares a compound cadence, the secondary part. */
  readonly cadenceNote?: string;
  /** State fields this owner may write. Never gameplay fields of another owner. */
  readonly writes: readonly string[];
  /** Where the decision is scheduled from (tick layer / command boundary). */
  readonly scheduledFrom: string;
  /** Test files covering the decision. */
  readonly testFile: string;
}

/**
 * Stable decision keys representing each distinct simulation subsystem.
 */
export type DecisionKey =
  | 'navigation'
  | 'workerMotionPresentation'
  | 'virtualPlayer'
  | 'chronicleProseNames'
  | 'dailyPersonRoll'
  | 'traitInfluence'
  | 'personalMarks'
  | 'careerHistory'
  | 'careerProgression'
  | 'workerFit'
  | 'completedBuildingLookup'
  | 'inputGuards'
  | 'buildingAccess'
  | 'humanLeisure'
  | 'settlerDeathAudio'
  | 'terrainClearingFields'
  | 'colonyMovementObservation'
  | 'humanPhysiology'
  | 'humanMeals'
  | 'workSchedule'
  | 'school'
  | 'workforce'
  | 'immigration'
  | 'housing'
  | 'construction'
  | 'production'
  | 'civicPetition'
  | 'tradeCaravans'
  | 'humanWalk'
  | 'dailyRelationships'
  | 'humanMortality'
  | 'ecosystemMetrics'
  | 'yearlyWorldEvents'
  | 'grassRegrowth'
  | 'foodLedger'
  | 'herdMemory'
  | 'wildlifePredation'
  | 'predatorCombat'
  | 'wildlifeReplenishment'
  | 'inventionFair'
  | 'authoredStoryExpiry'
  | 'rivalStrategy'
  | 'idleSkillDecay'
  | 'socialFeedback'
  | 'dialogueContent'
  | 'dialogueSessions'
  | 'renffrOmen'
  | 'spotlightLore'
  | 'courtship'
  | 'affairs'
  | 'conception'
  | 'pregnancyBirth'
  | 'wildkinLineage'
  | 'moonHowler'
  | 'leadership'
  | 'raidCombat'
  | 'outgoingRaidStatus'
  | 'raidRecovery'
  | 'raidBattlePresentation'
  | 'raidTerminalPresentation'
  | 'crashRecovery'
  | 'valleyChronicle'
  | 'terrainRiverSurface'
  | 'commands';

export const SIMULATION_DECISIONS = {
  navigation: {
    owner: 'pathfinding.ts — getNavigationQuote, searchRoute, walkRoute, searchNodeBudget, routeToBlockedGoal, standTilesForWalker, sharedRouteCaches, getPathGrid, getReadOnlyPathGrid, resetPathGridCaches; commuteReach.ts — routeCommuteCost (internal budget verdict), quoteCommute (point-leg price), quoteBuildingCommute (validated facade-to-facade price)',
    cadence: 'on-demand',
    cadenceNote: 'No independent scheduler or saved writes. Strict shared quotes validate walkable endpoint tiles, cache only complete directed results and preserve node exhaustion as pending, with a search budget that follows the trip length; if a walker still exhausts that budget, the same steering owner retries at bounded escalating node limits with decision-pulse backoff (up to 96,000 nodes), without changing shared commute eligibility or pricing; generator-reserved big-rock cells obstruct walking while decorative building footprints do not; terrainGrid.isWalkableTerrainType consumes terrainTraits.isWaterTerrainType as the single water classifier (including shallow water), and completed bridge footprints alone reopen crossings. A blocked destination is approached over its walkable stand tiles grouped into distance bands from the walker, nearest band first, so the walk ends at the closest reachable stand instead of a far ring around the obstacle. Route geometry also keeps the settler body radius off stamped wall cells, while a physical step keeps the exact point rule so a destination that itself sits near a wall stays reachable. Workforce, education, relocation and walker steering consume shared map-scoped route evidence; auto-play does not quote private employment commutes. Building commute quotes use one representative per connected frontage stretch to preserve isolated entrances while bounding route work; walker approach and arrival still accept every accessible perimeter sample. Policy owners retain their individual writes and scheduled cadence.',
    writes: [],
    scheduledFrom: 'pathfinding.findRouteCostOutcome for valid tile endpoints; commuteReach.quoteCommute on demand',
    testFile: 'tests/navigation.sharedRoutes.test.ts, tests/commuteRouteEstimate.test.ts, tests/pathfinding.segmentTraversal.test.ts',
  },
  virtualPlayer: {
    owner: 'virtualPlayer.ts — decideVirtualPlayerAction, findPlacementSpot (existing-road-frontage-first lawful building placement, camp rings only as fallback), decideFood, wantedBootstrapCropSiteCount, needsAdditionalStore, decideIndustry (read-only policy proposals); economyLedger.isMeasuredFoodDeficit owns measured trend, getProjectedFoodSupply/isProjectedFoodShortfall own proactive demand risk',
    cadence: 'on-demand',
    cadenceNote: 'Once per in-game hour when auto-play is enabled; may propose food-production expansion using visible building occupancy and food supply; never queries private staffing eligibility, issues staffing commands or changes workforce policy or focus. Food expansion prefers real getRecentFoodFlow output and a seven-day forecast of population demand over interchangeable building counts, acting before deficits while waiting for visibly empty completed food sites only outside visible food pressure and limiting pending construction; before history exists, a crop-only bootstrap estimate excludes Fishing/Hunting Spot as Farm equivalents. Store expansion uses economy.computeStorageMax material caps at 85% pressure, never low gold or a population-based Store count. Mine tuning prioritizes a sub-80 gold treasury before an iron shortage; both are checked on the same hourly decision path. Housing status reports the occupied plus actually assignable bed capacity, excluding unoccupied reserved Leader\'s House beds. When no House plot is available, decideHousing first proposes safe redundant-site demolition or residence expansion before optional food construction. Actual world writes remain with command and workforce owners; the auto-player only proposes allowed player actions and never decides staffing or changes workforce priorities. The headless scenario command adapter hydrates runtime caches if it adopts a cloned WorldState into the existing shell. Elective community/perimeter/upgrade and optional storage proposals wait while the spare-bed reserve is short; decorative structures stay player-only',
    writes: [],
    scheduledFrom: 'useVirtualPlayer.shouldVirtualPlayerAct → virtualPlayer.decideVirtualPlayerAction → GameLoop.applyCommand or scripts/colonyHealth.applyColonyBotAction',
    testFile: 'tests/virtualPlayer.test.ts, tests/virtualPlayerHealthVerdict.test.ts, tests/colonyBotCacheHydration.test.ts',
  },
  workerMotionPresentation: {
    owner: 'gameLoop.ts — isLightweightWorkerCommand, canPreviewWorkerCommand, registerWorkerHandlers, scheduleFrame, frameBody, stepFallbackTick, applyCommand, rebuildOptimisticDisplay, exportAuthoritativeWorld, lastExportWasDegraded; scheduleFeedback.ts — getScheduleImpactPreview (read-only)',
    cadence: 'render',
    cadenceNote: 'Worker message admission awaits the shared census-name gate. Failed fallback ticks retain accumulator time; each command carries a host monotonic id and the worker echoes the last applied id so recovery replays only unproven work. Buffer pooling and delta packing remain transport-only, and display caches are hydrated once. On acknowledged ticks, blend only confirmed positions. Top-level schedule/policy commands use shallow previews and skip unnecessary catalog rebuilding unless a tick completed while commands were pending; the next acknowledgement reconciles entities and stale selections. Read-only schedule impact counts authoritative workerBuildingId assignments and shared construction crew membership in one entity pass, excludes imprisoned and invalid staff, and compares complete windows. On save, halt new ticks while earlier commands settle. The tick result carries the simulation-authored pause and the replica adopts it one-way; host resume stays authoritative. No gameplay writes.',
    writes: [],
    scheduledFrom: 'GameWorkerHost tick acknowledgement and requestAnimationFrame → GameLoop.frameBody; useGamePersistence.persistGame → GameLoop.exportAuthoritativeWorld (on-demand)',
    testFile: 'tests/gameLoop.test.ts, tests/gameLoop.lifecycle.test.ts, tests/gameLoop.fallbackTickRollback.test.ts, tests/renderer.motionAndHover.test.ts, tests/workerHandoff.state.test.ts, tests/scheduleFeedback.test.ts',
  },
  chronicleProseNames: {
    owner: 'citizenId.ts — citizenFullName, formatDeathLog',
    cadence: 'on-demand',
    cadenceNote: 'Pure identity formatting for Chronicle prose and graduation notices. Numbered citizen labels remain available for search, identifiers and grave-record lookups.',
    writes: [],
    scheduledFrom: 'On-demand in humanRelationships, education, humanNeeds, worldEvents and other event owners before eventLog writes',
    testFile: 'tests/chronicle.citizenProseNames.test.ts',
  },
  dailyPersonRoll: {
    owner: 'simRng.ts — personDayRoll, personPairDayRoll, mixDayRoll',
    cadence: 'on-demand',
    cadenceNote: 'Pure stateless hash keyed by settler ID, absolute colony day and call-site salt; pair rolls hash both IDs. Historical buckets retain aligned strict thresholds, with quotient precision resolving rare probabilities. Stable for the entire colony day; read-only and consumes no RNG stream state.',
    writes: [],
    scheduledFrom: 'Direct on-demand calls from humanSchedule, townHall, socialLife, hospitalCare, humanHospitalBehavior, humanLeisureBehavior, humanHuntingBehavior, hotelStay, humanTick and simulation/humanRelationships',
    testFile: 'tests/personDayRoll.simRng.test.ts, tests/humanLeisureBehavior.test.ts, tests/civicPetition.cadence.test.ts',
  },
  traitInfluence: {
    owner: 'personality/traitEvaluation.ts — evaluateAptitudeInfluence, combinePairFactors and evaluateAllAptitudeActivities: the single pure entry point that reads the signed weights in personality/activityAptitudes.ts against the one GenomeV2 owned by settlerTraits.ts',
    cadence: 'on-demand',
    cadenceNote: 'Pure data projection with no tick, no scheduler, no RNG and no mutation authority. One validated GenomeV2 per living settler holds fourteen allele pairs; expression is each pair\'s mean and the activity score is relative to that settler\'s own fourteen-dimension mean. The evaluator returns one bounded factor per activity (`1 + cap*score`, cap 5–20%) plus stable reasons on request, and never a second genetics source, cached modifier or extra roll. Signed weights give every one of the fourteen dimensions at least one upward and one downward live activity, so no genome is universally best and every settler has both strengths and weaknesses. Costs: the crew multiplier (skills.ts routineWork/construction), school credit and research (education.ts learning/research), apprenticeship training (apprenticeships.ts), per-soldier militia defence (militiaBalance.ts), hunting reach and pursuit (humanHuntingBehavior.ts), flight speed (humanTick.ts escape), labour drain (humanPhysiology.ts), friendship gain, reconciliation decay and pair feud drift (relationships.ts), courtship rate (humanTick.ts), workplace banter (socialLife.ts), grief recovery (humanLifecycleCleanup.ts), civic voices (raidAftermath.ts) and the advisory worker-fit tie-break (careers/workerFit.ts). A carried personal mark adds that activity\'s signed mark weight to the same score before the one clamp and one cap; the `conception` activity has no aptitude weights, so only the acquired lucky mark can move it.',
    writes: [],
    scheduledFrom: 'On-demand direct caller: skills.getWorkerSkillMultiplier (called by dailyBuildingEconomy production and construction and by workshopEconomy), education.creditChildSchoolDay / getEducationResearchMultiplier, apprenticeships.teach, militiaBalance.computeMilitiaBreakdown (defense per mustered soldier), humanHuntingBehavior.tickHumanHunting (hunting and pursuit), humanTick.tickHumans (escape and courtship), humanPhysiology.advanceHumanNeeds (labor drain), socialLife.tryWorkplaceBanter, humanLifecycleCleanup.finalizeHumanDeath, raidAftermath.applyWarCommunityReaction, relationships.advanceSocialRelationships, careers.workerFit.evaluateWorkerFit (pure projection in workforce exact ties and the selected-settler inspector)',
    testFile: 'tests/personality.activityAptitudes.test.ts, tests/personality.traitEvaluation.test.ts, tests/settlerTraits.test.ts, tests/personality.workIntegration.test.ts, tests/personality.educationIntegration.test.ts, tests/personality.defenseIntegration.test.ts, tests/personality.physiologyIntegration.test.ts, tests/personality.legacyDNA.test.ts, tests/personality.romanceContext.test.ts, tests/personality.socialCompatibility.test.ts, tests/personality.familyContext.test.ts, tests/personality.civicContext.test.ts, tests/personalityCareer.inspector.test.ts, tests/personalityCareer.oldSaveMigration.test.ts',
  },
  personalMarks: {
    owner: 'personalMarks.ts — grantMark (the only mark writer), rollBornMarks, normalizeMarks, marksOf, hasMark, awardRaidSurvivalMark, awardRareWindfallMark',
    cadence: 'on-demand',
    cadenceNote: 'No clock of its own: marks are written on demand at the one owner where a real event resolves. Appearance and constitution are drawn once at creation on the `settlerMarks` stream for a player settler only, an earned mark is written only when a raid survivor or an emptied rare bush resolves, and a repeated or replayed event cannot duplicate or stack one because `grantMark` is idempotent per mark id. Provenance is part of the contract: one per-mark allowed-source table rejects a born lucky or a raid-earned pretty in both `grantMark` and `normalizeMarks`. The evaluator prices a carried mark through the same activity record with no tick, scheduler or extra roll.',
    writes: ['human.marks'],
    scheduledFrom: 'entityFactory.createEntity (born marks) → personalMarks.rollBornMarks; frontierCombat.resolveIncomingRaidCasualties (living survivors) → awardRaidSurvivalMark; blueberryForaging.tryTickBlueberryForaging (emptied rare bush) → awardRareWindfallMark',
    testFile: 'tests/personalMarks.test.ts, tests/personality.activityAptitudes.test.ts',
  },
  careerHistory: {
    owner: 'careers/careerHistory.ts — recordCareerWork; single writer of compact observed work days per job',
    cadence: 'daily',
    cadenceNote: 'No independent pass: credits the just-finished calendar day immediately inside dailyScheduleFatigue.resolveDailyVillageScheduleFatigue after the midnight attendance snapshot, using the shared indexed workplace map. Current staffing may differ after a Moon Howler night; canonical player human shift membership includes temporary transformed settlers and explicit player markers. No construction inference, noon delay or full-storage gating.',
    writes: ['human.careerHistory', 'human.careerHistory[job].days', 'human.careerHistory[job].lastDay'],
    scheduledFrom: 'tickLayerDaily midnight → dailyScheduleFatigue.resolveDailyVillageScheduleFatigue → recordCareerWork using witnessed site/job, finished day and indexed completed site',
    testFile: 'tests/careers.history.test.ts, tests/personalityCareer.oldSaveMigration.test.ts',
  },
  careerProgression: {
    owner: 'careers/careerProgression.ts — advanceCareerProgression; new career milestone owner',
    cadence: 'daily',
    cadenceNote: 'Event-driven only: after a newly accepted career day or actual apprenticeship completion; no duplicate skill writer or career timer.',
    writes: ['human.careerMilestones', 'human.careerMilestones[job].tier', 'human.careerMilestones[job].tierAtDay', 'human.careerMilestones[job].trainedAtDay'],
    scheduledFrom: 'dailyScheduleFatigue midnight accepted recordCareerWork; apprenticeships.teach actual graduation',
    testFile: 'tests/careers.progression.test.ts, tests/personalityCareer.oldSaveMigration.test.ts',
  },
  workerFit: {
    owner: 'careers/workerFit.ts — evaluateWorkerFit (plus its private activityForJob mapping) pure optional experienced-worker and aptitude projection',
    cadence: 'on-demand',
    cadenceNote: 'No state writes, no extra assignment pass; only compared for precisely tied eligibility, squared commute and skill in workforce.assignWorkerInPlace.',
    writes: [],
    scheduledFrom: 'workforce.assignWorkerInPlace — already-visited eligible idle candidates when proximity and skill tie',
    testFile: 'tests/careers.workerFit.test.ts',
  },
  completedBuildingLookup: {
    owner: 'buildings.ts — isCompletedPlayerBuilding, findCompletedBuilding',
    cadence: 'on-demand',
    cadenceNote: 'Pure read-only lookup of the first completed building of the requested type. All on-map buildings belong to the player; the lookup validates completion and type only. No world state, ticks, or RNG are mutated.',
    writes: [],
    scheduledFrom: 'townHall.isTownHallStaffed / getTownHallTradeMultiplier / getTownHallGovernanceEfficiency, villageLeadership election site, tickLayerRealtime election notification, virtualPlayer.decideFestival',
    testFile: 'tests/buildings.lookup.test.ts',
  },
  inputGuards: {
    owner: 'inputGuards.ts — isFiniteNumber, isBuildingType',
    cadence: 'on-demand',
    cadenceNote: 'Pure read-only validation of untrusted values shared by save import, view-state hydration and worker-command parsing. BuildingType membership is initialized lazily to tolerate circular module initialization; no tick, scheduler, game-state mutation or RNG.',
    writes: [],
    scheduledFrom: 'saveLoad.ts — save validation; viewState.ts — view-state parsing; simWorker/commands.ts — worker command shape validation',
    testFile: 'tests/inputGuards.test.ts, tests/commands.validation.test.ts',
  },
  humanLeisure: {
    owner: 'humanLeisureBehavior.ts — tickHumanLeisure (single free-time entry), tickHumanChildLeisure, tickAdultLeisureMotive',
    cadence: 'realtime',
    cadenceNote: 'Called once per eligible humanTick free-time tick. Children prefer established friends and childhood bonds, form daily groups of two to four, share a dry play site with a 14px water-free arrival area every leisure hour (including invalidating wet saved sites and failed-attempt phase caching; each member needs a clear direct leg or a priced detour of at most 24 tiles using a 600-node quote budget), reconcile survivors after a companion loss, and record active play/follow/home intent; play pauses within 14 units until the next hourly stop; unaccompanied children or children with no reachable shared stop use the same safe site chooser for solo play, preserving the shared attempt cache; no reachable site means no claimed play; follow stops within 14 units; children exclude caregivers during all real assigned shifts and live work commutes (ordinary, construction, apprenticeship, venue, hospital and guard) through one shared leisure predicate; stopSupersededChildLeisure clears stale following and destinationless residual child play movement before the off-screen throttle when school, mandatory bedtime or the caregiver work shift takes over, without interrupting scheduled travel; both clear stale walk targets; humanTick owns movement integration. Adult leisure holds a daily companion selection with hourly retry after a failed search, selects pair-keyed venue destinations, routes through the shared human walk owner, and temporarily rejects definitively unreachable goals with a home fallback. Adult social and grave visits use that same steerTo path and arrival verdict; market arrivals record a day-scoped receipt; civic visits remain eligible through the scheduled 18:00 audience and only townHall records successful processing.',
    writes: ['human.vx', 'human.vy', 'human.indoorBuildingId', 'human.childPlaymateDay', 'human.childPlaymateId', 'human.childPlayGroupIds', 'human.childPlaySite', 'human.childPlaySiteAttempt', 'human.childLeisureActivity', 'human.childLeisureTargetId', 'human.leisureFriendSearch', 'human.leisureRejectedTarget', 'human.socialErrands'],
    scheduledFrom: 'humanTick.tickHumans → humanLeisureBehavior.tickHumanLeisure',
    testFile: 'tests/humanLeisureBehavior.test.ts, tests/humanStatus.projection.test.ts, tests/simulation.decisionRegistry.test.ts',
  },
  buildingAccess: {
    owner: 'buildingAccess.ts — buildingAccessPoints (validated facades), buildingAccessPoint (canonical UI frontage), isOpenDoorstep (facade corridor), doorstepHasExit (usable doorstep), isAtBuildingReach (the one arrival rule)',
    cadence: 'on-demand',
    cadenceNote: 'Pure read-only geometry: buildingAccessPoints samples the full accessible perimeter at path-cell intervals and validates each frontage against the current grid; a doorstep is usable when doorstepHasExit finds one walkable orthogonal neighbour outside the footprint, so a narrow alley counts as a street; a side narrower than the doorstep standoff keeps the nearest open stand point, so no open facade loses its entrance; buildingAccessPoint selects a canonical first frontage for presentation, while isAtBuildingReach accepts any nearby reachable side and movement picks whichever facade it can actually reach. No extra state or scheduler. No tick, no scheduler, no RNG and no writes; the commuter targets the access and the activity enterHumanBuilding call decides entry.',
    writes: [],
    scheduledFrom: 'humanMovement.commuteHumanToBuilding (navigation target and arrival), humanTick attendance, workAbsence, humanStatus, education, humanHospitalBehavior, logisticsOverlayData',
    testFile: 'tests/homeEntry.geometry.test.ts, tests/buildingAccess.routeAround.test.ts, tests/settlers.indoors.test.ts, tests/workAbsence.reasons.test.ts, tests/education.centerGeometry.test.ts',
  },
  settlerDeathAudio: {
    owner: 'audio/interactionDetect.ts — detectInteractionSounds; hooks/useGameAudio.ts — useGameAudio holds the observed annual death count, year and session revision',
    cadence: 'render',
    cadenceNote: 'Player death tallies survive worker living-roster filtering; seed on enable/session replacement, include completed-year tallies across rollover, and play only the positive increment. The tally includes cursed settlers and excludes departures; retained corpse fallback applies only without a tally.',
    writes: [],
    scheduledFrom: 'useGameAudio effect after worker state publication',
    testFile: 'tests/audio.interactionDetect.test.ts',
  },
  terrainClearingFields: {
    owner: 'renderer/terrain.ts — buildTerrainCache',
    cadence: 'render',
    cadenceNote: 'Refresh override-dependent Whittaker fields on terrain revision; chunk surfaces retain their separate regional revision keys. Only renderer-local caches change.',
    writes: [],
    scheduledFrom: 'renderer/terrain.drawGround',
    testFile: 'tests/groundChunk.rebake.test.ts, tests/terrain.clearingVisuals.test.ts',
  },
  colonyMovementObservation: {
    owner: 'scripts/colonyHealth.ts — createColonyObserver, sampleMovement, observe',
    cadence: 'on-demand',
    cadenceNote: 'Opt-in harness sampling after normal gameTick movement integration. Reads actual positions, canonical building reach, configured shift, and loop pacing; records daily budgets, distance, closest approach and first shift arrival without writing world state.',
    writes: [],
    scheduledFrom: 'scripts/run-full-year.mts run with --movement',
    testFile: 'tests/colonyProducerCommute.test.ts',
  },
  humanPhysiology: {
    owner: 'simulation/humanPhysiology.ts — initialHumanNeeds, legacyHumanNeeds, normalizeHumanNeeds, advanceHumanNeeds, resolveHumanNeedsIntent, getHumanNeedsWorkMultiplier, hasFatalStarvation, creditHumanNutritionFromFood, adjustHumanStamina, getHumanStaminaRatio, rebaseHumanNeedsClockAfterFormRestore, hasNearbyWell',
    cadence: 'realtime',
    cadenceNote: 'Player humans advance once per tick before offscreen throttling. Creation, load migration and form restoration initialize or restore saved needs. Resolve intent and work effects as read-only queries; the hourly meal cadence is owned by humanTick, passed into tryEatColonyMeal only at clock boundaries. HumanPhysiology determines hunger and the meal cooldown, never clock-boundary scheduling. Private setHumanStamina is the single native stamina mutation; no runtime energy projection or energy-based missing-needs decision. Old saves and the historical positional spawn argument explicitly convert once through legacyHumanNeeds. Active Moon Howlers have independent predator metabolism and restore their saved native needs. Courtship, conception, affairs, medical treatment sizing, birth effects, hunting, civic petition eligibility, dormant plague effects and election turnout consume authoritative stamina; plague selects native stamina by player-human ownership even when needs are missing, retaining foreign energy behavior; all migrated gameplay thresholds and effects are native 0–100 stamina values. Shared player energy slots are zero; nonhuman and foreign metabolism is unchanged. The sole seven-hour-night recovery rate is shared by rest and stamina, and humanTick.observeHumanSleep observes eligible homes, hotels, wards, cells, lover visits and deployed soldiers sleeping in camp at night before the single physiology write; marching troops use ordinary moving stamina cost, not local work attendance. Prison sleep and continued confinement share prisonShifts.isPrisonerInCell; hotel sleep and absence views share hotelStay.isSettlerLodgingAtHotel. No retired visitor sleep or hotel check-in writer remains; hotelStay reserves beds for player settlers only; sleep, capacity, roster and checkout share tick-aware reservation validity, and checkout updates any initialized lodging index before clearing the pointer. Sleep requires a confirmed indoor arrival from the movement owner: buildingAccess.buildingAccessPoint is the one navigation target, buildingAccess.isAtBuildingReach is the one arrival rule, and only the activity enterHumanBuilding call writes indoor state; humanMovement.homeStandPosition fronts the doorstep, with home leisure using the same porch; this decision does not own navigation. A free-time spouse chase must not replace home/hotel commuting or critical-rest recovery. Children reserve 23:00–06:00 sleep with a preceding homeward hour; scheduled homeward travel bypasses offscreen throttling, and discretionary gatherings cannot interrupt recovery. Duty remains protected. Work-shift stamina costs 6/h (scaled once by labor aptitude), ordinary awake leisure costs 2/h, walking costs 5/h, and only an observed off-duty stationary needs break restores 5/h. Nine worked hours and eight waking leisure hours target 30% stamina at bedtime, followed by seven hours to refill; real configured shift lengths affect total work drain directly. Hospital medical triage is owned by hospitalCare.needsMedicalCare / medicalCareReason / medicalUrgency, consuming the existing 15%-stamina critical threshold; normal bedtime fatigue is not medical, while independent late pregnancy and grief remain eligible. Doctors and ward roster read that same tick-aware verdict without another threshold. The independent scheduleFatigue productivity multiplier is not reapplied to stamina. An unheated winter day multiplies the nutrition loss by 1.5, so daily heating wood buys a real reserve.',
    writes: [
      'human.needs',
      'human.needs.nutrition',
      'human.needs.rest',
      'human.needs.stamina',
      'human.needs.severeHungerTicks',
      'human.needs.lastAdvancedTick',
      'human.needs.sleepRecoveryUntilTick',
      'human.needs.breakUntilRecovered',
      'human.needs.nightDutyRecoveryPending',
    ],
    scheduledFrom: 'humanTick.ts → advanceHumanNeeds and resolveHumanNeedsIntent; entityFactory.ts → legacyHumanNeeds/initialHumanNeeds; saveLoad.ts → legacyHumanNeeds/normalizeHumanNeeds; domain effects → stamina/nutrition adjustment',
    testFile: 'tests/humanNeeds.calibration.test.ts, tests/humanNeeds.mealRule.test.ts, tests/humanNeeds.restAndWell.test.ts, tests/humanNeeds.unheatedWinter.test.ts, tests/settlers.indoors.test.ts, tests/homeEntry.geometry.test.ts, tests/hotelSettlerLodging.night.test.ts',
  },
  humanMeals: {
    owner: 'simulation/humanNeeds.ts — canEatColonyMeal, tryEatColonyMeal, killFromStarvation, fract, freeHuntFoodGain',
    cadence: 'realtime',
    cadenceNote: 'Only humanTick schedules meal attempts on the clock-hour boundary; canEatColonyMeal evaluates hunger/available food without a duplicate time gate, and only tryEatColonyMeal debits the colony food ledger. Successful player meals delegate nutrition credit to humanPhysiology; the persisted last-meal stamp prevents duplicate charges across calls and reload without creating stamina or energy needs. Free-roam hunting records the food storage actually accepted against the hunting source, matching Hunting Spot production. A kill never credits personal stamina, rest or nutrition; movement/work costs remain owned by physiology and only actual paid meals credit nutrition. Death actions are delegated to the existing human lifecycle/death owner. Player settlers read the catalog labor factor in humanPhysiology on their own needs state, never this one.',
    writes: [
      'resources.food',
      'economyLedger.consumed.meals',
      'human.needs.lastMealTick',
      'human.alive (via delegated death action)',
    ],
    scheduledFrom: 'humanTick.ts → clock-hour-gated tryEatColonyMeal / killFromStarvation; workAbsence.ts reads the lastMealTick receipt to report actual meals; humanHuntingBehavior.ts → freeHuntFoodGain and recordFoodProduced',
    testFile: 'tests/humanNeeds.mealRule.test.ts, tests/humanNeeds.calibration.test.ts',
  },
  workSchedule: {
    owner: 'workSchedule.ts — validateWorkSchedule, normalizeWorkSchedule, getWorkSchedule, setWorkSchedule, isWorkScheduleHour, isOnWorkScheduleShift; humanSchedule.ts — home/night/festival/shift-aligned sleep policy (shouldBeAtHomeFor, prefersHomeTonightFor, preShiftSleepPlan, allowSocialLifeFor); prisonShifts.ts — prisonDutyForGuard (absolute watch owner, internal holds predicate); workDuty.ts — resolveShift',
    cadence: 'player-command',
    cadenceNote: 'The shipped window is 07–16; the player may set any non-wrapping whole-hour window. The command writes only world.workSchedule. `workDuty.resolveShift` supplies the same workplace duty to realtime simulation and activity projections, including the prison watch, barracks patrol assignment and Moon Howler duty. workAbsence.resolveWorkPresence is shared by movement, witnessed attendance and inspector/roster status; a local soldier patrols directly without a barracks commute, and interrupted patrol does not earn presence. `humanSchedule.preShiftSleepPlan` reads upcoming prison, hospital, venue or day shift and home-to-work commute; `humanTick.observeHumanSleep` honors the planned rest after confirmed arrival home, and the realtime tick gives departure priority over sleep. The sleep policy is read-only; physiology remains the sole writer of needs.',
    writes: ['workSchedule'],
    scheduledFrom: 'simWorker/commands.ts "setWorkSchedule"; renderer/humans, hooks/useGameAudio, townHall and humanStatus read getWorkSchedule',
    testFile: 'tests/workSchedule.bounds.test.ts, tests/humanSchedule.defaultWindow.test.ts, tests/prisonFestivalWorkContinuity.test.ts, tests/audio.workDetect.test.ts',
  },
  school: {
    owner: 'education.ts — syncSchoolAssignments, findSchoolForChild, schoolCapacity, isSchoolAge, getAssignedSchool, resolveSchoolSchedule, isSchoolTime (weekday 09–15), isAttendingSchool, buildSchoolRosters, recordChildSchoolTick, creditChildSchoolDay, applyEducationGraduation; summarizeSchooling (read-only adult education totals)',
    cadence: 'realtime',
    cadenceNote: 'School keeps its own weekday 09–15 day, independent of the configured work window. Only syncSchoolAssignments grants persisted schoolBuildingId seats; read-only rosters and classroom credit never invent a candidate seat, and eligible unassigned children are shown as awaiting assignment. Only real staffed-school attendance of at least half the day earns one school-day credit; new immigrant children start with zero credit. syncSchoolAssignments reassigns pupils daily; humanTick executes the education-owned school schedule and invokes its attendance writer; the same isAttendingSchool rule gates schoolyard interactions, roster presence and inspector attendance; school hours are not workplace attendance, and creditChildSchoolDay settles credits at day close. Graduation grants eligibility for apprenticeships and stamina but no blanket trade-skill bonus. Village Schooling renders current living adult education totals from the canonical tier and educated flag, without a new scheduler or state.',
    writes: ['child.schoolBuildingId', 'child.schoolTicksToday', 'child.schoolDays', 'child.educated'],
    scheduledFrom: 'humanTick.ts (syncSchoolAssignments, resolveSchoolSchedule, recordChildSchoolTick, creditChildSchoolDay); humanStatus and dashboardData read education-owned schedule and attendance',
    testFile: 'tests/school.test.ts, tests/schooling.explains.test.ts, tests/education.schoolDayTicks.test.ts, tests/humanStatus.projection.test.ts, tests/dashboardData.prisonAndCouncil.test.ts, tests/humanGraduation.education.test.ts, tests/immigration.composition.test.ts',
  },
  workforce: {
    owner: 'workforce.ts — pickIdleWorkerForBuilding, assignWorkerInPlace, pickWorkerToTransfer, transferWorkerBetweenBuildings, assignBuilderInPlace, swapReachableWorkersIntoVacancies, staffJobsBeforeConstruction, preferredSchoolStaff, fillPriorityStaffing, workforceSignature, isAcuteFoodStaffingEmergency, hasFoodStaffingPressure, isIdleWorkforceCandidate, assignMissingWorkers, syncJobBuildingOccupants, prepareWorkforce, releasePrisoners; priority order: workforcePolicy.ts; player-command assignWorker and removeWorker limited to construction/residency',
    cadence: 'assignment',
    cadenceNote: 'Workforce reconciliation corrects legacy Fishing Spot Hunters to Fisher through the normal assignment transition, carrying the higher Hunter/Fisher skill into Fisher via the skill writer without removing Hunter proficiency. The Defense preset\'s order is Barracks, Prison, Mine, Blacksmith, Workshop, Quarry, Lumber Mill, Hospital, then food/services (workforcePolicy.PRESET_BUILDING_ORDER.defense). Under the survival preset, food capacity is filled first, then each reachable completed job site (including Barracks) is offered an idle applicant before construction. Other presets likewise seed completed jobs before construction. The elected office is not a workplace or an exclusion from the ordinary candidate pool. The idle-only assignWorkerInPlace choice uses the canonical two-hour home-to-work route gate; transfers use the same reachability owner. Existing jobs persist despite blocked routes. Automatic staffing completes reachable minimum-coverage transfers, then tops the open posts of each workplace up to capacity by moving a hand only from a workplace holding at least two more workers, and tries alternate donors before caching its O(player humans+buildings) fingerprint; only fully priced passes cache completion. First appointments do not start transfer cooldown, which only follows real transfers. The signature also tracks current 3-day transfer eligibility, acute measured food emergency status, and unhoused applicant path cells, so expiry, shortages and movement retry on the next pulse. Under a measured or forecasted food shortfall, only food-post transfers bypass cooldown and no protected minimum crew or commute eligibility is sacrificed. Route-budget deferrals clear the cache; node-budget deferrals progress under a bounded escalating A* limit (one advanced search per pass, terminal conservative rejection), so unchanged pulses only skip when outcomes are resolved, with a weekly repair run. Explicit autoStaffWorkers requests force reconciliation.  Legacy manual flags normalize to auto without dropping jobs; career/DNA fit breaks exact ties without changing transfer cooldown. Command/assignment phase: tickLayerAssign and dailyBuildingEconomy still call the shared owner, but unchanged input signatures return without expensive staffing. Vacancy swaps use the canonical construction-crew index and the same idle-worker selector as ordinary appointments: home-based commute, skill, career fit and stable first-encountered exact ties. Bonded apprentices cannot be selected as replacement workers or transfer donors. Transfer distance comparisons use hours consistently and select in one ranked scan. The shared transfer eligibility gate reserves bonded apprentices even under food pressure; ordinary rebalance continues to larger donors if a smaller crew cannot lend above the recipient baseline. Swap searches skip empty or immovable donor sites before consuming their bounded allowance. Player-selected Food/Mining/Schools/Hospitals/Church priorities overlay the preset using workforcePolicy.ts. A ten-pupil classroom requests its second teacher even without a sector focus; higher-priority vacancies borrow only reachable, cooldown-eligible staff above safe donor floors; a focused same-sector donor only lends beyond its own demand, while emergency food vacancies outrank other focused sectors without stripping essential coverage. These choices persist through the existing save, worker delta, and rollback owners. When an idle adult has no currently reachable post, staffJobsBeforeConstruction may request one legal household relocation per assignment pass from housingPipeline.relocateJobSeekerForVacancy; housing alone checks real routes, available beds, intact custodian groups and school reach for pupils, and writes the move. The same normal workforce picker then fills that vacancy, even in a partially staffed barracks; a successful move invalidates the staffing fingerprint for the next pulse to fill further open posts. No second staffing owner or long-distance assignment is introduced. Only a forced or changed event triggers re-matching. releasePrisoners is NOT assignment-cadenced: it runs every realtime tick from tickLayerRealtime (O(state.entities)); only its assignMissingResidences/assignMissingWorkers tail is gated behind the `released` flag',
    writes: [
      'building.staffingMode',
      'building.occupants',
      'human.workerBuildingId',
      'human.occupation',
      'human.job',
      'human.skills',
      'workforcePolicy',
      'workforceFocus',
    ],
    scheduledFrom: 'tickLayerAssign.assignMissingWorkers; saveLoad.loadGameFromParsedOutcome installs its restored path map before the load-time staffing pass; tickLayerRealtime.releasePrisoners; commands.ts "autoStaffWorkers" and "setWorkforceFocus" (owned world in place, isolated calls copied); "assignWorker" retained for construction/residency only; buildingStaffingActions on place/recruit/death',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/saveLoad.commuteGrid.test.ts, tests/virtualPlayerHealthVerdict.test.ts, tests/workforce.persistentCommute.test.ts, tests/workforce.deferredCommuteRetry.test.ts, tests/autoStaff.notify.test.ts, tests/commands.validation.test.ts, tests/workforceFocus.priorities.test.ts, tests/prisonFestivalWorkContinuity.test.ts',
  },
  immigration: {
    owner: 'dailyPopulation.ts — tickDailyPopulation, tickImmigration, canSupportImmigration (one daily admission owner); economyLedger.ts owns historical and forecast food verdicts; worldGen.ts owns immigrant party composition',
    cadence: 'daily',
    cadenceNote: 'After completed-day production is recorded, recurring meal demand (not one-off recruitment or trade food spending) gates admission. The admitted party is bounded by the actual unreserved vacant beds and its affordable projected meal demand; large families are not forced when only a smaller party is sustainable. A large stored larder alone cannot permit unsustainable growth; sparse startup history preserves bootstrap immigration. Never cancels births or reassigns existing residents. Housing, settlement entity spawning and spatial indexes retain their owners.',
    writes: ['maxHumanPopulation', 'humanPopulation', 'entities (via spawned new settlers)', 'nextEntityId', 'eventLog (through logEvent)', 'notifications'],
    scheduledFrom: 'tickLayerDaily.tickLayerDaily → dailyPopulation.tickDailyPopulation → tickImmigration once per colony day; spawn bookkeeping delegates to simulationEntities',
    testFile: 'tests/dailyPopulation.foodAdmission.test.ts, tests/dailyImmigration.gridSync.test.ts, tests/immigration.composition.test.ts',
  },
  housing: {
    owner: 'housingPipeline.ts — relocateJobSeekerForVacancy is the housing-only prospective job commute move; assignMissingResidences runs the single decision pipeline (HOUSING_PHASE_ORDER: leader, integrity, guardianship, capacity, homeless, adult-child, commute) over one HousingLedger, planRelocation answers move-or-stay for homeless, custody, custodian, capacity, surplus, leave-home, commute and couple, and applyRelocation writes a plan; assignFamilyToResidence seats every custodian group whole or legally split (custodian + youngest children together, older children in a second residence) and never unhouses on assignment; rebalanceOvercrowdedResidences tries the legal group placement/split before shedding excess; the commute phase also swaps two occupied homes when both households improve; manor seating is event-driven (start/election) and never a housing-phase decision; relocateHousehold applies a whole-household decision; relocateFamily retries a destination the writer refused with the next-best home; writeResidence is the sole residence write and enforces the bed capacity (manor hold exempt, legal split checked first); HousingReport carries the run stats; assignMissingResidences accepts an optional resume ledger; ranking lives in the same module; facts: housingModel.ts — getChildCustodian gives the elected parent priority when living biological parents are separated; ordinary custody resumes after office ends; immediate player entry: buildingResidencyActions.assignResidentToBuilding',
    cadence: 'assignment',
    cadenceNote: 'Scheduled housing sweeps run four times per day, the housing signature includes the elected leader so a change of office invalidates the sweep cache, the last pulse revisits all units, and housingUnitBucket is only a deterministic hash of CURRENT member IDs (not stable through departures); demolition reconciles displaced households immediately using the bounded tick sweep, while removals without displaced residents skip the housing pipeline; other events request immediate reconciliation or a reasoned residence transition. assignMissingResidences schedules; planRelocation answers move-or-stay for each household and applyRelocation writes; the commute phase can swap two occupied homes when both improve, and its straight-line floor skips impossible route candidates; the capacity rebalance plans through it too, and the homeless repair pass still seats every partially housed unit. A mandatory phase settles a household for the run, so the optional adult-child and commute phases cannot undo it. Reconciliation owns reference and resident-roster writes; selection and leader entitlement provide rules. The weekly safety sweep also reads the audit report violations and records a housed-custodian/homeless-minor split in the chronicle. Worker transport applies authoritative snapshots, never new housing decisions.',
    writes: [
      'human.residenceBuildingId',
      'residence building.occupants',
      'household membership (couple + minor children)',
    ],
    scheduledFrom: 'gameTick tick boundary + tickLayerAssign.syncResidenceOccupants (mirror); tickLayerAssign.assignMissingResidences (assignment); commands.ts "assignResidentToBuilding"',
    testFile: 'tests/housingPlanner.contract.test.ts, tests/housingAuthority.pipeline.test.ts, tests/housingPipeline.invariants.test.ts, tests/housingDiagnostics.test.ts, tests/adultChild.moveOutTarget.test.ts, tests/residenceCommuteRelocation.test.ts, tests/divorceHousing.custody.test.ts, tests/leaderHouse.successionHousehold.test.ts, tests/simulation.invariants.test.ts, tests/longRunColony.integration.test.ts, tests/residencyCapacity.writers.test.ts, tests/housing.custodianSplit.test.ts, tests/housingPipeline.invariants.test.ts',
  },
  construction: {
    owner: 'buildingStaffingActions.assignBuilderToBuilding + workforce.assignBuilderInPlace (crew membership); dailyBuildingEconomy.tickBuildingProgress (progress advance at 23:00 after the latest legal work shift)',
    cadence: 'work',
    cadenceNote: 'The existing construction owner closes at 23:00, consuming every permitted shift before midnight clears the witness counters; attendance and site attribution still come solely from scheduleFatigue; assignment alone never proves work. Passive sites retain their uncrewed pace, while unattended staffable sites crawl at 0.22x. Individual fractional shifts add monotonically to construction progress, retaining the 0.35 full-worker bonus; skill and DNA are evaluated once per worker using the sole skills owner. One proportional trade skill credit is paid. Any new completion refreshes storage caps and Silo spoilage through economy.updateStorageCaps, before overnight resource arrivals.',
    writes: [
      'building.constructionProgress',
      'building.occupants (construction crew)',
      'building.buildAnimTimer',
      'storageMax (via economy.updateStorageCaps on completion)',
      'foodSpoilageRate (via economy.updateStorageCaps on completion)',
    ],
    scheduledFrom: 'gameTick → tickLayerDaily 23:00 → dailyBuildingEconomy.tickBuildingProgress (progress); assign layer + commands (crew membership)',
    testFile: 'tests/commands.validation.test.ts, tests/demolish.roundtrip.test.ts, tests/personality.workIntegration.test.ts, tests/production.attendancePacing.test.ts',
  },
  tradeCaravans: {
    owner: 'tradeCaravans.ts — canEstablishTradeRoute, isMaterialPurchaseRoute, establishTradeRoute, spawnCaravan, tickTradeCaravans, countDownCaravanWait, tryAdvanceCaravanLeg, canStoreImports, applyImports, refundExports, settlePendingReturns, abandonCaravan',
    cadence: 'systems',
    cadenceNote: 'The systems layer schedules one caravan departure/deadline and advances partner/home cooldowns; humanTick.tickHumans drives the same owner\'s arrival transitions after moving the carrier. Export cargo is reserved at departure. Incoming cargo is admitted only with actual storage headroom on the return leg; a full store delays unloading until headroom or the bounded trip deadline. Aborted exports are held as pendingRefund on the route and drained through resourceUtils without exceeding caps, including after save/load and route deactivation. Outstanding returns block a new departure; food ledgers count accepted quantities only. Establishment uses the same route-eligibility rule from UI/commands.',
    writes: ['tradeRoutes.caravanCarrierId', 'tradeRoutes.caravanLeg', 'tradeRoutes.caravanWaitTicks', 'tradeRoutes.nextDepartureTick', 'tradeRoutes.pendingRefund', 'tradeRoutes.caravansCompleted', 'entities (via simulationEntities)', 'resources (via resourceUtils and spendFood)', 'economyLedger.produced (via recordFoodProduced)', 'lifetimeStats', 'eventLog (via logEvent)', 'notifications (via simEffects)'],
    scheduledFrom: 'tickLayerSystems.ts → tickTradeCaravans; humanTick.tickHumans → tryAdvanceCaravanLeg; trade establishment command → establishTradeRoute',
    testFile: 'tests/tradeCaravan.carrierRetention.test.ts, tests/tradeImports.iron.test.ts, tests/tradeRoutes.eligibility.test.ts',
  },
  civicPetition: {
    owner: 'townHall.ts — wantsCivicAudience, isCivicAudienceDay, tickScheduledTownHallAudiences, tickTownHallAudiences, resolveCivicPetition',
    cadence: 'daily',
    cadenceNote: 'Every third colony day at 18:00 independently of deferred production, using witnessed staff attendance. At most two successful petitions per hall per pulse; the resolver records a successful day once per citizen, never on arrival or an unsuccessful attempt. Free-time visits read the same audience day and eligibility; work, sleep and medical priority remain unchanged.',
    writes: ['human.civicPetitionResolvedDay', 'human.needs', 'human.skills', 'resources.food', 'resources.gold', 'economyLedger', 'villageReputation', 'floatingTexts', 'eventLog'],
    scheduledFrom: 'tickLayerDaily — DAILY_PHASE_HOURS.production → tickScheduledTownHallAudiences → tickTownHallAudiences → resolveCivicPetition',
    testFile: 'tests/civicPetition.cadence.test.ts',
  },
  production: {
    owner: 'dailyBuildingEconomy.tickBuildingProduction; scheduleFatigue.getWorkdayAttendance (the one presence verdict); forge.tickVillageForge (forge orders, gated on the production-day anchor); economy.ts — addResource, applyFoodSpoilage, updateStorageCaps, computeStorageMax; the crew term this decision multiplies is skills.getWorkerSkillMultiplier; the read-only weather yield modifier is worldEvents.getWeatherFarmMultiplier',
    cadence: 'daily',
    cadenceNote: 'At 18:00 production settles the workday or sets productionDeferred and captures productionValleyStage for an evening shift before world-events can change the ecology stage. Deferred production runs at 23:00 with the 18:00 stage through canonical ecology yield readers, then clears the snapshot immediately before construction closes, so a site finished that night cannot yet grant output, XP or operational bonuses; existing sites price attendance through scheduleFatigue.getWorkdayAttendance. A worked shift earns XP even at full storage; separate XP for successful output remains. Stale, underage, dead, jailed, foreign and duplicate occupant ids never dilute the skill/DNA crew average. An empty eligible crew has a neutral multiplier.',
    writes: [
      'productionDeferred',
      'productionValleyStage',
      'resources',
      'economyLedger.produced',
      'foodSpoilageRate',
      'human.skills (gainSkill)',
      'storageMax',
      'villageForge.progress',
      'villageForge.activeOrder',
      'villageForge.completed',
    ],
    scheduledFrom: 'tickLayerDaily',
    testFile: 'tests/storageCap.test.ts, tests/dayCycle.tavern.test.ts, tests/personality.workIntegration.test.ts, tests/workSkillAttribution.accrual.test.ts, tests/forge.cadence.test.ts, tests/production.attendancePacing.test.ts',
  },
  predatorCombat: {
    owner: 'combat.ts — resolvePredatorCombatChances, rollPredatorCombat; workDuty.ts — resolveArmedDuty',
    cadence: 'on-demand',
    cadenceNote: 'Actual predator encounters read the defender and predator, not village-wide equipment. The chance resolver internally derives duty through workDuty.resolveArmedDuty; neither the chance nor seeded roll API accepts caller-provided equipment authority. Age, assignment, imprisonment, shift and matching active raid roster gate weapons and armour; missing needs use humanPhysiology.initialHumanNeeds without reading legacy energy or writing state; native human reserves, existing nonhuman energy, aptitude, skill and speciesConfig predatorCombatStrength affect seeded rolls. Werewolves have twice the ordinary wolf resistance to human defence and transform at full species capacity. One roll owner retains separate block and counterattack identities. No persistent strength, extra schedule or equipment inventory.',
    writes: [],
    scheduledFrom: 'tickLayerSystems.tickWildlife at unobstructed human contact',
    testFile: 'tests/combatTierEffects.test.ts, tests/hospital.howler.geometry.test.ts',
  },
  wildlifePredation: {
    owner: 'tickLayerSystems.tickWildlife — sole wildlife AI owner (hunt, predation, metabolism, reproduction); tickLayerSystems.tickWolfRecruitment — rare wolf migration; wildlifePopulationPolicy.getWildlifeCarryingCapacity owns the prey-supported breeding/migration cap; speciesConfig.getPreyEnergyGain owns prey energy; GRAZER_METABOLISM owns grazer metabolism',
    cadence: 'systems',
    cadenceNote: 'WILDLIFE_LAYER_INTERVAL = 4 systems pulses; out-of-focus wildlife runs every 8th pulse except active Moon Howlers, which always run on the systems cadence and pursue exposed human prey even when fed; animal prey remains hunger-gated. The temporary form keeps human calendar age. Active howlers route blocked pursuits through the shared path owner using a cached wildlife-restricted grid derived from the same water/bridge predicate as the step integrator, with route verdicts scoped to grid identity, skip definitive unreachable prey, cannot attack through blocked segments, and ignore wildlife road repulsion. Moonslayer uses the pre-death form and death removes the original type bucket; forward world state to killHuman for genealogy and leader vacancy, and clear hunter links to the slain predator rather than the defender. Predators leave rabbits at/below the shared scarcity floor, and wolf/fox breeding and rare wolf recruitment cannot exceed shared prey-supported capacity; the 3-day restock remains with worldGen. Wildlife uses shared walk-step obstacles with the shared water terrain predicate, including shallow water; dry births and migration use worldGen.isPassableWildlifePosition; completed bridges allowed for movement; legacy wet wildlife recovers through the shared nearest-stand search. Hungry Wildkin hunts deer/rabbit only and pays apex metabolism; it is never prey and never grazes. Wildkin is on the predator roster that grazers scent-flee. No human prey for Wildkin.',
    writes: [
      'entity.energy',
      'entity.huntTargetId',
      'entity.alive (prey death)',
      'entity.x',
      'entity.y',
      'entity.vx',
      'entity.vy',
      'entity.age',
      'entity.flash',
      'entity.combatTicks',
      'entity.reproductionCooldown',
      'grass.energy (grazers only)',
      'eventLog',
      'floatingTexts',
    ],
    scheduledFrom: 'gameTick → tickLayerSystems.tickLayerSystems → tickWildlife / tickWolfRecruitment',
    testFile: 'tests/wildkin.apexRole.test.ts, tests/ecosystemPressure.winterDemand.test.ts, tests/wildlife.populationPolicy.test.ts',
  },
  ecosystemMetrics: {
    owner: 'dailyEcology.ts — calculateEcosystemMetrics, tickEcosystemMetrics; ecologyStage.ts — tickValleyEcologyStage',
    cadence: 'daily',
    cadenceNote: 'Weighted occupied buildable land replaces building-count penalties. Industrial emissions use witnessed work attendance and industrial type; pollution scales with map area and forestry research. Completed preserve bonuses are capped; immutable settled inputs explain the recorded score. Settlement runs at 18:00 after normal production or 23:00 after deferred production and before construction; the stage owner consumes those same metrics once.',
    writes: ['ecosystemHealth', 'pollutionLevel', 'biodiversityIndex', 'settledEcology', 'ecologySettlementPending', 'pendingEcosystemHealthDelta', 'pendingPollutionDelta', 'valleyStage', 'valleyStageSinceDay', 'valleyRawStressStreakDays', 'valleyRawCalmStreakDays', 'valleyLastStageNotifyDay', 'eventLog', 'notifications', 'bigNews'],
    scheduledFrom: 'tickLayerDaily → dailyWorldEvents.settleDailyEcology (18:00 via tickDailyWorldEvents or 23:00 deferred) → tickEcosystemMetrics / tickValleyEcologyStage',
    testFile: 'tests/dailyEcology.pollutionGrading.test.ts, tests/ecologyStoryDelta.survivesRecompute.test.ts, tests/production.attendancePacing.test.ts, tests/saveMigration.roundtrip.test.ts',
  },
  humanMortality: {
    owner: 'humanRelationships.tryDailyHumanMortality — daily age and sudden-illness roll; hospitalCare.getPreventiveCareMortalityMultiplier — preventive care capacity; dayCycle.killHuman — death transition',
    cadence: 'new-calendar-day',
    cadenceNote: 'The existing human tick samples living assigned doctors once per calendar boundary. One doctor per fifty residents can halve the player sudden-illness risk at full coverage; empty, dead, jailed or deployed doctors provide no coverage. Old age and foreign mortality are unchanged.',
    writes: ['human.alive', 'eventLog', 'deathParticles'],
    scheduledFrom: 'humanTick.tickHumans → tryDailyHumanMortality → killHuman',
    testFile: 'tests/dailyEcology.pollutionGrading.test.ts, tests/dayCycle.cadence.test.ts',
  },
  wildlifeReplenishment: {
    owner: 'worldGen.replenishDepletedWildlife — wildlife restocking; wildlifePopulationPolicy.WILDLIFE_POPULATION_POLICY and getWildlifeCarryingCapacity — sole refill targets and prey-supported predator caps',
    cadence: 'daily',
    cadenceNote: 'Every third colony day at 18:00. Grazer restocking is bounded per pulse and predators are replenished only below their minimum and when existing prey can sustain them. Initial predator groups follow the same target policy. Completed preserves raise scarce-grazer refill thresholds and redirect the same bounded pulse into rotating protected habitat; no per-preserve spawn multiplier. Both settler hunting paths consume wildlifePopulationPolicy.isWildlifeProtected.',
    writes: ['entities (via worldGen.registerSpawnedWildlife)', 'nextEntityId', 'wildlifeCounts', 'lastWildlifeReplenishLogDay', 'eventLog'],
    scheduledFrom: 'tickLayerDaily → dailyWorldEvents.tickDailyWorldEvents → worldGen.replenishDepletedWildlife',
    testFile: 'tests/wildlife.populationPolicy.test.ts, tests/huntingSpot.cleanup.test.ts',
  },
  inventionFair: {
    owner: 'inventionFair.ts — maybeOfferInventionFair, tickInventionFair, tickInventionFairRealtime, getInventionFairChoiceEligibility, resolveInventionFair, rollInventionFairOutcome, private stage and outcome lifecycle; storyEvents delegates player choices only',
    cadence: 'daily',
    cadenceNote: '18:00 daily gating offers and schedules the 24-in-game-hour event; one realtime advance owns the 288-tick three-phase demonstration. Modern state is saved in WorldState, worker delta and rollback. Player story commands use the same owner; old flag-based saves continue resolving the legacy path.',
    writes: ['storyFlags', 'inventionFair', 'pendingStoryEvents', 'resources.wood', 'resources.gold', 'villageReputation', 'building.health', 'human.needs.stamina', 'eventLog', 'bigNews', 'notifications'],
    scheduledFrom: 'tickLayerDaily.ts 18:00 → dailyWorldEvents.tickDailyWorldEvents → maybeOfferInventionFair/tickInventionFair; tickLayerRealtime → tickInventionFairRealtime; simWorker.commands respondToStoryEvent → storyEvents.respondToStoryEvent → inventionFair.resolveInventionFair',
    testFile: 'tests/inventionFair.simulation.test.ts, tests/inventionFair.storageCap.test.ts, tests/inventionFair.invalidChoices.test.ts, tests/actionOutcome.test.ts',
  },
  authoredStoryExpiry: {
    owner: 'storyEvents.ts — tickPendingStoryEvents and the expire* resolvers; deerParliament/travelingTheatre/weddingDiplomacy/rumourLedger own their own resolved flags',
    cadence: 'new-calendar-day',
    cadenceNote: 'The 18:00 daily pass drops expired cards first, then asks each story owner to resolve its chain once with an explicit fate: theatre/deer/wedding/rumour resolve, Winter Prep records a visible lapse, Children Shelter starts the refuse chain, and a lapsed Ranger blocks the Howler instead of inventing the visit. Chainless cards pass quietly. No unearned reward is granted.',
    writes: [
      'pendingStoryEvents',
      'storyFlags',
      'eventLog',
      'bigNews',
      'notifications',
      'villageReputation',
      'ecosystemHealth',
      'rivalSettlements.relationship',
      'resources.food',
      'resources.wood',
      'resources.gold',
    ],
    scheduledFrom: 'tickLayerDaily.ts 18:00 → dailyWorldEvents.tickDailyWorldEvents → storyEvents.tickPendingStoryEvents',
    testFile: 'tests/story.expiryResolvers.test.ts, tests/storyEvents.test.ts, tests/guidedCampaign.test.ts',
  },
  humanWalk: {
    owner: 'humanTick.tickHumans → humanMovement.resumeHumanWalk + applyHumanWalkStep (one integration for focused, throttled, prisoner and caravan walks)',
    cadence: 'realtime',
    cadenceNote: 'Decisions still run once per 24 ticks for out-of-focus settlers, but the already commanded walk is re-issued and integrated every tick, so travel distance per game time matches focus and arrival/collision stay per-step. Ordinary work commutes open at shift minus the existing commute lead; work, home, hotel and school commutes are exempt from the 0.85 planning damping. Collinear final steps are capped at the commanded destination even with road speed bonus, without changing detour steps; prison keeps its sticky departure. The walk target is a transient WeakMap, never saved; isCommutingToBuilding checks the owner\'s commanded destination and velocity, projected to host entities by the worker delta without persistent fields, not incidental motion or a possible obstacle detour. On-shift workers enter indoor presentation on verified arrival even at outdoor job sites; emergency hunting takes over by clearing indoor presentation and superseded commute targets; free-roam pursuit uses steerHumanToward and the canonical line obstruction check for close-range kills. Indoor workplace presence is released immediately when shifts end. Prisoner and caravan steps keep their unboosted pace; discretionary gathering does not override duty or the commute.',
    writes: [
      'human.x',
      'human.y',
      'human.vx',
      'human.vy',
      'human.animFrame',
      'human.indoorBuildingId',
    ],
    scheduledFrom: 'tickHumans',
    testFile: 'tests/production.attendancePacing.test.ts, tests/humanTick.hotPathIndexes.test.ts, tests/humanMovement.test.ts, tests/pathfinding.test.ts, tests/humanHunting.ledger.test.ts',
  },
  dailyRelationships: {
    owner: 'tickLayerDaily at 06:00 — relationships.advanceSocialRelationships (friendships/feuds), simulation/humanRelationships.advanceYouthLove and reconcileCourtships, leaderHouse.syncLeaderHouseResidency (delegated housing); at 23:00 — apprenticeships.advanceApprenticeships after all legal work shifts',
    cadence: 'daily',
    cadenceNote: 'At 06:00 the social/relationship pass uses the living list without retroactively counting later arrivals. Leader-house reconciliation delegates residence writes. At 23:00 the existing apprenticeship owner matches young adult students to qualified masters, after all configured work shifts finish. A new or existing valid apprenticeship first clears competing employment/construction rosters through workforce.removeWorkerTransition. Workforce auto-staffing reserves apprentices, including in its eligibility cache signature; humanTick sends them to the master\'s actual workplace and records attendance through the shared scheduleFatigue writers; training requires both student and master to be present at the same site for at least half a shift. Every eligible trade shares the same effective workplace resolver, normal movement command and schedule; an apprentice counts as assigned labour without taking a production roster slot. Production aggregation excludes a trainee without an actual roster seat even when training attendance is attributed to the mentor\'s building. Apprenticeship completion grants a one-time +5/+8/+20 by school tier in that trade, honours requiring grandmaster training, never all trades. New matches open one fresh bounded commute-search pass via beginCommuteRoutePass, then use the existing commute gate and exclude invalid roles and previously trained trades. Legacy invalid bonds are cleared.',
    writes: [
      'human.friendships',
      'human.feuds',
      'human.feudPeaks',
      'human.courtshipPartnerId',
      'human.courtshipProgress',
      'human.courtshipCooldownDays',
      'human.youthLovePartnerId',
      'human.youthLoveProgress',
      'human.youthLoveStartedDay',
      'human.apprenticeOfId',
      'human.apprenticeId',
    ],
    scheduledFrom: 'tickLayerDaily — DAILY_PHASE_HOURS.relationships (social and housing at 06:00), DAILY_PHASE_HOURS.construction (apprenticeships at 23:00); humanTick work commute/presence; workforceSummary shared workplace resolution and employment counts, apprenticeshipEligibility training-site predicate, humanStatus/workAbsence read-only projection, movementExplanation, renderSnapshot and dashboardData',
    testFile: 'tests/apprenticeships.test.ts, tests/workAbsence.reasons.test.ts, tests/relationships.sharedHomeFriendship.test.ts, tests/relationships.friendCapAndFeudEnd.test.ts, tests/relationshipDiagnostics.test.ts, tests/villageLeadership.test.ts, tests/humanGraduation.education.test.ts, tests/immigration.composition.test.ts',
  },
  yearlyWorldEvents: {
    owner: 'dailyWorldEvents.ts — tickYearBoundaryWorldEvents, tickDailyWorldEvents, tickFestivals, normalizeFestivalState, repairStaleFestivalOnLoad; groupEvents.ts — rollYearlyWorldEvent; townHall.ts — hostTownFestival, getTownHallFestivalCooldownTicks',
    cadence: 'daily',
    cadenceNote: 'The 00:00 year boundary clears last year\'s harvest grant before production; the first 18:00 daily pass rolls a non-visitor event and schedules two-day seasonal or rare 2–4-day random festivals at 90-day checkpoints. Hosted festivals last three days; hosted/random starts set a shared 90-day cooldown, never renewed by festival expiry; ongoing legacy festivals are capped to four days.',
    writes: [
      'activeEvent',
      'lastEventYear',
      'bountifulHarvest',
      'festival',
      'townHallFestivalCooldownUntilTick',
      'eventsThisYear',
      'eventLog',
      'notifications',
    ],
    scheduledFrom: 'tickLayerDaily.tickYearBoundaryWorldEvents (00:00); dailyWorldEvents.tickDailyWorldEvents (18:00) → rollYearlyWorldEvent and tickFestivals; townHall.hostTownFestival via player command',
    testFile: 'tests/dailyEconomy.ledgerEcology.test.ts, tests/inventionFair.simulation.test.ts, tests/festival.behavior.test.ts, tests/dayCycle.tavern.test.ts',
  },
  grassRegrowth: {
    owner: 'dailyGrassEcology.ts — tickGrassDaily; grassEcology.ts — GRASS_GROWTH_PER_DAY, getGrassGrowthMultiplier; ecosystemPressure.ts — getGrazingPressureReport (read-only estimate)',
    cadence: 'daily',
    cadenceNote: 'One per-colony-day regrowth: GRASS_GROWTH_PER_DAY * season/weather multiplier, applied at 00:00 and priced by the pressure report with the same rule. This is not a per-tick value.',
    writes: [
      'grass.energy',
      'grass.age',
      'entities (new grass via simulationEntities)',
      'nextEntityId',
    ],
    scheduledFrom: 'tickLayerDaily.tickGrassDaily',
    testFile: 'tests/dailyEconomy.ledgerEcology.test.ts, tests/ecosystemPressure.winterDemand.test.ts',
  },
  foodLedger: {
    owner: 'economyLedger.ts — recordFoodProduced, recordFoodConsumed, spendFood, rollEconomyLedgerForDay; every stored-food inflow delegates here',
    cadence: 'on-demand',
    cadenceNote: 'One ledger owner for produced/consumed flows; trade, gift, foraging, raid spoils, tribute and all production sources record the accepted amount with a source label. The day roll archives the finished day; no caller keeps a parallel produced counter.',
    writes: [
      'economyLedger',
      'foodHistory',
      'resources.food (via spendFood/import callers)',
    ],
    scheduledFrom: 'production/trade/gift/raid/tribute/foraging owners → recordFoodProduced; tickLayerDaily → rollEconomyLedgerForDay',
    testFile: 'tests/dailyEconomy.ledgerEcology.test.ts, tests/foodLedger.acceptedCatch.test.ts',
  },
  herdMemory: {
    owner: 'migration.ts — tickMigration, migrationArrivalDay, spawnHerdAtEdge',
    cadence: 'new-calendar-day',
    cadenceNote: 'Arrival places the remembered count (spawnHerdAtEdge returns the placed count); departure shrinks only by the real losses and recovers +1 after an unharmed autumn, capped at HERD_BASE_SIZE. A zero-placement year is neutral. Unharmed means zero total losses; player-hunted-only recovery needs a kill-source marker.',
    writes: [
      'activeMigration',
      'migrationNextHerdSize',
      'entities (herd deer spawn/removal)',
      'bigNews',
      'eventLog',
    ],
    scheduledFrom: 'tickLayerDaily → migration.tickMigration',
    testFile: 'tests/migration.herds.test.ts, tests/invariants.commute.herd.test.ts',
  },
  rivalStrategy: {
    owner: 'rivalEvents.ts — tickRivalSettlements; rivalProfiles.ts — growth eligibility/cadence and selectRivalDailyAction/applyRivalDailyAction',
    cadence: 'daily',
    cadenceNote: 'Strategic rival decisions, growth, diplomacy and raids only; no village-map raiders, hunter poaching, reveal patrols or floating text.',
    writes: ['rivalSettlements', 'pendingRaidEvents (through frontierCombat owner)', 'pendingDiplomacyEvents (through rivalDiplomacy owner)', 'resources (through resource owner)', 'villageReputation (through reputation owner)', 'eventLog (through logEvent)'],
    scheduledFrom: 'tickLayerDaily.ts 18:00 → dailyWorldEvents.tickDailyWorldEvents → rivalEvents.tickRivalSettlements',
    testFile: 'tests/rivalWorldMap.only.test.ts, tests/frontierCombat.hostility.test.ts',
  },
  idleSkillDecay: {
    owner: 'skills.ts — decayIdleSkills; sole non-active trade-skill decay writer',
    cadence: 'new-calendar-day',
    cadenceNote: 'Exactly once at 00:00, before attendance settlement, living adult player humans decay skills that were not practiced. Unemployment is not a trade; the skills owner ignores its awards and reads and removes obsolete saved scores. Only the witnessed, site-attributed trade from that day is exempt; a held job alone is not. No-op decay does not dirty the entity profile revision. Required CI: calendar-scheduler gameTick regression.',
    writes: ['human.skills', 'human.profileRevision'],
    scheduledFrom: 'gameTick.ts → tickLayerDaily.ts 00:00 → skills.decayIdleSkills',
    testFile: 'tests/dayCycle.cadence.test.ts, tests/skills.attendanceOwner.test.ts',
  },
  socialFeedback: {
    owner: 'humanSocial.ts — simAmbientChatNeighbors, simSettlerPairChat; socialLife.ts — pickSocialImpulse, tryWorkplaceBanter, tryNeighborGreeting, isSocialStaggerTick, isGreetingHour',
    cadence: 'realtime',
    cadenceNote: 'Human-social owner only selects real nearby eligible participants and social motives at the shared work/morning/stagger gates; reciprocal marriage and the same proximity radius govern spouse care; the physiology and hospital owners supply break and medical eligibility, and nearest completed venues are selected consistently from cached or direct pools. Healthy pregnancy is not a hospital referral. A scene is requested at most once per person per colony day across every event family (hasDialogueSceneOnDay counts greeting, banter and solo scenes together), even though the gate itself is evaluated per tick; the dialogue router selects text and humanChat executes sessions. Affair tryst speech is sampled on the initiating settler\'s hourly ID-staggered tick (11.4% opportunity, formerly 1% each active tick); tryst progress stays realtime. The spatial query is adaptive and may legitimately use a bounded linear candidate scan.',
    writes: ['floatingTexts (hearts)', 'small courtship progress'],
    scheduledFrom: 'humanTick.ts realtime social/leisure path, with SOCIAL_STAGGER on neighbour selection',
    testFile: 'tests/socialLife.dialogueBusy.test.ts, tests/humanChat.ambientPairing.test.ts, tests/socialCadence.oneScenePerDay.test.ts',
  },
  dialogueContent: {
    owner: 'dialogueTrees.ts — buildCanonicalDialogueBank, freezeDialogueTree, requestDialogue, hasDialogueSceneOnDay, rememberDialogueLine, dialogueHoursFromNominalTicks, maybeDialogueChat, pickRandomChatContext, tryAmbientRandomDialogue, contextualAmbientScene, parsePresentationDialogue, bindNumberedPresentationSpeakers, indexDialogueBank, preloadDialogueBank',
    cadence: 'on-demand',
    cadenceNote: 'One centralized ambient source (data/dialogue/ambient.json, one neutral dialogue category); eventKey+mode lookup matches real participant roles, cycles eligible variants and applies a per-settler three-day line cooldown before repeating. Successful ambient.affair pair dialogue also imposes a 48-game-hour cooldown on both participants, using their existing persisted scene-history entries (failed requests do not count). Singleton ambient scenes cool down for three calendar days; per-entity scene and line history survive save/load; line history is capped at the newest 48 entries so a silent settler keeps a bounded map. This owner writes human.dialogueRecentScenes and human.dialogueRecentLines; scripted exact scenes bypass rotation; humanChat alone writes visible dialogue sessions.',
    writes: ['human.dialogueRecentScenes', 'human.dialogueRecentLines'],
    scheduledFrom: 'humanTick.ts, socialLife.ts, humanLeisureBehavior.ts, factionWander.ts and existing domain event owners; Spotlight overlay later uses read-only group adapter',
    testFile: 'tests/dialogue.schema13.test.ts, tests/dialogue.eventRouting.test.ts, tests/dialogue.workerSaveParity.test.ts, tests/dialogue.variety.test.ts, tests/dialogue.lineRepeat.test.ts, tests/dialogue.pipeline.integration.test.ts',
  },
  dialogueSessions: {
    owner: 'humanChat.ts — startDialogueTreeChat, tickHumanChat, endAmbientHumanChat, clearCurrentEntityDialogue, releaseDialogueSession, cleanupEntityDialogueState, resetDialogueSessions, retainDialogueSessionsForWorld',
    cadence: 'realtime',
    cadenceNote: 'Sole simulation writer of chatPhrase, chatTicks, chatPartnerId and chatDialogueSessionKey. Paired sessions are held with live participant references and release both sides immediately on interruption; saved orphan keys are reclaimed on their existing ticks; missing counterparts and cleared keys are ignored safely. The render-buffer boundary mirrors fields but does not originate speech.',
    writes: ['human.chatPhrase', 'human.chatTicks', 'human.chatPartnerId', 'human.chatDialogueSessionKey'],
    scheduledFrom: 'humanTick.ts — tickHumanChat and, on confirmed sleep, endAmbientHumanChat before the active-entity return; event owners request sessions through dialogueTrees.ts',
    testFile: 'tests/humanChat.duration.test.ts, tests/pairDialogue.orphanReclaim.test.ts, tests/dialogue.sessionModes.test.ts, tests/dialogue.workerSaveParity.test.ts, tests/dialogue.schema13.test.ts',
  },
  renffrOmen: {
    owner: 'renffrStar.ts — maybeTriggerRenffrOmen, beginRenffrSettlerChatter, isRenffrGossipActive, tickRenffrOmen',
    cadence: 'realtime',
    cadenceNote: 'Eligibility is checked in the realtime layer, but the rare deterministic omen RNG runs only on nighttime clock-hour boundaries (0.42% per eligible hour, approximately the former 0.035% per tick). A successful omen starts three days of gossip and blocks another omen until the gossip window expires; visual animation still advances per tick. Existing dialogueTrees.ts and humanChat.ts remain the sole dialogue pipeline.',
    writes: ['world.renffrOmen', 'world.renffrChatterUntilTick', 'world.screenShakeImpulse'],
    scheduledFrom: 'tickLayerRealtime.ts for omen roll and animation; humanTick.ts reads the gossip window for ambient conversation context',
    testFile: 'tests/dialogue.affairRenffrCadence.test.ts, tests/simSeed.adoption.test.ts',
  },
  spotlightLore: {
    owner: 'spotlightLore.ts — squareStagePoint (exact painted centre; no off-square relocation), buildSpotlightLoreScene, stageSpotlightLoreCast, maybeStartSpotlightLore, startSpotlightLoreDebug, getSpotlightGatherTarget, tickSpotlightGathering, finishSpotlightLore, normalizeSpotlightLoreOnLoad',
    cadence: 'realtime',
    cadenceNote: 'Cheap O(1) gate each sim tick, rare weekend 19:00 selection through direct simRng.personDayRoll with 6–10 eligible adult male speakers and stage slots constrained to the actual ring (retry near angles/radii on blocked tiles, never accept distant snaps) before cooldown, all-actor attendance/eligibility through ready, load-time cast validation and typed finish; `startSpotlightLoreDebug` is a dev-only bypass from the `?debug=1` Guide card that stages a paused ready cast on its marks without writing the cooldown; completed Village Squares stage the real cast immediately on validated marks (other settlements still use normal gathering); stage movement in humanTick uses cached pathfinding velocity and one normal walk step; renderSnapshot plus overheadLayout.shouldDrawSpotlightHuman hide bystanders only during ready performance, and that ready phase also suppresses settler name plates, status badges and the gold building level frames/pennants/level text (the entity layer key carries the phase so the baked building layer repaints); read-only UI choreography derives independent wall-clock 44-caption cues via canonical captionBoundary lookup, with the overlay pinning the current canonical line in a fixed caption under the title banner (formatChatLine, no chat state writes, no canvas bubble over the stage), camera projection at the 2.5x stage zoom that App restores to the pre-scene view when the performance ends, streamed instrumental fading before applause and cancellable SFX applause; the overlay delegates keyboard ownership and Escape-to-skip to the existing useOverlayKeyboard hook, not WorldState',
    writes: ['spotlightLore', 'spotlightLoreLastDay', 'eventLog (through logEvent)', 'paused (debug preview only)', 'entity positions, indoorBuildingId, huntTargetId and velocity (square stage or debug preview only)'],
    scheduledFrom: 'tickLayerRealtime.ts before and after tickHumans; humanTick reads the gathering target and delegates obstacle steering to pathfinding.steerWithPath (single humanTick movement integration); simWorker/commands.ts delegates finishSpotlightLore and startSpotlightLoreDebug',
    testFile: 'tests/spotlightLore.test.ts, tests/spotlightQuietStage.test.ts, tests/renderer.presentationLayout.test.ts, tests/spotlightChoreography.test.ts, tests/spotlightApplause.test.ts, tests/spotlightAudioRace.test.ts',
  },
  courtship: {
    owner: 'humanRelationships.ts — findCourtshipPartner, isEligibleToCourt, canAdvanceCourtship, tryCompleteCourtshipMarriage; progress advance executes from humanTick.ts',
    cadence: 'realtime',
    cadenceNote: 'Realtime: humanTick observes each participant’s actual shift/sleep state before interactions; canAdvanceCourtship requires both awake and physically within 10px, off-duty social time or both actually present at the same workplace during an overlapping shift. Because the partner’s sleep observation must be known, the later processed partner may advance the pair; a per-tick pair guard prevents duplicate credit. Partner selection uses indexed established bonds and deduplicated available candidates with deterministic distance ties. Both off-duty participants must be available for leisure; new bonds require close contact. No stagger is applied to courtship partner selection. A settler never freezes their movement while the second partner has not yet been observed as available. An active secret-affair candidate is not in the courtship pool; marriage finalization remains owned by humanRelationships.',
    writes: [
      'human.courtshipPartnerId',
      'human.courtshipProgress',
      'human.relationshipStatus',
      'lifetimeStats.totalMarriages / marriagesThisYear (via stats.recordMarriageEvent at wedding commit)',
      'human.partnerId',
    ],
    scheduledFrom: 'humanTick.ts (per realtime tick, observed pair sleep, distance and shared-duty gates) → humanRelationships.findCourtshipPartner / canAdvanceCourtship / tryCompleteCourtshipMarriage',
    testFile: 'tests/courtship.exclusivity.test.ts',
  },
  affairs: {
    owner: 'humanRelationships.ts — tryDailyAffairEncounter, recordAffairTrystSite, tryDailyAffairGossip, tryExposeCaughtAffairForPair, exposeAffair',
    cadence: 'staggered-social',
    cadenceNote: 'daily encounter owns pair-keyed pending progress and exclusive establishment; pendingAffairProgress computes one point/day decay after seven days without a successful encounter roll; writePendingAffair replaces/removes individual entries and clearPendingAffairs removes reciprocal entries; validPendingPair checks candidate eligibility; reconcileAffairPartner atomically consumes both reciprocal legacy references, migrates only valid mutual progress without overwriting existing map entries, preserves established scalars and prunes invalid/expired pairs; getPendingAffairs is a read-only projection; selectPendingAffairMeeting rotates eligible known candidates within 240 world units and delegates travel to the existing walk owner; humanTick.canMeetAffair is a local read-only counterpart availability check using resolveHumanWorkplace, resolveShift, isCommutingToBuilding and canPursueSecretAffair; flavour chat attempts on one hourly, ID-staggered tick per active leading lover; gossip/scandal roll on the daily gate; caught-in-act exposure requires witnessed proximity with one stable daily probability per leading lover (direct home walk-in remains certain); witnessed divorces are deterministic after discovery, independent per marriage, with 21-day courtship cooldown; an established off-duty pair already at a valid overnight tryst house may sleep there, but bedtime cannot initiate pursuit; getAffairTrystBuilding selects only an available home of either lover when nearby; otherwise affairs remain outdoors; partner order never changes site selection; buildingAccess.buildingAccessPoint gives both partners the one outdoor doorstep instead of the blocked footprint centre; recordAffairTrystSite records an indoor location only when both lovers actually entered it; the before-shift hour is not affair time; during a scheduled shift and its commute, work movement wins and affair encounters are off-duty only; flight, hospital travel and gathering also exclude affair steering; overnight tryst presence is sampled before any human movement',
    writes: [
      'human.affairPartnerId',
      'human.affairCandidates',
      'human.affairCandidateId', // legacy migration only
      'human.affairProgress',
      'human.lastAffairSiteDay',
      'human.lastAffairSiteX',
      'human.lastAffairSiteY',
      'human.scandalCooldownUntilTick',
      'prison fields on arrest',
      'villageReputation',
    ],
    scheduledFrom: 'humanTick.ts tickHumans → one daily lover-specific waking-hour gate for tryDailyAffairEncounter and tryDailyAffairGossip; realtime meeting and caught-in-act proximity, with shared tryst site read-only in humanRelationships.getAffairTrystBuilding and the shared approach point in buildingAccess.buildingAccessPoint',
    testFile: 'tests/affair.cadence.test.ts, tests/eventLog.duplicatesAndNotifications.test.ts, tests/electionGossip.dedup.test.ts, tests/affairTrystSite.walkIn.test.ts, tests/settlers.indoors.test.ts',
  },
  conception: {
    owner: 'humanRelationships.ts — tryDailyConception (ONLY conception decision/roll owner; the married, youth and affair routes all apply the same conception activity factor); pregnancy.ts — startPregnancy (sole pregnancy-start writer, called by resolveConception)',
    cadence: 'new-calendar-day',
    cadenceNote: 'One roll per settler per colony day through salted personDayRoll; married-near, youth-pair and affair trysts use separate salts. Conception is deliberately non-genetic: the `conception` activity carries no aptitude weights and reads no allele, so only the acquired lucky mark can move the married/youth chance; the retired inherited Lucky ×1.15 is gone and no replacement roll exists. The youth route follows the retained youth link: while one partner is 18 and the other is still a minor it may conceive in either direction; once both are 18 (or the older is beyond 18) the route closes and the handoff/adult path applies.',
    writes: [
      'human.pregnant',
      'human.pregnantById (required conception-time biological father)',
      'human.pregnancyFromYouthLove (conception route)',
      'human.pregnancyProgress',
      'human.pregnancyDueProgress',
    ],
    scheduledFrom: 'humanTick.ts (isNewCalendarDay gate) → tryDailyConception → resolveConception → pregnancy.startPregnancy',
    testFile: 'tests/conceptionEvent.labelling.test.ts, tests/youthConception.ageFloor.test.ts, tests/humanLifecycle.test.ts',
  },
  pregnancyBirth: {
    owner: 'pregnancy.ts — startPregnancy (validates and freezes conception identity), advancePregnancy (one progress tick and due verdict), clearPregnancy (delivery reset), normalizePregnancyElapsedProgress (legacy elapsed rule), rollPregnancyDueProgress (only term formula), normalizePregnancyDueProgress (only invalid-due rule), isValidPregnancyDueProgress (validity), getPregnancyProgressFraction; humanLifecycle.ts — tickPregnancyAndBirth and isPregnancyHospitalDue (delivery/threshold consumers; no pregnancy field writes); settlerTraits.ts — inheritGenome is the only birth genetics rule',
    cadence: 'pregnancy-progress',
    cadenceNote: 'A single 85%-of-individual-due-date gate in humanLifecycle is read by humanHospitalBehavior doctor duty/admission and hospitalCare needs/reason. SelectedEntityPanel displays the nominal 24-day percentage without capping it: late deliveries can exceed 100%. HumanTick schedules progress and uses humanHospitalBehavior hospital priority to protect the route and stop crediting work presence when a staffed ward is available; duty hours and assigned jobs remain intact. Paternity is historical and survives relationship changes and removal; delivery never infers it from the current spouse. Birth records both available parents through the genealogy owner immediately; legacy unknown paternity is not fabricated. Active pregnancies cannot restart; invalid new states fail before mutation. Legacy save migration and Moon Howler snapshot restoration preserve existing records rather than starting pregnancies. No second pregnancy rule exists.',
    writes: [
      'human.pregnancyProgress',
      'human.pregnant/pregnantById/pregnancyDueProgress/pregnancyFromYouthLove (cleared at birth)',
      'human.childrenIds',
      'new child entity',
      'new child human.genomeV2 (one allele per biological parent per dimension; parents are read-only)',
      'genealogyRegistry.people (via recordGenealogyBirth)',
      'eventLog/bigNews/floatingTexts',
    ],
    scheduledFrom: 'humanTick.ts pregnancy gate → humanLifecycle.tickPregnancyAndBirth → pregnancy.advancePregnancy / clearPregnancy → settlerTraits.inheritGenome (birth-key seeded stream); entityFactory.createEntity(opts.pregnant, opts.pregnantById) → pregnancy.startPregnancy (arrival spawns require an explicit biological father; no spouse fallback)',
    testFile: 'tests/humanLifecycle.test.ts, tests/hospitalWalk.regression.test.ts, tests/pregnancyHospitalWork.test.ts, tests/settlers.indoors.test.ts, tests/workAbsence.reasons.test.ts, tests/conceptionEvent.labelling.test.ts, tests/personality.romanceContext.test.ts, tests/settlerTraits.test.ts, scripts/check-source-guards.mjs',
  },
  wildkinLineage: {
    owner: 'humanLifecycle.ts — tickPregnancyAndBirth (human mother + closest deer father); tickLayerSystems.ts — tickWildlife (Wildkin parents and juvenile guardian steering); genealogyRegistry.ts — recordGenealogyBirth, recordGenealogyDeath, syncGenealogyRegistry (sole persisted family owner); wildkinChronicle.ts — logWildkinBirth, logWildkinDeath, tickWildkinChronicle (sole log owner)',
    cadence: 'systems',
    cadenceNote: 'A human birth uses the pregnancy cadence, wild-to-wild births and juvenile movement use the systems cadence, and a daily genealogy census receives the already-merged alive set. The genealogy census and death writer include transformed player settlers via the shared human ownership predicate and retain human identity. Human mothers retain their Wildkin children in the historical registry without adding animals to housing; newborns follow the human mother while juvenile instead of being expelled.',
    writes: [
      'wildkin.motherId',
      'wildkin.fatherId',
      'wildkin.wildkinParentIds',
      'wildkin.wildkinGuardianId',
      'wildkin.age',
      'wildkin.isJuvenile',
      'genealogyRegistry.people',
      'eventLog',
    ],
    scheduledFrom: 'humanTick.ts → tickPregnancyAndBirth; tickLayerSystems.ts → tickWildlife → pushNewEntity; tickLayerDaily.ts → tickDailyWorldEvents → syncGenealogyRegistry; wildlife death → retireWildlifeInState → recordGenealogyDeath',
    testFile: 'tests/humanLifecycle.test.ts, tests/genealogyRegistry.test.ts, tests/wildkin.apexRole.test.ts',
  },
  moonHowler: {
    owner: 'moonHowler.ts + moonHowlerForm.ts — tickMoonHowlerCycle, curseMoonHowler, transformToWerewolfForm, revertToHumanForm, cureMoonHowler, finalizeMoonHowlerDeath, isSettlerRelationshipEntity; night window owned by daycycleconstants.ts',
    cadence: 'full-moon-event',
    cadenceNote: 'The existing night-window ejection excludes road and bridge travel surfaces from the padded indoor footprint check; they remain traversable. Hunting uses the wildlife systems owner independently of viewport. Transform, ejection and reversion clear the transient indoor marker; reversion stops predator velocity.',
    writes: [
      'human.moonHowlerCursed',
      'human.moonHowlerSaved',
      'entity.type (Human ↔ Werewolf)',
      'building.occupants during transform/restore',
      'eventLog/title (Moonslayer)',
    ],
    scheduledFrom: 'tickLayerRealtime.ts → tickMoonHowlerCycle (22:00 on full-moon day through next-day 06:00; form ends at 06:00)',
    testFile: 'tests/moonHowler.test.ts',
  },
  leadership: {
    owner: 'leaderHouse.ts — syncLeaderHouseResidency, applyLeaderOccupation; election and scoring: villageLeadership.ts — getLeadershipScoreBreakdown (real recorded workdays, two strongest trades, restrained family prestige, social trust, battle/campaign record), getYearsUntilElectionForYear (shared regular term calendar), tickElectionBuildup, tryStartTermElectionCeremony, startElectionCeremony (immutable ballot-time names), tryStartVacancyElectionCeremony, tickElectionCeremony, tickElectionGossip, creditedCeremonyBallot; dailyWorldEvents.ts — tickYearBoundaryWorldEvents (midnight scheduling), tickDailyWorldEvents (18:00 vacancy scheduling); ceremony attendance: villageLeadership.ts — isCeremonyAttendee, getElectionGatherTarget (read-only)',
    cadence: 'daily',
    cadenceNote: 'Term elections run at 00:00 on year rollover; regular buildup runs at 00:00 on the preceding day and regular gossip is limited to that day, vacancies and one campaign-promise evaluation pass run at 18:00 through dailyWorldEvents, ceremony progression in realtime; residency remains idempotent. Required CI: calendar-scheduler tests Year-2 midnight via gameTick.',
    writes: [
      'human.occupation',
      'human.job',
      'human.workerBuildingId (stale-repair only)',
      'building.occupants (stale leader assignment only)',
      'villageLeaderId',
      'leaderSinceYear',
      'electionCeremony',
      'pendingElectionYear',
      'electionBuildupNotifiedYear',
      'lastElectionResult',
      'nextElectionId',
      'pendingLeaderHouseResidentIds',
      'eventLog',
      'notifications/bigNews',
    ],
    scheduledFrom: 'tickLayerDaily.ts 00:00 → dailyWorldEvents.tickYearBoundaryWorldEvents → villageLeadership term owner; tickLayerDaily.ts 18:00 → dailyWorldEvents.tickDailyWorldEvents → villageLeadership vacancy owner; tickLayerDaily.ts 06:00 → leaderHouse.syncLeaderHouseResidency',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/villageLeadership.test.ts, tests/dayCycle.cadence.test.ts, tests/saveLoad.a1CalendarRepair.test.ts',
  },
  raidCombat: {
    owner: 'militiaBalance.ts — canBeMustered (shared adult muster eligibility with optional elected-commander job exemption); frontierCombat.ts — getRaidParticipants, canLaunchRaidOnRival (read-only shared raid preview/action guard: check arms before participants, explain imprisoned leaders with saved release ticks), queueRaidDefense, tickPendingRaidEvents, tickPendingOutgoingRaidEvents, resolveIncomingRaidInPlace, beginRaidReturn, resolveOutgoingRaidCombat, persistBattleAftermath, resolveRaidVictory, isCounterRaidOnRival',
    cadence: 'realtime',
    cadenceNote: 'Incoming and outgoing battles progress on game ticks across six game hours. Deployed soldiers sleep in camp at night and march under the normal physiology stamina budget, without earning phantom barracks attendance or conceiving from frozen village coordinates; scheduleFatigue.getWorkdayAttendance rejects deployed workers before legacy last-day fallback. Raid dispatch, responses and settlement-fate choices also enter through player commands; truce recalls retain deployment until return, the preview and launch share eligibility, incoming strength uses the adult population with capped loot; the elected leader joins all viable defensive formations and outgoing campaigns even when not employed as a soldier, cannot deploy in simultaneous armies, faces the same casualty pool, and earns battlefield merit only when actually deployed; the immediate responder cannot skip the six-hour defense; treaties may be broken at a reputation cost, razing zeroes the strategic population of a settlement, and events are written through the ordinary Chronicle owner. Awarded spoils—gold included—enter through addCappedResource, so the configured storage cap and the common resource accounting apply. Rival camp growth is staggered by the stable rival id, never by list position.',
    writes: ['pendingRaidEvents', 'pendingOutgoingRaidEvents', 'pendingRaidVictories', 'raidBattleReports', 'scoredRaidIds', 'human.raidDeploymentId', 'human.battleLeadershipMerit', 'rivalSettlements', 'resources (through economy owner)', 'eventLog (through logEvent)'],
    scheduledFrom: 'gameTick.ts → tickPendingRaidEvents/tickPendingOutgoingRaidEvents; simWorker/commands.ts → raid and victory commands',
    testFile: 'tests/frontierCombat.hostility.test.ts, tests/frontierCombat.raidGold.test.ts, tests/raidChronicle.lifecycle.test.ts, tests/raidDeadline.owner.test.ts, tests/humanTick.hotPathIndexes.test.ts',
  },
  outgoingRaidStatus: {
    owner: 'frontierCombat.ts — getOutgoingRaidStatus',
    cadence: 'on-demand',
    cadenceNote: 'Read-only phase-aware status for outgoing raids; old encounter text is ignored during return travel.',
    writes: [],
    scheduledFrom: 'App.tsx, focusHints.getFocusHints, priorityAlerts.getPriorityAlerts',
    testFile: 'tests/frontierCombat.hostility.test.ts',
  },
  raidRecovery: {
    owner: 'raidAftermath.ts — beginRaidRecovery, tickRaidRecovery, isSettlementDestroyed, rememberRivalDisposition, applyWarCommunityReaction',
    cadence: 'realtime',
    cadenceNote: 'Recovery starts at actual raid resolution and advances on subsequent game ticks; remembered settlement-fate diplomacy and its civic reaction execute only on the relevant command. isSettlementDestroyed is read-only.',
    writes: ['raidRecovery', 'paused (settlement destruction)', 'building.health (through building removal owner)', 'rivalSettlements.diplomacyMemory', 'eventLog (through logEvent)'],
    scheduledFrom: 'frontierCombat.ts → beginRaidRecovery/rememberRivalDisposition/applyWarCommunityReaction; gameTick.ts → tickRaidRecovery',
    testFile: 'tests/raidTerminalReport.test.ts, tests/raidChronicle.lifecycle.test.ts',
  },
  raidBattlePresentation: {
    owner: 'eventLog.ts — selectRaidBattleEvents (pure Chronicle projection); App.tsx and components/BattleReportScreen.tsx — one active report, resume and presentation only',
    cadence: 'on-demand',
    cadenceNote: 'One battle ID per report; only bounded same-side legacy events may fall back to rival name. Sort chronologically, deduplicate event IDs, retain distinct named deaths and hide redundant complete loss summaries. Persisted battle result is authoritative. Phase and strength visuals reflect recorded combat; no simulated battle, extra RNG, save timer or second history writer.',
    writes: [],
    scheduledFrom: 'App.tsx → BattleReportScreen for the selected raid; frontierCombat.ts → logEvent owns tagged combat history',
    testFile: 'tests/raidChronicle.lifecycle.test.ts, tests/battleReportScreen.test.ts',
  },
  raidTerminalPresentation: {
    owner: 'raidTerminalReport.ts — buildRaidTerminalReport (pure read-only projection); components/WarfareStatus.tsx, components/BattleReportScreen.tsx and components/RazeConfirmation.tsx own display only, including modal keyboard/focus',
    cadence: 'on-demand',
    cadenceNote: 'Only derived for a genuinely destroyed settlement; one bounded scan of retained Chronicle events and one player-entity scan per report render. No tick, scheduler, RNG, state changes or additional save fields.',
    writes: [],
    scheduledFrom: 'components/WarfareStatus.tsx → buildRaidTerminalReport when raidRecovery.status is destroyed; App.tsx → RazeConfirmation for an existing pending raid',
    testFile: 'tests/raidTerminalReport.test.ts',
  },
  crashRecovery: {
    owner: 'components/GameErrorBoundary.tsx — GameErrorBoundary, registerCrashRecoverySource, isCrashRecoveryActive (UI fallback); saveLoad.ts — saveGame (file-only export option)',
    cadence: 'on-demand',
    cadenceNote: 'On a React render/lifecycle crash, capture the live read-only session refs before App unmount; do not overwrite the quick-save or run the normal unmount auto-save. The recovery file is the last available display snapshot, not a promised worker-authoritative export.',
    writes: [],
    scheduledFrom: 'main.tsx → GameErrorBoundary; App.tsx useLayoutEffect registers session refs; export button → saveLoad.saveGame; useGamePersistence cleanup checks crash state',
    testFile: 'tests/gameErrorBoundary.test.ts, tests/saveLoad.externalSlot.test.ts',
  },
  valleyChronicle: {
    owner: 'valleyChronicle.ts — advanceValleyChronicle; components/tabPanels/ValleyChroniclePanel.tsx is read-only',
    cadence: 'daily',
    cadenceNote: 'Only the daily tick unlocks historical chapters; UI displays saved chapter IDs without a Legacy Goals projection or new achievement decisions.',
    writes: ['chronicleChapters', 'resources (through resourceUtils)', 'economyLedger.produced (via recordFoodProduced)', 'eventLog (through logEvent)'],
    scheduledFrom: 'tickLayerDaily.ts → advanceValleyChronicle; Progress sidebar reads historical chapters',
    testFile: 'tests/valleyChronicle.foodLedger.test.ts',
  },
  terrainRiverSurface: {
    owner: 'renderer/whittakerTerrain.ts — buildRiverSurfaceFields, buildWhittakerFields, bakeWhittakerGround, sampleRiverPhase',
    cadence: 'render',
    cadenceNote: 'Read-only map-cache prepass, grassland clearing mask, and budgeted chunk baking; no simulation writes.',
    writes: [],
    scheduledFrom: 'renderer/terrain.ts → buildWhittakerFields on map cache change; bakeWhittakerGround for uncached ground chunks',
    testFile: 'tests/terrain.riverMaterials.test.ts, tests/terrain.clearingVisuals.test.ts',
  },
  commands: {
    owner: 'commands.ts (simWorker) → domain owners: buildingActionRouting, buildingStaffingActions, buildingResidencyActions, buildingMaintenanceActions and buildingConfigurationActions',
    cadence: 'player-command',
    cadenceNote: 'Manual individual job assignment is retired; legacy setBuildingStaffingMode accepts auto only. Worker-owned building upgrades mutate the authoritative world without cloning it; isolated calls retain copy semantics. main-thread fallback must use the same domain implementation (gameLoop); demolition cleans references immediately, reconciles displaced households only, and triggers full workforce staffing only when staff or crews are displaced; gameLoop does not replay an unconfirmed command after its worker reports a command fault, but preserves later queued requests',
    writes: [
      'building.occupants',
      'building.level',
      'workforcePolicy',
      'hotelSchedule',
      'tavernSchedule',
      'workSchedule',
      'resources',
      'building.workshopRecipeId',
      'building.mineMode',
      'building.staffingMode',
      'building.rotation',
      'building.health',
      'validated requested state transition (building/assignment/recipe/mode fields)',
    ],
    scheduledFrom: 'hooks/useCanvasInteractions.handleMouseUp (Alt-drag confirmation) → GameWorkerHost command channel; main-thread fallback in gameLoop',
    testFile: 'tests/commands.validation.test.ts, tests/workerCommand.roundtrip.test.ts, scripts/check-source-guards.mjs',
  },
} as const satisfies Record<DecisionKey, DecisionOwner>;

/** Selected-settler inspector: read-only render of the saved genome and career records, no tick or writer. */
export const PERSONALITY_CAREER_INSPECTOR_PRESENTATION = {
  owner: 'PersonalityCareerDetails.tsx — PersonalityCareerDetails; renders the fourteen inherited aptitudes, derived highlights, the same evaluateAllAptitudeActivities factors, evaluateWorkerFit reasons and saved careerHistory/careerMilestones',
  cadence: 'Read-only React render of the selected-entity panel',
  scheduledFrom: 'SelectedEntityPanel.tsx → PersonalityCareerDetails.tsx; gated by playerHuman.isPlayerHuman and human.alive',
  writes: [] as readonly string[],
  testFile: 'tests/personalityCareer.inspector.test.ts',
} as const;

/** Read-only UI projection: no new simulation scheduler or decision key. */
export const STRATEGIC_MAP_PRESENTATION = {
  owner: 'strategicMapProjection.ts — projectStrategicCamp; StrategicWorldMap.tsx — rivalInk, StrategicWorldMap; CitizenOverviewScreen.tsx — Frontier window sizing',
  cadence: 'Read-only React render of the Frontier subject window',
  scheduledFrom: 'CitizenOverviewScreen.tsx → GameWindow.tsx → FrontierTabPanel.tsx → FrontierPanel.tsx → StrategicWorldMap.tsx',
  writes: [] as readonly string[],
  testFile: 'tests/strategicWorldMap.projection.test.ts, scripts/check-source-guards.mjs',
} as const;

/** All declared decision keys as a typed array. */
export const DECISION_KEYS = Object.keys(SIMULATION_DECISIONS) as DecisionKey[];

// TEST & VERIFICATION UTILITIES

/** Lists all subsystems executing under a specific primary cadence. */
export function getDecisionsByCadence(cadence: DecisionCadence): DecisionKey[] {
  return DECISION_KEYS.filter((key) => SIMULATION_DECISIONS[key].cadence === cadence);
}

/** Checks whether a property write is declared by a subsystem; only exact field names match, so
 * `job` may match `human.job` but `id` must never match `residenceBuildingId` or `villageLeaderId`.
 */
export function isPropertyWritePermitted(key: DecisionKey, fieldName: string): boolean {
  const decision = SIMULATION_DECISIONS[key];
  if (!decision) return false;

  const field = fieldName.trim().toLowerCase();
  if (!field) return false;
  return decision.writes.some((permitted) => {
    const token = permitted.trim().toLowerCase().split(/[\s(]/, 1)[0];
    if (field.includes('.')) return token === field;
    return token === field || token.endsWith(`.${field}`);
  });
}
