import type { WorldState, Entity, Building } from '../gameTypes';
import { getWorkSchedule } from '../workSchedule';
import { getVenueSchedule } from '../venueSchedule';
import { EntityType } from '../gameTypes';
import { EVENT_LOG_MAX_ENTRIES } from '../eventLog';
import type { SimulationFocus } from '../simFocus';
import type { EntityRenderMeta } from './entityRenderMeta';
import { packRenderMetaForPacked } from './entityRenderMeta';
import { selectRenderEntities } from './packRenderSoA';
import { RENDER_MAX_SLOTS } from './schema';

export const SIM_DELTA_PROTO = 1;
export const EVENT_LOG_DELTA_TAIL_MAX = 128;

export type SimDeltaCloneMode = 'isolated' | 'transfer';

export interface ExtractSimTickDeltaOptions {
  renderPacked?: Entity[];
  focus?: SimulationFocus;
  headless?: boolean;
  cloneMode?: SimDeltaCloneMode;
  prevBuildings?: ReadonlyMap<number, Building> | null;
}

export interface ApplySimTickDeltaOptions {
  cloneMode?: SimDeltaCloneMode;
}

/** Keep player-dismissed Big News across worker ticks. */
export function preserveBigNewsDismissals(
  prev: WorldState['bigNews'],
  incoming: WorldState['bigNews'],
  dismissedIds?: readonly string[],
): WorldState['bigNews'] {
  const dismissed = new Set<string>([
    ...prev.filter((n) => n.dismissed).map((n) => n.id),
    ...(dismissedIds ?? []),
  ]);
  return dismissed.size === 0 ? incoming : incoming.filter((n) => !dismissed.has(n.id));
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
  dismissedIds?: readonly string[],
): WorldState['notifications'] {
  const hidden = new Set(dismissedIds ?? []);
  return incoming.filter((n) => !n.dismissed && !hidden.has(n.id));
}

function deltaClone<T>(value: T, mode: SimDeltaCloneMode): T {
  return mode === 'isolated' ? structuredClone(value) : value;
}

function deltaCloneOptional<T>(value: T | null | undefined, mode: SimDeltaCloneMode): T | null {
  if (value == null) return null;
  return mode === 'isolated' ? structuredClone(value) : value;
}

function buildingFingerprint(building: Building): string {
  return JSON.stringify(building);
}

const CATALOG_PATCH_KEYS = [
  'name', 'surname', 'chatPhrase', 'gender', 'spriteVariant', 'faction',
  'moonHowlerCursed', 'moonHowlerSaved', 'educated', 'pregnant', 'pregnantById',
  'pregnancyProgress', 'pregnancyDueProgress', 'courtshipProgress', 'relationshipStatus',
  'partnerId', 'homeBuildingId', 'residenceBuildingId', 'tamedBy', 'combatTicks',
  'job', 'occupation', 'skills', 'age', 'birthYear', 'birthMonth', 'birthDay', 'generation',
  'energy', 'maxEnergy', 'x', 'y', 'vx', 'vy',
  'spriteAngle', 'animFrame', 'size', 'flash', 'huntTargetId', 'chatTicks',
  'chatPartnerId', 'chatDialogueSessionKey',
  'prisonBuildingId', 'prisonerUntilTick', 'prisonSentenceCrime', 'affairPartnerId',
  'affairProgress', 'isJuvenile', 'alive',
] as const satisfies readonly (keyof Entity)[];

const CATALOG_CLEARABLE_KEYS = new Set<keyof Entity>([
  'chatPhrase',
  'chatTicks',
  'chatPartnerId',
  'chatDialogueSessionKey',
]);

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
  valleyStage: WorldState['valleyStage'];
  valleyStageSinceDay: number | undefined;
  valleyRawStressStreakDays: number | undefined;
  valleyRawCalmStreakDays: number | undefined;
  valleyLastStageNotifyDay: number | undefined;
  villageReputation: number;
  workSchedule: WorldState['workSchedule'];
  tavernSchedule: WorldState['tavernSchedule'];
  hotelSchedule: WorldState['hotelSchedule'];
  screenShakeImpulse: number;
  floatingTexts: WorldState['floatingTexts'];
  deathParticles: WorldState['deathParticles'];
  buildings?: Building[];
  changedBuildings?: Building[];
  removedBuildingIds?: number[];
  aliveEntities: Entity[];
  diedIds: number[];
  newEntities: Entity[];
  eventLogTail: WorldState['eventLog'];
  bigNews: WorldState['bigNews'];
  notifications: WorldState['notifications'];
  festival: WorldState['festival'];
  townHallFestivalCooldownUntilTick: number;
  visitorGroups: WorldState['visitorGroups'];
  activeVillageRequest: WorldState['activeVillageRequest'];
  villageRequestCooldownUntilDay: number;
  villageRequestHistory: NonNullable<WorldState['villageRequestHistory']>;
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
  renderMetaBySlot?: EntityRenderMeta[];
  catalogEntities?: Entity[];
  storyFlags: WorldState['storyFlags'];
  pendingStoryEvents: NonNullable<WorldState['pendingStoryEvents']>;
  guidedCampaign: WorldState['guidedCampaign'];
}

function simTickDeltaFromWorld(world: WorldState, aliveBefore?: Set<number>): SimTickDelta {
  const alive = world.entities.filter((e) => e.alive);
  const before = aliveBefore ?? new Set(alive.map((e) => e.id));
  return extractSimTickDelta(world, before, alive);
}

export function extractSimTickDelta(
  world: WorldState,
  aliveBefore: Set<number>,
  aliveOrdered?: Entity[],
  options?: ExtractSimTickDeltaOptions,
): SimTickDelta {
  const aliveNow: Entity[] = aliveOrdered ?? [];
  const aliveIds = new Set<number>();

  if (!aliveOrdered) {
    for (let i = 0; i < world.entities.length; i++) {
      const e = world.entities[i];
      if (e.alive) {
        aliveNow.push(e);
        aliveIds.add(e.id);
      }
    }
  } else {
    for (let i = 0; i < aliveNow.length; i++) {
      aliveIds.add(aliveNow[i].id);
    }
  }

  const diedIds: number[] = [];
  for (const id of aliveBefore) {
    if (!aliveIds.has(id)) diedIds.push(id);
  }

  const newEntities = aliveNow.filter((e) => !aliveBefore.has(e.id));
  const headless = options?.headless ?? false;
  const cloneMode = options?.cloneMode ?? 'isolated';

  const renderPacked = headless
    ? undefined
    : options?.renderPacked ?? selectRenderEntities(aliveNow, RENDER_MAX_SLOTS, options?.focus).packed;

  const eventLogTail = world.eventLog.slice(0, EVENT_LOG_DELTA_TAIL_MAX);

  // Building delta optimization
  const prevBuildings = options?.prevBuildings;
  let changedBuildings: Building[] | undefined;
  let removedBuildingIds: number[] | undefined;

  if (prevBuildings) {
    changedBuildings = [];
    removedBuildingIds = [];
    const currentIds = new Set<number>();

    for (let i = 0; i < world.buildings.length; i++) {
      const building = world.buildings[i];
      currentIds.add(building.id);
      const prev = prevBuildings.get(building.id);
      if (!prev || buildingFingerprint(prev) !== buildingFingerprint(building)) {
        changedBuildings.push(building);
      }
    }

    for (const id of prevBuildings.keys()) {
      if (!currentIds.has(id)) removedBuildingIds.push(id);
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
    humanPopulation: world.humanPopulation,
    maxHumanPopulation: world.maxHumanPopulation,
    wildlifeCounts: { ...world.wildlifeCounts },
    ecosystemHealth: world.ecosystemHealth,
    pollutionLevel: world.pollutionLevel,
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
    screenShakeImpulse: world.screenShakeImpulse,
    floatingTexts: deltaClone(world.floatingTexts, cloneMode),
    deathParticles: deltaClone(world.deathParticles, cloneMode),
    aliveEntities: deltaClone(aliveNow, cloneMode),
    diedIds,
    newEntities: deltaClone(newEntities, cloneMode),
    eventLogTail: deltaClone(eventLogTail, cloneMode),
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
    tradeRoutes: deltaClone(world.tradeRoutes, cloneMode),
    disasters: deltaClone(world.disasters, cloneMode),
    villageForge: deltaClone(world.villageForge, cloneMode),
    populationHistory: deltaClone(world.populationHistory, cloneMode),
    yearlyStats: deltaClone(world.yearlyStats, cloneMode),
    lifetimeStats: deltaClone(world.lifetimeStats, cloneMode),
    eventsThisYear: cloneMode === 'isolated' ? [...(world.eventsThisYear ?? [])] : (world.eventsThisYear ?? []),
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
    storyFlags: deltaClone(world.storyFlags ?? {}, cloneMode),
    pendingStoryEvents: deltaClone(world.pendingStoryEvents ?? [], cloneMode),
    guidedCampaign: deltaCloneOptional(world.guidedCampaign, cloneMode) ?? undefined,
  };

  if (changedBuildings) {
    delta.changedBuildings = deltaClone(changedBuildings, cloneMode);
    delta.removedBuildingIds = removedBuildingIds;
  } else {
    delta.buildings = deltaClone(world.buildings, cloneMode);
  }

  if (!headless && renderPacked) {
    delta.renderMetaBySlot = packRenderMetaForPacked(renderPacked);
    delta.catalogEntities = deltaClone(
      aliveNow.filter((e) => e.type === EntityType.Human),
      cloneMode,
    );
  }

  return delta;
}

/**
 * Creates a minimal fallback SimTickDelta from a WorldState by delegating
 * directly to extractSimTickDelta in headless mode.
 */
export function createFallbackSimTickDelta(world: WorldState): SimTickDelta {
  const alive = world.entities.filter((e) => e.alive);
  const aliveSet = new Set(alive.map((e) => e.id));
  return extractSimTickDelta(world, aliveSet, alive, {
    headless: true,
    cloneMode: 'isolated',
  });
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
  world.humanPopulation = delta.humanPopulation;
  world.maxHumanPopulation = delta.maxHumanPopulation;
  world.wildlifeCounts = { ...delta.wildlifeCounts };
  world.ecosystemHealth = delta.ecosystemHealth;
  world.pollutionLevel = delta.pollutionLevel;
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
  world.screenShakeImpulse = delta.screenShakeImpulse;
  world.floatingTexts = deltaClone(delta.floatingTexts, cloneMode);
  world.deathParticles = deltaClone(delta.deathParticles, cloneMode);

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
  world.villageRequestHistory = deltaClone(delta.villageRequestHistory, cloneMode);
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
  world.tradeRoutes = deltaClone(delta.tradeRoutes, cloneMode);
  world.disasters = deltaClone(delta.disasters, cloneMode);
  world.villageForge = deltaClone(delta.villageForge, cloneMode);
  world.populationHistory = deltaClone(delta.populationHistory, cloneMode);
  world.yearlyStats = deltaClone(delta.yearlyStats, cloneMode);
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
  world.renffrChatterUntilTick = delta.renffrChatterUntilTick;
  world.lastProcessedCalendarDay = delta.lastProcessedCalendarDay;
  world.lastWildlifeReplenishLogDay = delta.lastWildlifeReplenishLogDay;
  world.storyFlags = deltaClone(delta.storyFlags, cloneMode);
  world.pendingStoryEvents = deltaClone(delta.pendingStoryEvents, cloneMode);
  world.guidedCampaign = deltaCloneOptional(delta.guidedCampaign, cloneMode) ?? undefined;

  world.entities = deltaClone(delta.aliveEntities, cloneMode);

  if (delta.catalogEntities?.length) {
    syncCatalogEntitiesToWorld(world, delta.catalogEntities);
  }

  if (delta.eventLogTail.length > 0) {
    const existingIds = new Set(world.eventLog.map((e) => e.id));
    const seenTailIds = new Set<string | number>();
    const newEntries: WorldState['eventLog'] = [];

    for (let i = 0; i < delta.eventLogTail.length; i++) {
      const entry = delta.eventLogTail[i];
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

function applyCatalogPatch(existing: Entity, patch: Entity): void {
  for (let i = 0; i < CATALOG_PATCH_KEYS.length; i++) {
    const key = CATALOG_PATCH_KEYS[i];
    const value = patch[key];
    if (value === undefined && !CATALOG_CLEARABLE_KEYS.has(key)) continue;

    if (key === 'skills') {
      existing.skills = patch.skills ? { ...patch.skills } : {};
      continue;
    }
    (existing as unknown as Record<string, unknown>)[key] = value;
  }
}

export function syncCatalogEntitiesToWorld(world: WorldState, catalogEntities: Entity[]): void {
  const byId = new Map<number, Entity>();
  for (let i = 0; i < world.entities.length; i++) {
    byId.set(world.entities[i].id, world.entities[i]);
  }
  for (let i = 0; i < catalogEntities.length; i++) {
    const patch = catalogEntities[i];
    const existing = byId.get(patch.id);
    if (existing) applyCatalogPatch(existing, patch);
  }
}