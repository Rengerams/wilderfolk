/**
 * Simulation Decision Registry — SIMULATION_AUTHORITY.md §3 Ownership Law
 *
 * One entry per major gameplay decision declaring:
 * 1. The authoritative owner module and entry functions
 * 2. The cadence on which it executes
 * 3. The state fields it is permitted to write
 * 4. The scheduler entry point (tick layer or command channel)
 * 5. Associated unit and invariant test files
 *
 * This is a static table used by test runners and architecture linters
 * to enforce mutation boundaries.
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
  | 'careerHistory'
  | 'careerProgression'
  | 'workerFit'
  | 'humanPhysiology'
  | 'humanMeals'
  | 'workSchedule'
  | 'school'
  | 'workforce'
  | 'housing'
  | 'construction'
  | 'production'
  | 'villageRequests'
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
    owner: 'virtualPlayer.ts — decideVirtualPlayerAction, decideFood, decideUnstaffedFoodProducer, firstUnstaffedFoodProducer, wantedFoodProducerCount, chooseRefugeeChoice, isMeasuredFoodDeficit (read-only policy proposals)',
    cadence: 'on-demand',
    cadenceNote: 'Once per in-game hour when auto-play is enabled; may propose a survival workforce preset, food producer build or release of a nonessential automatically staffed worker under a measured deficit. Actual world writes remain with command and workforce owners. The headless scenario command adapter hydrates runtime caches if it adopts a cloned WorldState into the existing shell.',
    writes: [],
    scheduledFrom: 'useVirtualPlayer.shouldVirtualPlayerAct → virtualPlayer.decideVirtualPlayerAction → GameLoop.applyCommand or scripts/colonyHealth.applyColonyBotAction',
    testFile: 'tests/virtualPlayer.test.ts, tests/virtualPlayerHealthVerdict.test.ts, tests/colonyBotCacheHydration.test.ts',
  },
  workerMotionPresentation: {
    owner: 'gameLoop.ts — isLightweightWorkerCommand, canPreviewWorkerCommand, registerWorkerHandlers, frameBody, stepFallbackTick, applyCommand, rebuildOptimisticDisplay, exportAuthoritativeWorld, lastExportWasDegraded; scheduleFeedback.ts — getScheduleImpactPreview (read-only)',
    cadence: 'render',
    cadenceNote: 'Worker message admission awaits the shared census-name gate. Failed fallback ticks retain accumulator time; buffer pooling and delta packing remain transport-only, and display caches are hydrated once. On acknowledged ticks, blend only confirmed positions. Top-level schedule/policy commands use shallow previews and skip unnecessary catalog rebuilding unless a tick completed while commands were pending; the next acknowledgement reconciles entities and stale selections. Read-only schedule impact indexes roster IDs once per render. On save, halt new ticks while earlier commands settle. No gameplay writes.',
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
    owner: 'personality/traitEvaluation.ts — evaluateTraitInfluence, the single pure entry point: bounded factor/tendency for ordinary contexts and a typed exact result for the six discrete contexts; personality/traitEffectCatalog.ts owns TRAIT_EFFECTS (including the legacyExact entries) and the derived TRAIT_OPPOSITIONS',
    cadence: 'on-demand',
    cadenceNote: 'Pure data projection with no tick, no scheduler, no RNG and no mutation authority. The fourteen DNA ids are typed only in settlerTraits.ts; gameTypes.ts imports that type without a reciprocal dependency, and the effect catalog consumes that canonical identity. Phase B consumes the bounded factor directly at existing owners: the crew multiplier (skills.ts, production and builder/construction contexts), the school-day credit and research multiplier (education.ts), the apprenticeship training credit (apprenticeships.ts), the per-soldier militia defence factor (militiaBalance.ts), the danger sites — hunt reach and closing speed (humanHuntingBehavior.ts) and flight speed (humanTick.ts) — and the player work drain (humanPhysiology.ts, physiology/labor); each site applies the returned factor alone inside the new-effect cap. Phase C calls the same function once per decision on a discrete context and reads only the catalog value it returns: social/courtshipProgress ordered factors (humanTick.ts), family/conception multiplier (humanRelationships.ts), social/workplaceBanter chance override (socialLife.ts), family/spousalBereavement duration (humanLifecycleCleanup.ts), civic/communityReaction voices (warPrisoners.ts) and social/feudClash count (relationships.ts). No legacy DNA multiplier survives beside either mode.',
    writes: [],
    scheduledFrom: 'On-demand direct caller: skills.getWorkerSkillMultiplier (called by dailyBuildingEconomy production and construction and by workshopEconomy), education.creditChildSchoolDay / getEducationResearchMultiplier, apprenticeships.teach, militiaBalance.computeMilitiaBreakdown (danger/defense per mustered soldier), humanHuntingBehavior.tickHumanHunting (hunt reach and pursuit contexts), humanTick.tickHumans (flee and courtship branches), humanPhysiology.advanceHumanNeeds (labor drain), humanRelationships.tryDailyConception, socialLife.tryWorkplaceBanter, humanLifecycleCleanup.finalizeHumanDeath, warPrisoners.applyWarCommunityReaction, relationships.advanceSocialRelationships, careers.workerFit.evaluateWorkerFit (pure on-demand projection in workforce exact ties and in the selected-settler inspector job fit)',
    testFile: 'tests/personality.legacyConsumerAudit.test.ts, tests/personality.traitCatalog.test.ts, tests/personality.traitEvaluation.test.ts, tests/personality.workIntegration.test.ts, tests/personality.educationIntegration.test.ts, tests/personality.defenseIntegration.test.ts, tests/personality.captiveEnergyIntegration.test.ts, tests/personality.physiologyIntegration.test.ts, tests/personality.legacyDNA.test.ts, tests/personality.romanceContext.test.ts, tests/personality.socialCompatibility.test.ts, tests/personality.familyContext.test.ts, tests/personality.civicContext.test.ts',
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
    owner: 'careers/workerFit.ts — evaluateWorkerFit pure optional experienced-worker and DNA projection',
    cadence: 'on-demand',
    cadenceNote: 'No state writes, no extra assignment pass; only compared for precisely tied eligibility, squared commute and skill in workforce.assignWorkerInPlace.',
    writes: [],
    scheduledFrom: 'workforce.assignWorkerInPlace — already-visited eligible idle candidates when proximity and skill tie',
    testFile: 'tests/careers.workerFit.test.ts',
  },
  humanPhysiology: {
    owner: 'simulation/humanPhysiology.ts — initialHumanNeeds, normalizeHumanNeeds, advanceHumanNeeds, resolveHumanNeedsIntent, getHumanNeedsWorkMultiplier, hasFatalStarvation, creditHumanNutritionFromFood, adjustHumanStaminaFromEnergy, getHumanStaminaRatio, rebaseHumanNeedsClockAfterFormRestore, hasNearbyWell',
    cadence: 'realtime',
    cadenceNote: 'Player humans advance once per tick before offscreen throttling. Creation, load migration and form restoration initialize or restore saved needs. Resolve intent and work effects as read-only queries. The legacy human energy field is a one-way stamina projection. The sole seven-hour-night recovery rate is shared by rest and stamina, and humanTick.observeHumanSleep observes eligible homes, hotels, wards, cells and lover visits before the single physiology write. Sleep requires a confirmed indoor arrival from the movement owner: humanMovement.homeStandPosition targets outside the housing footprint, with home leisure using the same porch; this decision does not own navigation. Work-shift stamina loss is divided by the catalog physiology/labor factor, so endurance DNA reaches the player work drain; walking keeps its base drain.',
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
    testFile: 'tests/humanNeeds.calibration.test.ts, tests/humanNeeds.mealRule.test.ts, tests/humanNeeds.restAndWell.test.ts, tests/settlers.indoors.test.ts, tests/homeEntry.geometry.test.ts',
  },
  humanMeals: {
    owner: 'simulation/humanNeeds.ts — canEatColonyMeal, tryEatColonyMeal, killFromStarvation, fract, freeHuntFoodGain',
    cadence: 'realtime',
    cadenceNote: 'Only tryEatColonyMeal debits the colony food ledger. Successful player meals delegate nutrition credit to humanPhysiology; foreign captives consume at most one ledger-debited 08:00 ration per calendar day; the persisted custody stamp prevents duplicate charges across calls and reload without creating stamina or energy needs. Free hunting invokes the yield helper. Death actions are delegated to the existing human lifecycle/death owner. Foreign captive metabolism and exhaustion deaths are retired: prisoners do not work or roam. Player settlers read the catalog labor factor in humanPhysiology on their own needs state, never this one.',
    writes: [
      'resources.food',
      'economyLedger.consumed.meals',
      'human.needs.lastMealTick',
      'human.warCaptive.lastRationDay',
      'human.alive (via delegated death action)',
    ],
    scheduledFrom: 'humanTick.ts → tryEatColonyMeal / killFromStarvation; workAbsence.ts → canEatColonyMeal; humanHuntingBehavior.ts → freeHuntFoodGain',
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
    owner: 'workforce.ts — assignWorkerInPlace, transferWorkerBetweenBuildings, assignBuilderInPlace, assignMissingWorkers, syncJobBuildingOccupants, prepareWorkforce, releasePrisoners; priority order: workforcePolicy.ts; player-command entry: buildingActionRouting.assignIdleWorkerToBuilding',
    cadence: 'assignment',
    cadenceNote: 'The idle-only assignWorkerInPlace choice preserves commute eligibility, squared distance, existing skill and first-encountered stability; optional career/DNA fit breaks only exact ties and never changes transfer/rebalance/cooldown. Command/assignment phase; auto-staff pulses 4×/day via tickLayerAssign, plus two extra assignMissingWorkers calls per day from dailyBuildingEconomy (already a no-op once staffed). releasePrisoners is NOT assignment-cadenced: it runs every realtime tick from tickLayerRealtime (O(state.entities)); only its assignMissingResidences/assignMissingWorkers tail is gated behind the `released` flag',
    writes: [
      'building.occupants',
      'human.workerBuildingId',
      'human.occupation',
      'human.job',
      'human.skills',
      'workforcePolicy',
    ],
    scheduledFrom: 'tickLayerAssign.assignMissingWorkers; tickLayerRealtime.releasePrisoners; commands.ts "assignWorker" and "autoStaffWorkers" (owned world in place, isolated calls copied); buildingStaffingActions on place/recruit/death',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/autoStaff.notify.test.ts, tests/commands.validation.test.ts',
  },
  housing: {
    owner: 'housingPipeline.ts — assignMissingResidences runs the single decision pipeline (HOUSING_PHASE_ORDER: leader, integrity, guardianship, capacity, homeless, adult-child, commute) over one HousingLedger, planRelocation answers move-or-stay for homeless, custody, custodian, capacity, surplus, leave-home, commute and couple, and applyRelocation writes a plan; manor seating is event-driven (start/election) and never a housing-phase decision; relocateHousehold applies a whole-household decision; relocateFamily retries a destination the writer refused with the next-best home; moveResident stays the sole write; HousingReport carries the run stats; assignMissingResidences accepts an optional resume ledger; ranking lives in the same module; facts: housingModel.ts; immediate player entry: buildingResidencyActions.assignResidentToBuilding',
    cadence: 'assignment',
    cadenceNote: 'Scheduled housing sweeps run four times per day; demolition reconciles displaced households immediately using the bounded tick sweep, while removals without displaced residents skip the housing pipeline; other events request immediate reconciliation or a reasoned residence transition. assignMissingResidences schedules; planRelocation answers move-or-stay for each household and applyRelocation writes; the capacity rebalance plans through it too, and the homeless repair pass still seats every partially housed unit. A mandatory phase settles a household for the run, so the optional adult-child and commute phases cannot undo it. Reconciliation owns reference and resident-roster writes; selection and leader entitlement provide rules. Worker transport applies authoritative snapshots, never new housing decisions.',
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
    cadenceNote: 'system/daily at 18:00, after the work window — the per-player-worker pass prefers verified on-post ticks (schedulePresentTicksToday) and the site actually worked; a changed site (-1) is excluded rather than guessed, and scheduled hours are the fallback only when no presence sample exists. Farms/hunt/smith production and spoilage are daily ledger work. Day-interval producers are additionally gated on isWorkDay, so they run 5 days in 7; the 2/3/5-day interval buildings (store, market, workshop, townHall, hospital) skip that work-day test. Silos are storage-only. The crew\'s trade DNA (personality traitInfluence, `work`/production context) enters through getWorkerSkillMultiplier, which reads `building.occupants` only; the workshop estimate reads the same function so the preview cannot drift. An occupant id that resolves to nobody contributes neutral DNA to that average instead of diluting it',
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
    scheduledFrom: 'dailyWorldEvents.ts (tickVisitorGroups then tickVillageRequests), reached from tickLayerDaily.ts; commands.ts "resolveVillageRequest" → groupEvents.resolveVillageRequest',
    testFile: 'tests/villageRequests.test.ts, tests/workerCommand.roundtrip.test.ts, tests/gameWorker.transport.test.ts',
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
    cadenceNote: 'authority declares staggered/daily — tryst PROGRESS advances every realtime tick (affairProgress += rate * PER_TICK_RATE_SCALE, no stagger); establishment/gossip/scandal roll on the daily gate; caught-in-act exposure can fire from realtime proximity checks; getAffairTrystBuilding selects only an available home of either lover when nearby; otherwise affairs remain outdoors; partner order never changes site selection; recordAffairTrystSite records an indoor location only when both lovers actually entered it; the before-shift hour is not affair time',
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
    scheduledFrom: 'humanTick.ts tickHumans → one daily lover-specific waking-hour gate for tryDailyAffairEncounter and tryDailyAffairGossip; realtime meeting/progress and caught-in-act proximity, with shared tryst site read-only in humanRelationships.getAffairTrystBuilding',
    testFile: 'tests/phase7.social.test.ts, tests/electionGossip.dedup.test.ts, tests/affairTrystSite.walkIn.test.ts, tests/settlers.indoors.test.ts',
  },
  conception: {
    owner: 'humanRelationships.ts — tryDailyConception (ONLY conception owner)',
    cadence: 'new-calendar-day',
    cadenceNote: 'One roll per settler per colony day through salted personDayRoll; married-near, youth-pair and affair trysts use separate salts. The youth route follows the retained youth link: while one partner is 18 and the other is still a minor it may conceive in either direction; once both are 18 (or the older is beyond 18) the route closes and the handoff/adult path applies.',
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
    owner: 'humanLifecycle.ts — tickPregnancyAndBirth (ONLY birth owner; never starts a second pregnancy path)',
    cadence: 'pregnancy-progress',
    writes: [
      'human.pregnancyProgress',
      'human.pregnant/pregnantById/pregnancyDueProgress/pregnancyFromYouthLove (cleared at birth)',
      'human.childrenIds',
      'new child entity',
      'eventLog/bigNews/floatingTexts',
    ],
    scheduledFrom: 'humanTick.ts pregnancy gate → humanLifecycle',
    testFile: 'tests/humanLifecycle.test.ts, tests/conceptionEvent.labelling.test.ts',
  },
  moonHowler: {
    owner: 'moonHowler.ts + moonHowlerForm.ts — tickMoonHowlerCycle, curseMoonHowler, transformToWerewolfForm, revertToHumanForm, cureMoonHowler, finalizeMoonHowlerDeath, isSettlerRelationshipEntity',
    cadence: 'full-moon-event',
    writes: [
      'human.moonHowlerCursed',
      'human.moonHowlerSaved',
      'entity.type (Human ↔ Werewolf)',
      'building.occupants during transform/restore',
      'eventLog/title (Moonslayer)',
    ],
    scheduledFrom: 'tickLayerRealtime.ts → tickMoonHowlerCycle (gated internally to full-moon ticks)',
    testFile: 'tests/moonHowler.test.ts, tests/low-3-moon-lifecycle.test.ts, tests/medium-persistence.test.ts',
  },
  leadership: {
    owner: 'leaderHouse.ts — syncLeaderHouseResidency (the housing pipeline\'s `leader` phase, decided through relocateHousehold), applyLeaderOccupation; election: villageLeadership.ts (villageLeaderId, selectElectionGossip, tickElectionGossip); ceremony attendance: villageLeadership.ts (isCeremonyAttendee, getElectionGatherTarget — read-only)',
    cadence: 'daily',
    cadenceNote: 'authority declares daily/idempotent — residency reconciliation is idempotent per day; applyLeaderOccupation preserves a valid leader workplace (only repairs stale), per 2026-08-20 decision',
    writes: [
      'human.occupation',
      'human.job',
      'human.workerBuildingId (stale-repair only)',
      'building.occupants (stale leader assignment only)',
      'villageLeaderId',
      'leaderSinceYear',
      'electionCeremony',
      'eventLog',
    ],
    scheduledFrom: 'tickLayerDaily.ts → syncLeaderHouseResidency; villageLeadership election flow',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/villageLeadership.test.ts, tests/medium-N5-electionGatherSlot.test.ts',
  },
  raidCombat: {
    owner: 'frontierCombat.ts — queueRaidDefense, tickPendingRaidEvents, tickPendingOutgoingRaidEvents, resolveIncomingRaidInPlace, resolveOutgoingRaidCombat, persistBattleAftermath, resolveRaidVictory',
    cadence: 'realtime',
    cadenceNote: 'Incoming and outgoing battles progress on game ticks across six game hours. Raid dispatch, responses and settlement-fate choices also enter through player commands; treaties may be broken at a reputation cost, extermination kills every remaining inhabitant, and events are written through the ordinary Chronicle owner.',
    writes: ['pendingRaidEvents', 'pendingOutgoingRaidEvents', 'pendingRaidVictories', 'raidBattleReports', 'scoredRaidIds', 'human.raidDeploymentId', 'human.battleLeadershipMerit', 'rivalSettlements', 'resources (through economy owner)', 'eventLog (through logEvent)'],
    scheduledFrom: 'gameTick.ts → tickPendingRaidEvents/tickPendingOutgoingRaidEvents; simWorker/commands.ts → raid and victory commands',
    testFile: 'tests/warfare.lifecycle.test.ts, tests/raidChronicle.lifecycle.test.ts, tests/raidDeadline.owner.test.ts',
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
    cadenceNote: 'Worker-owned building upgrades mutate the authoritative world without cloning it; isolated calls retain copy semantics. main-thread fallback must use the same domain implementation (gameLoop); demolition cleans references immediately, reconciles displaced households only, and triggers full workforce staffing only when staff or crews are displaced; gameLoop does not replay an unconfirmed command after its worker reports a command fault, but preserves later queued requests',
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

/** Selected-settler inspector: read-only render of saved DNA and career records, no tick or writer. */
export const PERSONALITY_CAREER_INSPECTOR_PRESENTATION = {
  owner: 'PersonalityCareerDetails.tsx — PersonalityCareerDetails; renders TRAIT_DEFS/TRAIT_EFFECTS wording, evaluateWorkerFit advisory reasons and saved careerHistory/careerMilestones',
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

// ==========================================
// TEST & VERIFICATION UTILITIES
// ==========================================

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

/** Checks whether a specific property write is declared by a given subsystem.
 * Only exact field names match. A shorthand `job` may match `human.job`,
 * but `id` must never match `residenceBuildingId` or `villageLeaderId`.
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
