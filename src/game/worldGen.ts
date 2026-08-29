/**
 * Game Initialization & Procedural World Generation
 *
 * Authoritative initialization module establishing starting resources,
 * procedural terrain, ecological rings, founding settlers, and immigration.
 */

import type {
  WorldState,
  Entity,
  Building,
  MapPreset,
} from './gameTypes';
import {
  BuildingType,
  EntityType,
  TerrainType,
  Season,
  WeatherType,
  BUILDING_CONFIGS,
  createInitialResearchNodes,
  MapSize,
  MAP_SIZE_DIMENSIONS,
  DEFAULT_WORKSHOP_RECIPE_ID,
  TERRAIN_TILE_SIZE,
} from './gameTypes';
import { generateWorldMap, findCampSite } from './terrainGen';
export { generateWorldMap } from './terrainGen';
import { enableSeededGlobalRandom, getSimRng, setSimSeed } from './simRng';
import { loadAutoSavePreference } from './preferences';
import { INITIAL_CHALLENGES } from './challenges';
import { ensureNamesLoaded, getRandomName, getRandomSurname } from './nameLoader';
import {
  getColonyDay,
  HUMAN_ADULT_MIN_AGE,
  TICKS_PER_HOUR,
} from './dayCycle';
import { syncEventLogIdFromState, logEvent } from './eventLog';
import { indexLivingEntity, rebuildEntityByIdMap } from './entityIndex';
import { syncResearchUnlocks } from './research';
import { computeWildlifeCounts } from './entityCounts';
import { playerHumanCount } from './playerHuman';
import { SPECIES_CONFIG } from './speciesConfig';
import { createEntity, finalizeSettlerAge } from './entityFactory';
import { appointFoundingLeader } from './villageLeadership';
import { clearAllFactionWanderStates } from './factionWander';
import { createInitialForgeState } from './forge';
import { getBuildingFootprint } from './buildingRotation';
import { createEmptyLifetimeStats } from './stats';
import { createGuidedCampaignState } from './guidedCampaign';

export { createEntity, finalizeSettlerAge } from './entityFactory';

/** Deterministic simulation RNG stream for world generation. */
function simRandom(): number {
  return getSimRng('worldGen')();
}

const UNPASSABLE_WILDLIFE_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

function getTileAtWorld(state: WorldState, x: number, y: number) {
  if (!state.worldMap) return null;
  const tx = Math.floor(x / TERRAIN_TILE_SIZE);
  const ty = Math.floor(y / TERRAIN_TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= state.worldMap.width || ty >= state.worldMap.height) {
    return null;
  }
  return state.worldMap.tiles[ty]?.[tx] ?? null;
}

export function isPassableWildlifePosition(state: WorldState, x: number, y: number, margin = 8): boolean {
  if (x < margin || y < margin || x > state.width - margin || y > state.height - margin) {
    return false;
  }
  const tile = getTileAtWorld(state, x, y);
  return !!tile && !UNPASSABLE_WILDLIFE_TERRAIN.has(tile.type);
}

const BLUEBERRY_TREE_INITIAL_YIELD = 6;
const BLUEBERRY_TREE_SPAWN_BY_MAP_SIZE: Record<MapSize, number> = {
  [MapSize.Medium]: 4,
  [MapSize.Large]: 6,
  [MapSize.Huge]: 10,
};

/**
 * Spawns rare blueberry trees as landmark forage points around the starting camp.
 */
function spawnBlueberryTrees(
  state: WorldState,
  size: MapSize,
  campX: number,
  campY: number,
): void {
  const target = BLUEBERRY_TREE_SPAWN_BY_MAP_SIZE[size];
  let spawned = 0;
  const maxAttempts = target * 72;

  for (let attempt = 0; attempt < maxAttempts && spawned < target; attempt++) {
    const angle = simRandom() * Math.PI * 2;
    const dist = 155 + simRandom() * Math.min(state.width, state.height) * 0.28;
    const x = campX + Math.cos(angle) * dist;
    const y = campY + Math.sin(angle) * dist;

    if (!isPassableWildlifePosition(state, x, y, 18)) continue;

    const tooCloseToOther = state.entities.some(
      (entity) =>
        entity.alive &&
        entity.forageKind === 'blueberry' &&
        Math.hypot(entity.x - x, entity.y - y) < 165,
    );
    if (tooCloseToOther) continue;

    const tree = createEntity(EntityType.Tree, x, y, state.nextEntityId++);
    tree.forageKind = 'blueberry';
    tree.blueberryYield = BLUEBERRY_TREE_INITIAL_YIELD;
    tree.blueberryNextRegrowthDay = 4;
    state.entities.push(tree);
    indexLivingEntity(state, tree);
    spawned++;
  }
}

function maxRingRadiusFromCenter(
  cx: number,
  cy: number,
  width: number,
  height: number,
  margin = 16,
): number {
  return Math.max(
    0,
    Math.min(cx - margin, width - cx - margin, cy - margin, height - cy - margin),
  );
}

function spawnWildlifeAtRandomPassable(
  state: WorldState,
  type: EntityType,
  count: number,
  opts?: {
    cx?: number;
    cy?: number;
    minDist?: number;
    maxDist?: number;
    recordBirthYear?: boolean;
    onSpawn?: (entity: Entity) => void;
  },
): void {
  const margin = 16;
  const cx = opts?.cx ?? state.width / 2;
  const cy = opts?.cy ?? state.height / 2;
  const effMin = Math.max(0, opts?.minDist ?? 0);
  const effMax = Math.max(effMin, opts?.maxDist ?? Math.max(state.width, state.height));
  const maxAttempts = Math.min(count * 16, 512);

  let spawned = 0;
  let consecutiveFails = 0;

  for (let attempt = 0; attempt < maxAttempts && spawned < count; attempt++) {
    const angle = simRandom() * Math.PI * 2;
    const dist = effMin + simRandom() * Math.max(0, effMax - effMin);
    const x = Math.max(margin, Math.min(state.width - margin, cx + Math.cos(angle) * dist));
    const y = Math.max(margin, Math.min(state.height - margin, cy + Math.sin(angle) * dist));

    if (!isPassableWildlifePosition(state, x, y, margin)) {
      consecutiveFails++;
      if (consecutiveFails >= 48) break;
      continue;
    }
    consecutiveFails = 0;

    const spawnedEntity = createEntity(
      type,
      x,
      y,
      state.nextEntityId++,
      SPECIES_CONFIG[type].spawnEnergy,
    );
    if (opts?.recordBirthYear) spawnedEntity.birthYear = state.year;

    if (opts?.onSpawn) {
      opts.onSpawn(spawnedEntity);
    } else {
      state.entities.push(spawnedEntity);
      indexLivingEntity(state, spawnedEntity);
    }
    spawned++;
  }
}

export interface InitGameOptions {
  width?: number;
  height?: number;
  size?: MapSize;
  preset?: MapPreset;
  villageName?: string;
  seed?: number;
  skipTerrain?: boolean;
}

export function setEntityBirthDate(entity: Entity, year?: number, month?: number, day?: number): void {
  if (year !== undefined) entity.birthYear = year;
  if (month !== undefined) entity.birthMonth = month;
  if (day !== undefined) entity.birthDay = day;
}

export function createBuilding(
  type: BuildingType,
  x: number,
  y: number,
  id: number,
  rotation: 0 | 90 | 180 | 270 = 0,
): Building {
  const config = BUILDING_CONFIGS[type];
  const footprint = getBuildingFootprint(config, rotation);
  const storedRotation: Building['rotation'] = rotation === 0 ? undefined : rotation;

  return {
    id,
    type,
    x,
    y,
    width: footprint.width,
    height: footprint.height,
    rotation: storedRotation,
    occupants: [],
    level: 1,
    constructionProgress: 0,
    completed: false,
    health: 100,
    maxHealth: 100,
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
  let spawned = 0;
  const maxAttempts = count * 12;

  for (let attempt = 0; attempt < maxAttempts && spawned < count; attempt++) {
    const angle = simRandom() * Math.PI * 2;
    const dist = simRandom() * patchRadius;
    const gx = cx + Math.cos(angle) * dist;
    const gy = cy + Math.sin(angle) * dist;

    if (gx < 0 || gx > width || gy < 0 || gy > height) continue;
    if (state.worldMap && !isPassableWildlifePosition(state, gx, gy, 4)) continue;

    const grass = createEntity(
      EntityType.Grass,
      gx,
      gy,
      state.nextEntityId++,
      SPECIES_CONFIG[EntityType.Grass].spawnEnergy,
    );
    state.entities.push(grass);
    indexLivingEntity(state, grass);
    spawned++;
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
  opts?: { recordBirthYear?: boolean; onSpawn?: (entity: Entity) => void },
): void {
  const { width, height } = state;
  const margin = 16;
  const maxRadius = maxRingRadiusFromCenter(cx, cy, width, height, margin);

  if (maxRadius <= 0) {
    spawnWildlifeAtRandomPassable(state, type, count, {
      cx, cy, minDist, maxDist, recordBirthYear: opts?.recordBirthYear, onSpawn: opts?.onSpawn,
    });
    return;
  }

  const effMax = Math.min(maxDist, maxRadius);
  const effMin = Math.min(Math.max(0, minDist), effMax);

  if (effMax <= 0) {
    spawnWildlifeAtRandomPassable(state, type, count, {
      cx, cy, minDist, maxDist, recordBirthYear: opts?.recordBirthYear, onSpawn: opts?.onSpawn,
    });
    return;
  }

  let spawned = 0;
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = simRandom() * Math.PI * 2;
      const dist = effMin + simRandom() * Math.max(0, effMax - effMin);
      const sx = Math.max(margin, Math.min(width - margin, cx + Math.cos(angle) * dist));
      const sy = Math.max(margin, Math.min(height - margin, cy + Math.sin(angle) * dist));

      if (state.worldMap && !isPassableWildlifePosition(state, sx, sy, margin)) continue;

      const spawnedEntity = createEntity(
        type,
        sx,
        sy,
        state.nextEntityId++,
        SPECIES_CONFIG[type].spawnEnergy,
      );
      if (opts?.recordBirthYear) spawnedEntity.birthYear = state.year;

      if (opts?.onSpawn) {
        opts.onSpawn(spawnedEntity);
      } else {
        state.entities.push(spawnedEntity);
        indexLivingEntity(state, spawnedEntity);
      }
      spawned++;
      placed = true;
      break;
    }
    if (!placed) continue;
  }

  if (spawned < count) {
    spawnWildlifeAtRandomPassable(state, type, count - spawned, {
      cx, cy, minDist: effMin, maxDist: effMax,
      recordBirthYear: opts?.recordBirthYear, onSpawn: opts?.onSpawn,
    });
  }
}

export function replenishDepletedWildlife(
  state: WorldState,
  onSpawn?: (entity: Entity) => void,
): boolean {
  const counts = state.wildlifeCounts;
  const rabbits = counts.rabbits;
  const deer = counts.deer;
  const wolves = counts.wolves;
  const foxes = counts.foxes;
  const preyTotal = rabbits + deer;
  const grassCount = counts.grass;

  const needsRabbits = rabbits < 18;
  const needsDeer = deer < 10;
  const preyHealthyForPredators = rabbits + deer >= 20;
  const needsPredatorRepopulation = preyHealthyForPredators && (wolves < 1 || foxes < 2);
  const needsWildlife = needsRabbits || needsDeer || needsPredatorRepopulation;
  const needsGrass = grassCount < 45;

  if (!needsWildlife && !needsGrass) return false;

  const cx = state.width / 2;
  const cy = state.height / 2;

  let grassReplenished = false;
  if (needsGrass) {
    for (let p = 0; p < 5; p++) {
      const angle = (p / 5) * Math.PI * 2;
      spawnGrassPatch(
        state,
        cx + Math.cos(angle) * 220,
        cy + Math.sin(angle) * 180,
        12,
        100,
      );
    }
    grassReplenished = true;
  }

  let wildlifeSpawned = false;
  if (needsRabbits) {
    spawnWildlifeRing(state, EntityType.Rabbit, cx, cy, Math.max(0, 22 - rabbits), 160, 420, {
      recordBirthYear: true, onSpawn,
    });
    wildlifeSpawned = true;
  }
  if (needsDeer) {
    spawnWildlifeRing(state, EntityType.Deer, cx, cy, Math.max(0, 12 - deer), 200, 480, {
      recordBirthYear: true, onSpawn,
    });
    wildlifeSpawned = true;
  }
  if (preyHealthyForPredators && wolves < 1) {
    spawnWildlifeRing(state, EntityType.Wolf, cx, cy, 1, 320, 520, {
      recordBirthYear: true, onSpawn,
    });
    wildlifeSpawned = true;
  }
  if (preyHealthyForPredators && foxes < 2) {
    spawnWildlifeRing(state, EntityType.Fox, cx, cy, 2 - foxes, 280, 500, {
      recordBirthYear: true, onSpawn,
    });
    wildlifeSpawned = true;
  }

  if (!wildlifeSpawned && !grassReplenished) return false;

  // Refresh wildlife tally
  state.wildlifeCounts = computeWildlifeCounts(state.entities);

  const colonyDay = getColonyDay(state);
  const lastLog = state.lastWildlifeReplenishLogDay ?? -999;
  const preyWasDepleted = preyTotal < 10;
  const logGap = colonyDay - lastLog;
  state.lastWildlifeReplenishLogDay = colonyDay;

  if (wildlifeSpawned) {
    if (preyWasDepleted && logGap >= 30) {
      logEvent(state, 'event', 'Wildlife returned to the frontier meadows.');
    } else if (logGap >= 90) {
      logEvent(state, 'event', 'More game spotted on the outskirts.');
    }
  } else if (grassReplenished && logGap >= 30) {
    logEvent(state, 'event', 'Fresh grass is spreading on the frontier meadows.');
  }

  return true;
}

export function createImmigrantSettler(
  state: WorldState,
  x: number,
  y: number,
  maxMembers = 2,
): Entity[] {
  if (maxMembers < 1) return [];

  const colonyDay = getColonyDay(state);
  const age = HUMAN_ADULT_MIN_AGE + Math.floor(simRandom() * 25);

  if (maxMembers >= 2 && simRandom() < 0.12) {
    const husband = createEntity(EntityType.Human, x - 6, y, state.nextEntityId++, undefined, false, {
      gender: 'male',
      ageYears: age,
      colonyDay,
      surname: getRandomSurname(),
    });
    husband.relationshipStatus = 'married';

    const wife = createEntity(EntityType.Human, x + 6, y, state.nextEntityId++, undefined, false, {
      gender: 'female',
      ageYears: Math.max(HUMAN_ADULT_MIN_AGE, age - 2),
      colonyDay,
      surname: husband.surname,
      pregnant: true,
      pregnancyProgress: 10 + Math.floor(simRandom() * 50),
      partnerId: husband.id,
      pregnantById: husband.id,
    });
    wife.relationshipStatus = 'married';
    husband.partnerId = wife.id;

    finalizeSettlerAge(husband, state);
    finalizeSettlerAge(wife, state);
    return [husband, wife];
  }

  const newcomer = createEntity(EntityType.Human, x, y, state.nextEntityId++, undefined, false, {
    ageYears: age,
    colonyDay,
    surname: getRandomSurname(),
  });
  newcomer.relationshipStatus = 'single';
  finalizeSettlerAge(newcomer, state);
  return [newcomer];
}

// ============ GAME INITIALIZATION ============

export function initGame(options: InitGameOptions = {}): WorldState {
  clearAllFactionWanderStates();
  ensureNamesLoaded();

  const {
    size = MapSize.Medium,
    preset,
    villageName,
    seed,
  } = options;

  // 1. Initialize Deterministic PRNG Seed
  const mapSeed = seed ?? Math.floor(Math.random() * 1_000_000);
  setSimSeed(mapSeed);
  enableSeededGlobalRandom();

  const dims = MAP_SIZE_DIMENSIONS[size];
  const width = options.width ?? dims.width;
  const height = options.height ?? dims.height;

  const state: WorldState = {
    entities: [],
    buildings: [],
    deathParticles: [],
    floatingTexts: [],
    // Start at 08:00 morning light
    tick: TICKS_PER_HOUR * 8,
    season: Season.Spring,
    year: 0,
    dayInYear: 0,
    populationHistory: [],
    chronicleChapters: [],
    width,
    height,
    nextEntityId: 0,
    nextBuildingId: 0,
    nextFloatingTextId: 0,
    paused: false,
    speed: 1,
    activeEvent: null,
    lastEventYear: 0,
    bountifulHarvest: false,
    humanPopulation: 0,
    maxHumanPopulation: 8,
    wildlifeCounts: { grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0 },
    workingSettlers: 0,
    idleSettlers: 0,
    villageName: villageName || 'New Frontier',
    workSchedule: { startHour: 7, endHour: 16 },
    villageReputation: 10,
    resources: { wood: 220, stone: 70, food: 530, gold: 80, iron: 0 },
    storageMax: { wood: 800, stone: 300, food: 800, gold: 20000, iron: 300 },
    foodSpoilageRate: 0.03,
    ecosystemHealth: 100,
    biodiversityIndex: 1.0,
    pollutionLevel: 0,
    valleyStage: 'stable',
    valleyStageSinceDay: 0,
    valleyRawStressStreakDays: 0,
    valleyRawCalmStreakDays: 0,
    valleyLastStageNotifyDay: -999,
    challenges: structuredClone(INITIAL_CHALLENGES),
    autoSave: loadAutoSavePreference(),
    weather: WeatherType.Clear,
    weatherTimer: 0,
    researchNodes: createInitialResearchNodes(),
    unlockedTechs: [],
    activeResearch: null,
    researchProgress: 0,
    soundEnabled: true,
    musicEnabled: true,
    notifications: [],
    bigNews: [],
    screenShakeImpulse: 0,
    renffrOmen: null,
    renffrChatterUntilTick: 0,
    disasters: [],
    tradeRoutes: [],
    festival: null,
    townHallFestivalCooldownUntilTick: 0,
    visitorGroups: [],
    activeVillageRequest: undefined,
    villageRequestCooldownUntilDay: 0,
    villageRequestHistory: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    tutorialSeen: [],
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
    lastProcessedCalendarDay: 0,
    worldMap: null,
    guidedCampaign: createGuidedCampaignState(),
    yearlyStats: [],
    lifetimeStats: createEmptyLifetimeStats(),
    eventLog: [
      {
        id: 0,
        tick: 0,
        year: 0,
        day: 0,
        type: 'season',
        message: 'The pioneers have arrived. A new settlement begins.',
      },
    ],
    eventsThisYear: [],
  };

  syncEventLogIdFromState(state);

  // 2. Procedural World Map Generation
  state.worldMap = generateWorldMap(size, preset ?? 'verdant', mapSeed);

  // 3. Grass Meadows
  for (let p = 0; p < 12; p++) {
    const cx = width * 0.1 + simRandom() * width * 0.8;
    const cy = height * 0.1 + simRandom() * height * 0.8;
    spawnGrassPatch(state, cx, cy, 12, 70 + simRandom() * 90);
  }

  // 4. Tree Clusters & Forest Fills
  for (let c = 0; c < 12; c++) {
    const cx = width * 0.12 + simRandom() * width * 0.76;
    const cy = height * 0.12 + simRandom() * height * 0.76;
    for (let i = 0; i < 14; i++) {
      const angle = simRandom() * Math.PI * 2;
      const dist = simRandom() * 72;
      const tx = cx + Math.cos(angle) * dist;
      const ty = cy + Math.sin(angle) * dist;
      if (!isPassableWildlifePosition(state, tx, ty, 4)) continue;
      const tree = createEntity(EntityType.Tree, tx, ty, state.nextEntityId++);
      state.entities.push(tree);
      indexLivingEntity(state, tree);
    }
  }

  if (state.worldMap?.tiles) {
    const ts = state.worldMap.tiles;
    const mw = state.worldMap.width;
    const mh = state.worldMap.height;
    const tw = width / mw;
    const th = height / mh;

    for (let ty = 0; ty < mh; ty += 2) {
      for (let tx = 0; tx < mw; tx += 2) {
        const t = ts[ty]?.[tx];
        if (!t) continue;
        const isForest = t.type === TerrainType.Forest || t.type === TerrainType.DarkForest;
        if (!isForest || simRandom() > 0.22) continue;

        const px = (tx + 0.35 + simRandom() * 0.3) * tw;
        const py = (ty + 0.35 + simRandom() * 0.3) * th;
        if (!isPassableWildlifePosition(state, px, py, 4)) continue;

        const tree = createEntity(EntityType.Tree, px, py, state.nextEntityId++);
        state.entities.push(tree);
        indexLivingEntity(state, tree);
      }
    }
  }

  // 5. Initial Wildlife Fauna
  spawnWildlifeAtRandomPassable(state, EntityType.Rabbit, 35);
  spawnWildlifeAtRandomPassable(state, EntityType.Deer, 20);
  spawnWildlifeAtRandomPassable(state, EntityType.Wolf, 1);
  spawnWildlifeAtRandomPassable(state, EntityType.Fox, 4);

  // 6. Camp Selection & Founding Pioneers
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

  const centerX = camp.x;
  const centerY = camp.y;
  spawnBlueberryTrees(state, size, centerX, centerY);

  const surname = getRandomSurname();
  const father = createEntity(EntityType.Human, centerX - 12, centerY, state.nextEntityId++, 400, false, {
    gender: 'male',
    generation: 1,
    surname,
    ageYears: 30,
    colonyDay: 0,
    name: getRandomName('male'),
  });

  const mother = createEntity(EntityType.Human, centerX + 12, centerY, state.nextEntityId++, 400, false, {
    gender: 'female',
    generation: 1,
    surname,
    ageYears: 28,
    colonyDay: 0,
    name: getRandomName('female'),
  });

  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'married';
  father.partnerId = mother.id;
  mother.partnerId = father.id;

  finalizeSettlerAge(father, state);
  finalizeSettlerAge(mother, state);

  state.entities.push(father, mother);
  indexLivingEntity(state, father);
  indexLivingEntity(state, mother);

  // 7. Camp Pastures & Wildlife Buffer Rings
  spawnGrassPatch(state, centerX + 140, centerY + 90, 12, 100);
  spawnGrassPatch(state, centerX - 150, centerY - 80, 12, 100);
  spawnGrassPatch(state, centerX + 60, centerY - 160, 10, 85);

  spawnWildlifeRing(state, EntityType.Rabbit, centerX, centerY, 14, 120, 280);
  spawnWildlifeRing(state, EntityType.Deer, centerX, centerY, 10, 180, 360);
  spawnWildlifeRing(state, EntityType.Fox, centerX, centerY, 2, 240, 400);
  spawnWildlifeRing(state, EntityType.Wolf, centerX, centerY, 2, 360, 520);

  // 8. Research, Leadership, and Index Finalization
  syncResearchUnlocks(state);
  appointFoundingLeader(state, father);

  state.humanPopulation = playerHumanCount(state.entities);
  state.wildlifeCounts = computeWildlifeCounts(state.entities);
  rebuildEntityByIdMap(state);

  return state;
}