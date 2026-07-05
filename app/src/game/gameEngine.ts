import type {
  WorldState, Entity, Building, DeathParticle,
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
} from './gameTypes';
import { recordYearlyStats, updateLifetimeStats } from './stats';
import { checkVictoryAchievements } from './victory';
import { logEvent } from './eventLog';
import {
  ensureEntitySkills, readSkill, getWorkerSkillMultiplier,
  getJobForBuilding, getOccupationForBuilding, gainSkill, rewardProductionSkills,
} from './skills';

export type { WorldState, Entity, Building, DeathParticle, FloatingText, GameEvent, Camera };
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

let nextBigNewsId = 1;
export function addBigNews(
  state: WorldState,
  title: string,
  message: string,
  type: 'positive' | 'negative' | 'neutral' = 'neutral'
) {
  state.bigNews.push({
    id: `bn_${nextBigNewsId++}_${Date.now()}`,
    title,
    message,
    type,
    createdAt: state.tick,
    dismissed: false,
  });
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
    maxEnergy: 500, energyLossPerTick: 4.2, energyGain: { deer: 350, rabbit: 150, farm: 120 },
    maxAge: HUMAN_MAX_LIFESPAN_DAYS, speed: 2.25, size: 10,
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
    maxEnergy: 450, energyLossPerTick: 3, energyGain: { grass: 45, farm: 80 },
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

export function getGrassGrowthMultiplier(season: Season, weather: WeatherType): number {
  let base = 1;
  switch (season) {
    case Season.Spring: base = 1.8; break;
    case Season.Summer: base = 1.2; break;
    case Season.Fall: base = 0.6; break;
    case Season.Winter: base = 0.15; break;
  }
  if (weather === WeatherType.Rain) base *= 1.3;
  if (weather === WeatherType.Drought) base *= 0.3;
  if (weather === WeatherType.Snow) base *= 0.5;
  return base;
}

export function getReproductionMultiplier(season: Season): number {
  switch (season) {
    case Season.Spring: return 1.5;
    case Season.Summer: return 1.0;
    case Season.Fall: return 0.5;
    case Season.Winter: return 0.2;
  }
}

export function getWinterEnergyPenalty(season: Season): number {
  return season === Season.Winter ? 0.4 : 0;
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

export function getAdjacencyMultiplier(state: WorldState, building: Building): number {
  const buildings = state.buildings;
  let mult = 1;

  // Barn boosts nearby farms
  if (building.type === BuildingType.Farm || building.type === BuildingType.Greenhouse) {
    const hasNearbyBarn = buildings.some(b => b.completed && b.type === BuildingType.Barn &&
      Math.hypot(b.x - building.x, b.y - building.y) < 120);
    if (hasNearbyBarn) mult += 0.35;
  }

  // Roads boost nearby production and community buildings
  if (building.type !== BuildingType.Road) {
    const hasNearbyRoad = buildings.some(b => b.completed && b.type === BuildingType.Road &&
      Math.hypot(b.x - building.x, b.y - building.y) < 70);
    if (hasNearbyRoad) mult += 0.15;
  }

  // Market boosts nearby industry
  if (building.type === BuildingType.Store || building.type === BuildingType.Workshop) {
    const hasNearbyMarket = buildings.some(b => b.completed && b.type === BuildingType.Market &&
      Math.hypot(b.x - building.x, b.y - building.y) < 160);
    if (hasNearbyMarket) mult += 0.25;
  }

  return mult;
}

export function impulseScreenShake(state: WorldState, amount: number): void {
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, amount);
}

// ============ PARTICLES & EFFECTS ============
export function createDeathParticles(state: WorldState, x: number, y: number, color: string, count: number, type?: DeathParticle['type']) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.5;
    state.deathParticles.push({
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

import {
  assignMissingResidences, buildWorkTicks, getCalendarDay, getHourOfDay,
  HUMAN_ADULT_MIN_AGE, HUMAN_MAX_LIFESPAN_DAYS,
  IMMIGRATION_CHECK_TICKS, FESTIVAL_CHECK_TICKS, isProductionTick,
  PRODUCTION_INTERVAL, REPRODUCTION_COOLDOWN_TICKS,
  hasWorkAssignment, isImprisoned,
  isResidenceBuilding, isResidenceBuildingType, isWorkHour, pickResidenceForHuman, getResidenceCapacity,
  TICKS_PER_DAY, WORK_START, NIGHT_START, isNightHour, ticksForDays,
  EVENT_INTERVAL, isFullMoonNight,
} from './dayCycle';
import { beginRenffrSettlerChatter, maybeTriggerRenffrOmen, tickRenffrOmen } from './renffrStar';
import { setEntityBirthDate } from './worldGen';
import {
  isPlayerHuman, tickVisitorGroups, tickRivalSettlements,
  rollYearlyWorldEvent, tryFirstWeekVisitor, tryMidYearVisitorEvent,
} from './groupEvents';
import {
  tickElectionBuildup,
  tickElectionCeremony,
  tickElectionGossip,
  tickLeaderVacancy,
  tryStartDecennialElectionCeremony,
  tryStartVacancyElectionCeremony,
} from './villageLeadership';
import { tickPendingRaidEvents } from './frontierCombat';

export {
  sendRivalGift, establishRivalTradePact, showStrengthToRival,
  signPeaceTreaty, isRivalAtPeace,
  respondToDiplomacyEvent, getDiplomacyChoiceEligibility, tradeWithVisitors, negotiateRefugees,
  talkToVisitorLeader, getVisitorLeaderTalkMeta,
  hitTestCamp,
} from './groupEvents';
export type { VisitorLeaderTalkMeta } from './groupEvents';
export {
  respondToRaidEvent, launchRaidOnRival,
  getMilitiaStrength, getRivalRaidStrength, countArmedMilitia,
  getCombatPreview, getBarricadeStrength,
  getOutgoingRaidFoodCostForRival, formatCampDistance, getCampDistancePixels,
  getRivalDefenseStrength, resolveCounterRaidRatio, canLaunchRaidOnRival,
  formatRaidDeadline, getRaidDaysRemaining, getIncomingRaidResponseDays,
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
  canMoonHowlerCurse, cureMoonHowler, curseMoonHowler, isActiveMoonHowler,
  syncMoonHowlerForms,
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
  fromBuilding.occupants = fromBuilding.occupants.filter((id) => id !== worker.id);
  if (!toBuilding.occupants.includes(worker.id)) toBuilding.occupants.push(worker.id);

  const job = BUILDING_JOB_TYPES[toBuilding.type]!;
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

function assignWorkerInPlace(building: Building, humans: Entity[]): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (countWorkersAtBuilding(humans, building.id) >= cap) return false;

  const candidates = humans.filter(
    (h) => isPlayerHuman(h) && h.alive && !h.isJuvenile && !hasWorkAssignment(h) && !isImprisoned(h) && !h.pregnant,
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

/** Auto-staff construction sites and job buildings so settlers work instead of wandering. */
export function assignMissingWorkers(humans: Entity[], buildings: Building[]): void {
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

  const jobBuildings = completedJobBuildings(buildings);

  for (const building of jobBuildings) {
    if (isManualStaffBuilding(building.type)) continue;
    while (assignWorkerInPlace(building, alive)) {
      // fill open job slots
    }
  }

  rebalanceJobWorkers(alive, buildings);
  syncJobBuildingOccupants(alive, buildings);
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
    entity.flash = 8;
    const name = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
    logEvent(state, 'event', `${name} was released from prison`, name);
    addFloatingText(state, entity.x, entity.y - 18, 'Released', '#22c55e');
  }
}

// ============ IMPORT EXTRACTED MODULES ============
import {
  updateStorageCaps,
  addResource,
  applyFoodSpoilage,
  canAffordWorkshopRecipe,
  consumeWorkshopRecipeInputs,
  updateTradeRoutes,
} from './economy';
import { updateWeather, updateDisasters } from './worldEvents';
import { updateResearch } from './research';
import { tickHumans, tickWildlife, type TickContext } from './lifeSimulation';
import { createEntity, replenishDepletedWildlife } from './worldGen';
import { tickVillageForge } from './forge';
import { spawnBuildCompleteParticles } from './juiceEffects';
import { loadJuiceEffectsEnabled } from './preferences';

export { computeWildlifeCounts } from './entityCounts';

// ============ GAME TICK ============
/** Advances simulation one tick. Mutates state in place for performance. */
export function gameTick(state: WorldState, focus?: SimulationFocus): WorldState {
  if (state.paused) return state;
  const { width, height } = state;

  state.tick++;
  state.dayInYear = getCalendarDay(state.tick);
  const season = getSeason(state.dayInYear);
  const grassMult = getGrassGrowthMultiplier(season, state.weather);
  const reproMult = getReproductionMultiplier(season);
  const winterPenalty = getWinterEnergyPenalty(season);

  state.season = season;

  // Update systems
  updateStorageCaps(state);
  updateWeather(state);
  updateResearch(state);
  updateDisasters(state);
  updateTradeRoutes(state);
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

  const byType: Record<EntityType, Entity[]> = {
    [EntityType.Grass]: [], [EntityType.Tree]: [],
    [EntityType.Rabbit]: [], [EntityType.Deer]: [],
    [EntityType.Wolf]: [], [EntityType.Fox]: [], [EntityType.Human]: [],
    [EntityType.Werewolf]: [], [EntityType.Wildkin]: [],
  };
  for (const e of aliveEntities) byType[e.type].push(e);

  const hourOfDay = getHourOfDay(state.tick);
  const isNewCalendarDay = state.tick > 0 && state.tick % TICKS_PER_DAY === 0;
  const moonSync = syncMoonHowlerForms(aliveEntities, state.dayInYear, hourOfDay);
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

  const entityById = new Map<number, Entity>();
  for (const e of aliveEntities) entityById.set(e.id, e);

  const isPassiveBuild =
    (type: BuildingType) =>
      type === BuildingType.House || type === BuildingType.Road || type === BuildingType.Well;

  // Update buildings
  const updatedBuildings = state.buildings.map(b => {
    if (!b.completed && b.constructionProgress < 100) {
      const workers = b.occupants.length;

      if (isWorkHour(hourOfDay)) {
        const buildDays = BUILDING_CONFIGS[b.type].buildTime;
        const totalWorkTicks = buildWorkTicks(buildDays);
        const baseRate = 100 / totalWorkTicks;
        const buildMultiplier = workers > 0
          ? 1 + workers * 0.25
          : isPassiveBuild(b.type) ? 0.55 : 0.12;
        const globalMult = getMultiplier(state, 'global_efficiency');
        const skillMult = getWorkerSkillMultiplier(state, b);
        b.constructionProgress += baseRate * buildMultiplier * globalMult * skillMult;
        if (workers > 0 && hourOfDay === WORK_START) {
          const job = getJobForBuilding(b.type) ?? JobType.Builder;
          for (const id of b.occupants) gainSkill(state, id, job, 0.15);
        }
      }
      b.buildAnimTimer += 0.1;
      if (b.constructionProgress >= 100) {
        b.constructionProgress = 100;
        b.completed = true;
        b.occupants = [];
        logEvent(state, 'building', `${BUILDING_CONFIGS[b.type].label} completed`);
        b.spriteScale = 1.18;
        state.totalBuildingsCompleted++;
        const repGain = b.faction === 'rival' ? 0 : 2;
        if (repGain > 0) {
          addReputation(state, repGain);
        }
        if (b.faction !== 'rival') {
          if (loadJuiceEffectsEnabled()) {
            spawnBuildCompleteParticles(state, b);
            addFloatingText(state, b.x, b.y - b.height * 0.35, '✨ Built!', '#fde047', 'emphasis');
            if (repGain > 0) {
              addFloatingText(state, b.x, b.y - 8, `+${repGain}⭐`, '#22c55e', 'brief');
            }
            impulseScreenShake(state, 3.5);
          }
        } else {
          createDeathParticles(state, b.x, b.y, '#ffd700', 12, 'star');
        }
      }
    }
    if (b.completed && b.spriteScale > 1) {
      b.spriteScale = Math.max(1, b.spriteScale - 0.025);
    } else if (b.completed && b.spriteScale < 1) {
      b.spriteScale = Math.min(1, b.spriteScale + 0.05);
    }
    // Winter building decay — once per game-day
    if (b.completed && season === Season.Winter && isNewCalendarDay) {
      b.health = Math.max(10, b.health - 2);
    }
    // Auto repair with workers — once per game-day
    if (
      b.completed
      && b.health < b.maxHealth
      && b.occupants.length > 0
      && isNewCalendarDay
      && state.resources.wood >= 2
    ) {
      state.resources.wood -= 2;
      b.health = Math.min(b.maxHealth, b.health + 5);
    }
    return b;
  });

  const hasMill = updatedBuildings.some(b => b.type === BuildingType.Mill && b.completed);
  const roadBuildings = updatedBuildings.filter(b => b.type === BuildingType.Road && b.completed);

  const playerHumans = byType[EntityType.Human].filter(isPlayerHuman);
  assignMissingResidences(playerHumans, updatedBuildings);
  assignMissingWorkers(playerHumans, updatedBuildings);

  if (maybeTriggerRenffrOmen(state, isNightHour(hourOfDay))) {
    logEvent(state, 'event', 'A star scratched "Renffr" across the night sky. The letters fell out of alignment.', 'Renffr');
    beginRenffrSettlerChatter(state, state.entities);
  }
  state.renffrOmen = tickRenffrOmen(state.renffrOmen);

  const isWinter = season === Season.Winter;
  const humanCount = playerHumans.length;

  // Predator migration
  if (isProductionTick(state.tick, EVENT_INTERVAL.wolfRecruit) && byType[EntityType.Wolf].filter(e => e.alive).length < 2 && Math.random() < 0.1) {
    const edge = Math.floor(Math.random() * 4);
    let sx = 0, sy = 0;
    if (edge === 0) { sx = Math.random() * width; sy = 0; }
    else if (edge === 1) { sx = Math.random() * width; sy = height; }
    else if (edge === 2) { sx = 0; sy = Math.random() * height; }
    else { sx = width; sy = Math.random() * height; }
    newEntities.push(createEntity(EntityType.Wolf, sx, sy, state.nextEntityId++, 400));
    addFloatingText(state, sx, sy, 'A lone wolf enters', '#6b7280');
  }

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

  const buildingById = new Map<number, Building>();
  for (const b of updatedBuildings) buildingById.set(b.id, b);

  const predators = [
    ...byType[EntityType.Wolf],
    ...byType[EntityType.Fox],
    ...byType[EntityType.Human].filter(isPlayerHuman),
    ...byType[EntityType.Human].filter((h) => h.faction === 'rival'),
    ...byType[EntityType.Werewolf],
  ];

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
    focus,
  };
  tickHumans(state, ctx);
  tickWildlife(state, ctx);

  const allAlive: Entity[] = [];
  for (const e of aliveEntities) {
    if (e.alive) allAlive.push(e);
  }
  for (const e of newEntities) {
    if (e.alive) allAlive.push(e);
  }

  tickVisitorGroups(state, allAlive);
  tickPendingRaidEvents(state, allAlive);
  tickRivalSettlements(state, allAlive);
  for (let i = allAlive.length - 1; i >= 0; i--) {
    if (!allAlive[i].alive) allAlive.splice(i, 1);
  }

  // Update particles
  const newParticles: DeathParticle[] = [];
  for (const p of state.deathParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
    p.life--;
    if (p.life > 0) newParticles.push(p);
  }

  // Population counts
  const counts = { grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, humans: 0, werewolves: 0, wildkin: 0 };
  for (const e of allAlive) {
    if (isPlayerHuman(e)) counts.humans++;
    else if (e.type === EntityType.Grass) counts.grass++;
    else if (e.type === EntityType.Rabbit) counts.rabbits++;
    else if (e.type === EntityType.Deer) counts.deer++;
    else if (e.type === EntityType.Wolf) counts.wolves++;
    else if (e.type === EntityType.Fox) counts.foxes++;
    else if (isActiveMoonHowler(e)) counts.werewolves++;
    else if (e.type === EntityType.Wildkin) counts.wildkin++;
  }

  // Moon Howler curse — settler stays human until the next full-moon night (~2 weeks)
  if (isFullMoonNight(state.dayInYear, hourOfDay) && hourOfDay === NIGHT_START && counts.humans > 5 && Math.random() < 0.08) {
    const candidates = byType[EntityType.Human].filter((h) => isPlayerHuman(h) && canMoonHowlerCurse(h));
    const human = candidates[Math.floor(Math.random() * candidates.length)];
    if (human) {
      const who = human.name ? `${human.name}${human.surname ? ` ${human.surname}` : ''}` : 'A settler';
      curseMoonHowler(human);
      const line = WEREWOLF_CURSE_LINES[Math.floor(Math.random() * WEREWOLF_CURSE_LINES.length)](who);
      addBigNews(state, '🌝 Moon Howler Curse!', line, 'negative');
      addFloatingText(state, human.x, human.y - 20, 'Cursed…', '#c4b5fd');
      logEvent(state, 'event', `${who} was cursed as a Moon Howler`, who);
    }
  }

  // Church breaks the Moon Howler curse
  const churches = updatedBuildings.filter(b => b.completed && b.type === BuildingType.Church);
  if (churches.length > 0 && isProductionTick(state.tick, EVENT_INTERVAL.churchCure)) {
    const cursed = aliveEntities.filter((e) => e.alive && e.moonHowlerCursed);
    for (const cursedOne of cursed) {
      const staffedChurch = churches.find(
        (c) => c.occupants.length > 0 && Math.hypot(c.x - cursedOne.x, c.y - cursedOne.y) < 140,
      );
      if (staffedChurch && Math.random() < 0.06) {
        const who = cursedOne.name ? `${cursedOne.name}${cursedOne.surname ? ` ${cursedOne.surname}` : ''}` : 'A settler';
        cureMoonHowler(cursedOne);
        const line = WEREWOLF_TAME_LINES[Math.floor(Math.random() * WEREWOLF_TAME_LINES.length)];
        addBigNews(state, '⛪ Curse Broken!', `${who} — ${line}`, 'positive');
        addFloatingText(state, cursedOne.x, cursedOne.y - 20, 'Cured!', '#22c55e');
        logEvent(state, 'event', `${who} was cured of the Moon Howler curse`, who);
      }
    }
  }

  // Village festival / party
  if (!state.festival && state.tick % FESTIVAL_CHECK_TICKS === 0 && counts.humans >= 6 && Math.random() < 0.25) {
    const festivalNames = ['Harvest Festival', 'Moonlight Feast', 'Founders Day', 'Spring Revel', 'Trade Fair'];
    const name = festivalNames[Math.floor(Math.random() * festivalNames.length)];
    state.festival = { active: true, name, daysLeft: 20 + Math.floor(Math.random() * 20) };
    state.villageReputation = Math.min(100, state.villageReputation + 10);
    addBigNews(state, '🎉 Festival!', `${name} has begun! Production, courtship, and immigration are boosted for ${state.festival.daysLeft} days.`, 'positive');
    logEvent(state, 'season', `${name} festival began in the village`);
  }
  if (state.festival && state.tick > 0 && state.tick % TICKS_PER_DAY === 0) {
    state.festival.daysLeft--;
    if (state.festival.daysLeft <= 0) {
      addBigNews(state, '🎉 Festival Ended', `${state.festival.name} is over. The village returns to normal.`, 'neutral');
      state.festival = null;
    }
  }

  // Pollution
  const industrialTypes: string[] = [BuildingType.Blacksmith, BuildingType.Mill, BuildingType.Workshop, BuildingType.Mine, BuildingType.Quarry, BuildingType.LumberMill];
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
  }

  // Housing
  const housingCap = updatedBuildings
    .filter((b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion))
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  state.maxHumanPopulation = 5 + housingCap + Math.floor(state.villageReputation / 10);

  // Immigration
  const completedHousing = updatedBuildings.filter(b => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion)).length;
  const immigrationChance = Math.min(0.95, (0.05 + state.villageReputation / 120 + completedHousing * 0.03) * (state.festival?.active ? 1.5 : 1));
  if (state.tick > 0 && state.tick % IMMIGRATION_CHECK_TICKS === 0 && counts.humans < state.maxHumanPopulation && Math.random() < immigrationChance) {
    let spawnX = width / 2, spawnY = height / 2;
    const homes = updatedBuildings.filter(b => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion));
    if (homes.length > 0) {
      const home = homes[Math.floor(Math.random() * homes.length)];
      spawnX = home.x + home.width / 2;
      spawnY = home.y + home.height / 2;
    }
    const newcomer = createEntity(EntityType.Human, spawnX + (Math.random() - 0.5) * 40, spawnY + (Math.random() - 0.5) * 40, state.nextEntityId++);
    newcomer.age = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 25);
    const immigrantAge = newcomer.age;
    setEntityBirthDate(newcomer, state.year - immigrantAge, Math.floor(Math.random() * 12), Math.floor(Math.random() * 30));
    const residences = updatedBuildings.filter(isResidenceBuilding);
    if (residences.length > 0) {
      newcomer.residenceBuildingId = pickResidenceForHuman(newcomer, allAlive.filter(isPlayerHuman), residences);
    }
    newcomer.relationshipStatus = 'single';
    newcomer.partnerId = undefined;
    newcomer.courtshipProgress = 0;
    allAlive.push(newcomer);
    counts.humans++;
    assignMissingWorkers(allAlive.filter(isPlayerHuman), updatedBuildings);
    addFloatingText(state, spawnX, spawnY - 18, '+1 Settler arrived', '#22c55e');
  }

  // Floating texts
  const newFloatingTexts: FloatingText[] = [];
  for (const ft of state.floatingTexts) {
    ft.y -= 0.7;
    ft.life--;
    ft.scale = ft.life < 6 ? ft.life / 6 : 1;
    if (ft.life > 0) newFloatingTexts.push(ft);
  }

  // Building production
  const smithBonus = getSmithBonus(updatedBuildings, playerHumans);
  const millBonus = hasMill ? 1.25 : 1.0;
  const globalEff = getMultiplier(state, 'global_efficiency');
  const festivalMult = state.festival?.active ? 1.5 : 1;

  for (const building of updatedBuildings) {
    const levelMult = building.level || 1;
    const terrainMult = getTerrainEfficiencyMultiplier(state, building);
    const adjacencyMult = getAdjacencyMultiplier(state, building);
    const skillMult = getWorkerSkillMultiplier(state, building);
    const totalMult = levelMult * terrainMult * adjacencyMult * festivalMult * skillMult;
    const productionJob = getJobForBuilding(building.type);

    const staffed = !BUILDING_JOB_TYPES[building.type] || building.occupants.length > 0;
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
      if (addResource(state, 'gold', amount) > 0) rewardProductionSkills(state, building);
    }
    if (building.completed && staffed && building.type === BuildingType.LumberMill && isProductionTick(state.tick, PRODUCTION_INTERVAL.lumber)) {
      const workers = building.occupants.length;
      const lumberMult = getMultiplier(state, 'lumber_yield');
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * lumberMult * globalEff);
      if (addResource(state, 'wood', amount) > 0) rewardProductionSkills(state, building);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.5, vy: -1 - Math.random(), life: 20, maxLife: 20, color: '#8B7355', size: 2 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Quarry && isProductionTick(state.tick, PRODUCTION_INTERVAL.quarry)) {
      const workers = building.occupants.length;
      const stoneMult = getMultiplier(state, 'quarry_yield');
      const amount = Math.floor((8 + workers * 3) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) rewardProductionSkills(state, building);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.3, vy: -0.8 - Math.random() * 0.5, life: 25, maxLife: 25, color: '#808080', size: 2 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Mine && isProductionTick(state.tick, PRODUCTION_INTERVAL.mine)) {
      const workers = building.occupants.length;
      const stoneMult = getMultiplier(state, 'stone_production');
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) rewardProductionSkills(state, building);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.4, vy: -1 - Math.random(), life: 30, maxLife: 30, color: '#555555', size: 3 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Greenhouse && isProductionTick(state.tick, PRODUCTION_INTERVAL.greenhouse)) {
      const workers = building.occupants.length;
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const amount = Math.floor((18 + workers * 5) * totalMult * harvestBonus * millBonus * farmMult * globalEff);
      if (addResource(state, 'food', amount) > 0) rewardProductionSkills(state, building);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.3, vy: -0.8 - Math.random() * 0.5, life: 25, maxLife: 25, color: '#90EE90', size: 2 + Math.random(), type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Market && isProductionTick(state.tick, PRODUCTION_INTERVAL.market)) {
      const workers = building.occupants.length;
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor((8 + workers * 3) * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) rewardProductionSkills(state, building);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.5, vy: -1.2 - Math.random(), life: 30, maxLife: 30, color: '#ffd700', size: 2 + Math.random() * 2, type: 'star' });
    }
    if (building.completed && staffed && building.type === BuildingType.Workshop && isProductionTick(state.tick, PRODUCTION_INTERVAL.workshop)) {
      const workers = building.occupants.length;
      const goldMult = getMultiplier(state, 'gold_production');
      const recipe = getWorkshopRecipe(building.workshopRecipeId);
      const outputMult = (1 + workers * 0.5) * totalMult * goldMult * globalEff;
      if (canAffordWorkshopRecipe(state, recipe)) {
        const amount = Math.max(1, Math.floor(recipe.baseGold * outputMult));
        const added = addResource(state, 'gold', amount);
        if (added > 0) {
          consumeWorkshopRecipeInputs(state, recipe);
          rewardProductionSkills(state, building);
          addFloatingText(
            state,
            building.x + building.width / 2,
            building.y - 12,
            `+${added} gold · ${recipe.label}`,
            '#ffd700',
            'brief',
          );
          state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), life: 25, maxLife: 25, color: '#cd7f32', size: 2 + Math.random(), type: 'sparkle' });
        } else {
          addFloatingText(state, building.x + building.width / 2, building.y - 10, 'Gold storage full', '#f97316', 'brief');
        }
      } else if (isProductionTick(state.tick, PRODUCTION_INTERVAL.workshop)) {
        addFloatingText(state, building.x + building.width / 2, building.y - 10, 'Need materials', '#f97316', 'brief');
      }
    }
    if (building.completed && staffed && building.type === BuildingType.Hospital && isProductionTick(state.tick, PRODUCTION_INTERVAL.hospital)) {
      addReputation(state, 2);
    }
    if (building.completed && staffed && building.type === BuildingType.TownHall && isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)) {
      addReputation(state, 3);
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

  // Time — 24 ticks = one calendar day (hour hand moves each tick)
  const newDayInYear = getCalendarDay(state.tick);
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const newYear = state.tick >= TICKS_PER_DAY && newDayInYear === 0 && prevCalendarDay > 0
    ? state.year + 1
    : state.year;

  let currentActiveEvent = state.activeEvent;
  let currentLastEventYear = state.lastEventYear;
  let currentBountifulHarvest = state.bountifulHarvest;

  if (newDayInYear === 0 && newYear > 0) {
    currentActiveEvent = null;
  }

  if (newYear > 0 && newYear % 2 === 0 && newYear !== currentLastEventYear) {
    currentLastEventYear = newYear;
    const rolled = rollYearlyWorldEvent(
      state, allAlive, updatedBuildings, width, height,
      () => state.nextEntityId++
    );
    currentActiveEvent = rolled.event;
    if (rolled.bountifulHarvest) currentBountifulHarvest = true;
    if (currentActiveEvent) {
      addNotification(state, currentActiveEvent.title, currentActiveEvent.description, currentActiveEvent.type === 'positive' ? 'success' : currentActiveEvent.type === 'negative' ? 'warning' : 'event');
    }
  }

  if (newDayInYear === 180 && newYear > 0 && state.tick > 0) {
    const midEvent = tryMidYearVisitorEvent(state, allAlive, updatedBuildings);
    if (midEvent) {
      currentActiveEvent = midEvent;
      addNotification(state, midEvent.title, midEvent.description, 'event');
    }
  }

  const firstWeekEvent = tryFirstWeekVisitor(state, allAlive, updatedBuildings);
  if (firstWeekEvent) {
    currentActiveEvent = firstWeekEvent;
    addNotification(state, firstWeekEvent.title, firstWeekEvent.description, 'success');
  }

  if (newYear > 0 && newYear % 2 !== 0) {
    currentBountifulHarvest = false;
  }

  // Record yearly statistics — once per year rollover (day 0 spans 24 ticks)
  const yearRollover = newDayInYear === 0 && prevCalendarDay > 0;
  let ecoHealthYearsAbove80 = state.ecoHealthYearsAbove80;
  if (yearRollover) {
    const yearlyStat = recordYearlyStats(state);
    state.yearlyStats.push(yearlyStat);
    if (state.yearlyStats.length > 50) state.yearlyStats.shift();
    state.lifetimeStats = updateLifetimeStats(state, state.lifetimeStats);
    if (newYear > 0) {
      ecoHealthYearsAbove80 = state.ecosystemHealth >= 80
        ? ecoHealthYearsAbove80 + 1
        : 0;
    }

    const buildupNews = tickElectionBuildup(state, newYear, yearRollover);
    if (buildupNews) {
      addBigNews(state, buildupNews.title, buildupNews.message, 'neutral');
      addNotification(state, buildupNews.title, buildupNews.message, 'event');
    }

    const vacancyCeremony = tryStartVacancyElectionCeremony(state, newYear, newDayInYear);
    const decennialCeremony = !vacancyCeremony
      && tryStartDecennialElectionCeremony(state, newYear, newDayInYear);

    if (vacancyCeremony || decennialCeremony) {
      addBigNews(
        state,
        '🗳️ Election Day',
        `Settlers gather for the leadership election (Year ${newYear}). Gossip, tension, then the merit reveal — and a village party after.`,
        'neutral',
      );
      addNotification(
        state,
        '🗳️ Election Day',
        `Year ${newYear} leadership election — villagers gathering now.`,
        'event',
      );
    }
  }

  // Challenges — after year rollover and eco streak update so year/eco checks are current
  const challengeState: WorldState = { ...state, year: newYear, ecoHealthYearsAbove80 };
  state.challenges = state.challenges.map(c => {
    if (c.completed) return c;
    const completed = isChallengeComplete(c, challengeState, counts.humans, updatedBuildings);

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
  assignMissingResidences(endTickHumans, updatedBuildings);
  assignMissingWorkers(endTickHumans, updatedBuildings);

  const preVictoryState: WorldState = {
    ...state,
    entities: allAlive,
    buildings: updatedBuildings,
    dayInYear: newDayInYear,
    year: newYear,
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

  state.entities = allAlive;
  if (state.tick > 0 && state.tick % ticksForDays(3) === 0) {
    replenishDepletedWildlife(state);
  }
  state.buildings = updatedBuildings;
  state.deathParticles = newParticles;
  state.floatingTexts = newFloatingTexts;
  state.dayInYear = newDayInYear;
  state.year = newYear;
  state.season = getSeason(newDayInYear);
  state.populationHistory = history;
  state.humanPopulation = counts.humans;
  state.wildlifeCounts = {
    grass: counts.grass,
    rabbits: counts.rabbits,
    deer: counts.deer,
    wolves: counts.wolves,
    foxes: counts.foxes,
    werewolves: counts.werewolves,
    wildkin: counts.wildkin,
  };
  state.activeEvent = currentActiveEvent;
  state.lastEventYear = currentLastEventYear;
  state.bountifulHarvest = currentBountifulHarvest;
  state.ecoHealthYearsAbove80 = ecoHealthYearsAbove80;
  state.victories = victoryResult.victories;
  state.victoryAchieved = victoryResult.victoryAchieved;
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
} from './buildingActions';
export {
  addResource,
  updateStorageCaps,
  applyFoodSpoilage,
  canAffordWorkshopRecipe,
  consumeWorkshopRecipeInputs,
  updateTradeRoutes,
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
  initGame,
  setEntityBirthDate,
  getAgeInYears,
  type InitGameOptions,
} from './worldGen';
export { tickHumans, tickWildlife } from './lifeSimulation';
export { updateWeather, updateDisasters } from './worldEvents';
export { GAME_VERSION, GAME_PHASE, GAME_TITLE, GAME_SUBTITLE, ECOLOGICAL_FACTS } from './version';
export { getOccupationForBuilding, getJobForBuilding, ensureEntitySkills, readSkill, gainSkill, rewardProductionSkills, getWorkerSkillMultiplier } from './skills';
export {
  FORGE_ORDERS, getForgeOrder, formatForgeInputs, getForgeBlockReason,
  queueForgeOrder, createInitialForgeState,
} from './forge';
export type { ForgeOrder, ForgeOrderId, VillageForgeState } from './forge';
