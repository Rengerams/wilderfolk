import type {
  WorldState, Entity, Building, MapPreset,
} from './gameTypes';
import {
  BuildingType, EntityType,
  Season, WeatherType,
  BUILDING_CONFIGS, INITIAL_CHALLENGES,
  createInitialResearchNodes,
  MapSize, MAP_SIZE_DIMENSIONS,
  JobType, DEFAULT_WORKSHOP_RECIPE_ID,
} from './gameTypes';
import { generateWorldMap, findCampSite } from './terrainGen';
import { createInitialVictories } from './victory';
import { loadAutoSavePreference } from './preferences';
import { getRandomName, getRandomSurname } from './nameLoader';
import { pickHumanVariant } from './humanSprites';
import { spawnVisitorGroup } from './groupEvents';
import { syncResearchUnlocks } from './research';
import { logEvent } from './eventLog';
import { computeWildlifeCounts } from './entityCounts';
import { isPlayerHuman } from './groupEvents';
import { SPECIES_CONFIG } from './gameEngine';
import { appointFoundingLeader } from './villageLeadership';
import { createInitialForgeState } from './forge';
import { getBuildingFootprint } from './buildingRotation';

export interface InitGameOptions {
  width?: number;
  height?: number;
  size?: MapSize;
  preset?: MapPreset;
  villageName?: string;
}

export function createEntity(
  type: EntityType,
  x: number,
  y: number,
  id: number,
  energy?: number,
  isJuvenile?: boolean,
  opts?: {
    gender?: 'male' | 'female';
    fatherId?: number;
    motherId?: number;
    generation?: number;
    surname?: string;
    spriteVariant?: number;
    isBastard?: boolean;
  },
): Entity {
  const config = SPECIES_CONFIG[type];
  const isHuman = type === EntityType.Human;
  const entGender = opts?.gender ?? (isHuman ? (Math.random() > 0.5 ? 'male' : 'female') : undefined);
  const gen = opts?.generation ?? 0;
  let name: string | undefined;
  if (isHuman) {
    name = getRandomName(entGender === 'male' ? 'male' : 'female');
  }
  return {
    id, type, x, y,
    energy: energy ?? config.spawnEnergy,
    maxEnergy: config.maxEnergy,
    age: isJuvenile ? 0 : Math.floor(Math.random() * config.maxAge * 0.3),
    birthYear: 0,
    birthMonth: Math.floor(Math.random() * 12),
    birthDay: Math.floor(Math.random() * 30),
    maxAge: config.maxAge,
    speed: config.speed,
    size: isJuvenile ? config.size * 0.5 : config.size,
    vx: 0, vy: 0,
    reproductionCooldown: type === EntityType.Grass ? 0 : Math.random() * 100,
    alive: true,
    flash: 0,
    gender: isHuman ? entGender : undefined,
    isJuvenile: isJuvenile ?? false,
    pregnant: isHuman && !isJuvenile && entGender === 'female' && Math.random() < 0.05 ? true : undefined,
    pregnancyProgress: 0,
    homeBuildingId: undefined,
    residenceBuildingId: undefined,
    occupation: isHuman ? 'settler' : undefined,
    job: isHuman ? JobType.Settler : undefined,
    skills: {},
    relationshipStatus: isHuman ? 'single' : undefined,
    childrenIds: [],
    fatherId: opts?.fatherId,
    motherId: opts?.motherId,
    name,
    surname: opts?.surname,
    generation: isHuman ? gen : 0,
    partnerId: undefined,
    affairPartnerId: undefined,
    affairProgress: 0,
    prisonBuildingId: undefined,
    prisonerUntilTick: undefined,
    pregnantById: undefined,
    courtshipProgress: 0,
    isBastard: opts?.isBastard,
    lastMetPartner: 0,
    spriteAngle: Math.random() * Math.PI * 2,
    animFrame: 0,
    spriteVariant: isHuman && entGender
      ? (opts?.spriteVariant ?? pickHumanVariant(id, entGender))
      : undefined,
  };
}

export function setEntityBirthDate(entity: Entity, year?: number, month?: number, day?: number): void {
  if (year !== undefined) entity.birthYear = year;
  if (month !== undefined) entity.birthMonth = month;
  if (day !== undefined) entity.birthDay = day;
}

/** Display age — life-days are shown as years in the compressed calendar. */
export function getAgeInYears(entity: Entity): number {
  return Math.max(0, entity.age);
}

export function createBuilding(
  type: BuildingType,
  x: number,
  y: number,
  id: number,
  rotation: 0 | 90 = 0,
): Building {
  const config = BUILDING_CONFIGS[type];
  const footprint = getBuildingFootprint(config, rotation);
  return {
    id, type, x, y,
    width: footprint.width, height: footprint.height,
    rotation: rotation === 90 ? 90 : undefined,
    occupants: [], level: 1,
    constructionProgress: 0, completed: false,
    health: 100, maxHealth: 100,
    spriteScale: 0,
    buildAnimTimer: 0,
    ...(type === BuildingType.Workshop ? { workshopRecipeId: DEFAULT_WORKSHOP_RECIPE_ID } : {}),
  };
}

export function spawnGrassPatch(
  state: WorldState,
  cx: number,
  cy: number,
  count: number,
  patchRadius = 80,
): void {
  const { width, height } = state;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * patchRadius;
    const gx = Math.max(0, Math.min(width, cx + Math.cos(angle) * dist));
    const gy = Math.max(0, Math.min(height, cy + Math.sin(angle) * dist));
    state.entities.push(createEntity(EntityType.Grass, gx, gy, state.nextEntityId++));
  }
}

export function spawnWildlifeRing(
  state: WorldState,
  type: EntityType,
  cx: number,
  cy: number,
  count: number,
  minDist: number,
  maxDist: number,
): void {
  const { width, height } = state;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const x = Math.max(0, Math.min(width, cx + Math.cos(angle) * dist));
    const y = Math.max(0, Math.min(height, cy + Math.sin(angle) * dist));
    state.entities.push(createEntity(type, x, y, state.nextEntityId++));
  }
}

/** Repopulate wildlife when starvation or hunting wiped the map clean. */
export function replenishDepletedWildlife(state: WorldState): boolean {
  const alive = state.entities.filter((e) => e.alive);
  const rabbits = alive.filter((e) => e.type === EntityType.Rabbit).length;
  const deer = alive.filter((e) => e.type === EntityType.Deer).length;
  const wolves = alive.filter((e) => e.type === EntityType.Wolf).length;
  const foxes = alive.filter((e) => e.type === EntityType.Fox).length;
  const preyTotal = rabbits + deer;

  if (preyTotal >= 20 && wolves + foxes >= 2) return false;

  const cx = state.width / 2;
  const cy = state.height / 2;
  const grassCount = alive.filter((e) => e.type === EntityType.Grass).length;

  if (grassCount < 30) {
    for (let p = 0; p < 4; p++) {
      const angle = (p / 4) * Math.PI * 2;
      spawnGrassPatch(
        state,
        cx + Math.cos(angle) * 220,
        cy + Math.sin(angle) * 180,
        10,
        90,
      );
    }
  }

  if (rabbits < 12) spawnWildlifeRing(state, EntityType.Rabbit, cx, cy, 12 - rabbits, 160, 420);
  if (deer < 8) spawnWildlifeRing(state, EntityType.Deer, cx, cy, 8 - deer, 200, 480);
  if (wolves < 1) spawnWildlifeRing(state, EntityType.Wolf, cx, cy, 1, 320, 520);
  if (foxes < 2) spawnWildlifeRing(state, EntityType.Fox, cx, cy, 2 - foxes, 280, 500);

  if (preyTotal < 20 || wolves + foxes < 2) {
    logEvent(state, 'event', 'Wildlife returned to the frontier meadows.');
    return true;
  }
  return false;
}

// ============ GAME INITIALIZATION ============
export function initGame(options: InitGameOptions = {}): WorldState {
  const {
    size = MapSize.Medium,
    preset,
    villageName,
  } = options;
  const dims = MAP_SIZE_DIMENSIONS[size];
  const width = options.width ?? dims.width;
  const height = options.height ?? dims.height;
  const state: WorldState = {
    entities: [], buildings: [],
    deathParticles: [], floatingTexts: [],
    tick: 0, season: Season.Spring, year: 0, dayInYear: 0,
    populationHistory: [], width, height,
    nextEntityId: 0, nextBuildingId: 0, nextFloatingTextId: 0,
    paused: false, speed: 1,
    activeEvent: null, lastEventYear: 0,
    bountifulHarvest: false,
    humanPopulation: 0, maxHumanPopulation: 8,
    wildlifeCounts: { grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0 },
    villageName: villageName || 'New Frontier',
    villageReputation: 10,
    resources: { wood: 220, stone: 70, food: 530, gold: 80 }, // balance v2.2 — +50 starting food
    storageMax: { wood: 500, stone: 300, food: 600, gold: 99999 },
    foodSpoilageRate: 0.03, // balance v2.2
    ecosystemHealth: 100, biodiversityIndex: 1.0, pollutionLevel: 0,
    challenges: JSON.parse(JSON.stringify(INITIAL_CHALLENGES)),
    autoSave: loadAutoSavePreference(),
    weather: WeatherType.Clear, weatherTimer: 0,
    researchNodes: createInitialResearchNodes(),
    unlockedTechs: [], activeResearch: null, researchProgress: 0,
    soundEnabled: true, musicEnabled: true,
    notifications: [], bigNews: [], screenShakeImpulse: 0,
    renffrOmen: null,
    renffrChatterUntilTick: 0,
    disasters: [], tradeRoutes: [],
    festival: null,
    visitorGroups: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    tutorialSeen: [],
    victories: createInitialVictories(),
    victoryAchieved: null,
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: false,
    villageLeaderId: null,
    leaderSinceYear: 0,
    lastElectionYear: -1,
    pendingElectionYear: null,
    electionBuildupNotifiedYear: null,
    electionCeremony: null,
    villageForge: createInitialForgeState(),
    totalBuildingsCompleted: 0,
    worldMap: null,
    yearlyStats: [],
    lifetimeStats: { totalHumansBorn: 0, totalHumansDied: 0, totalMarriages: 0, totalBuildings: 0, totalBuildingsUpgraded: 0, totalResourcesGathered: { wood: 0, stone: 0, food: 0, gold: 0 }, disastersSurvived: 0, technologiesResearched: 0, tradeRoutesEstablished: 0, longestLivingHuman: { name: '', age: 0 }, largestPopulation: { count: 0, year: 0 }, mostProductiveYear: { year: 0, buildings: 0 } },
    eventLog: [{ id: 0, tick: 0, year: 0, day: 0, type: 'season', message: 'The pioneers have arrived. A new settlement begins.' }],
  };

  // Grass meadows — prey need grazing patches to survive the day/night calendar.
  for (let p = 0; p < 8; p++) {
    const cx = width * 0.1 + Math.random() * width * 0.8;
    const cy = height * 0.1 + Math.random() * height * 0.8;
    spawnGrassPatch(state, cx, cy, 10, 60 + Math.random() * 80);
  }

  // Spawn tree clusters
  for (let c = 0; c < 8; c++) {
    const cx = width * 0.15 + Math.random() * width * 0.7;
    const cy = height * 0.15 + Math.random() * height * 0.7;
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 60;
      state.entities.push(createEntity(EntityType.Tree,
        Math.max(0, Math.min(width, cx + Math.cos(angle) * dist)),
        Math.max(0, Math.min(height, cy + Math.sin(angle) * dist)),
        state.nextEntityId++
      ));
    }
  }

  // Spawn animals across the world (fewer predators, more prey)
  for (let i = 0; i < 35; i++) state.entities.push(createEntity(EntityType.Rabbit, Math.random() * width, Math.random() * height, state.nextEntityId++));
  for (let i = 0; i < 20; i++) state.entities.push(createEntity(EntityType.Deer, Math.random() * width, Math.random() * height, state.nextEntityId++));
  for (let i = 0; i < 1; i++) state.entities.push(createEntity(EntityType.Wolf, Math.random() * width, Math.random() * height, state.nextEntityId++)); // balance v2.2 — lighter early wolf pressure
  for (let i = 0; i < 4; i++) state.entities.push(createEntity(EntityType.Fox, Math.random() * width, Math.random() * height, state.nextEntityId++));

  // Generate terrain
  state.worldMap = generateWorldMap(size, preset ?? 'verdant');

  const houseFootprint = BUILDING_CONFIGS[BuildingType.House];
  const camp = findCampSite(
    state.worldMap.tiles,
    state.worldMap.width,
    state.worldMap.height,
    width,
    height,
    houseFootprint.width,
    houseFootprint.height,
    width / 2,
    height / 2,
  );

  // Pioneering couple — founding family (high energy to survive initial days)
  const centerX = camp.x;
  const centerY = camp.y;
  const surname = getRandomSurname();
  const father = createEntity(EntityType.Human, centerX - 12, centerY, state.nextEntityId++, 400, false, { gender: 'male', generation: 1, surname });
  const mother = createEntity(EntityType.Human, centerX + 12, centerY, state.nextEntityId++, 400, false, { gender: 'female', generation: 1, surname });
  // Marry them
  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'married';
  father.partnerId = mother.id;
  mother.partnerId = father.id;
  father.name = getRandomName('male');
  mother.name = getRandomName('female');
  father.age = 30;
  mother.age = 28;
  setEntityBirthDate(father, -30, Math.floor(Math.random() * 12), Math.floor(Math.random() * 30));
  setEntityBirthDate(mother, -28, Math.floor(Math.random() * 12), Math.floor(Math.random() * 30));
  state.entities.push(father, mother);

  // Grazing meadows around the settlement so prey stay visible and fed.
  spawnGrassPatch(state, centerX + 140, centerY + 90, 12, 100);
  spawnGrassPatch(state, centerX - 150, centerY - 80, 12, 100);
  spawnGrassPatch(state, centerX + 60, centerY - 160, 10, 85);

  // Prey ring outside flee range of the starting camp
  spawnWildlifeRing(state, EntityType.Rabbit, centerX, centerY, 14, 120, 280);
  spawnWildlifeRing(state, EntityType.Deer, centerX, centerY, 10, 180, 360);
  spawnWildlifeRing(state, EntityType.Fox, centerX, centerY, 2, 240, 400);

  syncResearchUnlocks(state);

  // Guaranteed friendly visitor in the first week: traders arrive at founding.
  if (state.visitorGroups.length === 0) {
    spawnVisitorGroup(state, state.entities, state.buildings, 'traders');
  }

  appointFoundingLeader(state, father);

  state.wildlifeCounts = computeWildlifeCounts(state.entities);
  state.humanPopulation = state.entities.filter((e) => e.alive && isPlayerHuman(e)).length;

  return state;
}
