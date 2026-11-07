import type { WorldState, Entity, Building } from '../gameTypes';
import { isStaticPropEntity } from '../gameTypes';
import { getWorkSchedule } from '../workSchedule';
import { getVenueSchedule } from '../venueSchedule';
import { getWorkforcePolicy, normalizeWorkforcePolicy } from '../workforcePolicy';
import { EVENT_LOG_MAX_ENTRIES } from '../eventLog';
import { HISTORY_FAMILIES, snapshotHistoryRevisions, type HistoryRevisions } from '../historyRevisions';
import { rebakeTerrainGrids, setTileOverride, takeTerrainPatches, type TerrainTilePatch } from '../terrain/terrainGrid';
import { bumpTerrainRevision } from '../terrainLayer';
import { snapshotSimRng, restoreSimRng, type SimRngSnapshot } from '../simRng';

export const SIM_DELTA_PROTO = 6;

/** Boundary guard for a delta that crossed the worker port; cheap enough to run before bookkeeping. */
export function isSimTickDelta(value: unknown): value is SimTickDelta {
  if (!value || typeof value !== 'object') return false;
  const delta = value as Partial<SimTickDelta>;
  return (
    delta.proto === SIM_DELTA_PROTO
    && typeof delta.tick === 'number'
    && Number.isFinite(delta.tick)
    && typeof delta.resources === 'object'
    && delta.resources !== null
    && typeof delta.storageMax === 'object'
    && delta.storageMax !== null
  );
}

/** Keep player-dismissed Big News across worker ticks (sim delta overwrites UI flags). */
export function preserveBigNewsDismissals(
  prev: WorldState['bigNews'],
  incoming: WorldState['bigNews'],
  dismissedIds?: readonly string[],
): WorldState['bigNews'] {
  const dismissed = new Set([
    ...prev.filter((n) => n.dismissed).map((n) => n.id),
    ...(dismissedIds ?? []),
  ]);
  if (dismissed.size === 0) return incoming;
  return incoming.filter((n) => !dismissed.has(n.id));
}

/** Keep player-dismissed active event banners across worker ticks. */
export function preserveActiveEventDismissal(
  incoming: WorldState['activeEvent'],
  dismissedIds?: readonly string[],
): WorldState['activeEvent'] {
  if (!incoming) return null;
  const hidden = new Set(dismissedIds ?? []);
  return hidden.has(incoming.id) ? null : incoming;
}

/** Keep player-dismissed toasts across worker ticks. */
export function preserveNotificationDismissals(
  incoming: WorldState['notifications'],
  dismissedIds: readonly string[] | undefined,
): WorldState['notifications'] {
  const hidden = new Set(dismissedIds ?? []);
  if (hidden.size === 0) return incoming;
  return incoming.filter((n) => !hidden.has(n.id));
}

/** Max event-log entries shipped per worker tick (overflow-safe). */
export const EVENT_LOG_DELTA_TAIL_MAX = 128;

/** JSON delta — UI + sim authority fields; kinematics travel in render SoA. */
export interface SimTickDelta {
  proto: typeof SIM_DELTA_PROTO;
  tick: number;
  year: number;
  dayInYear: number;
  season: WorldState['season'];
  weather: WorldState['weather'];
  weatherTimer: number;
  resources: WorldState['resources'];
  storageMax: WorldState['storageMax'];
  foodSpoilageRate: WorldState['foodSpoilageRate'];
  humanPopulation: number;
  maxHumanPopulation: number;
  workingSettlers: number;
  idleSettlers: number;
  villageHappiness?: number;
  villageCanHeat?: boolean;
  wildlifeCounts: WorldState['wildlifeCounts'];
  ecosystemHealth: number;
  pollutionLevel: number;
  pendingEcosystemHealthDelta?: number;
  pendingPollutionDelta?: number;
  biodiversityIndex: number;
  valleyStage: WorldState['valleyStage'];
  valleyStageSinceDay: number | undefined;
  valleyRawStressStreakDays: number | undefined;
  valleyRawCalmStreakDays: number | undefined;
  valleyLastStageNotifyDay: number | undefined;
  villageReputation: number;
  workSchedule: WorldState['workSchedule'];
  tavernSchedule: WorldState['tavernSchedule'];
  hotelSchedule: WorldState['hotelSchedule'];
  workforcePolicy: WorldState['workforcePolicy'];
  screenShakeImpulse: number;
  floatingTexts: WorldState['floatingTexts'];
  deathParticles: WorldState['deathParticles'];
  huntVisuals: WorldState['huntVisuals'];
  buildings?: Building[];
  changedBuildings?: Building[];
  removedBuildingIds?: number[];
  /** True when building geometry changed (or a building was removed), so caches must rebuild. */
  buildingGeometryChanged?: boolean;
  /** Tiles a command patched (ground reinforcement, forest clearing), applied to the replica map. */
  terrainPatches?: TerrainTilePatch[];
  aliveEntities: Entity[];
  /** Static decor added since the last delta; unchanged props stay on the replica. */
  staticEntities?: Entity[];
  /** Static decor ids removed from the world; the replica drops them. */
  removedStaticEntityIds?: number[];
  /** True when props are authoritative and omitted from `aliveEntities` (static channel active). */
  staticPropsResolved?: boolean;
  eventLogTail: WorldState['eventLog'];
  graveRecords?: WorldState['graveRecords'];
  genealogyRegistry?: WorldState['genealogyRegistry'];
  bigNews: WorldState['bigNews'];
  notifications: WorldState['notifications'];
  festival: WorldState['festival'];
  townHallFestivalCooldownUntilTick: number;
  visitorGroups: WorldState['visitorGroups'];
  activeVillageRequest: WorldState['activeVillageRequest'];
  villageRequestCooldownUntilDay: number;
  villageRequestHistory?: NonNullable<WorldState['villageRequestHistory']>;
  rivalSettlements: WorldState['rivalSettlements'];
  pendingRaidEvents: WorldState['pendingRaidEvents'];
  pendingOutgoingRaidEvents: WorldState['pendingOutgoingRaidEvents'];
  pendingRaidVictories?: WorldState['pendingRaidVictories'];
  raidBattleReports?: WorldState['raidBattleReports'];
  raidRecovery?: WorldState['raidRecovery'];
  scoredRaidIds?: WorldState['scoredRaidIds'];
  raidPrisonerHistory?: WorldState['raidPrisonerHistory'];
  pendingDiplomacyEvents: WorldState['pendingDiplomacyEvents'];
  villageLeaderId: number | null;
  leaderSinceYear: number;
  lastElectionYear: number;
  pendingElectionYear: number | null;
  electionBuildupNotifiedYear: number | null;
  electionCeremony: WorldState['electionCeremony'];
  spotlightLore: WorldState['spotlightLore'];
  spotlightLoreLastDay?: number;
  unlockedTechs: string[];
  researchNodes: WorldState['researchNodes'];
  researchProgress: number;
  activeResearch: string | null;
  challenges: WorldState['challenges'];
  tradeRoutes: WorldState['tradeRoutes'];
  disasters: WorldState['disasters'];
  villageForge: WorldState['villageForge'];
  populationHistory?: WorldState['populationHistory'];
  yearlyStats?: WorldState['yearlyStats'];
  lifetimeStats: WorldState['lifetimeStats'];
  eventsThisYear: string[];
  activeEvent: WorldState['activeEvent'];
  lastEventYear: number;
  bountifulHarvest: boolean;
  ecoHealthYearsAbove80: number;
  firstWeekVisitorSpawned: boolean;
  totalBuildingsCompleted: number;
  nextEntityId: number;
  nextBuildingId: number;
  nextFloatingTextId: number;
  renffrOmen: WorldState['renffrOmen'];
  visitorQuest: WorldState['visitorQuest'];
  deathsThisYear: WorldState['deathsThisYear'];
  lastMoonHowlerExorcismTick: WorldState['lastMoonHowlerExorcismTick'];
  moonHowlerPriestsFleeUntil: WorldState['moonHowlerPriestsFleeUntil'];
  chronicleChapters?: WorldState['chronicleChapters'];
  renffrChatterUntilTick: number;
  lastProcessedCalendarDay: number;
  lastWildlifeReplenishLogDay: number;
  storyFlags: WorldState['storyFlags'];
  pendingStoryEvents: NonNullable<WorldState['pendingStoryEvents']>;
  guidedCampaign: WorldState['guidedCampaign'];
  activeMigration?: WorldState['activeMigration'];
  migrationNextHerdSize?: WorldState['migrationNextHerdSize'];
  economyLedger?: WorldState['economyLedger'];
  foodHistory?: WorldState['foodHistory'];
  simRng?: SimRngSnapshot;
}

export type SimDeltaCloneMode = 'isolated' | 'transfer';

export interface ExtractSimTickDeltaOptions {
  cloneMode?: SimDeltaCloneMode;
  prevBuildings?: ReadonlyMap<number, string> | null;
  nextBuildings?: Map<number, string>;
  /** Geometry signature per building; whether it changed decides cache retention on the host. */
  prevBuildingGeometry?: ReadonlyMap<number, string> | null;
  nextBuildingGeometry?: Map<number, string>;
  prevHistoryRevisions?: HistoryRevisions | null;
  previousEventHeadId?: WorldState['eventLog'][number]['id'];
}

export interface ApplySimTickDeltaOptions {
  cloneMode?: SimDeltaCloneMode;
}

function deltaClone<T>(value: T, mode: SimDeltaCloneMode): T {
  return mode === 'isolated' ? structuredClone(value) : value;
}

function deltaCloneOptional<T>(value: T | null | undefined, mode: SimDeltaCloneMode): T | null {
  if (value == null) return value ?? null;
  return mode === 'isolated' ? structuredClone(value) : value;
}

function buildingFingerprint(building: Building): string {
  return JSON.stringify(building);
}

/** The fields the derived geometry caches (road avoidance, adjacency, beauty) depend on. */
function buildingGeometryKey(building: Building): string {
  return `${building.id}|${building.type}|${building.x}|${building.y}|${building.width}`
    + `|${building.height}|${building.rotation ?? 0}|${building.completed ? 1 : 0}`
    + `|${building.faction ?? ''}`;
}

export function simTickDeltaFromWorld(world: WorldState): SimTickDelta {
  const alive = world.entities.filter((e) => e.alive);
  return extractSimTickDelta(world, alive);
}

export function createFallbackSimTickDelta(world: WorldState): SimTickDelta {
  return simTickDeltaFromWorld(world);
}

/**
 * The full-slice delta for one tick. `aliveOrdered` is the caller's alive list; otherwise it is
 * derived from `world.entities`. `aliveEntities` is a complete replacement, with no spawn/death ids.
 */
export function extractSimTickDelta(
  world: WorldState,
  aliveOrdered?: Entity[],
  options?: ExtractSimTickDeltaOptions,
): SimTickDelta {
  const aliveNow: Entity[] = aliveOrdered ?? [];

  if (!aliveOrdered) {
    for (const e of world.entities) {
      if (e.alive) aliveNow.push(e);
    }
  }

  const cloneMode = options?.cloneMode ?? 'isolated';

  const previousEventIndex = options?.previousEventHeadId == null
    ? -1
    : world.eventLog.findIndex((event) => event.id === options.previousEventHeadId);
  const eventLogTail = world.eventLog.slice(
    0,
    previousEventIndex >= 0 ? previousEventIndex : EVENT_LOG_DELTA_TAIL_MAX,
  );

  const prevBuildings = options?.prevBuildings;
  const prevBuildingGeometry = options?.prevBuildingGeometry;
  let changedBuildings: Building[] | undefined;
  let removedBuildingIds: number[] | undefined;
  let buildingGeometryChanged: boolean | undefined;

  if (prevBuildings || options?.nextBuildings) {
    changedBuildings = [];
    removedBuildingIds = [];
    buildingGeometryChanged = false;
    const currentIds = new Set<number>();
    for (const building of world.buildings) {
      currentIds.add(building.id);
      const fingerprint = buildingFingerprint(building);
      options?.nextBuildings?.set(building.id, fingerprint);
      const geometry = buildingGeometryKey(building);
      options?.nextBuildingGeometry?.set(building.id, geometry);
      if (prevBuildingGeometry && prevBuildingGeometry.get(building.id) !== geometry) {
        buildingGeometryChanged = true;
      }
      const prev = prevBuildings?.get(building.id);
      if (prev !== fingerprint) {
        changedBuildings.push(building);
      }
    }
    for (const id of prevBuildings?.keys() ?? []) {
      if (!currentIds.has(id)) {
        removedBuildingIds.push(id);
        buildingGeometryChanged = true;
      }
    }
  }

  const delta: SimTickDelta = {
    proto: SIM_DELTA_PROTO,
    tick: world.tick,
    year: world.year,
    dayInYear: world.dayInYear,
    season: world.season,
    weather: world.weather,
    weatherTimer: world.weatherTimer,
    resources: { ...world.resources },
    storageMax: { ...world.storageMax },
    foodSpoilageRate: world.foodSpoilageRate,
    humanPopulation: world.humanPopulation,
    maxHumanPopulation: world.maxHumanPopulation,
    workingSettlers: world.workingSettlers ?? 0,
    idleSettlers: world.idleSettlers ?? 0,
    villageHappiness: world.villageHappiness,
    villageCanHeat: world.villageCanHeat,
    wildlifeCounts: { ...world.wildlifeCounts },
    ecosystemHealth: world.ecosystemHealth,
    pollutionLevel: world.pollutionLevel,
    pendingEcosystemHealthDelta: world.pendingEcosystemHealthDelta,
    pendingPollutionDelta: world.pendingPollutionDelta,
    biodiversityIndex: world.biodiversityIndex,
    valleyStage: world.valleyStage,
    valleyStageSinceDay: world.valleyStageSinceDay,
    valleyRawStressStreakDays: world.valleyRawStressStreakDays,
    valleyRawCalmStreakDays: world.valleyRawCalmStreakDays,
    valleyLastStageNotifyDay: world.valleyLastStageNotifyDay,
    villageReputation: world.villageReputation,
    workSchedule: getWorkSchedule(world),
    tavernSchedule: getVenueSchedule(world, 'tavern'),
    hotelSchedule: getVenueSchedule(world, 'hotel'),
    workforcePolicy: getWorkforcePolicy(world),
    screenShakeImpulse: world.screenShakeImpulse,
    floatingTexts: deltaClone(world.floatingTexts, cloneMode),
    deathParticles: deltaClone(world.deathParticles, cloneMode),
    huntVisuals: deltaClone(world.huntVisuals ?? [], cloneMode),
    aliveEntities: deltaClone(aliveNow, cloneMode),
    eventLogTail: deltaClone(eventLogTail, cloneMode),
    graveRecords: deltaClone(world.graveRecords ?? [], cloneMode),
    genealogyRegistry: deltaCloneOptional(world.genealogyRegistry, cloneMode) ?? undefined,
    bigNews: deltaClone(world.bigNews, cloneMode),
    notifications: deltaClone(world.notifications, cloneMode),
    festival: deltaCloneOptional(world.festival, cloneMode),
    townHallFestivalCooldownUntilTick: world.townHallFestivalCooldownUntilTick ?? 0,
    visitorGroups: deltaClone(world.visitorGroups, cloneMode),
    activeVillageRequest: deltaCloneOptional(world.activeVillageRequest, cloneMode) ?? undefined,
    villageRequestCooldownUntilDay: world.villageRequestCooldownUntilDay ?? 0,
    villageRequestHistory: deltaClone(world.villageRequestHistory ?? [], cloneMode),
    rivalSettlements: deltaClone(world.rivalSettlements, cloneMode),
    pendingRaidEvents: deltaClone(world.pendingRaidEvents ?? [], cloneMode),
    pendingOutgoingRaidEvents: deltaClone(world.pendingOutgoingRaidEvents ?? [], cloneMode),
    pendingRaidVictories: world.pendingRaidVictories === undefined ? undefined : deltaClone(world.pendingRaidVictories, cloneMode),
    raidBattleReports: world.raidBattleReports === undefined ? undefined : deltaClone(world.raidBattleReports, cloneMode),
    raidRecovery: world.raidRecovery === undefined ? undefined : deltaClone(world.raidRecovery, cloneMode),
    scoredRaidIds: world.scoredRaidIds === undefined ? undefined : deltaClone(world.scoredRaidIds, cloneMode),
    raidPrisonerHistory: world.raidPrisonerHistory === undefined ? undefined : deltaClone(world.raidPrisonerHistory, cloneMode),
    pendingDiplomacyEvents: deltaClone(world.pendingDiplomacyEvents ?? [], cloneMode),
    villageLeaderId: world.villageLeaderId,
    leaderSinceYear: world.leaderSinceYear,
    lastElectionYear: world.lastElectionYear,
    pendingElectionYear: world.pendingElectionYear,
    electionBuildupNotifiedYear: world.electionBuildupNotifiedYear ?? null,
    electionCeremony: deltaCloneOptional(world.electionCeremony, cloneMode),
    spotlightLore: deltaCloneOptional(world.spotlightLore, cloneMode),
    spotlightLoreLastDay: world.spotlightLoreLastDay,
    unlockedTechs: cloneMode === 'isolated' ? [...world.unlockedTechs] : world.unlockedTechs,
    researchNodes: deltaClone(world.researchNodes, cloneMode),
    researchProgress: world.researchProgress,
    activeResearch: world.activeResearch,
    challenges: deltaClone(world.challenges, cloneMode),
    tradeRoutes: deltaClone(world.tradeRoutes, cloneMode),
    disasters: deltaClone(world.disasters, cloneMode),
    villageForge: deltaClone(world.villageForge, cloneMode),
    populationHistory: deltaClone(world.populationHistory, cloneMode),
    yearlyStats: deltaClone(world.yearlyStats, cloneMode),
    lifetimeStats: deltaClone(world.lifetimeStats, cloneMode),
    eventsThisYear: cloneMode === 'isolated'
      ? [...(world.eventsThisYear ?? [])]
      : (world.eventsThisYear ?? []),
    activeEvent: deltaCloneOptional(world.activeEvent, cloneMode),
    lastEventYear: world.lastEventYear,
    bountifulHarvest: world.bountifulHarvest,
    ecoHealthYearsAbove80: world.ecoHealthYearsAbove80,
    firstWeekVisitorSpawned: world.firstWeekVisitorSpawned,
    totalBuildingsCompleted: world.totalBuildingsCompleted,
    nextEntityId: world.nextEntityId,
    nextBuildingId: world.nextBuildingId,
    nextFloatingTextId: world.nextFloatingTextId,
    renffrOmen: deltaCloneOptional(world.renffrOmen, cloneMode),
    visitorQuest: deltaCloneOptional(world.visitorQuest, cloneMode) ?? undefined,
    deathsThisYear: deltaCloneOptional(world.deathsThisYear, cloneMode) ?? undefined,
    lastMoonHowlerExorcismTick: world.lastMoonHowlerExorcismTick,
    moonHowlerPriestsFleeUntil: world.moonHowlerPriestsFleeUntil,
    chronicleChapters: deltaClone(world.chronicleChapters ?? [], cloneMode),
    renffrChatterUntilTick: world.renffrChatterUntilTick ?? 0,
    lastProcessedCalendarDay: world.lastProcessedCalendarDay ?? 0,
    lastWildlifeReplenishLogDay: world.lastWildlifeReplenishLogDay ?? 0,
    storyFlags: deltaClone(world.storyFlags ?? {}, cloneMode),
    pendingStoryEvents: deltaClone(world.pendingStoryEvents ?? [], cloneMode),
    guidedCampaign: deltaCloneOptional(world.guidedCampaign, cloneMode) ?? undefined,
    activeMigration: deltaCloneOptional(world.activeMigration, cloneMode) ?? undefined,
    migrationNextHerdSize: world.migrationNextHerdSize,
    simRng: snapshotSimRng(),
  };

  if (world.economyLedger) {
    delta.economyLedger = {
      day: world.economyLedger.day,
      produced: { ...world.economyLedger.produced },
      consumed: { ...world.economyLedger.consumed },
      // Carried explicitly: the display world reads these instead of adding the maps up, and the
      // worker-boundary test fails if a simulation-written field is not shipped.
      producedTotal: world.economyLedger.producedTotal,
      consumedTotal: world.economyLedger.consumedTotal,
    };
  }
  if (world.foodHistory && world.foodHistory.length > 0) {
    delta.foodHistory = world.foodHistory.map((sample) => ({
      day: sample.day,
      produced: { ...sample.produced },
      consumed: { ...sample.consumed },
    }));
  }

  if (changedBuildings) {
    delta.changedBuildings = deltaClone(changedBuildings, cloneMode);
    delta.removedBuildingIds = removedBuildingIds;
    delta.buildingGeometryChanged = buildingGeometryChanged;
  } else {
    delta.buildings = deltaClone(world.buildings, cloneMode);
  }

  const terrainPatches = takeTerrainPatches(world.worldMap);
  if (terrainPatches.length > 0) delta.terrainPatches = terrainPatches;

  if (options?.prevHistoryRevisions) {
    // Histories cross the boundary only when their owner bumped the revision, so the per-tick
    // JSON fingerprint over grave and genealogy history disappears from the worker loop.
    const currentRevisions = snapshotHistoryRevisions(world);
    const previousRevisions = options.prevHistoryRevisions;
    const deltaRecord = delta as unknown as Record<string, unknown>;
    for (const family of HISTORY_FAMILIES) {
      if (previousRevisions[family] === currentRevisions[family]) delete deltaRecord[family];
    }
  }

  return delta;
}

/** Apply a command's tile patches to the replica map and rebake the affected terrain region. */
function applyTerrainPatches(world: WorldState, patches: readonly TerrainTilePatch[] | undefined): void {
  const map = world.worldMap;
  if (!map || !patches || patches.length === 0) return;
  let startTx = Infinity;
  let endTx = -1;
  let startTy = Infinity;
  let endTy = -1;
  for (const patch of patches) {
    setTileOverride(map, patch.tx, patch.ty, patch.tile);
    if (patch.tx < startTx) startTx = patch.tx;
    if (patch.tx > endTx) endTx = patch.tx;
    if (patch.ty < startTy) startTy = patch.ty;
    if (patch.ty > endTy) endTy = patch.ty;
  }
  if (endTx < 0) return;
  rebakeTerrainGrids(map, { startTx, endTx, startTy, endTy });
  bumpTerrainRevision();
}

const RELATIONSHIP_FIELDS = ['friendships', 'feuds', 'feudPeaks'] as const;

/**
 * Replace a delta entity with a copy that omits `fields` when the replica already holds them;
 * `include` records the revision for entities that do ship. The live entity is never mutated.
 */
function stripCoveredFields(
  delta: SimTickDelta,
  revisionsById: ReadonlyMap<number, number>,
  covered: (id: number, revision: number) => boolean,
  include: (id: number, revision: number) => void,
  fields: readonly string[],
): void {
  const entities = delta.aliveEntities;
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const revision = revisionsById.get(entity.id) ?? 0;
    if (covered(entity.id, revision)) {
      const sparse = { ...entity };
      for (const field of fields) delete (sparse as Record<string, unknown>)[field];
      entities[i] = sparse;
    } else {
      include(entity.id, revision);
    }
  }
}

/**
 * Drop relationship records the replica already holds: the maps are the bulk of the entity payload
 * and change on a minority of settlers per tick.
 */
export function stripUnchangedRelationships(
  delta: SimTickDelta,
  revisionsById: ReadonlyMap<number, number>,
  sent: Map<number, number>,
): void {
  stripCoveredFields(
    delta,
    revisionsById,
    (id, revision) => sent.get(id) === revision,
    (id, revision) => sent.set(id, revision),
    RELATIONSHIP_FIELDS,
  );
}

/**
 * Move static decor out of the per-tick entity roster: props the replica already holds stay there,
 * new ones ship once, felled ones ship as ids. `sent` is the prop roster the replica has.
 */
export function splitStaticProps(delta: SimTickDelta, sent: Set<number>): void {
  const entities = delta.aliveEntities;
  const props: Entity[] = [];
  const rest: Entity[] = [];
  for (const entity of entities) {
    if (isStaticPropEntity(entity)) props.push(entity);
    else rest.push(entity);
  }
  const current = new Set(props.map((entity) => entity.id));
  const added = props.filter((entity) => !sent.has(entity.id));
  const removed: number[] = [];
  for (const id of sent) {
    if (!current.has(id)) removed.push(id);
  }
  sent.clear();
  for (const id of current) sent.add(id);
  delta.aliveEntities = rest;
  delta.staticPropsResolved = true;
  if (added.length > 0) delta.staticEntities = added;
  if (removed.length > 0) delta.removedStaticEntityIds = removed;
}

/** Profile fields the replica reads but the simulation writes rarely (bounded by a refresh). */
const PROFILE_FIELDS = [
  'skills', 'genomeV2', 'marks', 'careerHistory', 'careerMilestones', 'childhoodFriendsIds', 'battleLeadershipAwards',
] as const;

/** Re-ship profile fields at least this often, so a missed writer can only be briefly stale. */
export const PROFILE_REFRESH_TICKS = 240;

/** Drop profile fields the replica already holds (or refreshed recently). */
export function stripUnchangedProfile(
  delta: SimTickDelta,
  revisionsById: ReadonlyMap<number, number>,
  sent: Map<number, { revision: number; tick: number }>,
  tick: number,
): void {
  stripCoveredFields(
    delta,
    revisionsById,
    (id, revision) => {
      const last = sent.get(id);
      return !!last && last.revision === revision && tick - last.tick < PROFILE_REFRESH_TICKS;
    },
    (id, revision) => sent.set(id, { revision, tick }),
    PROFILE_FIELDS,
  );
}

export function applySimTickDelta(
  world: WorldState,
  delta: SimTickDelta,
  options?: ApplySimTickDeltaOptions,
): void {
  const cloneMode = options?.cloneMode ?? 'isolated';
  if (delta.proto !== SIM_DELTA_PROTO) {
    throw new Error(`Invalid SimTickDelta protocol: ${String(delta.proto)}`);
  }

  world.tick = delta.tick;
  world.year = delta.year;
  world.dayInYear = delta.dayInYear;
  world.season = delta.season;
  world.weather = delta.weather;
  world.weatherTimer = delta.weatherTimer;
  world.resources = { ...delta.resources };
  world.storageMax = { ...delta.storageMax };
  world.foodSpoilageRate = delta.foodSpoilageRate;
  world.humanPopulation = delta.humanPopulation;
  world.maxHumanPopulation = delta.maxHumanPopulation;
  world.workingSettlers = delta.workingSettlers ?? 0;
  world.idleSettlers = delta.idleSettlers ?? 0;
  world.villageHappiness = delta.villageHappiness;
  world.villageCanHeat = delta.villageCanHeat;
  world.wildlifeCounts = { ...delta.wildlifeCounts };
  world.ecosystemHealth = delta.ecosystemHealth;
  world.pollutionLevel = delta.pollutionLevel;
  world.pendingEcosystemHealthDelta = delta.pendingEcosystemHealthDelta;
  world.pendingPollutionDelta = delta.pendingPollutionDelta;
  world.biodiversityIndex = delta.biodiversityIndex;
  world.valleyStage = delta.valleyStage;
  world.valleyStageSinceDay = delta.valleyStageSinceDay;
  world.valleyRawStressStreakDays = delta.valleyRawStressStreakDays;
  world.valleyRawCalmStreakDays = delta.valleyRawCalmStreakDays;
  world.valleyLastStageNotifyDay = delta.valleyLastStageNotifyDay;
  world.villageReputation = delta.villageReputation;
  world.workSchedule = delta.workSchedule ? { ...delta.workSchedule } : getWorkSchedule(world);
  world.tavernSchedule = delta.tavernSchedule ? { ...delta.tavernSchedule } : getVenueSchedule(world, 'tavern');
  world.hotelSchedule = delta.hotelSchedule ? { ...delta.hotelSchedule } : getVenueSchedule(world, 'hotel');
  world.workforcePolicy = normalizeWorkforcePolicy(delta.workforcePolicy);
  world.screenShakeImpulse = delta.screenShakeImpulse;
  world.floatingTexts = deltaClone(delta.floatingTexts, cloneMode);
  world.deathParticles = deltaClone(delta.deathParticles, cloneMode);
  world.huntVisuals = deltaClone(delta.huntVisuals ?? [], cloneMode);
  if ('graveRecords' in delta) {
    world.graveRecords = deltaClone(delta.graveRecords ?? [], cloneMode);
  }
  if ('genealogyRegistry' in delta) {
    world.genealogyRegistry = deltaCloneOptional(delta.genealogyRegistry, cloneMode) ?? undefined;
  }

  if (delta.changedBuildings) {
    const removed = new Set(delta.removedBuildingIds ?? []);
    world.buildings = world.buildings.filter((b) => !removed.has(b.id));
    const byId = new Map(world.buildings.map((b) => [b.id, b] as const));
    for (const building of deltaClone(delta.changedBuildings, cloneMode)) {
      byId.set(building.id, building);
    }
    world.buildings = Array.from(byId.values());
  } else {
    world.buildings = deltaClone(delta.buildings ?? [], cloneMode);
  }

  world.bigNews = preserveBigNewsDismissals(
    world.bigNews,
    deltaClone(delta.bigNews, cloneMode),
    world.dismissedBigNewsIds,
  );

  world.notifications = preserveNotificationDismissals(
    deltaClone(delta.notifications, cloneMode),
    world.dismissedNotificationIds,
  );

  world.festival = deltaCloneOptional(delta.festival, cloneMode);
  world.townHallFestivalCooldownUntilTick = delta.townHallFestivalCooldownUntilTick;
  world.visitorGroups = deltaClone(delta.visitorGroups, cloneMode);
  world.activeVillageRequest = deltaCloneOptional(delta.activeVillageRequest, cloneMode) ?? undefined;
  world.villageRequestCooldownUntilDay = delta.villageRequestCooldownUntilDay;
  if ('villageRequestHistory' in delta) {
    world.villageRequestHistory = deltaClone(delta.villageRequestHistory, cloneMode);
  }
  world.rivalSettlements = deltaClone(delta.rivalSettlements, cloneMode);
  world.pendingRaidEvents = deltaClone(delta.pendingRaidEvents, cloneMode);
  world.pendingOutgoingRaidEvents = deltaClone(delta.pendingOutgoingRaidEvents, cloneMode);
  if (delta.pendingRaidVictories === undefined) delete world.pendingRaidVictories;
  else world.pendingRaidVictories = deltaClone(delta.pendingRaidVictories, cloneMode);
  if (delta.raidBattleReports === undefined) delete world.raidBattleReports;
  else world.raidBattleReports = deltaClone(delta.raidBattleReports, cloneMode);
  if (delta.raidRecovery === undefined) delete world.raidRecovery;
  else world.raidRecovery = deltaClone(delta.raidRecovery, cloneMode);
  if (delta.scoredRaidIds === undefined) delete world.scoredRaidIds;
  else world.scoredRaidIds = deltaClone(delta.scoredRaidIds, cloneMode);
  if (delta.raidPrisonerHistory === undefined) delete world.raidPrisonerHistory;
  else world.raidPrisonerHistory = deltaClone(delta.raidPrisonerHistory, cloneMode);
  world.pendingDiplomacyEvents = deltaClone(delta.pendingDiplomacyEvents, cloneMode);
  world.villageLeaderId = delta.villageLeaderId;
  world.leaderSinceYear = delta.leaderSinceYear;
  world.lastElectionYear = delta.lastElectionYear;
  world.pendingElectionYear = delta.pendingElectionYear;
  world.electionBuildupNotifiedYear = delta.electionBuildupNotifiedYear;
  world.electionCeremony = deltaCloneOptional(delta.electionCeremony, cloneMode);
  world.spotlightLore = deltaCloneOptional(delta.spotlightLore, cloneMode);
  world.spotlightLoreLastDay = delta.spotlightLoreLastDay;
  world.unlockedTechs = cloneMode === 'isolated' ? [...delta.unlockedTechs] : delta.unlockedTechs;
  world.researchNodes = deltaClone(delta.researchNodes, cloneMode);
  world.researchProgress = delta.researchProgress;
  world.activeResearch = delta.activeResearch;
  world.challenges = deltaClone(delta.challenges, cloneMode);
  world.tradeRoutes = deltaClone(delta.tradeRoutes, cloneMode);
  world.disasters = deltaClone(delta.disasters, cloneMode);
  world.villageForge = deltaClone(delta.villageForge, cloneMode);
  if ('populationHistory' in delta) {
    world.populationHistory = deltaClone(delta.populationHistory ?? [], cloneMode);
  }
  if ('yearlyStats' in delta) {
    world.yearlyStats = deltaClone(delta.yearlyStats ?? [], cloneMode);
  }
  world.lifetimeStats = deltaClone(delta.lifetimeStats, cloneMode);
  world.eventsThisYear = cloneMode === 'isolated' ? [...delta.eventsThisYear] : delta.eventsThisYear;

  world.activeEvent = preserveActiveEventDismissal(
    deltaCloneOptional(delta.activeEvent, cloneMode),
    world.dismissedActiveEventIds,
  );

  world.lastEventYear = delta.lastEventYear;
  world.bountifulHarvest = delta.bountifulHarvest;
  world.ecoHealthYearsAbove80 = delta.ecoHealthYearsAbove80;
  world.firstWeekVisitorSpawned = delta.firstWeekVisitorSpawned;
  world.totalBuildingsCompleted = delta.totalBuildingsCompleted;
  world.nextEntityId = delta.nextEntityId;
  world.nextBuildingId = delta.nextBuildingId;
  world.nextFloatingTextId = delta.nextFloatingTextId;
  world.renffrOmen = deltaCloneOptional(delta.renffrOmen, cloneMode);
  world.visitorQuest = deltaCloneOptional(delta.visitorQuest, cloneMode) ?? undefined;
  world.deathsThisYear = deltaCloneOptional(delta.deathsThisYear, cloneMode) ?? undefined;
  world.lastMoonHowlerExorcismTick = delta.lastMoonHowlerExorcismTick;
  world.moonHowlerPriestsFleeUntil = delta.moonHowlerPriestsFleeUntil;
  if ('chronicleChapters' in delta) {
    world.chronicleChapters = deltaClone(delta.chronicleChapters ?? [], cloneMode);
  }
  world.renffrChatterUntilTick = delta.renffrChatterUntilTick;
  world.lastProcessedCalendarDay = delta.lastProcessedCalendarDay;
  world.lastWildlifeReplenishLogDay = delta.lastWildlifeReplenishLogDay;
  world.storyFlags = deltaClone(delta.storyFlags, cloneMode);
  world.pendingStoryEvents = deltaClone(delta.pendingStoryEvents, cloneMode);
  world.guidedCampaign = deltaCloneOptional(delta.guidedCampaign, cloneMode) ?? undefined;
  world.activeMigration = deltaCloneOptional(delta.activeMigration, cloneMode) ?? undefined;
  world.migrationNextHerdSize = delta.migrationNextHerdSize;

  if (delta.simRng) {
    world.simRng = delta.simRng;
    restoreSimRng(delta.simRng);
  }
  world.economyLedger = delta.economyLedger
    ? {
        day: delta.economyLedger.day,
        produced: { ...delta.economyLedger.produced },
        consumed: { ...delta.economyLedger.consumed },
        producedTotal: delta.economyLedger.producedTotal,
        consumedTotal: delta.economyLedger.consumedTotal,
      }
    : undefined;
  world.foodHistory = delta.foodHistory?.map((sample) => ({
    day: sample.day,
    produced: { ...sample.produced },
    consumed: { ...sample.consumed },
  }));

  const previousById = new Map<number, Entity>();
  for (const entity of world.entities) previousById.set(entity.id, entity);
  const merged = delta.aliveEntities.map((entity) => {
    const next = deltaClone(entity, cloneMode);
    const previous = previousById.get(next.id);
    return previous ? { ...previous, ...next } : next;
  });
  const mergedIds = new Set(merged.map((entity) => entity.id));
  if (delta.staticPropsResolved) {
    const removed = new Set(delta.removedStaticEntityIds ?? []);
    const propsById = new Map<number, Entity>();
    for (const entity of world.entities) {
      if (isStaticPropEntity(entity) && entity.alive && !removed.has(entity.id) && !mergedIds.has(entity.id)) {
        propsById.set(entity.id, entity);
      }
    }
    for (const entity of delta.staticEntities ?? []) {
      propsById.set(entity.id, deltaClone(entity, cloneMode));
    }
    merged.push(...propsById.values());
  }
  world.entities = merged;
  applyTerrainPatches(world, delta.terrainPatches);

  // The authoritative alive snapshot is the sole entity delta payload.

  if (delta.eventLogTail.length > 0) {
    const existingIds = new Set(world.eventLog.map((e) => e.id));
    const seenTailIds = new Set<string | number>();
    const newEntries: WorldState['eventLog'] = [];

    for (const entry of delta.eventLogTail) {
      if (seenTailIds.has(entry.id)) continue;
      seenTailIds.add(entry.id);
      if (!existingIds.has(entry.id)) {
        newEntries.push(entry);
        existingIds.add(entry.id);
      }
    }

    if (newEntries.length > 0) {
      world.eventLog = [...newEntries, ...world.eventLog].slice(0, EVENT_LOG_MAX_ENTRIES);
    }
  }
}



