import type { WorldState, Entity, Building } from '../gameTypes';
import { getWorkSchedule } from '../workSchedule';
import { getVenueSchedule } from '../venueSchedule';
import { getWorkforcePolicy, normalizeWorkforcePolicy } from '../workforcePolicy';
import { EntityType } from '../gameTypes';
import { EVENT_LOG_MAX_ENTRIES } from '../eventLog';
import type { SimulationFocus } from '../simFocus';
import type { EntityRenderMeta } from './entityRenderMeta';
import { packRenderMetaForPacked } from './entityRenderMeta';
import { selectRenderEntities } from './packRenderSoA';
import { RENDER_MAX_SLOTS } from './schema';
import { snapshotSimRng, restoreSimRng, type SimRngSnapshot } from '../simRng';

export const SIM_DELTA_PROTO = 1;

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
  aliveEntities: Entity[];
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
  visitorQuest: WorldState['visitorQuest'];
  deathsThisYear: WorldState['deathsThisYear'];
  lastMoonHowlerExorcismTick: WorldState['lastMoonHowlerExorcismTick'];
  moonHowlerPriestsFleeUntil: WorldState['moonHowlerPriestsFleeUntil'];
  chronicleChapters: WorldState['chronicleChapters'];
  renffrChatterUntilTick: number;
  lastProcessedCalendarDay: number;
  lastWildlifeReplenishLogDay: number;
  renderMetaBySlot?: EntityRenderMeta[];
  catalogEntities?: Entity[];
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
  renderPacked?: Entity[];
  focus?: SimulationFocus;
  headless?: boolean;
  cloneMode?: SimDeltaCloneMode;
  prevBuildings?: ReadonlyMap<number, Building> | null;
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

const CATALOG_PATCH_KEYS = [
  'name', 'surname', 'maidenSurname', 'title', 'chatPhrase', 'gender', 'spriteVariant', 'faction',
  'moonHowlerCursed', 'moonHowlerSaved', 'educated', 'pregnant', 'pregnantById',
  'pregnancyProgress', 'pregnancyDueProgress', 'courtshipPartnerId', 'courtshipProgress',
  'courtshipCooldownDays',
  'youthLovePartnerId', 'youthLoveProgress', 'childhoodFriendsIds', 'traits', 'schoolDays',
  'relationshipStatus', 'partnerId', 'homeBuildingId', 'residenceBuildingId',
  'tamedBy', 'combatTicks', 'griefUntilTick', 'job', 'occupation', 'skills', 'age', 'birthYear',
  'birthMonth', 'birthDay', 'generation', 'energy', 'maxEnergy', 'x', 'y', 'vx', 'vy',
  'spriteAngle', 'animFrame', 'size', 'flash', 'huntTargetId', 'chatTicks',
  'chatPartnerId', 'chatDialogueSessionKey', 'prisonBuildingId', 'prisonerUntilTick',
  'prisonSentenceCrime', 'affairPartnerId', 'affairProgress', 'isJuvenile', 'alive',
  'scandalCooldownUntilTick',
] as const satisfies readonly (keyof Entity)[];

/**
 * Fields that can transition to undefined (divorces, breakups, release from prison, job changes, grief expiry).
 * Without being listed here, clearing a partner, title, or home would be skipped during UI sync.
 */
const CATALOG_CLEARABLE_KEYS = [
  'chatPhrase',
  'chatTicks',
  'chatPartnerId',
  'chatDialogueSessionKey',
  'partnerId',
  'affairPartnerId',
  'courtshipPartnerId',
  'youthLovePartnerId',
  'pregnantById',
  'prisonBuildingId',
  'prisonerUntilTick',
  'prisonSentenceCrime',
  'homeBuildingId',
  'residenceBuildingId',
  'huntTargetId',
  'title',
  'griefUntilTick',
] as const satisfies readonly (keyof Entity)[];

export function simTickDeltaFromWorld(world: WorldState): SimTickDelta {
  const alive = world.entities.filter((e) => e.alive);
  return extractSimTickDelta(world, alive);
}

export function createFallbackSimTickDelta(world: WorldState): SimTickDelta {
  return simTickDeltaFromWorld(world);
}

/**
 * The full-slice delta for one tick. `aliveOrdered` is the tick's own alive list when the caller
 * already built one (the worker does); otherwise it is derived from `world.entities`.
 *
 * The delta carries `aliveEntities` as a **complete replacement**, so it deliberately does not also
 * ship per-tick spawn/death id lists: they were extracted and transferred every tick but read by
 * nobody (worker-boundary audit F6 — the only consumer, `EntityCatalog.applyTickDelta`, had zero call
 * sites because the catalog is rebuilt from the world instead).
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

  const headless = options?.headless ?? false;
  const cloneMode = options?.cloneMode ?? 'isolated';

  const renderPacked = headless
    ? undefined
    : options?.renderPacked
      ?? selectRenderEntities(aliveNow, RENDER_MAX_SLOTS, options?.focus).packed;

  const eventLogTail = world.eventLog.slice(0, EVENT_LOG_DELTA_TAIL_MAX);

  const prevBuildings = options?.prevBuildings;
  let changedBuildings: Building[] | undefined;
  let removedBuildingIds: number[] | undefined;

  if (prevBuildings) {
    changedBuildings = [];
    removedBuildingIds = [];
    const currentIds = new Set<number>();
    for (const building of world.buildings) {
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
      // Carried explicitly: the display world reads these instead of adding the maps up
      // (`LIVE-FINDINGS-STATUS.md`, F2), and `workerBoundary.closure.test.ts` fails if a
      // simulation-written field is not shipped.
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
  world.visitorQuest = deltaCloneOptional(delta.visitorQuest, cloneMode) ?? undefined;
  world.deathsThisYear = deltaCloneOptional(delta.deathsThisYear, cloneMode) ?? undefined;
  world.lastMoonHowlerExorcismTick = delta.lastMoonHowlerExorcismTick;
  world.moonHowlerPriestsFleeUntil = delta.moonHowlerPriestsFleeUntil;
  world.chronicleChapters = deltaClone(delta.chronicleChapters ?? [], cloneMode);
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

  world.entities = deltaClone(delta.aliveEntities, cloneMode);

  if (delta.catalogEntities?.length) {
    syncCatalogEntitiesToWorld(world, delta.catalogEntities);
  }

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

function applyCatalogPatch(existing: Entity, patch: Entity): void {
  for (const key of CATALOG_PATCH_KEYS) {
    const value = patch[key];
    const clearable = (CATALOG_CLEARABLE_KEYS as readonly string[]).includes(key);
    if (value === undefined && !clearable) continue;
    if (key === 'skills') {
      existing.skills = structuredClone(patch.skills ?? {});
      continue;
    }
    if (key === 'traits' || key === 'childhoodFriendsIds') {
      (existing as unknown as Record<string, unknown>)[key] = value ? structuredClone(value) : undefined;
      continue;
    }
    (existing as unknown as Record<string, unknown>)[key] = value;
  }
}

export function syncCatalogEntitiesToWorld(world: WorldState, catalogEntities: Entity[]): void {
  const byId = new Map(world.entities.map((e) => [e.id, e]));
  for (const patch of catalogEntities) {
    const existing = byId.get(patch.id);
    if (existing) applyCatalogPatch(existing, patch);
  }
}