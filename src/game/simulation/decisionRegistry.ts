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
    owner: 'workforce.ts — assignWorkerInPlace, transferWorkerBetweenBuildings, assignBuilderInPlace, assignMissingWorkers, syncJobBuildingOccupants, prepareWorkforce, releasePrisoners; priority order: workforcePolicy.ts; player-command entry: buildingActions.assignIdleWorkerToBuilding',
    cadence: 'assignment',
    cadenceNote: 'command/assignment phase; auto-staff pulses 4×/day via tickLayerAssign, plus two extra assignMissingWorkers calls per day from dailyBuildingEconomy (already a no-op once staffed). releasePrisoners is NOT assignment-cadenced: it runs every realtime tick from tickLayerRealtime (O(state.entities)); only its assignMissingResidences/assignMissingWorkers tail is gated behind the `released` flag',
    writes: [
      'building.occupants',
      'human.homeBuildingId',
      'human.occupation',
      'human.job',
      'human.skills',
      'workforcePolicy',
    ],
    scheduledFrom: 'tickLayerAssign.assignMissingWorkers; tickLayerRealtime.releasePrisoners; commands.ts "assignWorker"; buildingActions on place/recruit/death',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/autoStaff.notify.test.ts, tests/commands.validation.test.ts',
  },
  housing: {
    owner: 'residency/ — residencyReconciliation.ts (assignMissingResidences, syncResidenceOccupants), residencySelection.ts, residenceActions.ts; immediate player entry: residenceActions.assignResidentToBuilding',
    cadence: 'assignment',
    cadenceNote: 'tickLayerAssign pulses 4×/day for the assignment pass, BUT the residence mirror is re-synced every tick: gameTick calls syncResidenceOccupants(allAlive, buildings) at the tick boundary (72×/day) because residenceBuildingId has realtime writers, and tickLayerRealtime does the same on a howler night. Immediate on place/recruit/death; delegated writes on divorce/arrest (humanRelationships), demolish (buildingActions), birth (humanLifecycle), leader move (leaderHouse), moon transform/restore (moonHowler), worker authoritative apply (simBuffers/applyKinematics)',
    writes: [
      'human.residenceBuildingId',
      'residence building.occupants',
      'household membership (couple + minor children)',
    ],
    scheduledFrom: 'gameTick tick boundary + tickLayerAssign.syncResidenceOccupants (mirror); tickLayerAssign.assignMissingResidences (assignment); commands.ts "assignResidentToBuilding"',
    testFile: 'tests/simulation.invariants.test.ts (residence occupants consistency), tests/church.manualStaffing.test.ts (residence cleanup on removal)',
  },
  construction: {
    owner: 'buildingActions.assignBuilderToBuilding + workforce.assignBuilderInPlace (crew membership); tickLayerDaily.tickBuildingProgress (progress advance)',
    cadence: 'work',
    cadenceNote: 'progress advances once per colony day in tickLayerDaily; crew membership changes on command/assignment phase',
    writes: [
      'building.constructionProgress',
      'building.occupants (construction crew)',
      'building.buildAnimTimer',
    ],
    scheduledFrom: 'tickLayerDaily.tickBuildingProgress (progress); assign layer + commands (crew membership)',
    testFile: 'tests/commands.validation.test.ts, tests/demolish.roundtrip.test.ts',
  },
  production: {
    owner: 'tickLayerDaily.tickBuildingProduction; economy.ts — addResource, applyFoodSpoilage, updateStorageCaps, computeStorageMax',
    cadence: 'daily',
    cadenceNote: 'system/daily — farms/hunt/smith production and spoilage are daily ledger work. Day-interval producers are additionally gated on isWorkDay, so they run 5 days in 7; the 2/3/5-day interval buildings (store, market, workshop, silo, townHall, hospital) skip that work-day test',
    writes: [
      'resources',
      'economyLedger.produced',
      'foodSpoilageRate',
      'human.skills (gainSkill)',
      'storageMax',
    ],
    scheduledFrom: 'tickLayerDaily',
    testFile: 'tests/economyAudit.storageCaps.test.ts, tests/dayCycle.tavern.test.ts',
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
    testFile: 'tests/phase7.social.test.ts, tests/school.gossip.test.ts, tests/humanChat.ambientPairing.test.ts',
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
      'human.pregnant/pregnantById/pregnancyDueProgress (cleared at birth)',
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
    testFile: 'tests/moonHowler.byTypeReuse.test.ts, tests/moonHowler.cureWindow.test.ts, tests/moonHowler.exorcism.test.ts',
  },
  leadership: {
    owner: 'leaderHouse.ts — syncLeaderHouseResidency, applyLeaderOccupation; election: villageLeadership.ts (villageLeaderId)',
    cadence: 'daily',
    cadenceNote: 'authority declares daily/idempotent — residency reconciliation is idempotent per day; applyLeaderOccupation preserves a valid leader workplace (only repairs stale), per 2026-08-20 decision',
    writes: [
      'human.residenceBuildingId (household)',
      'human.occupation',
      'human.job',
      'human.homeBuildingId (stale-repair only)',
      'building.occupants (stale leader assignment only)',
      'villageLeaderId',
      'leaderSinceYear',
      'electionCeremony',
      'eventLog',
    ],
    scheduledFrom: 'tickLayerDaily.ts → syncLeaderHouseResidency; villageLeadership election flow',
    testFile: 'tests/leaderHouse.workforce.test.ts, tests/villageLeadership.actingHead.test.ts, tests/villageLeadership.titlePoints.test.ts',
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

/** Checks whether a specific property write is declared by a given subsystem. */
export function isPropertyWritePermitted(key: DecisionKey, fieldName: string): boolean {
  const decision = SIMULATION_DECISIONS[key];
  if (!decision) return false;

  // Normalize away common scoping prefixes like "entity.", "human.", "building."
  const cleanField = fieldName.replace(/^(entity|human|building|residence)\./i, '').toLowerCase().trim();

  return decision.writes.some((permitted) => {
    const cleanPermitted = permitted.replace(/^(entity|human|building|residence)\./i, '').toLowerCase().trim();
    return (
      cleanPermitted.includes(cleanField) ||
      cleanField.includes(cleanPermitted) ||
      permitted.toLowerCase().includes(cleanField)
    );
  });
}