import type { Building, Entity, WorldState } from '../gameTypes';
import { EntityType } from '../gameTypes';
import type { SimulationFocus } from '../gameEngine';
import { clearScreenShakeImpulse } from '../viewState';
import type { EntityRenderMeta } from './entityRenderMeta';
import { packRenderMetaForPacked } from './entityRenderMeta';
import { selectRenderEntities } from './packRenderSoA';
import { RENDER_MAX_SLOTS } from './schema';

export const SIM_DELTA_PROTO = 1;

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
  humanPopulation: number;
  maxHumanPopulation: number;
  wildlifeCounts: WorldState['wildlifeCounts'];
  ecosystemHealth: number;
  pollutionLevel: number;
  biodiversityIndex: number;
  villageReputation: number;
  screenShakeImpulse: number;
  floatingTexts: WorldState['floatingTexts'];
  deathParticles: WorldState['deathParticles'];
  buildings: Building[];
  /** Worker-compacted alive entity list — replaces main-thread entities each tick. */
  aliveEntities: Entity[];
  diedIds: number[];
  newEntities: Entity[];
  eventLogTail: WorldState['eventLog'];
  bigNews: WorldState['bigNews'];
  notifications: WorldState['notifications'];
  festival: WorldState['festival'];
  townHallFestivalCooldownUntilTick: number;
  visitorGroups: WorldState['visitorGroups'];
  rivalSettlements: WorldState['rivalSettlements'];
  pendingRaidEvents: WorldState['pendingRaidEvents'];
  pendingOutgoingRaidEvents: WorldState['pendingOutgoingRaidEvents'];
  pendingDiplomacyEvents: WorldState['pendingDiplomacyEvents'];
  villageLeaderId: number | null;
  leaderSinceYear: number;
  lastElectionYear: number;
  pendingElectionYear: number | null;
  electionBuildupNotifiedYear: number | null;
  electionCeremony: WorldState['electionCeremony'];
  unlockedTechs: string[];
  researchNodes: WorldState['researchNodes'];
  researchProgress: number;
  activeResearch: string | null;
  challenges: WorldState['challenges'];
  victories: WorldState['victories'];
  victoryAchieved: WorldState['victoryAchieved'];
  tradeRoutes: WorldState['tradeRoutes'];
  disasters: WorldState['disasters'];
  villageForge: WorldState['villageForge'];
  populationHistory: WorldState['populationHistory'];
  yearlyStats: WorldState['yearlyStats'];
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
  renffrChatterUntilTick: number;
  lastProcessedCalendarDay: number;
  lastWildlifeReplenishLogDay: number;
  /** Aligned with render SoA slot order — strings/status for canvas. */
  renderMetaBySlot?: EntityRenderMeta[];
  /** Human entities for EntityCatalog — avoids full-world scan. */
  catalogEntities?: Entity[];
}

/** How nested delta payloads are copied between threads. */
export type SimDeltaCloneMode = 'isolated' | 'transfer';

export interface ExtractSimTickDeltaOptions {
  /** Same entity order as `packRenderSoA` slots — required for meta alignment on overflow. */
  renderPacked?: Entity[];
  focus?: SimulationFocus;
  /** Skip render meta + catalog snapshots (headless worker ticks). */
  headless?: boolean;
  /**
   * `isolated` — clone on extract and apply (in-process tests).
   * `transfer` — rely on postMessage as the single isolation boundary (worker ticks).
   */
  cloneMode?: SimDeltaCloneMode;
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

const CATALOG_PATCH_KEYS = [
  'name', 'surname', 'chatPhrase', 'gender', 'spriteVariant', 'faction',
  'moonHowlerCursed', 'pregnant', 'courtshipProgress', 'relationshipStatus',
  'partnerId', 'homeBuildingId', 'residenceBuildingId', 'tamedBy', 'combatTicks',
  'job', 'occupation', 'skills', 'energy', 'maxEnergy', 'x', 'y', 'vx', 'vy',
  'spriteAngle', 'animFrame', 'size', 'flash', 'huntTargetId', 'chatTicks',
  'prisonBuildingId', 'prisonerUntilTick', 'prisonSentenceCrime', 'affairPartnerId',
  'affairProgress', 'isJuvenile', 'alive',
] as const satisfies readonly (keyof Entity)[];

/** Test helper — extract a full delta from an already-ticked world. */
export function simTickDeltaFromWorld(world: WorldState): SimTickDelta {
  const alive = world.entities.filter((e) => e.alive);
  const before = new Set(alive.map((e) => e.id));
  return extractSimTickDelta(world, before, alive);
}

export function extractSimTickDelta(
  world: WorldState,
  aliveBefore: Set<number>,
  aliveOrdered?: Entity[],
  options?: ExtractSimTickDeltaOptions,
): SimTickDelta {
  const aliveNow = aliveOrdered ?? world.entities.filter((e) => e.alive);
  const aliveIds = new Set(aliveNow.map((e) => e.id));

  const diedIds: number[] = [];
  for (const id of aliveBefore) {
    if (!aliveIds.has(id)) diedIds.push(id);
  }

  const newEntities = aliveNow.filter((e) => !aliveBefore.has(e.id));
  const headless = options?.headless ?? false;
  const cloneMode = options?.cloneMode ?? 'isolated';

  const renderPacked = headless
    ? undefined
    : options?.renderPacked
      ?? selectRenderEntities(aliveNow, RENDER_MAX_SLOTS, options?.focus).packed;

  const tailStart = Math.max(0, world.eventLog.length - EVENT_LOG_DELTA_TAIL_MAX);
  const eventLogTail = world.eventLog.slice(tailStart);

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
    humanPopulation: world.humanPopulation,
    maxHumanPopulation: world.maxHumanPopulation,
    wildlifeCounts: { ...world.wildlifeCounts },
    ecosystemHealth: world.ecosystemHealth,
    pollutionLevel: world.pollutionLevel,
    biodiversityIndex: world.biodiversityIndex,
    villageReputation: world.villageReputation,
    screenShakeImpulse: world.screenShakeImpulse,
    floatingTexts: deltaClone(world.floatingTexts, cloneMode),
    deathParticles: deltaClone(world.deathParticles, cloneMode),
    buildings: deltaClone(world.buildings, cloneMode),
    aliveEntities: deltaClone(aliveNow, cloneMode),
    diedIds,
    newEntities: deltaClone(newEntities, cloneMode),
    eventLogTail: deltaClone(eventLogTail, cloneMode),
    bigNews: deltaClone(world.bigNews, cloneMode),
    notifications: deltaClone(world.notifications, cloneMode),
    festival: deltaCloneOptional(world.festival, cloneMode),
    townHallFestivalCooldownUntilTick: world.townHallFestivalCooldownUntilTick ?? 0,
    visitorGroups: deltaClone(world.visitorGroups, cloneMode),
    rivalSettlements: deltaClone(world.rivalSettlements, cloneMode),
    pendingRaidEvents: deltaClone(world.pendingRaidEvents ?? [], cloneMode),
    pendingOutgoingRaidEvents: deltaClone(world.pendingOutgoingRaidEvents ?? [], cloneMode),
    pendingDiplomacyEvents: deltaClone(world.pendingDiplomacyEvents ?? [], cloneMode),
    villageLeaderId: world.villageLeaderId,
    leaderSinceYear: world.leaderSinceYear,
    lastElectionYear: world.lastElectionYear,
    pendingElectionYear: world.pendingElectionYear,
    electionBuildupNotifiedYear: world.electionBuildupNotifiedYear ?? null,
    electionCeremony: deltaCloneOptional(world.electionCeremony, cloneMode),
    unlockedTechs: cloneMode === 'isolated' ? [...world.unlockedTechs] : world.unlockedTechs,
    researchNodes: deltaClone(world.researchNodes, cloneMode),
    researchProgress: world.researchProgress,
    activeResearch: world.activeResearch,
    challenges: deltaClone(world.challenges, cloneMode),
    victories: deltaClone(world.victories, cloneMode),
    victoryAchieved: world.victoryAchieved,
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
    renffrChatterUntilTick: world.renffrChatterUntilTick ?? 0,
    lastProcessedCalendarDay: world.lastProcessedCalendarDay ?? 0,
    lastWildlifeReplenishLogDay: world.lastWildlifeReplenishLogDay ?? 0,
  };

  if (!headless && renderPacked) {
    delta.renderMetaBySlot = packRenderMetaForPacked(renderPacked);
    delta.catalogEntities = deltaClone(
      aliveNow.filter((e) => e.type === EntityType.Human),
      cloneMode,
    );
  }

  return delta;
}

export function applySimTickDelta(
  world: WorldState,
  delta: SimTickDelta,
  options?: ApplySimTickDeltaOptions,
): void {
  const cloneMode = options?.cloneMode ?? 'isolated';

  world.tick = delta.tick;
  world.year = delta.year;
  world.dayInYear = delta.dayInYear;
  world.season = delta.season;
  world.weather = delta.weather;
  world.weatherTimer = delta.weatherTimer;
  world.resources = { ...delta.resources };
  world.storageMax = { ...delta.storageMax };
  world.humanPopulation = delta.humanPopulation;
  world.maxHumanPopulation = delta.maxHumanPopulation;
  world.wildlifeCounts = { ...delta.wildlifeCounts };
  world.ecosystemHealth = delta.ecosystemHealth;
  world.pollutionLevel = delta.pollutionLevel;
  world.biodiversityIndex = delta.biodiversityIndex;
  world.villageReputation = delta.villageReputation;
  world.screenShakeImpulse = delta.screenShakeImpulse;
  world.floatingTexts = deltaClone(delta.floatingTexts, cloneMode);
  world.deathParticles = deltaClone(delta.deathParticles, cloneMode);
  world.buildings = deltaClone(delta.buildings, cloneMode);
  world.bigNews = deltaClone(delta.bigNews, cloneMode);
  world.notifications = deltaClone(delta.notifications, cloneMode);
  world.festival = deltaCloneOptional(delta.festival, cloneMode);
  world.townHallFestivalCooldownUntilTick = delta.townHallFestivalCooldownUntilTick;
  world.visitorGroups = deltaClone(delta.visitorGroups, cloneMode);
  world.rivalSettlements = deltaClone(delta.rivalSettlements, cloneMode);
  world.pendingRaidEvents = deltaClone(delta.pendingRaidEvents, cloneMode);
  world.pendingOutgoingRaidEvents = deltaClone(delta.pendingOutgoingRaidEvents, cloneMode);
  world.pendingDiplomacyEvents = deltaClone(delta.pendingDiplomacyEvents, cloneMode);
  world.villageLeaderId = delta.villageLeaderId;
  world.leaderSinceYear = delta.leaderSinceYear;
  world.lastElectionYear = delta.lastElectionYear;
  world.pendingElectionYear = delta.pendingElectionYear;
  world.electionBuildupNotifiedYear = delta.electionBuildupNotifiedYear;
  world.electionCeremony = deltaCloneOptional(delta.electionCeremony, cloneMode);
  world.unlockedTechs = cloneMode === 'isolated' ? [...delta.unlockedTechs] : delta.unlockedTechs;
  world.researchNodes = deltaClone(delta.researchNodes, cloneMode);
  world.researchProgress = delta.researchProgress;
  world.activeResearch = delta.activeResearch;
  world.challenges = deltaClone(delta.challenges, cloneMode);
  world.victories = deltaClone(delta.victories, cloneMode);
  world.victoryAchieved = delta.victoryAchieved;
  world.tradeRoutes = deltaClone(delta.tradeRoutes, cloneMode);
  world.disasters = deltaClone(delta.disasters, cloneMode);
  world.villageForge = deltaClone(delta.villageForge, cloneMode);
  world.populationHistory = deltaClone(delta.populationHistory, cloneMode);
  world.yearlyStats = deltaClone(delta.yearlyStats, cloneMode);
  world.lifetimeStats = deltaClone(delta.lifetimeStats, cloneMode);
  world.eventsThisYear = cloneMode === 'isolated' ? [...delta.eventsThisYear] : delta.eventsThisYear;
  world.activeEvent = deltaCloneOptional(delta.activeEvent, cloneMode);
  world.lastEventYear = delta.lastEventYear;
  world.bountifulHarvest = delta.bountifulHarvest;
  world.ecoHealthYearsAbove80 = delta.ecoHealthYearsAbove80;
  world.firstWeekVisitorSpawned = delta.firstWeekVisitorSpawned;
  world.totalBuildingsCompleted = delta.totalBuildingsCompleted;
  world.nextEntityId = delta.nextEntityId;
  world.nextBuildingId = delta.nextBuildingId;
  world.nextFloatingTextId = delta.nextFloatingTextId;
  world.renffrOmen = deltaCloneOptional(delta.renffrOmen, cloneMode);
  world.renffrChatterUntilTick = delta.renffrChatterUntilTick;
  world.lastProcessedCalendarDay = delta.lastProcessedCalendarDay;
  world.lastWildlifeReplenishLogDay = delta.lastWildlifeReplenishLogDay;

  world.entities = deltaClone(delta.aliveEntities, cloneMode);

  if (delta.catalogEntities?.length) {
    syncCatalogEntitiesToWorld(world, delta.catalogEntities);
  }

  if (delta.eventLogTail.length > 0) {
    const existingIds = new Set(world.eventLog.map((e) => e.id));
    for (const entry of delta.eventLogTail) {
      if (!existingIds.has(entry.id)) {
        world.eventLog.push(entry);
        existingIds.add(entry.id);
      }
    }
  }

  clearScreenShakeImpulse(world);
}

function applyCatalogPatch(existing: Entity, patch: Entity): void {
  for (const key of CATALOG_PATCH_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (key === 'skills') {
      existing.skills = structuredClone(patch.skills ?? {});
      continue;
    }
    (existing as unknown as Record<string, unknown>)[key] = value;
  }
}

/** Merge worker human snapshots into the main-thread world (commands + tick deltas). */
export function syncCatalogEntitiesToWorld(world: WorldState, catalogEntities: Entity[]): void {
  const byId = new Map(world.entities.map((e) => [e.id, e]));
  for (const patch of catalogEntities) {
    const existing = byId.get(patch.id);
    if (existing) applyCatalogPatch(existing, patch);
  }
}