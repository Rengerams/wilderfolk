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
  | 'traitInfluence'
  | 'humanPhysiology'
  | 'humanMeals'
  | 'workforce'
  | 'housing'
  | 'construction'
  | 'production'
  | 'villageRequests'
  | 'socialFeedback'
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
  traitInfluence: {
    owner: 'personality/traitEvaluation.ts — evaluateTraitInfluence, the single pure entry point: bounded factor/tendency for ordinary contexts and a typed exact result for the six discrete contexts; personality/traitEffectCatalog.ts owns TRAIT_EFFECTS (including the legacyExact entries) and the derived TRAIT_OPPOSITIONS',
    cadence: 'on-demand',
    cadenceNote: 'Pure data projection with no tick, no scheduler, no RNG and no mutation authority. Phase B consumes the bounded factor directly at existing owners: the crew multiplier (skills.ts, production and builder/construction contexts), the school-day credit and research multiplier (education.ts), the apprenticeship training credit (apprenticeships.ts), the per-soldier militia defence factor (militiaBalance.ts), the danger sites — hunt reach and closing speed (humanHuntingBehavior.ts) and flight speed (humanTick.ts) — and the player work drain (humanPhysiology.ts, physiology/labor); each site applies the returned factor alone inside the new-effect cap. Phase C calls the same function once per decision on a discrete context and reads only the catalog value it returns: social/courtshipProgress ordered factors (humanTick.ts), family/conception multiplier (humanRelationships.ts), social/workplaceBanter chance override (socialLife.ts), family/spousalBereavement duration (humanLifecycleCleanup.ts), civic/communityReaction voices (warPrisoners.ts) and social/feudClash count (relationships.ts). No legacy DNA multiplier survives beside either mode.',
    writes: [],
    scheduledFrom: 'On-demand direct caller: skills.getWorkerSkillMultiplier (called by dailyBuildingEconomy production and construction and by workshopEconomy), education.creditChildSchoolDay / getEducationResearchMultiplier, apprenticeships.teach, militiaBalance.computeMilitiaBreakdown (danger/defense per mustered soldier), humanHuntingBehavior.tickHumanHunting (hunt reach and pursuit contexts), humanTick.tickHumans (flee and courtship branches), humanPhysiology.advanceHumanNeeds (labor drain), humanRelationships.tryDailyConception, socialLife.coworkerBanter, humanLifecycleCleanup.finalizeHumanDeath, warPrisoners.applyWarCommunityReaction, relationships.advanceSocialRelationships',
    testFile: 'tests/personality.legacyConsumerAudit.test.ts, tests/personality.traitCatalog.test.ts, tests/personality.traitEvaluation.test.ts, tests/personality.workIntegration.test.ts, tests/personality.educationIntegration.test.ts, tests/personality.defenseIntegration.test.ts, tests/personality.captiveEnergyIntegration.test.ts, tests/personality.physiologyIntegration.test.ts, tests/personality.legacyDNA.test.ts, tests/personality.romanceContext.test.ts, tests/personality.socialCompatibility.test.ts, tests/personality.familyContext.test.ts, tests/personality.civicContext.test.ts',
  },
  humanPhysiology: {
    owner: 'simulation/humanPhysiology.ts — initialHumanNeeds, normalizeHumanNeeds, advanceHumanNeeds, resolveHumanNeedsIntent, getHumanNeedsWorkMultiplier, hasFatalStarvation, creditHumanNutritionFromFood, adjustHumanStaminaFromEnergy, rebaseHumanNeedsClockAfterFormRestore',
    cadence: 'realtime',
    cadenceNote: 'Player humans advance once per tick before offscreen throttling. Creation, load migration and form restoration initialize or restore saved needs. Resolve intent and work effects as read-only queries. The legacy human energy field is a one-way stamina projection. Work-shift stamina loss is divided by the catalog physiology/labor factor, so endurance DNA reaches the player work drain; walking keeps its base drain.',
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
    testFile: 'tests/humanNeeds.calibration.test.ts, tests/humanNeeds.mealRule.test.ts',
  },
  humanMeals: {
    owner: 'simulation/humanNeeds.ts — isMealCheckHour, canEatColonyMeal, tryEatColonyMeal, killForeignCaptiveFromExhaustion, killFromStarvation, fract, freeHuntFoodGain, humanEnergyLoss',
    cadence: 'realtime',
    cadenceNote: 'Only tryEatColonyMeal debits the colony food ledger. Successful player meals delegate nutrition credit to humanPhysiology; foreign captives retain legacy meal/energy semantics. Free hunting invokes the yield helper. Death actions are delegated to the existing human lifecycle/death owner. humanEnergyLoss is DNA-free: its base, cold, home and hospital terms are unchanged and no trait multiplies captive energy. Player settlers read the catalog labor factor in humanPhysiology on their own needs state, never this one.',
    writes: [
      'resources.food',
      'economyLedger.consumed.meals',
      'human.needs.lastMealTick',
      'foreignCaptive.energy',
      'human.alive (via delegated death action)',
    ],
    scheduledFrom: 'humanTick.ts → tryEatColonyMeal / killForeignCaptiveFromExhaustion / killFromStarvation; workAbsence.ts → canEatColonyMeal; humanHuntingBehavior.ts → freeHuntFoodGain',
    testFile: 'tests/humanNeeds.mealRule.test.ts, tests/humanNeeds.calibration.test.ts',
  },
  workforce: {
    owner: 'workforce.ts — assignWorkerInPlace, transferWorkerBetweenBuildings, assignBuilderInPlace, assignMissingWorkers, syncJobBuildingOccupants, prepareWorkforce, releasePrisoners; priority order: workforcePolicy.ts; player-command entry: buildingActions.assignIdleWorkerToBuilding',
    cadence: 'assignment',
    cadenceNote: 'command/assignment phase; auto-staff pulses 4×/day via tickLayerAssign, plus two extra assignMissingWorkers calls per day from dailyBuildingEconomy (already a no-op once staffed). releasePrisoners is NOT assignment-cadenced: it runs every realtime tick from tickLayerRealtime (O(state.entities)); only its assignMissingResidences/assignMissingWorkers tail is gated behind the `released` flag',
    writes: [
      'building.occupants',
      'human.workerBuildingId',
      'human.occupation',
      'human.job',
      'human.skills',
      'workforcePolicy',
    ],
    scheduledFrom: 'tickLayerAssign.assignMissingWorkers; tickLayerRealtime.releasePrisoners; commands.ts "assignWorker"; buildingActions on place/recruit/death',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/autoStaff.notify.test.ts, tests/commands.validation.test.ts',
  },
  housing: {
    owner: 'residencyReconciliation.ts — assignMissingResidences runs the single decision pipeline (HOUSING_PHASE_ORDER: leader, integrity, guardianship, capacity, homeless, adult-child, commute) over one HousingLedger, and relocateHousehold applies a whole-household decision; moveResident stays the sole write; pure selection: residencySelection.ts; immediate player entry: buildingResidencyActions.assignResidentToBuilding',
    cadence: 'assignment',
    cadenceNote: 'Scheduled housing sweeps run four times per day; events request immediate reconciliation or a reasoned residence transition. Only assignMissingResidences decides — the phase functions are its steps, never independently scheduled. A mandatory phase settles a household for the run, so the optional adult-child and commute phases cannot undo it. Reconciliation owns reference and resident-roster writes; selection and leader entitlement provide rules. Worker transport applies authoritative snapshots, never new housing decisions.',
    writes: [
      'human.residenceBuildingId',
      'residence building.occupants',
      'household membership (couple + minor children)',
    ],
    scheduledFrom: 'gameTick tick boundary + tickLayerAssign.syncResidenceOccupants (mirror); tickLayerAssign.assignMissingResidences (assignment); commands.ts "assignResidentToBuilding"',
    testFile: 'tests/simulation.invariants.test.ts (residence occupants consistency), tests/church.manualStaffing.test.ts (residence cleanup on removal), tests/longRunColony.integration.test.ts',
  },
  construction: {
    owner: 'buildingActions.assignBuilderToBuilding + workforce.assignBuilderInPlace (crew membership); tickLayerDaily.tickBuildingProgress (progress advance)',
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
    cadenceNote: 'system/daily — farms/hunt/smith production and spoilage are daily ledger work. Day-interval producers are additionally gated on isWorkDay, so they run 5 days in 7; the 2/3/5-day interval buildings (store, market, workshop, silo, townHall, hospital) skip that work-day test. The crew\'s trade DNA (personality traitInfluence, `work`/production context) enters through getWorkerSkillMultiplier, which reads `building.occupants` only; the workshop estimate reads the same function so the preview cannot drift. An occupant id that resolves to nobody contributes neutral DNA to that average instead of diluting it',
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
    owner: 'humanSocial.ts — simSettlerChat, simSettlerPairChat, simAmbientChatNeighbors',
    cadence: 'realtime',
    cadenceNote: 'only simAmbientChatNeighbors is staggered-social (it returns [] unless (tick + id) % SOCIAL_STAGGER === 0); simSettlerChat and simSettlerPairChat are called ungated every realtime tick from the humanTick path, each scaling its own chance by PER_TICK_RATE_SCALE where a per-tick rate is intended. The query is an ADAPTIVE spatial query — it falls back to a linear scan of the candidate array when the social grid is absent or the cost model rejects it, so "spatial-grid queries only" would be wrong',
    writes: [
      'human.chatPhrase',
      'human.chatTicks',
      'human.chatPartnerId',
      'human.chatDialogueSessionKey',
      'floatingTexts (hearts)',
      'small courtship progress',
    ],
    scheduledFrom: 'humanTick.ts realtime path (simAmbientChatNeighbors staggered; settler/pair chat per tick)',
    testFile: 'tests/phase7.social.test.ts, tests/school.test.ts, tests/humanChat.ambientPairing.test.ts',
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
    cadence: 'new-calendar-day',
    cadenceNote: 'authority declares staggered/daily — tryst PROGRESS advances every realtime tick (affairProgress += rate * PER_TICK_RATE_SCALE, no stagger); establishment/gossip/scandal roll on the daily gate; caught-in-act exposure can fire from realtime proximity checks',
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
    scheduledFrom: 'humanTick.ts (isNewCalendarDay gate) → humanRelationships.tryDailyAffairEncounter; realtime proximity for caught-in-act',
    testFile: 'tests/phase7.social.test.ts, tests/electionGossip.dedup.test.ts',
  },
  conception: {
    owner: 'humanRelationships.ts — tryDailyConception (ONLY conception owner)',
    cadence: 'new-calendar-day',
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
    testFile: 'tests/moonHowler.test.ts',
  },
  leadership: {
    owner: 'leaderHouse.ts — syncLeaderHouseResidency (the housing pipeline\'s `leader` phase, decided through relocateHousehold), applyLeaderOccupation; election: villageLeadership.ts (villageLeaderId)',
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
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/villageLeadership.test.ts',
  },
  raidCombat: {
    owner: 'frontierCombat.ts — queueRaidDefense, tickPendingRaidEvents, tickPendingOutgoingRaidEvents, resolveIncomingRaidInPlace, resolveOutgoingRaidCombat, persistBattleAftermath, resolveRaidVictory',
    cadence: 'realtime',
    cadenceNote: 'Incoming and outgoing battles progress on game ticks across six game hours. Raid dispatch, responses and settlement-fate choices also enter through player commands; events are written through the ordinary Chronicle owner.',
    writes: ['pendingRaidEvents', 'pendingOutgoingRaidEvents', 'pendingRaidVictories', 'raidBattleReports', 'scoredRaidIds', 'human.raidDeploymentId', 'human.battleLeadershipMerit', 'rivalSettlements', 'resources (through economy owner)', 'eventLog (through logEvent)'],
    scheduledFrom: 'gameTick.ts → tickPendingRaidEvents/tickPendingOutgoingRaidEvents; simWorker/commands.ts → raid and victory commands',
    testFile: 'tests/warfare.lifecycle.test.ts, tests/raidChronicle.lifecycle.test.ts',
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
    cadenceNote: 'Read-only map-cache prepass and budgeted chunk baking, not simulation ticks.',
    writes: [],
    scheduledFrom: 'renderer/terrain.ts → buildWhittakerFields on map cache change; bakeWhittakerGround for uncached ground chunks',
    testFile: 'tests/terrain.riverMaterials.test.ts',
  },
  commands: {
    owner: 'commands.ts (simWorker) → domain owner in buildingActions.ts (assignIdleWorkerToBuilding, repairBuilding, upgradeBuilding, demolishBuilding, setMineMode, workshop recipes, modes)',
    cadence: 'player-command',
    cadenceNote: 'main-thread fallback must use the same domain implementation (gameLoop)',
    writes: [
      'building.occupants',
      'building.level',
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
