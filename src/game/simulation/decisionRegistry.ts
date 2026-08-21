/**
 * Simulation decision registry — SIMULATION_AUTHORITY.md §3 ownership law.
 *
 * One row per major gameplay decision: the authoritative owner module, the
 * cadence it runs on, the state fields it may write, where it is scheduled
 * from, and the tests that cover it. Every decision has exactly one owner.
 *
 * This is a STATIC table, not a manager or event bus. Nothing imports it at
 * runtime; tests and future change records use it as the source of truth for
 * "who owns this decision". Update it only together with
 * SIMULATION_AUTHORITY.md when an ownership row changes.
 *
 * The cadence tokens mirror the authority document: assignment, work, daily,
 * staggered-social, new-calendar-day, pregnancy-progress, full-moon-event,
 * player-command. A compound cadence in the authority table ("Staggered/daily",
 * "System/daily") is recorded as its primary cadence with a `cadenceNote`.
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
] as const;

export type DecisionCadence = (typeof DECISION_CADENCES)[number];

export interface DecisionOwner {
  /** Authoritative owner module + entry function(s). */
  owner: string;
  /** Primary cadence (authority §4). Secondary cadence in `cadenceNote`. */
  cadence: DecisionCadence;
  /** When the authority declares a compound cadence, the secondary part. */
  cadenceNote?: string;
  /** State fields this owner may write. Never gameplay fields of another owner. */
  writes: readonly string[];
  /** Where the decision is scheduled from (tick layer / command boundary). */
  scheduledFrom: string;
  /** Test files covering the decision. */
  testFile: string;
}

/**
 * Stable decision keys. The test suite asserts this exact set — adding a new
 * major decision requires an authority update first, then a row here.
 */
export type DecisionKey =
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
  | 'commands';

export const SIMULATION_DECISIONS = {
  workforce: {
    owner: 'workforce.ts — assignWorkerInPlace, transferWorkerBetweenBuildings, assignBuilderInPlace, assignMissingWorkers, syncJobBuildingOccupants, prepareWorkforce, releasePrisoners; player-command entry: buildingActions.assignIdleWorkerToBuilding',
    cadence: 'assignment',
    cadenceNote: 'command/assignment phase; auto-staff pulses 4×/day via tickLayerAssign',
    writes: ['building.occupants', 'human.homeBuildingId', 'human.occupation', 'human.job', 'human.skills'],
    scheduledFrom: 'tickLayerAssign.assignMissingWorkers; commands.ts "assignWorker"; buildingActions on place/recruit/death',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/autoStaff.notify.test.ts, tests/commands.validation.test.ts',
  },
  housing: {
    owner: 'dayCycle.ts — assignMissingResidences, syncResidenceOccupants, syncPartnerResidence, reassignResidencesOnDeath; immediate player entry: buildingActions.assignResidentToBuilding',
    cadence: 'assignment',
    cadenceNote: 'tickLayerAssign pulses 4×/day; immediate on place/recruit/death; delegated writes on divorce/arrest (humanRelationships), demolish (buildingActions), birth (humanLifecycle), leader move (leaderHouse), moon transform/restore (moonHowler), worker authoritative apply (simBuffers/applyKinematics)',
    writes: ['human.residenceBuildingId', 'residence building.occupants', 'household membership (couple + minor children)'],
    scheduledFrom: 'tickLayerAssign.syncResidenceOccupants + assignMissingResidences; commands.ts "assignResidentToBuilding"',
    testFile: 'tests/simulation.invariants.test.ts (residence occupants consistency), tests/church.manualStaffing.test.ts (residence cleanup on removal)',
  },
  construction: {
    owner: 'buildingActions.assignBuilderToBuilding + workforce.assignBuilderInPlace (crew membership); tickLayerDaily.tickBuildingProgress (progress advance)',
    cadence: 'work',
    cadenceNote: 'progress advances once per colony day in tickLayerDaily; crew membership changes on command/assignment phase',
    writes: ['building.constructionProgress', 'building.occupants (construction crew)', 'building.buildAnimTimer'],
    scheduledFrom: 'tickLayerDaily.tickBuildingProgress (progress); assign layer + commands (crew membership)',
    testFile: 'tests/commands.validation.test.ts (demolition/construction command coverage to be extended in Objective 7)',
  },
  production: {
    owner: 'tickLayerDaily.tickBuildingProduction; economy.ts — addResource, applyFoodSpoilage, updateStorageCaps',
    cadence: 'daily',
    cadenceNote: 'system/daily — farms/hunt/smith production and spoilage are daily ledger work',
    writes: ['resources', 'economyLedger.produced', 'foodSpoilageRate', 'human.skills (gainSkill)', 'storageMax'],
    scheduledFrom: 'tickLayerDaily',
    testFile: 'tests/economyAudit.storageCaps.test.ts, tests/dayCycle.tavern.test.ts',
  },
  villageRequests: {
    owner: 'groupEvents.ts — tickVillageRequests, resolveVillageRequest (ONLY request generation, expiry, and resolution owner)',
    cadence: 'new-calendar-day',
    cadenceNote: 'daily generation/expiry; typed player-command delegates into the same owner through commands.ts',
    writes: ['activeVillageRequest', 'villageRequestCooldownUntilDay', 'villageRequestHistory', 'documented resources/reputation effects', 'source visitor-group counters', 'eventLog/bigNews/floatingTexts'],
    scheduledFrom: 'tickLayerDaily.ts after tickVisitorGroups; commands.ts "resolveVillageRequest" → groupEvents.resolveVillageRequest',
    testFile: 'tests/villageRequests.test.ts, tests/workerCommand.roundtrip.test.ts, tests/gameWorker.transport.test.ts',
  },
  socialFeedback: {
    owner: 'humanSocial.ts — simSettlerChat, simSettlerPairChat, simAmbientChatNeighbors',
    cadence: 'staggered-social',
    writes: ['human.chatPhrase', 'human.chatTicks', 'human.chatPartnerId', 'human.chatDialogueSessionKey', 'floatingTexts (hearts)', 'small courtship progress'],
    scheduledFrom: 'humanTick.ts realtime path (staggered social pulse, spatial-grid queries only)',
    testFile: 'tests/phase7.social.test.ts, tests/school.gossip.test.ts (social-feel coverage; Objective 9 hardening)',
  },
  courtship: {
    owner: 'humanRelationships.ts — findCourtshipPartner, isEligibleToCourt; progress advance executes from humanTick.ts staggered-social path',
    cadence: 'staggered-social',
    cadenceNote: 'authority declares social/daily; progress is staggered-social, marriage finalization runs on the same path',
    writes: ['human.courtshipPartnerId', 'human.courtshipProgress', 'human.relationshipStatus', 'human.partnerId'],
    scheduledFrom: 'humanTick.ts (staggered-social encounter path)',
    testFile: 'tests/phase7.social.test.ts',
  },
  affairs: {
    owner: 'humanRelationships.ts — recordAffairTrystSite, tryDailyAffairGossip, tryExposeCaughtAffairForPair, exposeAffair',
    cadence: 'new-calendar-day',
    cadenceNote: 'authority declares staggered/daily — tryst progress is staggered-social; establishment/gossip/scandal roll on the daily gate; caught-in-act exposure can fire from realtime proximity checks',
    writes: ['human.affairPartnerId', 'human.affairProgress', 'human.lastAffairSiteDay/X/Y', 'human.scandalCooldownUntilTick', 'prison fields on arrest', 'villageReputation'],
    scheduledFrom: 'humanTick.ts (isNewCalendarDay gate + realtime proximity encounters)',
    testFile: 'tests/phase7.social.test.ts, tests/electionGossip.dedup.test.ts',
  },
  conception: {
    owner: 'humanRelationships.ts — tryDailyConception (ONLY conception owner)',
    cadence: 'new-calendar-day',
    writes: ['human.pregnant', 'human.pregnantById', 'human.pregnancyProgress', 'human.pregnancyDueProgress', 'human.relationshipStatus (expecting)'],
    scheduledFrom: 'humanTick.ts (isNewCalendarDay gate)',
    testFile: 'tests/phase7.social.test.ts (conception eligibility golden test to be added)',
  },
  pregnancyBirth: {
    owner: 'humanLifecycle.ts — tickPregnancyAndBirth (ONLY birth owner; never starts a second pregnancy path)',
    cadence: 'pregnancy-progress',
    writes: ['human.pregnancyProgress', 'human.pregnant/pregnantById/pregnancyDueProgress (cleared at birth)', 'human.childrenIds', 'new child entity', 'eventLog/bigNews/floatingTexts'],
    scheduledFrom: 'humanTick.ts pregnancy gate → humanLifecycle',
    testFile: 'tests/phase678.regression.test.ts (birth/bastard coverage; Objective 8 adds birth counters)',
  },
  moonHowler: {
    owner: 'moonHowler.ts — tickMoonHowlerCycle, curseMoonHowler, transformToWerewolfForm, revertToHumanForm, cureMoonHowler, finalizeMoonHowlerDeath',
    cadence: 'full-moon-event',
    writes: ['human.moonHowlerCursed', 'human.moonHowlerSaved', 'entity.type (Human ↔ Werewolf)', 'building.occupants during transform/restore', 'eventLog/title (Moonslayer)'],
    scheduledFrom: 'tickLayerRealtime.ts → tickMoonHowlerCycle (gated internally to full-moon ticks)',
    testFile: 'tests/moonHowler.byTypeReuse.test.ts, tests/moonHowler.cureWindow.test.ts, tests/moonHowler.exorcism.test.ts',
  },
  leadership: {
    owner: 'leaderHouse.ts — syncLeaderHouseResidency, applyLeaderOccupation; election: villageLeadership.ts (villageLeaderId)',
    cadence: 'daily',
    cadenceNote: 'authority declares daily/idempotent — residency reconciliation is idempotent per day; applyLeaderOccupation preserves a valid leader workplace (only repairs stale), per 2026-08-20 decision',
    writes: ['human.residenceBuildingId (household)', 'human.occupation', 'human.job', 'human.homeBuildingId (stale-repair only)', 'building.occupants (stale leader assignment only)', 'villageLeaderId', 'leaderSinceYear', 'electionCeremony', 'eventLog'],
    scheduledFrom: 'tickLayerDaily.ts → syncLeaderHouseResidency; villageLeadership election flow',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/villageLeadership.actingHead.test.ts, tests/villageLeadership.titlePoints.test.ts',
  },
  commands: {
    owner: 'commands.ts (simWorker) → domain owner in buildingActions.ts (assignIdleWorkerToBuilding, repairBuilding, upgradeBuilding, demolishBuilding, setMineMode, workshop recipes, modes)',
    cadence: 'player-command',
    cadenceNote: 'main-thread fallback must use the same domain implementation (gameLoop)',
    writes: ['validated requested state transition (building/assignment/recipe/mode fields)'],
    scheduledFrom: 'GameWorkerHost command channel; main-thread fallback in gameLoop',
    testFile: 'tests/commands.validation.test.ts (round-trip tests to be added in Objective 6)',
  },
} as const satisfies Record<DecisionKey, DecisionOwner>;

/** Convenience: every declared decision key, for tests and change records. */
export const DECISION_KEYS = Object.keys(SIMULATION_DECISIONS) as DecisionKey[];
