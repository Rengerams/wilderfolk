import type { WorldState, Entity } from './gameTypes';
import { EntityType, BuildingType, DEFAULT_WORKSHOP_RECIPE_ID, INITIAL_CHALLENGES } from './gameTypes';
import { createEmptyLifetimeStats } from './stats';
import { mergeForSave, createViewFromSave, type ViewState } from './viewState';
import { generateWorldMap } from './terrainGen';
import {
  getCalendarDay, getHourOfDay, migrateHumanAges, rebuildChildrenIds,
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
import { replenishDepletedWildlife } from './worldGen';
import { seedTutorialSeenForExistingState } from './contextualTutorial';
import { syncResearchUnlocks } from './research';
import { assignMissingWorkers } from './gameEngine';
import {
  getCampDistancePixels,
  getCampDistanceTiles,
  getIncomingRaidExpireTicks,
} from './frontierCombat';
import { computeWildlifeCounts } from './entityCounts';
import { ensureFullTradeRoutes } from './economy';
import { validateVillageLeaderOnLoad } from './villageLeadership';
import { migrateVillageForgeOnLoad } from './forge';

const SAVE_KEY = 'ecosim_save';
const COMPATIBLE_SAVE_VERSIONS = ['2.0', '2.1', '2.2', '0.4', '0.4.1', '0.4.2'] as const;

export type SaveResult = { success: true } | { success: false; error: string };

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

export function saveGame(world: WorldState, view: ViewState): SaveResult {
  try {
    const saveData = {
      ...mergeForSave(world, view),
      worldMap: compactWorldMapForSave(world.worldMap),
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
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!COMPATIBLE_SAVE_VERSIONS.includes(parsed._version)) return null;

    const {
      camera: _viewCamera,
      selectedEntity: _viewSelectedEntity,
      selectedBuilding: _viewSelectedBuilding,
      hoveredBuilding: _viewHoveredBuilding,
      buildMode: _viewBuildMode,
      buildGhost: _viewBuildGhost,
      showGrid: _viewShowGrid,
      showPaths: _viewShowPaths,
      showTechTree: _viewShowTechTree,
      screenShake: _viewScreenShake,
      ...worldData
    } = parsed;
    void _viewCamera;
    void _viewSelectedEntity;
    void _viewSelectedBuilding;
    void _viewHoveredBuilding;
    void _viewBuildMode;
    void _viewBuildGhost;
    void _viewShowGrid;
    void _viewShowPaths;
    void _viewShowTechTree;
    void _viewScreenShake;

    const loadedTick = worldData.tick ?? parsed.tick ?? 0;
    const autoSave = typeof worldData.autoSave === 'boolean'
      ? worldData.autoSave
      : loadAutoSavePreference();
    saveAutoSavePreference(autoSave);

    const world: WorldState = {
      ...worldData,
      autoSave,
      tick: loadedTick,
      dayInYear: getCalendarDay(loadedTick),
      year: Math.floor(loadedTick / (TICKS_PER_DAY * DAYS_PER_YEAR)),
      paused: true,
      deathParticles: [],
      floatingTexts: [],
      notifications: [],
      bigNews: [],
      disasters: [],
      screenShakeImpulse: 0,
      festival: parsed.festival ?? null,
      storageMax: parsed.storageMax || { wood: 500, stone: 300, food: 600, gold: 99999 },
      foodSpoilageRate: parsed.foodSpoilageRate ?? 0.03,
      eventLog: parsed.eventLog || [],
      worldMap: restoreWorldMapFromSave(parsed),
      victories: parsed.victories ?? createInitialVictories(),
      victoryAchieved: parsed.victoryAchieved ?? null,
      ecoHealthYearsAbove80: parsed.ecoHealthYearsAbove80 ?? 0,
      firstWeekVisitorSpawned: parsed.firstWeekVisitorSpawned ?? false,
      visitorGroups: (parsed.visitorGroups ?? []).map((g: Record<string, unknown>) => ({
        ...g,
        tradesCompleted: (g.tradesCompleted as number) ?? 0,
        refugeeResolved: (g.refugeeResolved as boolean) ?? g.kind !== 'refugees',
        leaderTalked: (g.leaderTalked as boolean) ?? false,
      })),
      rivalSettlements: (parsed.rivalSettlements ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        raidCooldownDays: (r.raidCooldownDays as number) ?? 30,
        peaceTreatyDays: (r.peaceTreatyDays as number) ?? 0,
      })),
      pendingDiplomacyEvents: parsed.pendingDiplomacyEvents ?? [],
      pendingRaidEvents: parsed.pendingRaidEvents ?? [],
      entities: (parsed.entities || []).map((e: Partial<Entity>) => {
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
        if (entity.type === EntityType.Human && entity.spriteVariant === undefined && entity.gender) {
          entity.spriteVariant = pickHumanVariant(entity.id, entity.gender);
        }
        migrateLegacyMoonHowler(entity, getCalendarDay(loadedTick), getHourOfDay(loadedTick));
        ensureEntitySkills(entity);
        return entity;
      }),
    };
    syncEventLogIdFromState(world);
    world.challenges = world.challenges?.length
      ? world.challenges
      : structuredClone(INITIAL_CHALLENGES);
    world.yearlyStats = world.yearlyStats ?? [];
    world.lifetimeStats = world.lifetimeStats ?? createEmptyLifetimeStats();
    world.wildlifeCounts = parsed.wildlifeCounts ?? computeWildlifeCounts(world.entities);

    world.buildings = (world.buildings || []).map((b) =>
      b.type === BuildingType.Workshop && !b.workshopRecipeId
        ? { ...b, workshopRecipeId: DEFAULT_WORKSHOP_RECIPE_ID }
        : b,
    );

    const saveVersion = parsed._version as string;
    const forceAgeMigration = saveVersion === '2.0' || saveVersion === '2.1' || saveVersion === '2.2';
    migrateHumanAges(world.entities, { forceCalendar: forceAgeMigration });
    rebuildChildrenIds(world.entities);
    replenishDepletedWildlife(world);
    assignMissingResidences(world.entities, world.buildings);
    assignMissingWorkers(world.entities.filter(isPlayerHuman), world.buildings);

    if (forceAgeMigration) {
      world.foodSpoilageRate = 0.03;
      if (!world.eventLog.some((e) => e.message.includes('migrated to v0.4'))) {
        logEvent(world, 'event', 'Save migrated to v0.4 — calendar, housing, and balance refreshed.');
      }
    }

    if (saveVersion === '0.4') {
      if (!world.eventLog.some((e) => e.message.includes('migrated to v0.4.1'))) {
        logEvent(world, 'event', 'Save migrated to v0.4.1 — diplomacy, leadership, trade routes, and victory paths refreshed.');
      }
    }

    if (saveVersion === '0.4.1' || saveVersion === '0.4') {
      if (!world.eventLog.some((e) => e.message.includes('migrated to v0.4.2'))) {
        logEvent(world, 'event', 'Save migrated to v0.4.2 — 6-tab UI, forge, defense buildings, and balance pass features are active.');
      }
    }

    mergeCombatResearchNodes(world.researchNodes);
    syncResearchUnlocks(world);
    world.tradeRoutes = ensureFullTradeRoutes(world.tradeRoutes ?? []);
    world.villageLeaderId = (parsed.villageLeaderId as number | null | undefined) ?? null;
    world.leaderSinceYear = (parsed.leaderSinceYear as number | undefined) ?? 0;
    world.lastElectionYear = (parsed.lastElectionYear as number | undefined) ?? -1;
    world.pendingElectionYear = (parsed.pendingElectionYear as number | null | undefined) ?? null;
    world.electionBuildupNotifiedYear = (parsed.electionBuildupNotifiedYear as number | null | undefined) ?? null;
    world.electionCeremony = (parsed.electionCeremony as WorldState['electionCeremony']) ?? null;
    validateVillageLeaderOnLoad(world);
    migrateVillageForgeOnLoad(world);
    for (const challenge of world.challenges ?? []) {
      if (challenge.id === 'great_city' && challenge.targetBuildings == null) {
        challenge.targetBuildings = 20;
      }
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
    const view = createViewFromSave(parsed, world);
    return { world, view };
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return COMPATIBLE_SAVE_VERSIONS.includes(parsed._version);
  } catch {
    return false;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
