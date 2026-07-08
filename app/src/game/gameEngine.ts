import type {
  WorldState, Entity, EntityByType, Building, DeathParticle,
  FloatingText, Camera, GameEvent, Challenge,
} from './gameTypes';

import {
  BuildingType, EntityType,
  Season, WeatherType, ResearchType,
  BUILDING_CONFIGS,
  TerrainType,
  JobType, BUILDING_JOB_TYPES,
  WEREWOLF_CURSE_LINES, WEREWOLF_TRANSFORM_LINES, WEREWOLF_TAME_LINES,
  getWorkshopRecipe,
  getRenderEntityLayer,
  emptyEntityByType,
} from './gameTypes';
import { recordYearlyStats, updateLifetimeStats, trackYearEvent } from './stats';
import { checkVictoryAchievements } from './victory';
import { logEvent } from './eventLog';
import {
  ensureEntitySkills, readSkill, getWorkerSkillMultiplier,
  getJobForBuilding, getOccupationForBuilding, gainSkill, rewardProductionSkills, decayIdleSkills,
} from './skills';

export type { WorldState, Entity, EntityByType, Building, DeathParticle, FloatingText, GameEvent, Camera };
export type { GameState } from './gameTypes';
export { EntityType, BuildingType, Season, WeatherType, ResearchType, BUILDING_CONFIGS };
export {
  GRID_SIZE, GRID_SNAP, snapToGrid, TerrainType, BUILDING_JOB_TYPES, JobType,
  WORKSHOP_RECIPES, DEFAULT_WORKSHOP_RECIPE_ID, getWorkshopRecipe, formatRecipeInputs,
} from './gameTypes';
export type { WorkshopRecipe } from './gameTypes';
export { generateWorldMap } from './terrainGen';
export { recordYearlyStats, updateLifetimeStats, drawBarChart, drawLineChart } from './stats';
export type { YearlyStats, LifetimeStats } from './stats';
export { createInitialVictories, computeVictoryProgress, VICTORY_DEFINITIONS } from './victory';
export type { VictoryPath, VictoryProgress } from './gameTypes';
export { logEvent } from './eventLog';
import {
  buildingUsesAdjacency,
  ensureAdjacencyIndex,
  getAdjacencyMultiplierFromIndex,
  syncAdjacency,
} from './adjacencyIndex';
import { ensureEntityByIdMap, indexEntity } from './entityIndex';
import { getLumberMillTreeMultiplier } from './treeProximity';
import { getGrassGrowthMultiplier, getWinterEnergyPenalty } from './grassEcology';
import { isEntityOnBuilding } from './buildingRotation';
import {
  assignMissingResidences, buildWorkTicks, getCalendarDay, getHourOfDay,
  HUMAN_MAX_LIFESPAN_YEARS,
  IMMIGRATION_CHECK_TICKS, FESTIVAL_CHECK_TICKS, isProductionTick,
  PRODUCTION_INTERVAL, REPRODUCTION_COOLDOWN_TICKS,
  hasWorkAssignment, isImprisoned,
  isResidenceBuildingType, isWorkHour, getResidenceCapacity,
  TICKS_PER_DAY, WORK_START, isNightHour, ticksForDays,
  EVENT_INTERVAL, isNewCalendarDayTick, markCalendarDayProcessed,
  getAbsoluteCalendarDay, syncHumanAgeFromCalendar,
  reconcileOrphanedMarriages,
  isResidenceOccupantEntity,
  syncResidenceOccupants,
} from './dayCycle';

/** Region of the world that receives full simulation this tick. */
export interface SimulationFocus {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Extra margin around the viewport in world units where AI still runs. */
const FOCUS_MARGIN = 120;

/** How often off-screen humans run full AI (every N ticks). */
export const OFFSCREEN_HUMAN_THROTTLE = 8;

function sortEntitiesByY(entities: Entity[]): Entity[] {
  return entities.slice().sort((a, b) => a.y - b.y);
}

export {
  ensureEntityByIdMap,
  indexEntity,
  indexLivingEntity,
  rebuildEntityByIdMap,
  unindexEntity,
  unindexEntityFromState,
} from './entityIndex';

/** Bucket alive entities by `entity.type` (call again after mid-tick type changes, e.g. Moon Howlers). */
export function buildEntityByType(entities: Iterable<Entity>): EntityByType {
  const byType = emptyEntityByType();
  for (const e of entities) {
    if (e.alive) byType[e.type].push(e);
  }
  return byType;
}

/** Sorted draw lists for canvas layers — uses sim `byType` buckets (no full-entity scan). */
export function buildEntityDrawBuckets(byType: EntityByType): {
  trees: Entity[];
  animals: Entity[];
  humans: Entity[];
} {
  const trees = sortEntitiesByY(byType[EntityType.Tree]);
  const humans = sortEntitiesByY(byType[EntityType.Human]);
  const animals: Entity[] = [];
  for (const type of Object.values(EntityType) as EntityType[]) {
    if (getRenderEntityLayer(type) !== 'animal') continue;
    animals.push(...byType[type]);
  }
  return { trees, animals: sortEntitiesByY(animals), humans };
}

function isOnConstructionCrew(human: Entity, buildings: Building[]): boolean {
  return buildings.some((b) => !b.completed && b.occupants.includes(human.id));
}

/** How often off-screen wildlife runs full AI (every N ticks). */
export const OFFSCREEN_WILDLIFE_THROTTLE = 8;

/** How often off-screen grass patches grow/reproduce (every N ticks). */
export const OFFSCREEN_GRASS_THROTTLE = 4;

export function computeSimulationFocus(
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
): SimulationFocus {
  const halfW = canvasWidth / camera.zoom / 2 + FOCUS_MARGIN;
  const halfH = canvasHeight / camera.zoom / 2 + FOCUS_MARGIN;
  return {
    minX: camera.x - halfW,
    maxX: camera.x + halfW,
    minY: camera.y - halfH,
    maxY: camera.y + halfH,
  };
}

export function isInFocus(entity: Entity, focus: SimulationFocus): boolean {
  return (
    entity.x >= focus.minX
    && entity.x <= focus.maxX
    && entity.y >= focus.minY
    && entity.y <= focus.maxY
  );
}

/** Typical settlement viewport for headless sims — matches in-game camera throttling. */
export function createSimFocus(
  state: Pick<WorldState, 'width' | 'height'>,
  options?: Partial<{ canvasWidth: number; canvasHeight: number; zoom: number }>,
): SimulationFocus {
  const canvasWidth = options?.canvasWidth ?? 1280;
  const canvasHeight = options?.canvasHeight ?? 720;
  const zoom = options?.zoom ?? 0.45;
  const cx = state.width / 2;
  const cy = state.height / 2;
  const camera: Camera = {
    x: cx, y: cy, zoom,
    targetX: cx, targetY: cy, targetZoom: zoom,
  };
  return computeSimulationFocus(camera, canvasWidth, canvasHeight);
}

let nextBigNewsId = 1;

/** Restore monotonic big-news ids after loading a save or hot reload. */
export function syncBigNewsIdFromState(state: Pick<WorldState, 'bigNews'>): void {
  let maxSeq = 0;
  for (const item of state.bigNews) {
    const match = /^bn_(\d+)$/.exec(item.id) ?? /^bn_\d+_(\d+)_/.exec(item.id);
    if (match) {
      const seq = Number(match[1]);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  nextBigNewsId = maxSeq + 1;
}

export function addBigNews(
  state: WorldState,
  title: string,
  message: string,
  type: 'positive' | 'negative' | 'neutral' = 'neutral'
) {
  const seq = nextBigNewsId++;
  state.bigNews.push({
    id: `bn_${seq}`,
    title,
    message,
    type,
    createdAt: state.tick,
    dismissed: false,
  });
  if (state.bigNews.length > 50) state.bigNews.shift();
}

// ============ SPECIES CONFIG ============
interface SpeciesConfig {
  maxEnergy: number;
  energyLossPerTick: number;
  energyGain: Record<string, number>;
  maxAge: number;
  speed: number;
  size: number;
  reproductionCooldown: number;
  reproductionEnergyThreshold: number;
  reproductionChance: number;
  spawnEnergy: number;
  color: string;
  fleeRange: number;
  huntRange: number;
  wanderRadius: number;
  sprite: string;
}

export const SPECIES_CONFIG: Record<EntityType, SpeciesConfig> = {
  [EntityType.Grass]: {
    maxEnergy: 100, energyLossPerTick: 0, energyGain: {},
    maxAge: 365 * 5, speed: 0, size: 4,
    reproductionCooldown: 0, reproductionEnergyThreshold: 40, reproductionChance: 0.02, spawnEnergy: 30,
    color: '#22c55e', fleeRange: 0, huntRange: 0, wanderRadius: 30,
    sprite: '/sprites/grass.png',
  },
  [EntityType.Rabbit]: {
    maxEnergy: 120, energyLossPerTick: 2.5, energyGain: { grass: 25 },
    maxAge: 365 * 3, speed: 3.5, size: 7,
    reproductionCooldown: ticksForDays(2), reproductionEnergyThreshold: 70, reproductionChance: 0.05, spawnEnergy: 60,
    color: '#c4875a', fleeRange: 70, huntRange: 0, wanderRadius: 60,
    sprite: '/sprites/rabbit.png',
  },
  [EntityType.Deer]: {
    maxEnergy: 500, energyLossPerTick: 4.2, energyGain: { grass: 55 },
    maxAge: 365 * 12, speed: 3.0, size: 11,
    reproductionCooldown: ticksForDays(8), reproductionEnergyThreshold: 300, reproductionChance: 0.015, spawnEnergy: 250,
    color: '#926418', fleeRange: 90, huntRange: 0, wanderRadius: 80,
    sprite: '/sprites/deer.png',
  },
  [EntityType.Wolf]: {
    maxEnergy: 600, energyLossPerTick: 5.5, energyGain: { deer: 450, rabbit: 80 },
    maxAge: 365 * 8, speed: 3.2, size: 13,
    reproductionCooldown: ticksForDays(15), reproductionEnergyThreshold: 450, reproductionChance: 0.005, spawnEnergy: 350,
    color: '#6b7280', fleeRange: 0, huntRange: 150, wanderRadius: 120,
    sprite: '/sprites/wolf.png',
  },
  [EntityType.Fox]: {
    maxEnergy: 150, energyLossPerTick: 2.2, energyGain: { rabbit: 60, grass: 10 },
    maxAge: 365 * 5, speed: 3.4, size: 9,
    reproductionCooldown: ticksForDays(10), reproductionEnergyThreshold: 100, reproductionChance: 0.008, spawnEnergy: 90,
    color: '#ea580c', fleeRange: 0, huntRange: 100, wanderRadius: 100,
    sprite: '/sprites/fox.png',
  },
  [EntityType.Human]: {
    maxEnergy: 500, energyLossPerTick: 4.2, energyGain: { deer: 350, rabbit: 150 },
    maxAge: HUMAN_MAX_LIFESPAN_YEARS, speed: 2.25, size: 10,
    reproductionCooldown: REPRODUCTION_COOLDOWN_TICKS, reproductionEnergyThreshold: 180, reproductionChance: 0.02, spawnEnergy: 180,
    color: '#f5d0a9', fleeRange: 50, huntRange: 105, wanderRadius: 100,
    sprite: '/sprites/human_male.png',
  },
  [EntityType.Tree]: {
    maxEnergy: 500, energyLossPerTick: 0, energyGain: {},
    maxAge: 365 * 100, speed: 0, size: 12,
    reproductionCooldown: 0, reproductionEnergyThreshold: 300, reproductionChance: 0.003, spawnEnergy: 250,
    color: '#228B22', fleeRange: 0, huntRange: 0, wanderRadius: 0,
    sprite: '/sprites/tree.png',
  },
  [EntityType.Werewolf]: {
    maxEnergy: 700, energyLossPerTick: 6, energyGain: { deer: 400, rabbit: 100 },
    maxAge: 365 * 35, speed: 3.4, size: 14,
    reproductionCooldown: ticksForDays(30), reproductionEnergyThreshold: 300, reproductionChance: 0.001, spawnEnergy: 350,
    color: '#7c6f9a', fleeRange: 0, huntRange: 150, wanderRadius: 150,
    sprite: '/sprites/wolf.png',
  },
  [EntityType.Wildkin]: {
    maxEnergy: 450, energyLossPerTick: 3, energyGain: { grass: 45 },
    maxAge: 365 * 40, speed: 3.2, size: 12,
    reproductionCooldown: ticksForDays(12), reproductionEnergyThreshold: 200, reproductionChance: 0.008, spawnEnergy: 200,
    color: '#a3a35a', fleeRange: 100, huntRange: 0, wanderRadius: 90,
    sprite: '/sprites/deer.png',
  },
};

// ============ HELPERS ============
export function getSeason(dayInYear: number): Season {
  if (dayInYear < 90) return Season.Spring;
  if (dayInYear < 180) return Season.Summer;
  if (dayInYear < 270) return Season.Fall;
  return Season.Winter;
}

export { getGrassGrowthMultiplier, getWinterEnergyPenalty } from './grassEcology';

export function getReproductionMultiplier(season: Season): number {
  switch (season) {
    case Season.Spring: return 1.5;
    case Season.Summer: return 1.0;
    case Season.Fall: return 0.5;
    case Season.Winter: return 0.2;
  }
}



export function hasTech(state: WorldState, techId: string): boolean {
  return state.unlockedTechs.includes(techId);
}

export function getMultiplier(state: WorldState, target: string): number {
  let mult = 1;
  for (const node of state.researchNodes) {
    if (node.researched) {
      for (const effect of node.effects) {
        if (effect.target === target && effect.multiplier) {
          mult *= effect.multiplier;
        }
      }
    }
  }
  return mult;
}

export function addReputation(state: WorldState, delta: number): void {
  state.villageReputation = Math.max(0, Math.min(100, state.villageReputation + delta));
}

// ============ TERRAIN & STORAGE SYSTEMS ============
function getTileAt(state: WorldState, x: number, y: number) {
  if (!state.worldMap) return null;
  const tx = Math.floor(x / 10);
  const ty = Math.floor(y / 10);
  return state.worldMap.tiles[ty]?.[tx] ?? null;
}

const UNBUILDABLE_SPAWN_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

function isInsideCompletedBuilding(state: WorldState, x: number, y: number, pad = 10): boolean {
  for (const b of state.buildings) {
    if (!b.completed) continue;
    if (isEntityOnBuilding(x, y, b, pad)) return true;
  }
  return false;
}

function isValidHumanSpawnPosition(state: WorldState, x: number, y: number): boolean {
  const margin = 12;
  if (x < margin || y < margin || x > state.width - margin || y > state.height - margin) return false;
  const tile = getTileAt(state, x, y);
  if (!tile || UNBUILDABLE_SPAWN_TERRAIN.has(tile.type)) return false;
  return !isInsideCompletedBuilding(state, x, y);
}

function findHumanSpawnNear(state: WorldState, x: number, y: number): { x: number; y: number } {
  if (isValidHumanSpawnPosition(state, x, y)) return { x, y };
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const r = 24 + (i % 4) * 20;
    const sx = x + Math.cos(angle) * r;
    const sy = y + Math.sin(angle) * r;
    if (isValidHumanSpawnPosition(state, sx, sy)) return { x: sx, y: sy };
  }
  return { x: state.width / 2, y: state.height / 2 };
}

export function getTerrainEfficiencyMultiplier(state: WorldState, building: Building): number {
  if (!state.worldMap) return 1;
  const tile = getTileAt(state, building.x, building.y);
  if (!tile) return 1;
  const type = tile.type;

  switch (building.type) {
    case BuildingType.Farm:
    case BuildingType.Greenhouse:
      if (type === TerrainType.Grassland) return 1.4;
      if (type === TerrainType.Forest || type === TerrainType.DarkForest) return 0.8;
      if (type === TerrainType.Rocky || type === TerrainType.Mountains) return 0.5;
      if (type === TerrainType.Snow) return 0.3;
      return 1.0;
    case BuildingType.LumberMill:
      if (type === TerrainType.Forest || type === TerrainType.DarkForest) return 1.5;
      if (type === TerrainType.Grassland) return 0.9;
      if (type === TerrainType.Rocky || type === TerrainType.Mountains) return 0.6;
      return 1.0;
    case BuildingType.Quarry:
    case BuildingType.Mine:
      if (type === TerrainType.Mountains || type === TerrainType.Rocky) return 1.5;
      if (type === TerrainType.Hills) return 1.2;
      if (type === TerrainType.Grassland || type === TerrainType.Forest) return 0.6;
      return 1.0;
    case BuildingType.Well:
      if (type === TerrainType.River || type === TerrainType.RiverBank || type === TerrainType.ShallowWater) return 1.5;
      if (type === TerrainType.Beach) return 1.2;
      return 1.0;
    default:
      return 1.0;
  }
}

export {
  AdjacencyIndex,
  buildAdjacencyIndex,
  buildingUsesAdjacency,
  ensureAdjacencyIndex,
  getAdjacencyMultiplierFromIndex,
  syncAdjacency,
  unindexAdjacency,
} from './adjacencyIndex';

export function getAdjacencyMultiplier(state: WorldState, building: Building): number {
  if (!buildingUsesAdjacency(building)) return 1;
  return getAdjacencyMultiplierFromIndex(ensureAdjacencyIndex(state), building);
}

export function impulseScreenShake(state: WorldState, amount: number): void {
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, amount);
}

// ============ PARTICLES & EFFECTS ============
export { pushTransientParticle } from './juiceEffects';

export function createDeathParticles(state: WorldState, x: number, y: number, color: string, count: number, type?: DeathParticle['type']) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.5;
    pushTransientParticle(state, {
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 25 + Math.random() * 15, maxLife: 40,
      color, size: 1.5 + Math.random() * 1.5,
      type: type || 'blood',
    });
  }
}

type FloatingTextTier = 'brief' | 'normal' | 'emphasis';

export function addFloatingText(
  state: WorldState,
  x: number,
  y: number,
  text: string,
  color: string,
  tier: FloatingTextTier = 'normal',
) {
  const maxLife = tier === 'brief' ? 18 : tier === 'emphasis' ? 48 : 28;
  state.floatingTexts.push({
    id: state.nextFloatingTextId++,
    x, y, text, color,
    life: maxLife, maxLife, scale: 1,
  });
}

export function addNotification(state: WorldState, title: string, message: string, type: 'info' | 'success' | 'warning' | 'event' = 'info') {
  state.notifications.push({
    id: `notif_${state.tick}_${Math.random()}`,
    title, message, type,
    createdAt: Date.now(),
  });
  if (state.notifications.length > 20) state.notifications.shift();
}

import { maybeTriggerRenffrOmen, tickRenffrOmen } from './renffrStar';
import {
  isPlayerHuman, tickVisitorGroups, tickRivalSettlements,
  rollYearlyWorldEvent, tryFirstWeekVisitor, tryMidYearVisitorEvent,
} from './groupEvents';
import {
  getTownHallGovernanceEfficiency,
  getTownHallImmigrationMultiplier,
  tickTownHallCivic,
  TOWN_HALL_FESTIVAL_COOLDOWN_TICKS,
} from './townHall';
import {
  tickElectionBuildup,
  tickElectionCeremony,
  tickElectionGossip,
  tickLeaderVacancy,
  tryStartDecennialElectionCeremony,
  tryStartVacancyElectionCeremony,
} from './villageLeadership';
import { tickPendingOutgoingRaidEvents, tickPendingRaidEvents } from './frontierCombat';

export {
  sendRivalGift, establishRivalTradePact, showStrengthToRival,
  signPeaceTreaty, isRivalAtPeace,
  respondToDiplomacyEvent, getDiplomacyChoiceEligibility, tradeWithVisitors, negotiateRefugees,
  talkToVisitorLeader, getVisitorLeaderTalkMeta,
  hitTestCamp,
} from './groupEvents';
export type { VisitorLeaderTalkMeta } from './groupEvents';
export {
  respondToRaidEvent, respondToOutgoingRaidEvent, launchRaidOnRival,
  rollRivalOutgoingRaidResponse, rollRivalPayoffOffer,
  cancelPendingOutgoingRaidsForRival,
  getMilitiaStrength, getRivalRaidStrength, countArmedMilitia,
  getCombatPreview, getBarricadeStrength,
  getOutgoingRaidFoodCostForRival, formatCampDistance, getCampDistancePixels,
  getRivalDefenseStrength, resolveCounterRaidRatio, canLaunchRaidOnRival,
  isCounterRaidOnRival, getOutgoingRaidActionLabel,
  formatRaidDeadline, getRaidDaysRemaining, getIncomingRaidResponseDays,
  raidEventLoot, formatRaidLootSummary,
} from './frontierCombat';
export type { CombatPreview, RaidOutcomeTier, CounterRaidTier } from './frontierCombat';
export { getGrazingPressureReport } from './ecosystemPressure';
export type { GrazingPressureReport, GrazingPressureLevel } from './ecosystemPressure';
export { getEcosystemBreakdown } from './ecoBreakdown';
export type { EcosystemBreakdown, EcosystemBreakdownLine } from './ecoBreakdown';
export { getPopulationGrowthReport } from './populationGrowth';
export type { PopulationGrowthReport, PopulationGrowthTone } from './populationGrowth';
export { formatRivalPopulationLabel, formatRivalRelationshipLabel } from './rivalDisplay';
export {
  getArmamentSteps, getHumanArmamentLabel,
  hasIronSpears, hasStoneSpears, hasCompletedBlacksmith,
} from './combat';
export {
  ELECTION_INTERVAL_YEARS,
  getVillageLeader,
  isVillageLeader,
  getYearsUntilElection,
  rankLeadershipCandidates,
  formatSettlerName,
  getLeadershipScoreBreakdown,
} from './villageLeadership';
import {
  canMoonHowlerCurse, countActiveMoonHowlerCurses, curseMoonHowler,
  isActiveMoonHowler,
  shouldApplyNewMoonHowlerCurse, syncMoonHowlerForms, transformToWerewolfForm,
  tryMoonHowlerChurchCures,
} from './moonHowler';

// ============ WORKFORCE HELPERS ============
const AUTO_JOB_BUILDING_PRIORITY: BuildingType[] = [
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Mine,
  BuildingType.Blacksmith,
  BuildingType.Workshop,
  BuildingType.Store,
  BuildingType.Market,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.TownHall,
  BuildingType.Church,
];

/** Job sites the player staffs manually (no auto-fill each tick). */
const MANUAL_STAFF_BUILDINGS = new Set<BuildingType>([BuildingType.Church, BuildingType.Prison, BuildingType.Barracks]);

export function isManualStaffBuilding(type: BuildingType): boolean {
  return MANUAL_STAFF_BUILDINGS.has(type);
}

export function jobBuildingPriority(type: BuildingType): number {
  const idx = AUTO_JOB_BUILDING_PRIORITY.indexOf(type);
  return idx === -1 ? AUTO_JOB_BUILDING_PRIORITY.length : idx;
}

export function countWorkersAtBuilding(humans: Entity[], buildingId: number): number {
  return humans.filter((h) => h.alive && !h.faction && h.homeBuildingId === buildingId).length;
}

export function countStaffedWorkersAtType(buildings: Building[], humans: Entity[], type: BuildingType): number {
  let total = 0;
  for (const b of buildings) {
    if (b.completed && b.type === type && b.faction !== 'rival') {
      total += countWorkersAtBuilding(humans, b.id);
    }
  }
  return total;
}

export function getSmithBonus(buildings: Building[], humans: Entity[]): number {
  const workers = countStaffedWorkersAtType(buildings, humans, BuildingType.Blacksmith);
  if (workers <= 0) return 1.0;
  return Math.min(1.5, 1 + workers * 0.25);
}

/** 0 = no church, 0.5 = built but unstaffed, 1 = staffed priest on duty */
export function getChurchStrength(buildings: Building[], humans: Entity[]): number {
  const hasChurch = buildings.some(
    (b) => b.completed && b.type === BuildingType.Church && b.faction !== 'rival',
  );
  if (!hasChurch) return 0;
  const workers = countStaffedWorkersAtType(buildings, humans, BuildingType.Church);
  return workers > 0 ? 1 : 0.5;
}

export function hasStaffedSchool(buildings: Building[]): boolean {
  return buildings.some(
    (b) => b.completed && b.type === BuildingType.School && b.faction !== 'rival' && b.occupants.length > 0,
  );
}

export function completedJobBuildings(buildings: Building[]): Building[] {
  return buildings
    .filter((b) => {
      if (!b.completed || b.faction === 'rival' || !BUILDING_JOB_TYPES[b.type]) return false;
      return BUILDING_CONFIGS[b.type].maxOccupants > 0;
    })
    .sort((a, b) => {
      const prio = jobBuildingPriority(a.type) - jobBuildingPriority(b.type);
      if (prio !== 0) return prio;
      return a.id - b.id;
    });
}

export function findOverstaffedDonorBuilding(
  jobBuildings: Building[],
  humans: Entity[],
  excludeBuildingId: number,
): Building | undefined {
  return jobBuildings
    .filter((b) => b.id !== excludeBuildingId && countWorkersAtBuilding(humans, b.id) >= 2)
    .sort((a, b) => countWorkersAtBuilding(humans, a.id) - countWorkersAtBuilding(humans, b.id))[0];
}

export function pickWorkerToTransfer(
  humans: Entity[],
  fromBuilding: Building,
  toBuilding: Building,
): Entity | undefined {
  const toJob = BUILDING_JOB_TYPES[toBuilding.type];
  const fromJob = BUILDING_JOB_TYPES[fromBuilding.type];
  if (!toJob || !fromJob) return undefined;

  const workers = humans.filter(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !h.pregnant
      && h.homeBuildingId === fromBuilding.id,
  );
  if (workers.length === 0) return undefined;

  workers.sort((a, b) => {
    const aFit = readSkill(a, toJob) - readSkill(a, fromJob);
    const bFit = readSkill(b, toJob) - readSkill(b, fromJob);
    return bFit - aFit;
  });
  return workers[0];
}

export function transferWorkerBetweenBuildings(
  worker: Entity,
  fromBuilding: Building,
  toBuilding: Building,
): void {
  const job = BUILDING_JOB_TYPES[toBuilding.type];
  if (!job) return;

  fromBuilding.occupants = fromBuilding.occupants.filter((id) => id !== worker.id);
  if (!toBuilding.occupants.includes(worker.id)) toBuilding.occupants.push(worker.id);

  worker.homeBuildingId = toBuilding.id;
  worker.occupation = getOccupationForBuilding(toBuilding.type);
  worker.job = job;
  ensureEntitySkills(worker)[job] = readSkill(worker, job);
}

function rebalanceJobWorkers(humans: Entity[], buildings: Building[]): void {
  const jobBuildings = completedJobBuildings(buildings);
  let changed = true;

  while (changed) {
    changed = false;
    for (const needy of jobBuildings) {
      if (isManualStaffBuilding(needy.type)) continue;
      if (BUILDING_CONFIGS[needy.type].maxOccupants <= 0) continue;
      if (countWorkersAtBuilding(humans, needy.id) !== 0) continue;

      const donor = findOverstaffedDonorBuilding(jobBuildings, humans, needy.id);
      if (!donor) continue;

      const worker = pickWorkerToTransfer(humans, donor, needy);
      if (!worker) continue;

      transferWorkerBetweenBuildings(worker, donor, needy);
      changed = true;
    }
  }
}

function syncJobBuildingOccupants(humans: Entity[], buildings: Building[]): void {
  for (const building of buildings) {
    if (!building.completed || building.faction === 'rival' || !BUILDING_JOB_TYPES[building.type]) continue;
    building.occupants = humans
      .filter((h) => h.alive && !h.faction && h.homeBuildingId === building.id && h.prisonBuildingId == null)
      .map((h) => h.id);
  }
}

function assignWorkerInPlace(building: Building, humans: Entity[], buildings: Building[]): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (countWorkersAtBuilding(humans, building.id) >= cap) return false;

  const candidates = humans.filter(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !hasWorkAssignment(h)
      && !isImprisoned(h)
      && !h.pregnant
      && !isOnConstructionCrew(h, buildings),
  );
  candidates.sort((a, b) => readSkill(b, job) - readSkill(a, job));
  const worker = candidates[0];
  if (!worker) return false;

  worker.homeBuildingId = building.id;
  worker.occupation = getOccupationForBuilding(building.type);
  worker.job = job;
  ensureEntitySkills(worker)[job] = readSkill(worker, job);
  if (!building.occupants.includes(worker.id)) building.occupants.push(worker.id);
  return true;
}

function assignBuilderInPlace(
  building: Building,
  humans: Entity[],
  allBuildings: Building[],
): boolean {
  if (building.completed || building.faction === 'rival') return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return false;

  const builder = humans.find(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !hasWorkAssignment(h)
      && !isImprisoned(h)
      && !h.pregnant
      && !building.occupants.includes(h.id)
      && !allBuildings.some((b) => !b.completed && b.id !== building.id && b.occupants.includes(h.id)),
  );
  if (!builder) return false;

  building.occupants.push(builder.id);
  return true;
}

function prepareWorkforce(humans: Entity[], buildings: Building[]): Entity[] {
  const alive = humans.filter((h) => h.alive && !h.faction);

  for (const human of alive) {
    if (human.prisonBuildingId != null) {
      if (human.homeBuildingId != null) {
        human.homeBuildingId = undefined;
        human.occupation = 'settler';
        human.job = JobType.Settler;
      }
      continue;
    }
    if (!hasWorkAssignment(human)) continue;
    const workplace = buildings.find((b) => b.id === human.homeBuildingId);
    if (
      !workplace
      || !workplace.completed
      || workplace.faction === 'rival'
      || !BUILDING_JOB_TYPES[workplace.type]
    ) {
      human.homeBuildingId = undefined;
      human.occupation = 'settler';
      human.job = JobType.Settler;
    }
  }

  syncJobBuildingOccupants(alive, buildings);
  return alive;
}

function staffConstructionCrews(alive: Entity[], buildings: Building[]): void {
  const incomplete = buildings
    .filter((b) => !b.completed && b.faction !== 'rival')
    .sort((a, b) => {
      const aHouse = isResidenceBuildingType(a.type) ? 0 : 1;
      const bHouse = isResidenceBuildingType(b.type) ? 0 : 1;
      if (aHouse !== bHouse) return aHouse - bHouse;
      return a.id - b.id;
    });

  for (const building of incomplete) {
    while (assignBuilderInPlace(building, alive, buildings)) {
      // fill construction crews
    }
  }
}

function staffJobBuildings(alive: Entity[], buildings: Building[], includeManualStaff: boolean): void {
  const jobBuildings = completedJobBuildings(buildings);

  for (const building of jobBuildings) {
    if (!includeManualStaff && isManualStaffBuilding(building.type)) continue;
    while (assignWorkerInPlace(building, alive, buildings)) {
      // fill open job slots
    }
  }

  if (!includeManualStaff) {
    rebalanceJobWorkers(alive, buildings);
  }
  syncJobBuildingOccupants(alive, buildings);
}

/** Auto-staff construction sites and job buildings so settlers work instead of wandering. */
export function assignMissingWorkers(humans: Entity[], buildings: Building[]): void {
  const alive = prepareWorkforce(humans, buildings);
  staffConstructionCrews(alive, buildings);
  staffJobBuildings(alive, buildings, false);
}

/** Headless balance sims — fill every job slot including church, prison, and barracks. */
export function assignAllWorkers(humans: Entity[], buildings: Building[]): void {
  const alive = prepareWorkforce(humans, buildings);
  staffConstructionCrews(alive, buildings);
  staffJobBuildings(alive, buildings, true);
}

export function findHumanWorkplace(entity: Entity, buildings: Building[]): Building | undefined {
  if (hasWorkAssignment(entity)) {
    const jobSite = buildings.find(
      (b) => b.id === entity.homeBuildingId && b.completed && BUILDING_JOB_TYPES[b.type],
    );
    if (jobSite) return jobSite;
  }
  return buildings.find((b) => !b.completed && b.occupants.includes(entity.id));
}

export function releasePrisoners(state: WorldState): void {
  let released = false;
  for (const entity of state.entities) {
    if (!entity.alive || entity.type !== EntityType.Human) continue;
    if (entity.prisonBuildingId == null || entity.prisonerUntilTick == null) continue;
    if (state.tick < entity.prisonerUntilTick) continue;
    const prison = state.buildings.find((b) => b.id === entity.prisonBuildingId);
    if (prison) {
      prison.occupants = prison.occupants.filter((id) => id !== entity.id);
    }
    entity.prisonBuildingId = undefined;
    entity.prisonerUntilTick = undefined;
    entity.prisonSentenceCrime = undefined;
    entity.flash = 8;
    const name = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
    logEvent(state, 'event', `${name} was released from prison`, name);
    addFloatingText(state, entity.x, entity.y - 18, 'Released', '#22c55e');
    released = true;
  }
  if (released) {
    assignMissingResidences(
      state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e)),
      state.buildings,
      state.entities,
    );
  }
}

// ============ IMPORT EXTRACTED MODULES ============
import {
  updateStorageCaps,
  addResource,
  applyFoodSpoilage,
  canAffordWorkshopRecipe,
  consumeWorkshopRecipeInputs,
} from './economy';
import { tickTradeCaravans } from './tradeCaravans';
import { updateWeather, updateDisasters } from './worldEvents';
import { updateResearch } from './research';
import { tickHumans, tickWildlife, buildHuntTargetByPreyIndex, type TickContext } from './lifeSimulation';
import {
  USE_SPATIAL_GRID,
  syncMobileSimGrid,
  syncTreeSimGrid,
  buildRoadAvoidanceIndex,
  computeRoadLayoutStamp,
  assertSpatialGridInvariants,
  syncGrassRenderGrid,
} from './spatialGrid';
import { USE_SCENT_GRID, ensureScentGrid, tickScentGrid } from './scentGrid';
import { createEntity, createImmigrantSettler, replenishDepletedWildlife } from './worldGen';
import { getForgeQuarryMultiplier, tickVillageForge } from './forge';
import { pushTransientParticle, spawnBuildCompleteParticles } from './juiceEffects';
import { pruneFactionWanderStates } from './factionWander';
import { loadJuiceEffectsEnabled } from './preferences';
import {
  computePopulationCounts,
  wildlifeCountsFromPopulation,
} from './entityCounts';
import {
  flushSpatialQueryTickToSession,
  isSpatialQueryMetricsEnabled,
  resetSpatialQueryTickMetrics,
  setSpatialQueryGridMode,
} from './spatialQueryMetrics';

export {
  computePopulationCounts,
  computeWildlifeCounts,
  wildlifeCountsFromPopulation,
} from './entityCounts';

// ============ GAME TICK ============
/** Advances simulation one tick. Mutates state in place for performance. */
export function gameTick(state: WorldState, focus?: SimulationFocus): WorldState {
  if (state.paused) return state;
  const { width, height } = state;

  if (isSpatialQueryMetricsEnabled()) {
    resetSpatialQueryTickMetrics();
    setSpatialQueryGridMode(USE_SPATIAL_GRID ? 'grid' : 'naive');
  }

  state.tick++;
  state.dayInYear = getCalendarDay(state.tick);
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  const newYear = yearRollover ? state.year + 1 : state.year;

  let ecoHealthYearsAbove80 = state.ecoHealthYearsAbove80;
  if (yearRollover) {
    const yearlyStat = recordYearlyStats(state, state.year);
    state.yearlyStats.push(yearlyStat);
    if (state.yearlyStats.length > 50) state.yearlyStats.shift();
    state.lifetimeStats = updateLifetimeStats(state, state.lifetimeStats);
    state.eventsThisYear = [];
    if (newYear > 0) {
      ecoHealthYearsAbove80 = state.ecosystemHealth >= 80
        ? ecoHealthYearsAbove80 + 1
        : 0;
    }
    state.year = newYear;
  }

  const season = getSeason(state.dayInYear);
  const grassMult = getGrassGrowthMultiplier(season, state.weather);
  const reproMult = getReproductionMultiplier(season);
  const winterPenalty = getWinterEnergyPenalty(season);

  state.season = season;

  // Update systems
  ensureEntityByIdMap(state);
  updateStorageCaps(state);
  updateWeather(state);
  updateResearch(state);
  updateDisasters(state);
  tickTradeCaravans(state);
  releasePrisoners(state);

  // Food spoilage (once per calendar day)
  const vacancyNews = tickLeaderVacancy(state);
  if (vacancyNews) {
    addBigNews(state, vacancyNews.title, vacancyNews.message, 'neutral');
    addNotification(state, vacancyNews.title, vacancyNews.message, 'event');
  }

  if (state.tick % TICKS_PER_DAY === 0) {
    applyFoodSpoilage(state, season);
    tickElectionGossip(state);
  }

  const newEntities: Entity[] = [];
  const aliveEntities = state.entities.filter(e => e.alive);

  for (const entity of aliveEntities) {
    if (entity.moonHowlerCursed && entity.type === EntityType.Human) {
      syncHumanAgeFromCalendar(entity, state);
    }
  }

  let byType = buildEntityByType(aliveEntities);

  const hourOfDay = getHourOfDay(state.tick);
  const isNewCalendarDay = isNewCalendarDayTick(state);
  const colonyDay = getAbsoluteCalendarDay(state.tick);
  const churchStaffed = getChurchStrength(state.buildings, aliveEntities) >= 1;
  const dawnCures = tryMoonHowlerChurchCures(aliveEntities, colonyDay, hourOfDay, churchStaffed);
  if (dawnCures.cured.length > 0) {
    for (const curedOne of dawnCures.cured) {
      const who = curedOne.name ? `${curedOne.name}${curedOne.surname ? ` ${curedOne.surname}` : ''}` : 'A settler';
      const line = WEREWOLF_TAME_LINES[Math.floor(Math.random() * WEREWOLF_TAME_LINES.length)];
      addBigNews(state, '⛪ Curse Broken!', `${who} — ${line}`, 'positive');
      addFloatingText(state, curedOne.x, curedOne.y - 20, 'Cured!', '#22c55e');
      logEvent(state, 'event', `${who} was cured of the Moon Howler curse`, who);
    }
    byType = buildEntityByType(aliveEntities);
  }

  const moonSync = syncMoonHowlerForms(aliveEntities, colonyDay, hourOfDay);
  if (moonSync.transformed.length > 0 || moonSync.reverted.length > 0) {
    byType = buildEntityByType(aliveEntities);
    syncResidenceOccupants(
      aliveEntities.filter(isResidenceOccupantEntity),
      state.buildings,
    );
  }
  if (moonSync.nightFall) {
    addBigNews(state, '🌝 Full Moon!', 'Moon Howlers are abroad. Keep settlers indoors — they hunt tonight.', 'negative');
    logEvent(state, 'event', 'Full moon rose — cursed settlers transformed');
  }
  for (const were of moonSync.transformed) {
    const who = were.name ? `${were.name}${were.surname ? ` ${were.surname}` : ''}` : 'A settler';
    const line = WEREWOLF_TRANSFORM_LINES[Math.floor(Math.random() * WEREWOLF_TRANSFORM_LINES.length)](who);
    addFloatingText(state, were.x, were.y - 20, 'AWOO!', '#c4b5fd');
    logEvent(state, 'event', line, who);
  }

  const activeMoonCurses = countActiveMoonHowlerCurses(aliveEntities);
  const humanPop = aliveEntities.filter((e) => e.alive && isPlayerHuman(e)).length;
  if (shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, humanPop, activeMoonCurses)) {
    const candidates = byType[EntityType.Human].filter((h) => isPlayerHuman(h) && canMoonHowlerCurse(h));
    const human = candidates[Math.floor(Math.random() * candidates.length)];
    if (human) {
      const who = human.name ? `${human.name}${human.surname ? ` ${human.surname}` : ''}` : 'A settler';
      curseMoonHowler(human);
      transformToWerewolfForm(human);
      byType = buildEntityByType(aliveEntities);
      const line = WEREWOLF_CURSE_LINES[Math.floor(Math.random() * WEREWOLF_CURSE_LINES.length)](who);
      addBigNews(state, '🌝 Moon Howler Curse!', line, 'negative');
      addFloatingText(state, human.x, human.y - 20, 'Cursed…', '#c4b5fd');
      logEvent(state, 'event', `${who} was cursed as a Moon Howler`, who);
      const transformLine = WEREWOLF_TRANSFORM_LINES[Math.floor(Math.random() * WEREWOLF_TRANSFORM_LINES.length)](who);
      addFloatingText(state, human.x, human.y - 20, 'AWOO!', '#c4b5fd');
      logEvent(state, 'event', transformLine, who);
      if (!moonSync.nightFall) {
        addBigNews(state, '🌝 Full Moon!', 'Moon Howlers are abroad. Keep settlers indoors — they hunt tonight.', 'negative');
        logEvent(state, 'event', 'Full moon rose — cursed settlers transformed');
      }
    }
  }

  const entityById = ensureEntityByIdMap(state);

  const isPassiveBuild =
    (type: BuildingType) =>
      type === BuildingType.House || type === BuildingType.Road || type === BuildingType.Well;

  // Update buildings (clone so state.buildings is not mutated mid-tick)
  const updatedBuildings = state.buildings.map((b) => {
    const building = { ...b, occupants: [...b.occupants] };
    if (!building.completed && building.constructionProgress < 100) {
      const workers = building.occupants.length;

      if (isWorkHour(hourOfDay)) {
        const buildDays = BUILDING_CONFIGS[building.type].buildTime;
        const totalWorkTicks = buildWorkTicks(buildDays);
        const baseRate = 100 / totalWorkTicks;
        const buildMultiplier = workers > 0
          ? 1 + workers * 0.25
          : isPassiveBuild(building.type) ? 0.55 : 0.12;
        const globalMult = getMultiplier(state, 'global_efficiency');
        const skillMult = getWorkerSkillMultiplier(state, building, entityById);
        building.constructionProgress += baseRate * buildMultiplier * globalMult * skillMult;
        if (workers > 0 && hourOfDay === WORK_START) {
          const job = getJobForBuilding(building.type) ?? JobType.Builder;
          for (const id of building.occupants) gainSkill(state, id, job, 0.15);
        }
      }
      building.buildAnimTimer += 0.1;
      if (building.constructionProgress >= 100) {
        building.constructionProgress = 100;
        building.completed = true;
        building.occupants = [];
        logEvent(state, 'building', `${BUILDING_CONFIGS[building.type].label} completed`);
        building.spriteScale = 1.18;
        if (building.faction !== 'rival') state.totalBuildingsCompleted++;
        const repGain = building.faction === 'rival' ? 0 : 2;
        if (repGain > 0) {
          addReputation(state, repGain);
        }
        if (building.faction !== 'rival') {
          if (loadJuiceEffectsEnabled()) {
            spawnBuildCompleteParticles(state, building);
            addFloatingText(state, building.x, building.y - building.height * 0.35, '✨ Built!', '#fde047', 'emphasis');
            if (repGain > 0) {
              addFloatingText(state, building.x, building.y - 8, `+${repGain}⭐`, '#22c55e', 'brief');
            }
            impulseScreenShake(state, 3.5);
          }
        } else {
          createDeathParticles(state, building.x, building.y, '#ffd700', 12, 'star');
        }
        syncAdjacency(state, building, b.completed);
      }
    }
    if (building.completed && building.spriteScale > 1) {
      building.spriteScale = Math.max(1, building.spriteScale - 0.025);
    } else if (building.completed && building.spriteScale < 1) {
      building.spriteScale = Math.min(1, building.spriteScale + 0.05);
    }
    // Winter building decay — once per game-day
    if (building.completed && season === Season.Winter && isNewCalendarDay) {
      building.health = Math.max(10, building.health - 2);
    }
    // Auto repair with workers — once per game-day (alive occupants only)
    const aliveRepairWorkers = building.occupants.filter(
      (id) => entityById.get(id)?.alive,
    ).length;
    if (
      building.completed
      && building.health < building.maxHealth
      && aliveRepairWorkers > 0
      && isNewCalendarDay
    ) {
      const hpNeeded = building.maxHealth - building.health;
      const repairAmount = Math.min(5, hpNeeded);
      const woodCost = hpNeeded <= 1 ? 1 : 2;
      if (state.resources.wood >= woodCost) {
        state.resources.wood -= woodCost;
        building.health = Math.min(building.maxHealth, building.health + repairAmount);
      }
    }
    return building;
  });

  const hasMill = updatedBuildings.some(b => b.type === BuildingType.Mill && b.completed);
  const roadBuildings = updatedBuildings.filter(b => b.type === BuildingType.Road && b.completed);

  const playerHumans = byType[EntityType.Human].filter(isPlayerHuman);
  assignMissingWorkers(playerHumans, updatedBuildings);

  if (isNewCalendarDay) {
    for (const human of playerHumans) {
      if (!human.alive || human.isJuvenile) continue;
      decayIdleSkills(human, human.job);
    }
  }

  if (maybeTriggerRenffrOmen(state, state.entities, isNightHour(hourOfDay))) {
    logEvent(state, 'event', 'A star scratched "Renffr" across the night sky. The letters fell out of alignment.', 'Renffr');
  }
  state.renffrOmen = tickRenffrOmen(state.renffrOmen);

  const humanCount = playerHumans.length;
  const isWinter = season === Season.Winter;

  // Winter heating
  let canHeat = true;
  if (isWinter && state.tick % TICKS_PER_DAY === 0 && humanCount > 0) {
    const woodNeeded = Math.ceil(humanCount / 5);
    if (state.resources.wood >= woodNeeded) {
      state.resources.wood -= woodNeeded;
    } else {
      canHeat = false;
    }
  }

  // Predator migration
  if (isProductionTick(state.tick, EVENT_INTERVAL.wolfRecruit) && byType[EntityType.Wolf].filter(e => e.alive).length < 2 && Math.random() < 0.1) {
    const edge = Math.floor(Math.random() * 4);
    let sx = 0, sy = 0;
    if (edge === 0) { sx = Math.random() * width; sy = 0; }
    else if (edge === 1) { sx = Math.random() * width; sy = height; }
    else if (edge === 2) { sx = 0; sy = Math.random() * height; }
    else { sx = width; sy = Math.random() * height; }
    const wolf = createEntity(
      EntityType.Wolf, sx, sy, state.nextEntityId++, SPECIES_CONFIG[EntityType.Wolf].spawnEnergy,
    );
    newEntities.push(wolf);
    indexEntity(entityById, wolf);
    addFloatingText(state, sx, sy, 'A lone wolf enters', '#6b7280');
  }

  const buildingById = new Map<number, Building>();
  for (const b of updatedBuildings) buildingById.set(b.id, b);

  const predators = [
    ...byType[EntityType.Wolf],
    ...byType[EntityType.Fox],
    ...byType[EntityType.Human].filter((h) => isPlayerHuman(h) && h.alive && !h.isJuvenile),
    ...byType[EntityType.Human].filter((h) => h.faction === 'rival' && h.alive),
    ...byType[EntityType.Werewolf].filter((e) => e.alive),
  ];

  const mobileGrid = USE_SPATIAL_GRID
    ? syncMobileSimGrid(state.mobileGrid, width, height, aliveEntities)
    : undefined;
  state.mobileGrid = mobileGrid;

  let grassGrid = USE_SPATIAL_GRID
    ? syncGrassRenderGrid(state.grassGrid, width, height, byType[EntityType.Grass] ?? [])
    : undefined;

  const treeTypeList = byType[EntityType.Tree];
  const treeGrid = syncTreeSimGrid(state.treeGrid, width, height, treeTypeList);
  state.treeGrid = treeGrid;

  const roadStamp = computeRoadLayoutStamp(roadBuildings);
  if (
    !state.roadAvoidance
    || state.roadAvoidanceStamp !== roadStamp
    || typeof state.roadAvoidance.isNearRoad !== 'function'
    || !state.roadAvoidance.matchesLayout(width, height)
  ) {
    state.roadAvoidance = buildRoadAvoidanceIndex(width, height, roadBuildings);
    state.roadAvoidanceStamp = roadStamp;
  }

  const scentGrid = USE_SCENT_GRID ? ensureScentGrid(state) : undefined;
  if (scentGrid) tickScentGrid(state, predators);

  const electionReveal = tickElectionCeremony(state, state.year);
  if (electionReveal) {
    addBigNews(state, electionReveal.title, electionReveal.message, 'positive');
    addNotification(state, electionReveal.title, electionReveal.message, 'event');
    impulseScreenShake(state, 4);
  }

  // Run human and wildlife simulation
  const ctx: TickContext = {
    width, height, hourOfDay, season, grassMult, reproMult, winterPenalty, canHeat,
    byType, newEntities, updatedBuildings, roadBuildings,
    playerHumans: byType[EntityType.Human].filter(isPlayerHuman),
    entityById,
    buildingById,
    predators,
    grassGrid,
    mobileGrid,
    treeGrid,
    roadAvoidance: state.roadAvoidance,
    huntTargetByPreyId: buildHuntTargetByPreyIndex(byType),
    scentGrid,
    focus,
    wildlifeSpawnParent: new Map(),
    hasWell: updatedBuildings.some((b) => b.type === BuildingType.Well && b.completed),
    hasHospital: updatedBuildings.some((b) => b.type === BuildingType.Hospital && b.completed),
  };
  if (aliveEntities.some(isActiveMoonHowler)) {
    syncResidenceOccupants(
      aliveEntities.filter(isResidenceOccupantEntity),
      updatedBuildings,
    );
  }

  tickHumans(state, ctx);
  tickWildlife(state, ctx);

  const allAlive: Entity[] = [];
  for (const e of aliveEntities) {
    if (e.alive) allAlive.push(e);
  }
  for (const e of newEntities) {
    if (e.alive) allAlive.push(e);
  }

  assertSpatialGridInvariants(grassGrid, mobileGrid, allAlive, treeGrid);

  tickVisitorGroups(state, allAlive);
  tickPendingRaidEvents(state, allAlive, updatedBuildings);
  tickPendingOutgoingRaidEvents(state);
  tickRivalSettlements(state, allAlive);
  for (let i = allAlive.length - 1; i >= 0; i--) {
    if (!allAlive[i].alive) allAlive.splice(i, 1);
  }
  pruneFactionWanderStates(allAlive.map((e) => e.id));

  const counts = computePopulationCounts(allAlive);

  // Village festival / party
  const townHallFestivalBoost = updatedBuildings.some(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival' && b.occupants.length > 0,
  )
    ? 1.4
    : 1;
  if (
    !state.festival
    && state.tick >= (state.townHallFestivalCooldownUntilTick ?? 0)
    && state.tick % FESTIVAL_CHECK_TICKS === 0
    && counts.humans >= 6
    && Math.random() < 0.25 * townHallFestivalBoost
  ) {
    const festivalNames = ['Harvest Festival', 'Moonlight Feast', 'Founders Day', 'Spring Revel', 'Trade Fair'];
    const name = festivalNames[Math.floor(Math.random() * festivalNames.length)];
    state.festival = { active: true, name, daysLeft: 20 + Math.floor(Math.random() * 20) };
    state.townHallFestivalCooldownUntilTick = state.tick + TOWN_HALL_FESTIVAL_COOLDOWN_TICKS;
    state.villageReputation = Math.min(100, state.villageReputation + 10);
    addBigNews(state, '🎉 Festival!', `${name} has begun! Production, courtship, and immigration are boosted for ${state.festival.daysLeft} days.`, 'positive');
    logEvent(state, 'season', `${name} festival began in the village`);
  }
  if (state.festival && state.tick > 0 && state.tick % TICKS_PER_DAY === 0) {
    state.festival.daysLeft--;
    if (state.festival.daysLeft <= 0) {
      addBigNews(state, '🎉 Festival Ended', `${state.festival.name} is over. The village returns to normal.`, 'neutral');
      state.festival = null;
      state.townHallFestivalCooldownUntilTick = state.tick + TOWN_HALL_FESTIVAL_COOLDOWN_TICKS;
    }
  }

  // Pollution
  const industrialTypes: BuildingType[] = [BuildingType.Blacksmith, BuildingType.Mill, BuildingType.Workshop, BuildingType.Mine, BuildingType.Quarry, BuildingType.LumberMill];
  const industrialCount = updatedBuildings.filter(b => b.completed && industrialTypes.includes(b.type)).length;
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1;
  state.pollutionLevel = Math.min(100, Math.floor(industrialCount * 4 * pollutionMult + (counts.humans / 3)));

  // Ecosystem health
  const totalWildlife = counts.rabbits + counts.deer + counts.wolves + counts.foxes;
  const idealWildlife = 80;
  const wildlifeRatio = Math.min(1, totalWildlife / idealWildlife);
  const playerCompletedBuildings = updatedBuildings.filter(
    (b) => b.completed && b.faction !== 'rival',
  ).length;
  const buildingImpact = playerCompletedBuildings * 2;
  const pollutionPenalty = Math.floor(state.pollutionLevel / 2);
  state.ecosystemHealth = Math.max(0, Math.min(100, 100 - buildingImpact - pollutionPenalty + (wildlifeRatio * 30 - 20)));

  // Biodiversity
  const species = [counts.rabbits, counts.deer, counts.wolves, counts.foxes].filter(c => c > 0);
  const total = species.reduce((a, b) => a + b, 0);
  if (total > 0) {
    state.biodiversityIndex = species.reduce((sum, count) => {
      const p = count / total;
      return sum - p * Math.log(p);
    }, 0);
  } else {
    state.biodiversityIndex = 0;
  }

  // Housing
  const housingCap = updatedBuildings
    .filter((b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion))
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  state.maxHumanPopulation = 5 + housingCap + Math.floor(state.villageReputation / 10);

  // Immigration
  const completedHousing = updatedBuildings.filter(b => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion)).length;
  const immigrationChance = Math.min(
    0.95,
    (0.05 + state.villageReputation / 120 + completedHousing * 0.03)
      * (state.festival?.active ? 1.5 : 1)
      * getTownHallImmigrationMultiplier(updatedBuildings),
  );
  if (state.tick > 0 && state.tick % IMMIGRATION_CHECK_TICKS === 0 && counts.humans < state.maxHumanPopulation && Math.random() < immigrationChance) {
    let spawnX = width / 2, spawnY = height / 2;
    const homes = updatedBuildings.filter(b => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion));
    if (homes.length > 0) {
      const home = homes[Math.floor(Math.random() * homes.length)];
      spawnX = home.x + home.width / 2;
      spawnY = home.y + home.height / 2;
    }
    const rawSpawnX = spawnX + (Math.random() - 0.5) * 40;
    const rawSpawnY = spawnY + (Math.random() - 0.5) * 40;
    const spawn = findHumanSpawnNear(state, rawSpawnX, rawSpawnY);
    const newcomers = createImmigrantSettler(state, spawn.x, spawn.y);
    for (const newcomer of newcomers) {
      allAlive.push(newcomer);
      indexEntity(entityById, newcomer);
      counts.humans++;
    }
    assignMissingResidences(allAlive.filter(isPlayerHuman), updatedBuildings, allAlive);
    assignMissingWorkers(allAlive.filter(isPlayerHuman), updatedBuildings);
    addFloatingText(state, spawnX, spawnY - 18, '+1 Settler arrived', '#22c55e');
  }

  // Building production
  const smithBonus = getSmithBonus(updatedBuildings, playerHumans);
  const millBonus = hasMill ? 1.25 : 1.0;
  const globalEff = getMultiplier(state, 'global_efficiency')
    * getTownHallGovernanceEfficiency(state, updatedBuildings);
  const festivalMult = state.festival?.active ? 1.5 : 1;
  const playerWorkers = allAlive.filter(isPlayerHuman);
  const workersByBuildingId = new Map<number, number>();
  for (const h of playerWorkers) {
    if (!h.alive || h.faction) continue;
    const siteId = h.homeBuildingId;
    if (siteId == null) continue;
    workersByBuildingId.set(siteId, (workersByBuildingId.get(siteId) ?? 0) + 1);
  }
  const adjacencyIndex = ensureAdjacencyIndex(state);

  for (const building of updatedBuildings) {
    const levelMult = building.level || 1;
    const terrainMult = getTerrainEfficiencyMultiplier(state, building);
    const adjacencyMult = buildingUsesAdjacency(building)
      ? getAdjacencyMultiplierFromIndex(adjacencyIndex, building)
      : 1;
    const skillMult = getWorkerSkillMultiplier(state, building, entityById);
    const totalMult = levelMult * terrainMult * adjacencyMult * festivalMult * skillMult;
    const productionJob = getJobForBuilding(building.type);

    const workers = BUILDING_JOB_TYPES[building.type]
      ? (workersByBuildingId.get(building.id) ?? 0)
      : 0;
    const staffed = !BUILDING_JOB_TYPES[building.type] || workers > 0;
    if (building.completed && staffed && building.type === BuildingType.Farm && isProductionTick(state.tick, PRODUCTION_INTERVAL.farm)) {
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const amount = Math.floor(22 * totalMult * harvestBonus * millBonus * farmMult * globalEff);
      const added = addResource(state, 'food', amount);
      if (added > 0 && productionJob) {
        for (const id of building.occupants) gainSkill(state, id, productionJob, 0.2);
      }
    }
    if (building.completed && staffed && building.type === BuildingType.Store && isProductionTick(state.tick, PRODUCTION_INTERVAL.store)) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor(5 * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
    }
    if (building.completed && staffed && building.type === BuildingType.LumberMill && isProductionTick(state.tick, PRODUCTION_INTERVAL.lumber)) {
      const lumberMult = getMultiplier(state, 'lumber_yield');
      const treeMult = getLumberMillTreeMultiplier(building, treeGrid, treeTypeList);
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * lumberMult * treeMult * globalEff);
      if (addResource(state, 'wood', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.5, vy: -1 - Math.random(), life: 20, maxLife: 20, color: '#8B7355', size: 2 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Quarry && isProductionTick(state.tick, PRODUCTION_INTERVAL.quarry)) {
      const stoneMult = getMultiplier(state, 'quarry_yield') * getForgeQuarryMultiplier(state);
      const amount = Math.floor((8 + workers * 3) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.3, vy: -0.8 - Math.random() * 0.5, life: 25, maxLife: 25, color: '#808080', size: 2 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Mine && isProductionTick(state.tick, PRODUCTION_INTERVAL.mine)) {
      const stoneMult = getMultiplier(state, 'stone_production');
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.4, vy: -1 - Math.random(), life: 30, maxLife: 30, color: '#555555', size: 3 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Greenhouse && isProductionTick(state.tick, PRODUCTION_INTERVAL.greenhouse)) {
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const amount = Math.floor((18 + workers * 5) * totalMult * harvestBonus * millBonus * farmMult * globalEff);
      if (addResource(state, 'food', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.3, vy: -0.8 - Math.random() * 0.5, life: 25, maxLife: 25, color: '#90EE90', size: 2 + Math.random(), type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Market && isProductionTick(state.tick, PRODUCTION_INTERVAL.market)) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor((8 + workers * 3) * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.5, vy: -1.2 - Math.random(), life: 30, maxLife: 30, color: '#ffd700', size: 2 + Math.random() * 2, type: 'star' });
    }
    if (building.completed && building.type === BuildingType.Workshop && isProductionTick(state.tick, PRODUCTION_INTERVAL.workshop)) {
      if (workers === 0) {
        addFloatingText(state, building.x + building.width / 2, building.y - 10, 'Needs worker', '#eab308', 'brief');
      } else {
        const goldMult = getMultiplier(state, 'gold_production');
        const recipe = getWorkshopRecipe(building.workshopRecipeId);
        const outputMult = (1 + workers * 0.5) * totalMult * goldMult * globalEff;
        if (canAffordWorkshopRecipe(state, recipe)) {
          const amount = Math.max(1, Math.floor(recipe.baseGold * outputMult));
          const added = addResource(state, 'gold', amount);
          if (added > 0) {
            consumeWorkshopRecipeInputs(state, recipe);
            rewardProductionSkills(state, building, 0.2, entityById);
            addFloatingText(
              state,
              building.x + building.width / 2,
              building.y - 12,
              `+${added} gold · ${recipe.label}`,
              '#ffd700',
              'brief',
            );
            state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), life: 25, maxLife: 25, color: '#cd7f32', size: 2 + Math.random(), type: 'sparkle' });
          }
        } else {
          addFloatingText(state, building.x + building.width / 2, building.y - 10, 'Need materials', '#f97316', 'brief');
        }
      }
    }
    if (building.completed && staffed && building.type === BuildingType.Hospital && isProductionTick(state.tick, PRODUCTION_INTERVAL.hospital)) {
      addReputation(state, 2);
    }
    if (building.completed && staffed && building.type === BuildingType.TownHall && isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)) {
      tickTownHallCivic(state, building, allAlive.filter(isPlayerHuman));
    }
    if (building.completed && building.type === BuildingType.Silo && isProductionTick(state.tick, PRODUCTION_INTERVAL.silo)) {
      const amount = Math.floor(8 * totalMult * millBonus * globalEff);
      addResource(state, 'food', amount);
    }
  }

  tickVillageForge(state, updatedBuildings);

  // Urban Planning: completed roads passively generate reputation (road_bonus research)
  const roadRepMult = getMultiplier(state, 'road_bonus');
  if (roadRepMult > 1 && isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)) {
    const roadCount = roadBuildings.length;
    if (roadCount > 0) {
      const rep = Math.min(5, Math.max(1, Math.floor(roadCount * (roadRepMult - 1) + 1)));
      addReputation(state, rep);
      const camp = updatedBuildings.find(
        (b) => b.completed && (b.type === BuildingType.TownHall || b.type === BuildingType.House),
      );
      if (camp) {
        addFloatingText(
          state,
          camp.x + camp.width / 2,
          camp.y - 12,
          `+${rep} rep (roads)`,
          '#c4b5fd',
          'brief',
        );
      }
    }
  }

  // Population history
  const history = [...state.populationHistory];
  if (state.tick % 10 === 0) {
    history.push({
      tick: state.tick, year: state.year,
      grass: counts.grass, rabbits: counts.rabbits, deer: counts.deer,
      wolves: counts.wolves, foxes: counts.foxes, humans: counts.humans,
      werewolves: counts.werewolves, wildkin: counts.wildkin,
      buildings: updatedBuildings.filter(b => b.completed).length,
    });
    if (history.length > 300) history.shift();
  }

  let currentActiveEvent = state.activeEvent;
  let currentLastEventYear = state.lastEventYear;
  let currentBountifulHarvest = state.bountifulHarvest;

  if (state.dayInYear === 0 && state.year > 0) {
    currentActiveEvent = null;
  }

  if (state.year > 0 && state.year % 2 === 0 && state.year !== currentLastEventYear) {
    currentLastEventYear = state.year;
    const rolled = rollYearlyWorldEvent(
      state, allAlive, updatedBuildings, width, height,
      () => state.nextEntityId++
    );
    currentActiveEvent = rolled.event;
    if (rolled.bountifulHarvest) currentBountifulHarvest = true;
    if (currentActiveEvent) {
      trackYearEvent(state, currentActiveEvent.title);
      addNotification(state, currentActiveEvent.title, currentActiveEvent.description, currentActiveEvent.type === 'positive' ? 'success' : currentActiveEvent.type === 'negative' ? 'warning' : 'event');
    }
  }

  if (state.dayInYear === 180 && state.year > 0 && state.tick > 0) {
    const midEvent = tryMidYearVisitorEvent(state, allAlive, updatedBuildings);
    if (midEvent) {
      currentActiveEvent = midEvent;
      trackYearEvent(state, midEvent.title);
      addNotification(state, midEvent.title, midEvent.description, 'event');
    }
  }

  if (!state.firstWeekVisitorSpawned) {
    const firstWeekEvent = tryFirstWeekVisitor(state, allAlive, updatedBuildings);
    if (firstWeekEvent) {
      currentActiveEvent = firstWeekEvent;
      trackYearEvent(state, firstWeekEvent.title);
      addNotification(state, firstWeekEvent.title, firstWeekEvent.description, 'success');
    }
  }

  if (state.year > 0 && state.year % 2 !== 0) {
    currentBountifulHarvest = false;
  }

  if (yearRollover) {
    const buildupNews = tickElectionBuildup(state, state.year, yearRollover);
    if (buildupNews) {
      addBigNews(state, buildupNews.title, buildupNews.message, 'neutral');
      addNotification(state, buildupNews.title, buildupNews.message, 'event');
    }

    const vacancyCeremony = tryStartVacancyElectionCeremony(state, state.year, state.dayInYear);
    const decennialCeremony = !vacancyCeremony
      && tryStartDecennialElectionCeremony(state, state.year, state.dayInYear);

    if (vacancyCeremony || decennialCeremony) {
      addBigNews(
        state,
        '🗳️ Election Day',
        `Settlers gather for the leadership election (Year ${state.year}). Gossip, tension, then the merit reveal — and a village party after.`,
        'neutral',
      );
      addNotification(
        state,
        '🗳️ Election Day',
        `Year ${state.year} leadership election — villagers gathering now.`,
        'event',
      );
    }
  }

  // Challenges — after year rollover and eco streak update so year/eco checks are current
  const challengeHumanCount = computePopulationCounts(allAlive).humans;
  const challengeState: WorldState = { ...state, ecoHealthYearsAbove80 };
  state.challenges = state.challenges.map(c => {
    if (c.completed) return c;
    const completed = isChallengeComplete(c, challengeState, challengeHumanCount, updatedBuildings);

    if (completed && c.reward) {
      addResource(state, 'wood', c.reward.wood || 0);
      addResource(state, 'stone', c.reward.stone || 0);
      addResource(state, 'food', c.reward.food || 0);
      addResource(state, 'gold', c.reward.gold || 0);
      addFloatingText(state, state.width / 2, state.height / 2 - 40, `Challenge: ${c.title}!`, '#fbbf24');
      if (c.rewardText) {
        addFloatingText(state, state.width / 2, state.height / 2 - 25, c.rewardText, '#22c55e');
      }
      addNotification(state, 'Challenge Complete!', `${c.title} - ${c.rewardText || 'Rewards granted!'}`, 'success');
      impulseScreenShake(state, 4);
    }

    return { ...c, completed: completed || c.completed };
  });

  const endTickHumans = allAlive.filter(isPlayerHuman);
  // Must use allAlive — newborns/immigrants from this tick are not in state.entities yet.
  assignMissingResidences(endTickHumans, updatedBuildings, allAlive);
  assignMissingWorkers(endTickHumans, updatedBuildings);

  const preVictoryState: WorldState = {
    ...state,
    entities: allAlive,
    buildings: updatedBuildings,
    humanPopulation: counts.humans,
    ecoHealthYearsAbove80,
  };
  const victoryResult = checkVictoryAchievements(preVictoryState);
  if (victoryResult.newlyAchieved) {
    const def = victoryResult.victories.find((v) => v.path === victoryResult.newlyAchieved);
    addBigNews(
      state,
      `🏆 ${def?.label ?? 'Victory'}!`,
      def?.description ?? 'Your settlement has achieved greatness!',
      'positive'
    );
    addNotification(state, 'Victory Achieved!', `${def?.label ?? 'Victory'} — your legacy is secured!`, 'success');
    impulseScreenShake(state, 6);
    logEvent(state, 'season', `Victory: ${def?.label ?? victoryResult.newlyAchieved}`);
  }

  reconcileOrphanedMarriages(allAlive);
  state.entities = allAlive;
  if (state.tick > 0 && state.tick % ticksForDays(7) === 0) {
    replenishDepletedWildlife(state);
  }
  state.entityByType = buildEntityByType(state.entities);
  state.grassGrid = grassGrid ?? undefined;
  if (USE_SPATIAL_GRID) state.mobileGrid = mobileGrid;
  state.buildings = updatedBuildings;

  const newParticles: DeathParticle[] = [];
  for (const p of state.deathParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
    p.life--;
    if (p.life > 0) newParticles.push(p);
  }
  state.deathParticles = newParticles;

  const newFloatingTexts: FloatingText[] = [];
  for (const ft of state.floatingTexts) {
    ft.y -= 0.7;
    ft.life--;
    ft.scale = ft.life < 6 ? ft.life / 6 : 1;
    if (ft.life > 0) newFloatingTexts.push(ft);
  }
  state.floatingTexts = newFloatingTexts;

  state.season = season;
  state.populationHistory = history;
  state.humanPopulation = counts.humans;
  state.wildlifeCounts = wildlifeCountsFromPopulation(counts);
  state.activeEvent = currentActiveEvent;
  state.lastEventYear = currentLastEventYear;
  state.bountifulHarvest = currentBountifulHarvest;
  state.ecoHealthYearsAbove80 = ecoHealthYearsAbove80;
  state.victories = victoryResult.victories;
  state.victoryAchieved = victoryResult.victoryAchieved;
  markCalendarDayProcessed(state);
  if (isSpatialQueryMetricsEnabled()) flushSpatialQueryTickToSession();
  return state;
}

function isChallengeComplete(
  challenge: Challenge,
  state: WorldState,
  humanCount: number,
  buildings: Building[],
): boolean {
  function countPlayerCompletedBuildings(buildings: Building[]): number {
    return buildings.filter((b) => b.completed && b.faction !== 'rival').length;
  }
  const playerBuildings = countPlayerCompletedBuildings(buildings);
  const hasHousing = buildings.some(
    (b) =>
      b.completed
      && b.faction !== 'rival'
      && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  );

  switch (challenge.id) {
    case 'first_settlers':
      return humanCount >= (challenge.targetPopulation ?? 0) && hasHousing;
    case 'growing_village':
      return (
        state.year >= (challenge.targetYear ?? 0)
        && playerBuildings >= (challenge.targetBuildings ?? 0)
      );
    case 'eco_master':
      return state.ecoHealthYearsAbove80 >= 10;
    case 'great_city':
      return humanCount >= (challenge.targetPopulation ?? 0) && playerBuildings >= (challenge.targetBuildings ?? 0);
    case 'tech_pioneer':
      return state.unlockedTechs.length >= 5;
    case 'trading_hub':
      return state.tradeRoutes.filter((r) => r.active).length >= 3;
    default: {
      let met = true;
      if (challenge.targetYear !== undefined) met = met && state.year >= challenge.targetYear;
      if (challenge.targetPopulation !== undefined) met = met && humanCount >= challenge.targetPopulation;
      if (challenge.targetBuildings !== undefined) met = met && playerBuildings >= challenge.targetBuildings;
      return met;
    }
  }
}

// ============ RE-EXPORTS ============
export { saveGame, loadGame, hasSave, deleteSave } from './saveLoad';
export {
  UNBUILDABLE_TERRAIN,
  isFootprintOnBuildableTerrain,
  canPlaceBuilding,
  getPlaceBuildingFailureReason,
  startBuilding,
  isOnConstructionCrew,
  pickAdultSettler,
  assignBuilderToBuilding,
  assignResidentToBuilding,
  moveOutOfFamilyHome,
  removeResidentFromBuilding,
  assignIdleWorkerToBuilding,
  removeWorkerFromBuilding,
  listAssignableWorkersForBuilding,
  canAssignWorkerToBuilding,
  repairBuilding,
  getBuildingUpgradeCost,
  upgradeBuilding,
  recruitSettler,
  estimateWorkshopGold,
  setWorkshopRecipe,
  demolishBuilding,
  spawnMoonHowlerDebug,
  getTameFoodCost,
  tameEntity,
  buildStripPreview,
  placeStripChain,
} from './buildingActions';
export { isStripBuildType, inferStripRotation } from './stripBuild';
export {
  addResource,
  updateStorageCaps,
  applyFoodSpoilage,
  canAffordWorkshopRecipe,
  consumeWorkshopRecipeInputs,
  initTradeRoutes,
  establishTradeRoute,
  ensureFullTradeRoutes,
} from './economy';
export {
  syncResearchUnlocks,
  notifyBuildingLocked,
  startResearch,
  updateResearch,
} from './research';
export {
  createEntity,
  createBuilding,
  spawnGrassPatch,
  spawnWildlifeRing,
  replenishDepletedWildlife,
  createImmigrantSettler,
  initGame,
  setEntityBirthDate,
  getAgeInYears,
  type InitGameOptions,
} from './worldGen';
export { tickHumans, tickWildlife } from './lifeSimulation';
export { updateWeather, updateDisasters } from './worldEvents';
export { GAME_VERSION, GAME_PHASE, GAME_TITLE, GAME_SUBTITLE, ECOLOGICAL_FACTS } from './version';
export { getOccupationForBuilding, getJobForBuilding, ensureEntitySkills, readSkill, gainSkill, rewardProductionSkills, decayIdleSkills, getWorkerSkillMultiplier } from './skills';
export {
  FORGE_ORDERS, getForgeOrder, formatForgeInputs, getForgeBlockReason,
  queueForgeOrder, createInitialForgeState,
} from './forge';
export type { ForgeOrder, ForgeOrderId, VillageForgeState } from './forge';
