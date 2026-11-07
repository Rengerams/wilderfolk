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
  | 'workerMotionPresentation'
  | 'virtualPlayer'
  | 'chronicleProseNames'
  | 'dailyPersonRoll'
  | 'traitInfluence'
  | 'personalMarks'
  | 'careerHistory'
  | 'careerProgression'
  | 'workerFit'
  | 'humanPhysiology'
  | 'humanMeals'
  | 'workSchedule'
  | 'school'
  | 'workforce'
  | 'immigration'
  | 'housing'
  | 'construction'
  | 'production'
  | 'villageRequests'
  | 'visitorLifecycle'
  | 'idleSkillDecay'
  | 'socialFeedback'
  | 'dialogueContent'
  | 'dialogueSessions'
  | 'spotlightLore'
  | 'courtship'
  | 'affairs'
  | 'conception'
  | 'pregnancyBirth'
  | 'moonHowler'
  | 'leadership'
  | 'raidCombat'
  | 'raidRecovery'
  | 'raidCaptivity'
  | 'raidTerminalPresentation'
  | 'valleyChronicle'
  | 'terrainRiverSurface'
  | 'commands';

export const SIMULATION_DECISIONS = {
  virtualPlayer: {
    owner: 'virtualPlayer.ts — decideVirtualPlayerAction, decideFood, decideUnstaffedFoodProducer, firstUnstaffedFoodProducer, wantedBootstrapCropSiteCount, needsAdditionalStore, decideIndustry, chooseRefugeeChoice (read-only policy proposals); economyLedger.isMeasuredFoodDeficit owns measured trend, getProjectedFoodSupply/isProjectedFoodShortfall own proactive demand risk',
    cadence: 'on-demand',
    cadenceNote: 'Once per in-game hour when auto-play is enabled; may propose a survival workforce preset, a staffed food-production expansion, or a targeted emergency auto-staff request for a measured critical shortage. Food expansion prefers real getRecentFoodFlow output and a seven-day forecast of population demand over interchangeable building counts, acting before deficits while requiring an unemployed adult or protected-minimum-safe transferable donor who can actually commute to the new plot via the read-only path map; new sites still require spare adults beyond existing/pending food posts; before history exists, a crop-only bootstrap estimate excludes Fishing/Hunting Spot as Farm equivalents. Store expansion uses economy.computeStorageMax material caps at 85% pressure, never low gold or a population-based Store count. When no House plot is available, decideHousing first proposes safe redundant-site demolition or residence expansion before optional food construction. Actual world writes remain with command and workforce owners. The headless scenario command adapter hydrates runtime caches if it adopts a cloned WorldState into the existing shell.',
    writes: [],
    scheduledFrom: 'useVirtualPlayer.shouldVirtualPlayerAct → virtualPlayer.decideVirtualPlayerAction → GameLoop.applyCommand or scripts/colonyHealth.applyColonyBotAction',
    testFile: 'tests/virtualPlayer.test.ts, tests/virtualPlayerHealthVerdict.test.ts, tests/colonyBotCacheHydration.test.ts',
  },
  workerMotionPresentation: {
    owner: 'gameLoop.ts — isLightweightWorkerCommand, canPreviewWorkerCommand, registerWorkerHandlers, frameBody, stepFallbackTick, applyCommand, rebuildOptimisticDisplay, exportAuthoritativeWorld, lastExportWasDegraded; scheduleFeedback.ts — getScheduleImpactPreview (read-only)',
    cadence: 'render',
    cadenceNote: 'Worker message admission awaits the shared census-name gate. Failed fallback ticks retain accumulator time; each command carries a host monotonic id and the worker echoes the last applied id so recovery replays only unproven work. Buffer pooling and delta packing remain transport-only, and display caches are hydrated once. On acknowledged ticks, blend only confirmed positions. Top-level schedule/policy commands use shallow previews and skip unnecessary catalog rebuilding unless a tick completed while commands were pending; the next acknowledgement reconciles entities and stale selections. Read-only schedule impact indexes roster IDs once per render. On save, halt new ticks while earlier commands settle. No gameplay writes.',
    writes: [],
    scheduledFrom: 'GameWorkerHost tick acknowledgement and requestAnimationFrame → GameLoop.frameBody; useGamePersistence.persistGame → GameLoop.exportAuthoritativeWorld (on-demand)',
    testFile: 'tests/gameLoop.test.ts, tests/gameLoop.fallbackTickRollback.test.ts, tests/renderer.motionAndHover.test.ts',
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
    owner: 'simRng.ts — personDayRoll',
    cadence: 'on-demand',
    cadenceNote: 'Pure stateless hash keyed by settler ID, absolute colony day and call-site salt. Stable for the entire colony day; read-only and consumes no RNG stream state.',
    writes: [],
    scheduledFrom: 'Direct on-demand calls from humanSchedule, townHall, socialLife, hospitalCare, humanHospitalBehavior, humanLeisureBehavior, humanHuntingBehavior, hotelStay, humanTick and simulation/humanRelationships',
    testFile: 'tests/personDayRoll.simRng.test.ts, tests/humanLeisureBehavior.test.ts, tests/civicPetition.cadence.test.ts',
  },
  traitInfluence: {
    owner: 'personality/traitEvaluation.ts — evaluateAptitudeInfluence, combinePairFactors and evaluateAllAptitudeActivities: the single pure entry point that reads the signed weights in personality/activityAptitudes.ts against the one GenomeV2 owned by settlerTraits.ts',
    cadence: 'on-demand',
    cadenceNote: 'Pure data projection with no tick, no scheduler, no RNG and no mutation authority. One validated GenomeV2 per living settler holds fourteen allele pairs; expression is each pair\'s mean and the activity score is relative to that settler\'s own fourteen-dimension mean. The evaluator returns one bounded factor per activity (`1 + cap*score`, cap 5–20%) plus stable reasons on request, and never a second genetics source, cached modifier or extra roll. Signed weights give every one of the fourteen dimensions at least one upward and one downward live activity, so no genome is universally best and every settler has both strengths and weaknesses. Costs: the crew multiplier (skills.ts routineWork/construction), school credit and research (education.ts learning/research), apprenticeship training (apprenticeships.ts), per-soldier militia defence (militiaBalance.ts), hunting reach and pursuit (humanHuntingBehavior.ts), flight speed (humanTick.ts escape), labour drain (humanPhysiology.ts), friendship gain, reconciliation decay and pair feud drift (relationships.ts), courtship rate (humanTick.ts), workplace banter (socialLife.ts), grief recovery (humanLifecycleCleanup.ts), civic voices (warPrisoners.ts) and the advisory worker-fit tie-break (careers/workerFit.ts). A carried personal mark adds that activity\'s signed mark weight to the same score before the one clamp and one cap; the `conception` activity has no aptitude weights, so only the acquired lucky mark can move it.',
    writes: [],
    scheduledFrom: 'On-demand direct caller: skills.getWorkerSkillMultiplier (called by dailyBuildingEconomy production and construction and by workshopEconomy), education.creditChildSchoolDay / getEducationResearchMultiplier, apprenticeships.teach, militiaBalance.computeMilitiaBreakdown (defense per mustered soldier), humanHuntingBehavior.tickHumanHunting (hunting and pursuit), humanTick.tickHumans (escape and courtship), humanPhysiology.advanceHumanNeeds (labor drain), socialLife.tryWorkplaceBanter, humanLifecycleCleanup.finalizeHumanDeath, warPrisoners.applyWarCommunityReaction, relationships.advanceSocialRelationships, careers.workerFit.evaluateWorkerFit (pure projection in workforce exact ties and the selected-settler inspector)',
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
  humanPhysiology: {
    owner: 'simulation/humanPhysiology.ts — initialHumanNeeds, normalizeHumanNeeds, advanceHumanNeeds, resolveHumanNeedsIntent, getHumanNeedsWorkMultiplier, hasFatalStarvation, creditHumanNutritionFromFood, adjustHumanStaminaFromEnergy, getHumanStaminaRatio, rebaseHumanNeedsClockAfterFormRestore, hasNearbyWell',
    cadence: 'realtime',
    cadenceNote: 'Player humans advance once per tick before offscreen throttling. Creation, load migration and form restoration initialize or restore saved needs. Resolve intent and work effects as read-only queries. The legacy human energy field is a one-way stamina projection. The sole seven-hour-night recovery rate is shared by rest and stamina, and humanTick.observeHumanSleep observes eligible homes, hotels, wards, cells and lover visits before the single physiology write. Sleep requires a confirmed indoor arrival from the movement owner: humanMovement.homeStandPosition targets outside the housing footprint, with home leisure using the same porch; this decision does not own navigation. Work-shift stamina loss is divided by the catalog physiology/labor factor, so endurance DNA reaches the player work drain; walking keeps its base drain. An unheated winter day multiplies the nutrition loss by 1.5, so daily heating wood buys a real reserve.',
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
      'human.energy (derived projection)',
    ],
    scheduledFrom: 'humanTick.ts → advanceHumanNeeds and resolveHumanNeedsIntent; entityFactory.ts → initialHumanNeeds; saveLoad.ts → normalizeHumanNeeds; domain effects → stamina/nutrition adjustment',
    testFile: 'tests/humanNeeds.calibration.test.ts, tests/humanNeeds.mealRule.test.ts, tests/humanNeeds.restAndWell.test.ts, tests/humanNeeds.unheatedWinter.test.ts, tests/settlers.indoors.test.ts, tests/homeEntry.geometry.test.ts',
  },
  humanMeals: {
    owner: 'simulation/humanNeeds.ts — canEatColonyMeal, tryEatColonyMeal, killFromStarvation, fract, freeHuntFoodGain',
    cadence: 'realtime',
    cadenceNote: 'Only tryEatColonyMeal debits the colony food ledger. Successful player meals delegate nutrition credit to humanPhysiology; foreign captives consume at most one ledger-debited 08:00 ration per calendar day; the persisted custody stamp prevents duplicate charges across calls and reload without creating stamina or energy needs. Free-roam hunting records the food storage actually accepted against the hunting source, matching Hunting Spot production. Death actions are delegated to the existing human lifecycle/death owner. Foreign captive metabolism and exhaustion deaths are retired: prisoners do not work or roam. Player settlers read the catalog labor factor in humanPhysiology on their own needs state, never this one.',
    writes: [
      'resources.food',
      'economyLedger.consumed.meals',
      'human.needs.lastMealTick',
      'human.warCaptive.lastRationDay',
      'human.alive (via delegated death action)',
    ],
    scheduledFrom: 'humanTick.ts → tryEatColonyMeal / killFromStarvation; workAbsence.ts → canEatColonyMeal; humanHuntingBehavior.ts → freeHuntFoodGain and recordFoodProduced',
    testFile: 'tests/humanNeeds.mealRule.test.ts, tests/personality.captiveEnergyIntegration.test.ts, tests/warfare.lifecycle.test.ts, tests/humanNeeds.calibration.test.ts',
  },
  workSchedule: {
    owner: 'workSchedule.ts — validateWorkSchedule, normalizeWorkSchedule, getWorkSchedule, setWorkSchedule, isWorkScheduleHour, isOnWorkScheduleShift; humanSchedule.ts — home/night/festival policy (shouldBeAtHomeFor, prefersHomeTonightFor, allowSocialLifeFor)',
    cadence: 'player-command',
    cadenceNote: 'The shipped window is 07–16; the player may set any non-wrapping whole-hour window. The command writes only world.workSchedule. Renderer status, work audio, town-hall hours, home preference and shift checks read that configured window hourly instead of a hard-coded legacy 07–18 default.',
    writes: ['workSchedule'],
    scheduledFrom: 'simWorker/commands.ts "setWorkSchedule"; renderer/humans, hooks/useGameAudio, townHall and humanStatus read getWorkSchedule',
    testFile: 'tests/workSchedule.bounds.test.ts, tests/humanSchedule.defaultWindow.test.ts, tests/audio.workDetect.test.ts',
  },
  school: {
    owner: 'education.ts — syncSchoolAssignments, findSchoolForChild, schoolCapacity, isSchoolTime (weekday 09–15), buildSchoolRosters, recordChildSchoolTick, creditChildSchoolDay, applyEducationGraduation',
    cadence: 'realtime',
    cadenceNote: 'School keeps its own weekday 09–15 day, independent of the configured work window. syncSchoolAssignments reassigns pupils on the new calendar day; humanTick records attendance ticks only while the teacher is present and the pupil is at school; creditChildSchoolDay runs at the day close. The dashboard reads isSchoolTime for its in-session state.',
    writes: ['child.schoolBuildingId', 'child.schoolTicksToday', 'child.schoolDays', 'child.educated'],
    scheduledFrom: 'humanTick.ts (syncSchoolAssignments, recordChildSchoolTick, creditChildSchoolDay); dashboardData reads isSchoolTime',
    testFile: 'tests/school.test.ts, tests/schooling.explains.test.ts, tests/dashboardData.prisonAndCouncil.test.ts',
  },
  workforce: {
    owner: 'workforce.ts — assignWorkerInPlace, transferWorkerBetweenBuildings, assignBuilderInPlace, staffFoodJobsBeforeConstruction, workforceSignature, isAcuteFoodStaffingEmergency, hasFoodStaffingPressure, prospectiveFoodTransferDonors, assignMissingWorkers, syncJobBuildingOccupants, prepareWorkforce, releasePrisoners; priority order: workforcePolicy.ts; player-command assignWorker limited to construction/residency',
    cadence: 'assignment',
    cadenceNote: 'Under the survival preset, idle adults first fill reachable food vacancies before being claimed by construction even while the larder is full; other presets retain normal construction-first order. The idle-only assignWorkerInPlace choice uses the canonical two-hour home-to-work route gate; transfers use the same reachability owner. Existing jobs persist despite blocked routes. Automatic staffing completes reachable minimum-coverage transfers and tries alternate donors before caching its O(player humans+buildings) fingerprint; only fully priced passes cache completion. The signature also tracks current 60-day transfer eligibility, acute measured food emergency status, and unhoused applicant path cells, so expiry, shortages and movement retry on the next pulse. Under a measured or forecasted food shortfall, only food-post transfers bypass cooldown and no protected minimum crew or commute eligibility is sacrificed. Route-budget deferrals clear the cache; node-budget deferrals progress under a bounded escalating A* limit (one advanced search per pass, terminal conservative rejection), so unchanged pulses only skip when outcomes are resolved, with a weekly repair run. Explicit autoStaffWorkers requests force reconciliation.  Legacy manual flags normalize to auto without dropping jobs; career/DNA fit breaks exact ties without changing transfer cooldown. Command/assignment phase: tickLayerAssign and dailyBuildingEconomy still call the shared owner, but unchanged input signatures return without expensive staffing. Only a forced or changed event triggers re-matching. releasePrisoners is NOT assignment-cadenced: it runs every realtime tick from tickLayerRealtime (O(state.entities)); only its assignMissingResidences/assignMissingWorkers tail is gated behind the `released` flag',
    writes: [
      'building.staffingMode',
      'building.occupants',
      'human.workerBuildingId',
      'human.occupation',
      'human.job',
      'human.skills',
      'workforcePolicy',
    ],
    scheduledFrom: 'tickLayerAssign.assignMissingWorkers; saveLoad.loadGameFromParsedOutcome installs its restored path map before the load-time staffing pass; tickLayerRealtime.releasePrisoners; commands.ts "autoStaffWorkers" (owned world in place, isolated calls copied); "assignWorker" retained for construction/residency only; buildingStaffingActions on place/recruit/death',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/saveLoad.commuteGrid.test.ts, tests/virtualPlayerHealthVerdict.test.ts, tests/workforce.persistentCommute.test.ts, tests/workforce.deferredCommuteRetry.test.ts, tests/autoStaff.notify.test.ts, tests/commands.validation.test.ts',
  },
  immigration: {
    owner: 'dailyPopulation.ts — tickDailyPopulation, tickImmigration, canSupportImmigration (one daily admission owner); economyLedger.ts owns historical and forecast food verdicts; worldGen.ts owns immigrant party composition',
    cadence: 'daily',
    cadenceNote: 'After real completed-day production is recorded, admission is gated against measured deficits and projected demand for the largest arriving family. A large stored larder alone cannot permit unsustainable growth; sparse startup history preserves bootstrap immigration. Never cancels births or reassigns existing residents. Housing, settlement entity spawning and spatial indexes keep their existing owners.',
    writes: ['maxHumanPopulation', 'humanPopulation', 'entities (via spawned new settlers)', 'nextEntityId', 'eventLog (through logEvent)', 'notifications'],
    scheduledFrom: 'tickLayerDaily.tickLayerDaily → dailyPopulation.tickDailyPopulation → tickImmigration once per colony day; spawn bookkeeping delegates to simulationEntities',
    testFile: 'tests/dailyPopulation.foodAdmission.test.ts, tests/immigration.composition.test.ts',
  },
  housing: {
    owner: 'housingPipeline.ts — assignMissingResidences runs the single decision pipeline (HOUSING_PHASE_ORDER: leader, integrity, guardianship, capacity, homeless, adult-child, commute) over one HousingLedger, planRelocation answers move-or-stay for homeless, custody, custodian, capacity, surplus, leave-home, commute and couple, and applyRelocation writes a plan; the commute phase also swaps two occupied homes when both households improve; manor seating is event-driven (start/election) and never a housing-phase decision; relocateHousehold applies a whole-household decision; relocateFamily retries a destination the writer refused with the next-best home; moveResident stays the sole write; HousingReport carries the run stats; assignMissingResidences accepts an optional resume ledger; ranking lives in the same module; facts: housingModel.ts; immediate player entry: buildingResidencyActions.assignResidentToBuilding',
    cadence: 'assignment',
    cadenceNote: 'Scheduled housing sweeps run four times per day, the last pulse revisits all units, and housingUnitBucket is only a deterministic hash of CURRENT member IDs (not stable through departures); demolition reconciles displaced households immediately using the bounded tick sweep, while removals without displaced residents skip the housing pipeline; other events request immediate reconciliation or a reasoned residence transition. assignMissingResidences schedules; planRelocation answers move-or-stay for each household and applyRelocation writes; the commute phase can swap two occupied homes when both improve, and its straight-line floor skips impossible route candidates; the capacity rebalance plans through it too, and the homeless repair pass still seats every partially housed unit. A mandatory phase settles a household for the run, so the optional adult-child and commute phases cannot undo it. Reconciliation owns reference and resident-roster writes; selection and leader entitlement provide rules. Worker transport applies authoritative snapshots, never new housing decisions.',
    writes: [
      'human.residenceBuildingId',
      'residence building.occupants',
      'household membership (couple + minor children)',
    ],
    scheduledFrom: 'gameTick tick boundary + tickLayerAssign.syncResidenceOccupants (mirror); tickLayerAssign.assignMissingResidences (assignment); commands.ts "assignResidentToBuilding"',
    testFile: 'tests/housingPlanner.contract.test.ts, tests/housingAuthority.pipeline.test.ts, tests/housingPipeline.invariants.test.ts, tests/housingDiagnostics.test.ts, tests/adultChild.moveOutTarget.test.ts, tests/residenceCommuteRelocation.test.ts, tests/divorceHousing.custody.test.ts, tests/leaderHouse.successionHousehold.test.ts, tests/simulation.invariants.test.ts, tests/longRunColony.integration.test.ts, tests/residencyCapacity.writers.test.ts',
  },
  construction: {
    owner: 'buildingStaffingActions.assignBuilderToBuilding + workforce.assignBuilderInPlace (crew membership); tickLayerDaily.tickBuildingProgress (progress advance)',
    cadence: 'work',
    cadenceNote: 'progress advances once per colony day in tickLayerDaily; crew membership changes on command/assignment phase. the crew multiplier is called with the construction action, so site progress reads only the catalog\'s work/builder/construction factor and no production-context DNA reaches it; that holds for a site with no production job too, since the crew\'s skill baseline falls back to Builder',
    writes: [
      'building.constructionProgress',
      'building.occupants (construction crew)',
      'building.buildAnimTimer',
    ],
    scheduledFrom: 'tickLayerDaily.tickBuildingProgress (progress); assign layer + commands (crew membership)',
    testFile: 'tests/commands.validation.test.ts, tests/demolish.roundtrip.test.ts, tests/personality.workIntegration.test.ts',
  },
  production: {
    owner: 'tickLayerDaily.tickBuildingProduction; economy.ts — addResource, applyFoodSpoilage, updateStorageCaps, computeStorageMax; the crew term this decision multiplies is skills.getWorkerSkillMultiplier',
    cadence: 'daily',
    cadenceNote: 'system/daily at 18:00, after the work window, and before the same-hour ecology/world-event tail — the per-player-worker pass prefers verified on-post ticks (schedulePresentTicksToday) and the site actually worked; a changed site (-1) is excluded rather than guessed, and scheduled hours are the fallback only when no presence sample exists. Farms/hunt/smith production and spoilage are daily ledger work. Day-interval producers are additionally gated on isWorkDay, so they run 5 days in 7; the 2/3/5-day interval buildings (store, market, workshop, townHall, hospital) skip that work-day test. Silos are storage-only. The crew\'s trade DNA (personality traitInfluence, `work`/production context) enters through getWorkerSkillMultiplier, which reads `building.occupants` only; the workshop estimate reads the same function so the preview cannot drift. An occupant id that resolves to nobody contributes neutral DNA to that average instead of diluting it',
    writes: [
      'resources',
      'economyLedger.produced',
      'foodSpoilageRate',
      'human.skills (gainSkill)',
      'storageMax',
    ],
    scheduledFrom: 'tickLayerDaily',
    testFile: 'tests/economyAudit.storageCaps.test.ts, tests/dayCycle.tavern.test.ts, tests/personality.workIntegration.test.ts, tests/workSkillAttribution.accrual.test.ts',
  },
  villageRequests: {
    owner: 'groupEvents.ts — tickVillageRequests, resolveVillageRequest (ONLY request generation, expiry, and resolution owner)',
    cadence: 'new-calendar-day',
    cadenceNote: 'daily generation/expiry; typed player-command delegates into the same owner through commands.ts',
    writes: [
      'activeVillageRequest',
      'villageRequestCooldownUntilDay',
      'villageRequestHistory',
      'documented resources/reputation effects',
      'source visitor-group counters',
      'eventLog/bigNews/floatingTexts',
    ],
    scheduledFrom: 'tickLayerDaily.ts 18:00 → dailyWorldEvents.tickDailyWorldEvents → groupEvents.tickVillageRequests; commands.ts "resolveVillageRequest" → groupEvents.resolveVillageRequest',
    testFile: 'tests/villageRequests.test.ts, tests/workerCommand.roundtrip.test.ts, tests/gameWorker.transport.test.ts',
  },
  visitorLifecycle: {
    owner: 'groupEvents.ts — tickVisitorGroups; sole visitor stay, gift, and departure owner',
    cadence: 'new-calendar-day',
    cadenceNote: 'One 00:00 pass per colony day; arrival grace stays in groupEvents and departure unindexes visitors. Required CI: calendar-scheduler executes the real gameTick regression.',
    writes: ['visitorGroups', 'visitorGroup.daysLeft', 'visitorGroup.giftsGiven', 'visitorGroup.gold', 'visitorHuman.alive', 'resources', 'villageReputation', 'eventLog/bigNews/floatingTexts'],
    scheduledFrom: 'gameTick.ts → tickLayerDaily.ts 00:00 → groupEvents.tickVisitorGroups',
    testFile: 'tests/calendarPhase.auditRegressions.test.ts',
  },
  idleSkillDecay: {
    owner: 'skills.ts — decayIdleSkills; sole non-active trade-skill decay writer',
    cadence: 'new-calendar-day',
    cadenceNote: 'Exactly once at 00:00 for living adult player humans; active job skill is exempt. Required CI: calendar-scheduler tests exact loss through gameTick.',
    writes: ['human.skills', 'human.profileRevision'],
    scheduledFrom: 'gameTick.ts → tickLayerDaily.ts 00:00 → skills.decayIdleSkills',
    testFile: 'tests/calendarPhase.auditRegressions.test.ts',
  },
  socialFeedback: {
    owner: 'humanSocial.ts — simAmbientChatNeighbors, simSettlerPairChat; socialLife.ts — pickSocialImpulse, tryWorkplaceBanter, tryNeighborGreeting',
    cadence: 'realtime',
    cadenceNote: 'Human-social owner only selects real nearby eligible participants and social motives at existing work/morning/stagger gates; the dialogue router selects text and humanChat executes sessions. The spatial query is adaptive and may legitimately use a bounded linear candidate scan.',
    writes: ['floatingTexts (hearts)', 'small courtship progress'],
    scheduledFrom: 'humanTick.ts realtime social/leisure path, with SOCIAL_STAGGER on neighbour selection',
    testFile: 'tests/phase7.social.test.ts, tests/socialLife.dialogueBusy.test.ts, tests/humanChat.ambientPairing.test.ts',
  },
  dialogueContent: {
    owner: 'dialogueTrees.ts — buildCanonicalDialogueBank, freezeDialogueTree, requestDialogue, dialogueHoursFromNominalTicks, tickDialogue, maybeDialogueChat, pickRandomChatContext, tryAmbientRandomDialogue, contextualAmbientScene, readPresentationDialogue, bindNumberedPresentationSpeakers, indexDialogueBank, preloadDialogueBank',
    cadence: 'on-demand',
    cadenceNote: 'One centralized ambient source (data/dialogue/ambient.json, one neutral dialogue category); eventKey+mode lookup matches real participant roles, cycles eligible variants and applies a per-settler three-day line cooldown before repeating. Singleton ambient scenes cool down for three calendar days; per-entity scene and line history survive save/load. This owner writes human.dialogueRecentScenes and human.dialogueRecentLines; scripted exact scenes bypass rotation; humanChat alone writes visible dialogue sessions.',
    writes: ['human.dialogueRecentScenes', 'human.dialogueRecentLines'],
    scheduledFrom: 'humanTick.ts, socialLife.ts, humanLeisureBehavior.ts, factionWander.ts and existing domain event owners; Spotlight overlay later uses read-only group adapter',
    testFile: 'tests/dialogue.schema13.test.ts, tests/dialogue.eventRouting.test.ts, tests/dialogue.workerSaveParity.test.ts, tests/dialogue.variety.test.ts, tests/dialogue.lineRepeat.test.ts, tests/dialogue.pipeline.integration.test.ts',
  },
  dialogueSessions: {
    owner: 'humanChat.ts — startDialogueTreeChat, tickHumanChat, endAmbientHumanChat, prepareScriptedDialogue, releaseDialogueSession, cleanupEntityDialogueState, resetDialogueSessions',
    cadence: 'realtime',
    cadenceNote: 'Sole simulation writer of chatPhrase, chatTicks, chatPartnerId and chatDialogueSessionKey. Paired sessions are held with live participant references and release both sides immediately on interruption; saved orphan keys are reclaimed on their existing ticks; missing counterparts and cleared keys are ignored safely. The render-buffer boundary mirrors fields but does not originate speech.',
    writes: ['human.chatPhrase', 'human.chatTicks', 'human.chatPartnerId', 'human.chatDialogueSessionKey'],
    scheduledFrom: 'humanTick.ts — tickHumanChat and, on confirmed sleep, endAmbientHumanChat before the active-entity return; event owners request sessions through dialogueTrees.ts',
    testFile: 'tests/humanChat.duration.test.ts, tests/pairDialogue.orphanReclaim.test.ts, tests/dialogue.sessionModes.test.ts, tests/dialogue.workerSaveParity.test.ts, tests/dialogue.schema13.test.ts',
  },
  spotlightLore: {
    owner: 'spotlightLore.ts — buildSpotlightLoreScene, stageSpotlightLoreCast, maybeStartSpotlightLore, startSpotlightLoreDebug, getSpotlightGatherTarget, tickSpotlightGathering, finishSpotlightLore, normalizeSpotlightLoreOnLoad',
    cadence: 'realtime',
    cadenceNote: 'Cheap O(1) gate each sim tick, rare weekend 19:00 selection through direct simRng.personDayRoll with 6–10 eligible adult male speakers and bounded walkable stage slots before cooldown, all-actor attendance/eligibility through ready, load-time cast validation and typed finish; `startSpotlightLoreDebug` is a dev-only bypass from the `?debug=1` Guide card that stages a paused ready cast on its marks without writing the cooldown; completed Village Squares stage the real cast immediately on validated marks (other settlements still use normal gathering); stage movement in humanTick uses cached pathfinding velocity and one normal walk step; renderSnapshot plus overheadLayout.shouldDrawSpotlightHuman hide bystanders only during ready performance, and that ready phase also suppresses settler name plates, status badges and the gold building level frames/pennants/level text (the entity layer key carries the phase so the baked building layer repaints); read-only UI choreography derives independent wall-clock 44-caption cues via canonical captionBoundary lookup, with the overlay pinning the current canonical line in a fixed caption under the title banner (formatChatLine, no chat state writes, no canvas bubble over the stage), camera projection at the 2.5x stage zoom that App restores to the pre-scene view when the performance ends, streamed instrumental fading before applause and cancellable SFX applause; the overlay delegates keyboard ownership and Escape-to-skip to the existing useOverlayKeyboard hook, not WorldState',
    writes: ['spotlightLore', 'spotlightLoreLastDay', 'eventLog (through logEvent)', 'paused (debug preview only)', 'entity positions, indoorBuildingId, huntTargetId and velocity (square stage or debug preview only)'],
    scheduledFrom: 'tickLayerRealtime.ts before and after tickHumans; humanTick reads the gathering target and delegates obstacle steering to pathfinding.steerWithPath (single humanTick movement integration); simWorker/commands.ts delegates finishSpotlightLore and startSpotlightLoreDebug',
    testFile: 'tests/spotlightLore.test.ts, tests/spotlightQuietStage.test.ts, tests/renderer.presentationLayout.test.ts, tests/spotlightChoreography.test.ts, tests/spotlightApplause.test.ts, tests/spotlightAudioRace.test.ts',
  },
  courtship: {
    owner: 'humanRelationships.ts — findCourtshipPartner, isEligibleToCourt, tryCompleteCourtshipMarriage; progress advance executes from humanTick.ts',
    cadence: 'realtime',
    cadenceNote: 'authority declares social/daily; the encounter path and the progress advance actually run every realtime tick for every eligible settler with NO stagger (humanTick findCourtshipPartner + bindCourtship). A SOCIAL_STAGGER gate exists in the same function but is deliberately not applied to the partner query: positions are rewritten every tick, so querying one tick in six would pair a different closest partner. Marriage finalization is owned by humanRelationships',
    writes: [
      'human.courtshipPartnerId',
      'human.courtshipProgress',
      'human.relationshipStatus',
      'human.partnerId',
    ],
    scheduledFrom: 'humanTick.ts (per realtime tick, socialTime gate) → humanRelationships.findCourtshipPartner / tryCompleteCourtshipMarriage',
    testFile: 'tests/phase7.social.test.ts',
  },
  affairs: {
    owner: 'humanRelationships.ts — tryDailyAffairEncounter, recordAffairTrystSite, tryDailyAffairGossip, tryExposeCaughtAffairForPair, exposeAffair',
    cadence: 'staggered-social',
    cadenceNote: 'authority declares staggered/daily — tryst PROGRESS advances every realtime tick (affairProgress += rate * PER_TICK_RATE_SCALE, no stagger); establishment/gossip/scandal roll on the daily gate; caught-in-act exposure can fire from realtime proximity checks; getAffairTrystBuilding selects only an available home of either lover when nearby; otherwise affairs remain outdoors; partner order never changes site selection; humanMovement.affairTrystEntry gives both partners the same outdoor doorstep instead of the blocked footprint centre; recordAffairTrystSite records an indoor location only when both lovers actually entered it; the before-shift hour is not affair time',
    writes: [
      'human.affairPartnerId',
      'human.affairProgress',
      'human.lastAffairSiteDay',
      'human.lastAffairSiteX',
      'human.lastAffairSiteY',
      'human.scandalCooldownUntilTick',
      'prison fields on arrest',
      'villageReputation',
    ],
    scheduledFrom: 'humanTick.ts tickHumans → one daily lover-specific waking-hour gate for tryDailyAffairEncounter and tryDailyAffairGossip; realtime meeting/progress and caught-in-act proximity, with shared tryst site read-only in humanRelationships.getAffairTrystBuilding and the shared approach point in humanMovement.affairTrystEntry',
    testFile: 'tests/phase7.social.test.ts, tests/electionGossip.dedup.test.ts, tests/affairTrystSite.walkIn.test.ts, tests/settlers.indoors.test.ts',
  },
  conception: {
    owner: 'humanRelationships.ts — tryDailyConception (ONLY conception owner)',
    cadence: 'new-calendar-day',
    cadenceNote: 'One roll per settler per colony day through salted personDayRoll; married-near, youth-pair and affair trysts use separate salts. Conception is deliberately non-genetic: the `conception` activity carries no aptitude weights and reads no allele, so only the acquired lucky mark can move the married/youth chance; the retired inherited Lucky ×1.15 is gone and no replacement roll exists. The youth route follows the retained youth link: while one partner is 18 and the other is still a minor it may conceive in either direction; once both are 18 (or the older is beyond 18) the route closes and the handoff/adult path applies.',
    writes: [
      'human.pregnant',
      'human.pregnantById',
      'human.pregnancyFromYouthLove (conception route)',
      'human.pregnancyProgress',
      'human.pregnancyDueProgress',
      'human.relationshipStatus (expecting)',
    ],
    scheduledFrom: 'humanTick.ts (isNewCalendarDay gate)',
    testFile: 'tests/phase7.social.test.ts, tests/conceptionEvent.labelling.test.ts, tests/youthConception.ageFloor.test.ts',
  },
  pregnancyBirth: {
    owner: 'humanLifecycle.ts — tickPregnancyAndBirth (ONLY birth owner; never starts a second pregnancy path); settlerTraits.ts — inheritGenome is the only birth genetics rule',
    cadence: 'pregnancy-progress',
    writes: [
      'human.pregnancyProgress',
      'human.pregnant/pregnantById/pregnancyDueProgress/pregnancyFromYouthLove (cleared at birth)',
      'human.childrenIds',
      'new child entity',
      'new child human.genomeV2 (one allele per biological parent per dimension; parents are read-only)',
      'eventLog/bigNews/floatingTexts',
    ],
    scheduledFrom: 'humanTick.ts pregnancy gate → humanLifecycle.tickPregnancyAndBirth → settlerTraits.inheritGenome (birth-key seeded stream)',
    testFile: 'tests/humanLifecycle.test.ts, tests/conceptionEvent.labelling.test.ts, tests/personality.romanceContext.test.ts, tests/settlerTraits.test.ts',
  },
  moonHowler: {
    owner: 'moonHowler.ts + moonHowlerForm.ts — tickMoonHowlerCycle, curseMoonHowler, transformToWerewolfForm, revertToHumanForm, cureMoonHowler, finalizeMoonHowlerDeath, isSettlerRelationshipEntity; night window owned by daycycleconstants.ts',
    cadence: 'full-moon-event',
    writes: [
      'human.moonHowlerCursed',
      'human.moonHowlerSaved',
      'entity.type (Human ↔ Werewolf)',
      'building.occupants during transform/restore',
      'eventLog/title (Moonslayer)',
    ],
    scheduledFrom: 'tickLayerRealtime.ts → tickMoonHowlerCycle (22:00 on full-moon day through next-day 06:00; form ends at 06:00)',
    testFile: 'tests/moonHowler.test.ts, tests/low-3-moon-lifecycle.test.ts, tests/medium-persistence.test.ts',
  },
  leadership: {
    owner: 'leaderHouse.ts — syncLeaderHouseResidency, applyLeaderOccupation; election: villageLeadership.ts — tickElectionBuildup, tryStartTermElectionCeremony, tryStartVacancyElectionCeremony, tickElectionCeremony, tickElectionGossip; dailyWorldEvents.ts — tickYearBoundaryWorldEvents (midnight scheduling), tickDailyWorldEvents (18:00 vacancy scheduling); ceremony attendance: villageLeadership.ts — isCeremonyAttendee, getElectionGatherTarget (read-only)',
    cadence: 'daily',
    cadenceNote: 'Term elections and buildup run at 00:00 on year rollover, vacancies on their due date at 18:00, ceremony progression in realtime; residency remains idempotent. Required CI: calendar-scheduler tests Year-2 midnight via gameTick.',
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
      'eventLog',
      'notifications/bigNews',
    ],
    scheduledFrom: 'tickLayerDaily.ts 00:00 → dailyWorldEvents.tickYearBoundaryWorldEvents → villageLeadership term owner; tickLayerDaily.ts 18:00 → dailyWorldEvents.tickDailyWorldEvents → villageLeadership vacancy owner; tickLayerDaily.ts 06:00 → leaderHouse.syncLeaderHouseResidency',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/villageLeadership.test.ts, tests/medium-N5-electionGatherSlot.test.ts, tests/calendarPhase.auditRegressions.test.ts',
  },
  raidCombat: {
    owner: 'frontierCombat.ts — queueRaidDefense, tickPendingRaidEvents, tickPendingOutgoingRaidEvents, resolveIncomingRaidInPlace, resolveOutgoingRaidCombat, persistBattleAftermath, resolveRaidVictory, buildIncomingRaidIndex, isRaidMarchingForRival',
    cadence: 'realtime',
    cadenceNote: 'Incoming and outgoing battles progress on game ticks across six game hours. Raid dispatch, responses and settlement-fate choices also enter through player commands; treaties may be broken at a reputation cost, extermination kills every remaining inhabitant, and events are written through the ordinary Chronicle owner. Awarded spoils—gold included—enter through addCappedResource, so the configured storage cap and the common resource accounting apply. Rival camp growth is staggered by the stable rival id, never by list position.',
    writes: ['pendingRaidEvents', 'pendingOutgoingRaidEvents', 'pendingRaidVictories', 'raidBattleReports', 'scoredRaidIds', 'human.raidDeploymentId', 'human.battleLeadershipMerit', 'rivalSettlements', 'resources (through economy owner)', 'eventLog (through logEvent)'],
    scheduledFrom: 'gameTick.ts → tickPendingRaidEvents/tickPendingOutgoingRaidEvents; simWorker/commands.ts → raid and victory commands; humanTick.ts builds buildIncomingRaidIndex once per tick for its rival wanderers',
    testFile: 'tests/warfare.lifecycle.test.ts, tests/raidChronicle.lifecycle.test.ts, tests/raidDeadline.owner.test.ts, tests/humanTick.hotPathIndexes.test.ts',
  },
  raidRecovery: {
    owner: 'raidAftermath.ts — beginRaidRecovery, tickRaidRecovery, isSettlementDestroyed, rememberRivalDisposition',
    cadence: 'realtime',
    cadenceNote: 'Recovery starts at actual raid resolution and advances on subsequent game ticks; remembered settlement-fate diplomacy executes only on the relevant command. isSettlementDestroyed is read-only.',
    writes: ['raidRecovery', 'building.health (through building removal owner)', 'rivalSettlements.diplomacyMemory', 'eventLog (through logEvent)'],
    scheduledFrom: 'frontierCombat.ts → beginRaidRecovery/rememberRivalDisposition; gameTick.ts → tickRaidRecovery; captivity decisions → rememberRivalDisposition',
    testFile: 'tests/warfare.lifecycle.test.ts',
  },
  raidCaptivity: {
    owner: 'warPrisoners.ts — captureRaidPrisoners, resolveWarPrisoner, applyWarCommunityReaction; warPrisonerCustody.ts — recordWarPrisonerOutcome, departWarPrisoner',
    cadence: 'player-command',
    cadenceNote: 'Capture occurs after resolved combat, custody outcomes via commands, and escape/release cleanup through existing prison paths; no duplicate custody loop.',
    writes: ['human.warCaptive', 'human.prisonBuildingId', 'raidPrisonerHistory', 'rivalSettlements.population', 'building.occupants (through prison owner)', 'eventLog (through logEvent)'],
    scheduledFrom: 'frontierCombat.ts → captureRaidPrisoners; simWorker/commands.ts → resolveWarPrisoner; prison escape/removal owners → departWarPrisoner',
    testFile: 'tests/warfare.lifecycle.test.ts',
  },
  raidTerminalPresentation: {
    owner: 'raidTerminalReport.ts — buildRaidTerminalReport (pure read-only projection); components/WarfareStatus.tsx and components/RazeConfirmation.tsx own display only',
    cadence: 'on-demand',
    cadenceNote: 'Only derived for a genuinely destroyed settlement; one bounded scan of retained Chronicle events and one player-entity scan per report render. No tick, scheduler, RNG, state changes or additional save fields.',
    writes: [],
    scheduledFrom: 'components/WarfareStatus.tsx → buildRaidTerminalReport when raidRecovery.status is destroyed; App.tsx → RazeConfirmation for an existing pending raid',
    testFile: 'tests/raidTerminalReport.test.ts',
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
    scheduledFrom: 'GameWorkerHost command channel; main-thread fallback in gameLoop',
    testFile: 'tests/commands.validation.test.ts, tests/workerCommand.roundtrip.test.ts',
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
  testFile: 'tests/strategicWorldMap.projection.test.ts, tests/strategicWorldMap.windowLayout.test.ts',
} as const;

/** All declared decision keys as a typed array. */
export const DECISION_KEYS = Object.keys(SIMULATION_DECISIONS) as DecisionKey[];

// TEST & VERIFICATION UTILITIES

/** Retrieves decision metadata by subsystem key. */
export function getDecisionOwner(key: DecisionKey): DecisionOwner {
  const decision = SIMULATION_DECISIONS[key];
  if (!decision) {
    throw new Error(`Unknown decision key: ${key}`);
  }
  return decision;
}

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
