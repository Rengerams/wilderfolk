import type { WorldState, Entity } from './gameTypes';
import { EntityType, BuildingType, DEFAULT_WORKSHOP_RECIPE_ID, INITIAL_CHALLENGES } from './gameTypes';
import { createEmptyLifetimeStats } from './stats';
import {
  mergeForSave,
  createViewFromSave,
  restoreTransientWorldFieldsFromSave,
  type ViewState,
} from './viewState';
import { ENTITY_PERSISTED_FIELDS, WORLD_STATE_SAVE_KEYS } from './saveSchema';
import { generateWorldMap } from './terrainGen';
import {
  getCalendarDay, getHourOfDay, getAbsoluteCalendarDay, migrateHumanAges, rebuildChildrenIds,
  TICKS_PER_DAY, DAYS_PER_YEAR,
  assignMissingResidences,
} from './dayCycle';
import { mergeCombatResearchNodes } from './combat';
import { createInitialVictories, computeVictoryProgress } from './victory';
import { loadAutoSavePreference, saveAutoSavePreference } from './preferences';
import { logEvent, syncEventLogIdFromState } from './eventLog';
import { pickHumanVariant } from './humanSprites';
import { migrateLegacyMoonHowler } from './moonHowler';
import { isPlayerHuman } from './groupEvents';
import { GAME_VERSION } from './version';
import { ensureEntitySkills } from './skills';

import { seedTutorialSeenForExistingState } from './contextualTutorial';
import { syncResearchUnlocks } from './research';
import { assignMissingWorkers, syncBigNewsIdFromState } from './gameEngine';
import {
  getCampDistancePixels,
  getCampDistanceTiles,
  getIncomingRaidExpireTicks,
} from './frontierCombat';
import { computeWildlifeCounts } from './entityCounts';
import { ensureFullTradeRoutes } from './economy';
import { enrichTradeRoute, scheduleTradeRouteDeparture } from './tradeCaravans';
import { clearAllFactionWanderStates } from './factionWander';
import { validateVillageLeaderOnLoad } from './villageLeadership';
import { migrateVillageForgeOnLoad } from './forge';

const SAVE_KEY = 'ecosim_save';
const COMPATIBLE_SAVE_VERSIONS = ['2.0', '2.1', '2.2', '0.4', '0.4.1', '0.4.2'] as const;

/** Restore entity fields that must survive save/load (see ENTITY_PERSISTED_FIELDS). */
function migrateEntityPersistedFields(entity: Entity, saved: Partial<Entity>): void {
  for (const key of ENTITY_PERSISTED_FIELDS) {
    const value = saved[key];
    if (value !== undefined) {
      (entity as unknown as Record<string, unknown>)[key] = value;
    }
  }
  ensureEntitySkills(entity);
}

export type SaveResult = { success: true } | { success: false; error: string };

export type SaveReadResult =
  | { valid: false }
  | { valid: true; parsed: Record<string, unknown> };

function pickWorldStateFromSave(parsed: Record<string, unknown>): Partial<WorldState> {
  const out: Partial<WorldState> = {};
  for (const key of WORLD_STATE_SAVE_KEYS) {
    if (key in parsed) (out as Record<string, unknown>)[key] = parsed[key];
  }
  return out;
}

export function readSavePayload(): SaveReadResult {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { valid: false };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!COMPATIBLE_SAVE_VERSIONS.includes(parsed._version as typeof COMPATIBLE_SAVE_VERSIONS[number])) {
      return { valid: false };
    }
    return { valid: true, parsed };
  } catch (e) {
    console.error('Save read failed:', e);
    return { valid: false };
  }
}

function compactWorldMapForSave(worldMap: WorldState['worldMap']) {
  if (!worldMap) return null;
  return {
    seed: worldMap.seed,
    preset: worldMap.preset,
    size: worldMap.size,
    width: worldMap.width,
    height: worldMap.height,
    _compact: true as const,
  };
}

function restoreWorldMapFromSave(parsed: { worldMap?: WorldState['worldMap'] & { _compact?: boolean } }): WorldState['worldMap'] {
  if (!parsed.worldMap) return null;
  if (parsed.worldMap.tiles && !parsed.worldMap._compact) {
    return parsed.worldMap;
  }
  return generateWorldMap(
    parsed.worldMap.size ?? 'medium',
    parsed.worldMap.preset ?? 'verdant',
    parsed.worldMap.seed
  );
}

/** Strip per-tick runtime indexes before persistence (not in WORLD_STATE_SAVE_KEYS). */
function stripRuntimeWorldFields(world: WorldState): WorldState {
  const {
    entityByType: _entityByType,
    grassGrid: _grassGrid,
    mobileGrid: _mobileGrid,
    treeGrid: _treeGrid,
    treeGridAlive: _treeGridAlive,
    scentGrid: _scentGrid,
    roadAvoidance: _roadAvoidance,
    roadAvoidanceStamp: _roadAvoidanceStamp,
    ...serializable
  } = world;
  return serializable;
}

export function saveGame(world: WorldState, view: ViewState): SaveResult {
  try {
    const persistable = stripRuntimeWorldFields(world);
    const saveData = {
      ...mergeForSave(persistable, view),
      worldMap: compactWorldMapForSave(persistable.worldMap),
      _savedAt: Date.now(),
      _version: GAME_VERSION,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    return { success: true };
  } catch (e) {
    const error =
      e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'Storage full — try a smaller map or clear browser data'
        : 'Save failed — check browser storage permissions';
    return { success: false, error };
  }
}

export function loadGame(): { world: WorldState; view: ViewState } | null {
  try {
    const result = readSavePayload();
    if (!result.valid) return null;
    const parsed = result.parsed;
    const worldData = pickWorldStateFromSave(parsed);

    const loadedTick = (worldData.tick ?? (parsed.tick as number | undefined) ?? 0) as number;
    const autoSave = typeof worldData.autoSave === 'boolean'
      ? worldData.autoSave
      : loadAutoSavePreference();
    saveAutoSavePreference(autoSave);

    const transient = restoreTransientWorldFieldsFromSave(parsed);
    const world = {
      ...worldData,
      buildings: worldData.buildings ?? [],
      scentGrid: undefined,
      autoSave,
      tick: loadedTick,
      lastProcessedCalendarDay: typeof worldData.lastProcessedCalendarDay === 'number'
        ? worldData.lastProcessedCalendarDay
        : getAbsoluteCalendarDay(loadedTick),
      dayInYear: getCalendarDay(loadedTick),
      year: Math.floor(loadedTick / (TICKS_PER_DAY * DAYS_PER_YEAR)),
      paused: true,
      ...transient,
      bigNews: [],
      screenShakeImpulse: 0,
      festival: worldData.festival ?? null,
      townHallFestivalCooldownUntilTick: worldData.townHallFestivalCooldownUntilTick ?? 0,
      storageMax: worldData.storageMax || { wood: 500, stone: 300, food: 600, gold: 99999 },
      foodSpoilageRate: worldData.foodSpoilageRate ?? 0.03,
      eventLog: worldData.eventLog || [],
      worldMap: restoreWorldMapFromSave(parsed),
      victories: worldData.victories ?? createInitialVictories(),
      victoryAchieved: worldData.victoryAchieved ?? null,
      ecoHealthYearsAbove80: worldData.ecoHealthYearsAbove80 ?? 0,
      firstWeekVisitorSpawned: worldData.firstWeekVisitorSpawned ?? false,
      visitorGroups: (worldData.visitorGroups ?? []).map((g) => ({
        ...g,
        tradesCompleted: g.tradesCompleted ?? 0,
        refugeeResolved: g.refugeeResolved ?? g.kind !== 'refugees',
        leaderTalked: g.leaderTalked ?? false,
        spawnedAtCalendarDay: g.spawnedAtCalendarDay ?? getAbsoluteCalendarDay(loadedTick),
      })),
      rivalSettlements: (worldData.rivalSettlements ?? []).map((r) => ({
        ...r,
        raidCooldownDays: r.raidCooldownDays ?? 30,
        peaceTreatyDays: r.peaceTreatyDays ?? 0,
      })),
      pendingDiplomacyEvents: worldData.pendingDiplomacyEvents ?? [],
      pendingRaidEvents: worldData.pendingRaidEvents ?? [],
      pendingOutgoingRaidEvents: worldData.pendingOutgoingRaidEvents ?? [],
      entities: (worldData.entities || []).map((e: Partial<Entity>) => {
        const entity = {
          childrenIds: [],
          generation: 0,
          spriteAngle: 0,
          animFrame: 0,
          vx: 0,
          vy: 0,
          alive: true,
          flash: 0,
          skills: {},
          birthYear: 0,
          birthMonth: 0,
          birthDay: 0,
          ...e,
        } as Entity;
        migrateEntityPersistedFields(entity, e);
        if (entity.type === EntityType.Human && entity.spriteVariant === undefined && entity.gender) {
          entity.spriteVariant = pickHumanVariant(entity.id, entity.gender);
        }
        migrateLegacyMoonHowler(entity, getAbsoluteCalendarDay(loadedTick), getHourOfDay(loadedTick));
        return entity;
      }),
    } as WorldState;
    syncEventLogIdFromState(world);
    syncBigNewsIdFromState(world);
    world.totalBuildingsCompleted = (world.buildings ?? []).filter(
      (b) => b.completed && b.faction !== 'rival',
    ).length;
    world.challenges = world.challenges?.length
      ? world.challenges
      : structuredClone(INITIAL_CHALLENGES);
    world.yearlyStats = world.yearlyStats ?? [];
    world.lifetimeStats = world.lifetimeStats ?? createEmptyLifetimeStats();
    world.eventsThisYear = worldData.eventsThisYear ?? [];
    world.wildlifeCounts = computeWildlifeCounts(world.entities);

    world.buildings = (world.buildings || []).map((b) =>
      b.type === BuildingType.Workshop && !b.workshopRecipeId
        ? { ...b, workshopRecipeId: DEFAULT_WORKSHOP_RECIPE_ID }
        : b,
    );

    const saveVersion = parsed._version as string;
    const forceAgeMigration =
      saveVersion === '2.0'
      || saveVersion === '2.1'
      || saveVersion === '2.2'
      || saveVersion === '0.4'
      || saveVersion === '0.4.1';
    migrateHumanAges(
      world.entities,
      { year: world.year, dayInYear: world.dayInYear },
      { forceCalendar: forceAgeMigration },
    );
    rebuildChildrenIds(world.entities);
    assignMissingResidences(world.entities.filter(isPlayerHuman), world.buildings, world.entities);
    assignMissingWorkers(world.entities.filter(isPlayerHuman), world.buildings);

    const applySaveMigration = (id: string, message: string) => {
      if (!world.appliedSaveMigrations) world.appliedSaveMigrations = [];
      if (world.appliedSaveMigrations.includes(id)) return;
      world.appliedSaveMigrations.push(id);
      logEvent(world, 'event', message);
    };

    if (forceAgeMigration) {
      world.foodSpoilageRate = 0.03;
      applySaveMigration('v0.4', 'Save migrated to v0.4 — calendar, housing, and balance refreshed.');
    }

    if (saveVersion === '0.4') {
      applySaveMigration('v0.4.1', 'Save migrated to v0.4.1 — diplomacy, leadership, trade routes, and victory paths refreshed.');
    }

    if (saveVersion === '0.4.1' || saveVersion === '0.4') {
      applySaveMigration('v0.4.2', 'Save migrated to v0.4.2 — 6-tab UI, forge, defense buildings, and balance pass features are active.');
    }

    mergeCombatResearchNodes(world.researchNodes);
    syncResearchUnlocks(world);
    world.tradeRoutes = ensureFullTradeRoutes(world.tradeRoutes ?? []);
    world.lifetimeStats.tradeCaravansCompleted ??= 0;
    world.lifetimeStats.goldFromTradeRoutes ??= 0;
    for (let i = 0; i < world.tradeRoutes.length; i++) {
      const route = world.tradeRoutes[i];
      enrichTradeRoute(route, world, i);
      if (route.active && route.caravanCarrierId == null && route.nextDepartureTick == null) {
        scheduleTradeRouteDeparture(world, route);
      }
    }
    world.villageLeaderId = (parsed.villageLeaderId as number | null | undefined) ?? null;
    world.leaderSinceYear = (parsed.leaderSinceYear as number | undefined) ?? 0;
    world.lastElectionYear = (parsed.lastElectionYear as number | undefined) ?? -1;
    world.pendingElectionYear = (parsed.pendingElectionYear as number | null | undefined) ?? null;
    world.electionBuildupNotifiedYear = (parsed.electionBuildupNotifiedYear as number | null | undefined) ?? null;
    world.electionCeremony = (parsed.electionCeremony as WorldState['electionCeremony']) ?? null;
    validateVillageLeaderOnLoad(world);
    migrateVillageForgeOnLoad(world);
    for (const challenge of world.challenges ?? []) {
      const fresh = INITIAL_CHALLENGES.find((c) => c.id === challenge.id);
      if (!fresh || challenge.completed) continue;
      if (fresh.targetPopulation != null) challenge.targetPopulation = fresh.targetPopulation;
      if (fresh.targetBuildings != null) challenge.targetBuildings = fresh.targetBuildings;
      challenge.description = fresh.description;
    }
    world.pendingRaidEvents = (world.pendingRaidEvents ?? []).map((evt) => {
      if (evt.expiresAtTick != null && evt.marchDistanceTiles != null) return evt;
      const rival = world.rivalSettlements.find((r) => r.id === evt.rivalId);
      const distPx = rival ? getCampDistancePixels(world, world.buildings, rival) : 300;
      return {
        ...evt,
        marchDistanceTiles: evt.marchDistanceTiles ?? getCampDistanceTiles(distPx),
        expiresAtTick: evt.expiresAtTick ?? evt.createdAtTick + getIncomingRaidExpireTicks(distPx),
      };
    });

    world.victories = computeVictoryProgress(world);
    world.tutorialSeen = seedTutorialSeenForExistingState({
      ...world,
      tutorialSeen: (parsed.tutorialSeen as string[] | undefined) ?? [],
    });
    clearAllFactionWanderStates();
    const view = createViewFromSave(parsed, world);
    return { world, view };
  } catch (e) {
    console.error('Save load failed:', e);
    return null;
  }
}

export function hasSave(): boolean {
  return readSavePayload().valid;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
