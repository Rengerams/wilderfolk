import type {
  WorldState, Entity, Building, MapPreset,
} from './gameTypes';
import {
  BuildingType, EntityType, TerrainType,
  Season, WeatherType,
  BUILDING_CONFIGS, INITIAL_CHALLENGES,
  createInitialResearchNodes,
  MapSize, MAP_SIZE_DIMENSIONS,
  JobType, DEFAULT_WORKSHOP_RECIPE_ID,
} from './gameTypes';
import { generateWorldMap, findCampSite } from './terrainGen';
import { createInitialVictories } from './victory';
import { loadAutoSavePreference } from './preferences';
import { ensureNamesLoaded, getRandomName, getRandomSurname } from './nameLoader';
import {
  computeHumanAgeYears,
  DAYS_PER_YEAR,
  getColonyDay,
  HUMAN_ADULT_MIN_AGE,
  setHumanBirthFromAge,
} from './dayCycle';
import { syncEventLogIdFromState } from './eventLog';
import { pickHumanVariant } from './humanSprites';
import { spawnVisitorGroup } from './groupEvents';
import { syncResearchUnlocks } from './research';
import { logEvent } from './eventLog';
import { computeWildlifeCounts } from './entityCounts';
import { isPlayerHuman } from './groupEvents';
import { SPECIES_CONFIG } from './gameEngine';
import { appointFoundingLeader } from './villageLeadership';
import { clearAllFactionWanderStates } from './factionWander';
import { createInitialForgeState } from './forge';
import { getBuildingFootprint } from './buildingRotation';
import { createEmptyLifetimeStats } from './stats';

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
  const tx = Math.floor(x / 10);
  const ty = Math.floor(y / 10);
  return state.worldMap.tiles[ty]?.[tx] ?? null;
}

function isPassableWildlifePosition(state: WorldState, x: number, y: number, margin = 8): boolean {
  if (x < margin || y < margin || x > state.width - margin || y > state.height - margin) return false;
  const tile = getTileAtWorld(state, x, y);
  if (!tile || UNPASSABLE_WILDLIFE_TERRAIN.has(tile.type)) return false;
  return true;
}

/** Max ring radius before spawns clip against map edges. */
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
): void {
  let spawned = 0;
  for (let attempt = 0; attempt < count * 16 && spawned < count; attempt++) {
    const x = Math.random() * state.width;
    const y = Math.random() * state.height;
    if (!isPassableWildlifePosition(state, x, y)) continue;
    state.entities.push(
      createEntity(type, x, y, state.nextEntityId++, SPECIES_CONFIG[type].spawnEnergy),
    );
    spawned++;
  }
}

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
    /** Human calendar age — sets birth date via setHumanBirthFromAge (avoids stale birthYear=0). */
    ageYears?: number;
    colonyDay?: number;
    pregnant?: boolean;
    pregnancyProgress?: number;
    pregnantById?: number;
    partnerId?: number;
    name?: string;
  },
): Entity {
  const config = SPECIES_CONFIG[type];
  const isHuman = type === EntityType.Human;
  const entGender = opts?.gender ?? (isHuman ? (Math.random() > 0.5 ? 'male' : 'female') : undefined);
  const gen = opts?.generation ?? 0;
  let name: string | undefined;
  if (isHuman) {
    name = opts?.name ?? getRandomName(entGender === 'male' ? 'male' : 'female');
  }
  const entity: Entity = {
    id, type, x, y,
    energy: energy ?? config.spawnEnergy,
    maxEnergy: config.maxEnergy,
    age: isHuman
      ? 0
      : isJuvenile
        ? 0
        : Math.floor(Math.random() * config.maxAge * 0.3),
    birthYear: isHuman ? 0 : -1,
    birthMonth: 0,
    birthDay: 0,
    maxAge: config.maxAge,
    speed: config.speed,
    size: isJuvenile ? config.size * 0.5 : config.size,
    vx: 0, vy: 0,
    reproductionCooldown: type === EntityType.Grass ? 0 : Math.random() * 100,
    alive: true,
    flash: 0,
    gender: isHuman ? entGender : undefined,
    isJuvenile: isJuvenile ?? false,
    pregnant: undefined,
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
    surname: isHuman ? (opts?.surname?.trim() || getRandomSurname()) : undefined,
    generation: isHuman ? gen : 0,
    partnerId: opts?.partnerId,
    affairPartnerId: undefined,
    affairProgress: 0,
    lastAffairSiteDay: undefined,
    lastAffairSiteX: undefined,
    lastAffairSiteY: undefined,
    scandalCooldownUntilTick: undefined,
    prisonBuildingId: undefined,
    prisonerUntilTick: undefined,
    prisonSentenceCrime: undefined,
    pregnantById: undefined,
    courtshipProgress: 0,
    isBastard: opts?.isBastard,
    adoptiveMotherId: undefined,
    adoptiveFatherId: undefined,
    lastMetPartner: 0,
    spriteAngle: Math.random() * Math.PI * 2,
    animFrame: 0,
    combatRollSeed: ((id * 2654435761) ^ 0x9e3779b9) >>> 0,
    spriteVariant: isHuman && entGender
      ? (opts?.spriteVariant ?? pickHumanVariant(id, entGender))
      : undefined,
  };

  if (isHuman) {
    if (opts?.ageYears !== undefined) {
      setHumanBirthFromAge(entity, opts.ageYears, opts.colonyDay ?? 0);
    }
    if (opts?.pregnant) {
      entity.pregnant = true;
      entity.pregnancyProgress = opts.pregnancyProgress ?? 0;
      const fatherId = opts.pregnantById ?? opts.fatherId ?? opts.partnerId;
      if (fatherId !== undefined) {
        entity.pregnantById = fatherId;
      }
      entity.relationshipStatus = opts.partnerId !== undefined ? 'married' : 'expecting';
    }
  }

  return entity;
}

export function setEntityBirthDate(entity: Entity, year?: number, month?: number, day?: number): void {
  if (year !== undefined) entity.birthYear = year;
  if (month !== undefined) entity.birthMonth = month;
  if (day !== undefined) entity.birthDay = day;
}

/** Display age — humans use the colony calendar; wildlife converts life-days to years. */
export function getAgeInYears(
  entity: Entity,
  state: Pick<WorldState, 'year' | 'dayInYear' | 'tick'>,
): number {
  if (entity.type === EntityType.Human) {
    return computeHumanAgeYears(entity, getColonyDay(state));
  }
  return Math.max(0, Math.floor(entity.age / DAYS_PER_YEAR));
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
    id, type, x, y,
    width: footprint.width, height: footprint.height,
    rotation: storedRotation,
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
  let spawned = 0;
  for (let attempt = 0; attempt < count * 12 && spawned < count; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * patchRadius;
    const gx = Math.max(0, Math.min(width, cx + Math.cos(angle) * dist));
    const gy = Math.max(0, Math.min(height, cy + Math.sin(angle) * dist));
    if (state.worldMap && !isPassableWildlifePosition(state, gx, gy, 4)) continue;
    state.entities.push(
      createEntity(EntityType.Grass, gx, gy, state.nextEntityId++, SPECIES_CONFIG[EntityType.Grass].spawnEnergy),
    );
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
): void {
  const { width, height } = state;
  const margin = 16;
  const maxRadius = maxRingRadiusFromCenter(cx, cy, width, height, margin);
  if (maxRadius <= 0) {
    spawnWildlifeAtRandomPassable(state, type, count);
    return;
  }
  const effMax = Math.min(maxDist, maxRadius);
  const effMin = Math.min(minDist, effMax);
  if (effMax <= 0) {
    spawnWildlifeAtRandomPassable(state, type, count);
    return;
  }

  let spawned = 0;
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = effMin + Math.random() * Math.max(0, effMax - effMin);
      const sx = Math.max(margin, Math.min(width - margin, cx + Math.cos(angle) * dist));
      const sy = Math.max(margin, Math.min(height - margin, cy + Math.sin(angle) * dist));
      if (state.worldMap && !isPassableWildlifePosition(state, sx, sy, margin)) continue;
      state.entities.push(
        createEntity(type, sx, sy, state.nextEntityId++, SPECIES_CONFIG[type].spawnEnergy),
      );
      spawned++;
      placed = true;
      break;
    }
    if (!placed) continue;
  }
  if (spawned < count) {
    spawnWildlifeAtRandomPassable(state, type, count - spawned);
  }
}

/** Repopulate wildlife when starvation or hunting wiped the map clean. */
export function replenishDepletedWildlife(state: WorldState): boolean {
  const counts = state.wildlifeCounts;
  const rabbits = counts.rabbits;
  const deer = counts.deer;
  const wolves = counts.wolves;
  const foxes = counts.foxes;
  const preyTotal = rabbits + deer;
  const predatorsOk = wolves + foxes >= 2;
  const grassCount = counts.grass;

  // Hysteresis for wildlife only — grass can recover even when prey is stable.
  const needsWildlife = preyTotal < 22 && !(preyTotal >= 14 && predatorsOk);
  const needsGrass = grassCount < 30;
  if (!needsWildlife && !needsGrass) return false;

  const cx = state.width / 2;
  const cy = state.height / 2;

  let grassReplenished = false;
  if (needsGrass) {
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
    grassReplenished = true;
  }

  let wildlifeSpawned = false;
  if (needsWildlife && rabbits < 12) {
    spawnWildlifeRing(state, EntityType.Rabbit, cx, cy, 12 - rabbits, 160, 420);
    wildlifeSpawned = true;
  }
  if (needsWildlife && deer < 8) {
    spawnWildlifeRing(state, EntityType.Deer, cx, cy, 8 - deer, 200, 480);
    wildlifeSpawned = true;
  }
  const preyHealthyForPredators = preyTotal >= 14;
  if (needsWildlife && wolves < 1 && preyHealthyForPredators) {
    spawnWildlifeRing(state, EntityType.Wolf, cx, cy, 1, 320, 520);
    wildlifeSpawned = true;
  }
  if (needsWildlife && foxes < 2 && preyHealthyForPredators) {
    spawnWildlifeRing(state, EntityType.Fox, cx, cy, 2 - foxes, 280, 500);
    wildlifeSpawned = true;
  }

  if (!wildlifeSpawned && !grassReplenished) return false;

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

/** Player settler from immigration — may arrive as a expecting couple with father linked. */
export function createImmigrantSettler(
  state: WorldState,
  x: number,
  y: number,
): Entity[] {
  const colonyDay = getColonyDay(state);
  const age = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 25);

  if (Math.random() < 0.12) {
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
      pregnancyProgress: 10 + Math.floor(Math.random() * 50),
      partnerId: husband.id,
    });
    husband.partnerId = wife.id;
    wife.relationshipStatus = 'married';
    return [husband, wife];
  }

  const newcomer = createEntity(EntityType.Human, x, y, state.nextEntityId++, undefined, false, {
    ageYears: age,
    colonyDay,
    surname: getRandomSurname(),
  });
  newcomer.relationshipStatus = 'single';
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
    wildlifeCounts: { grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0 },
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
    townHallFestivalCooldownUntilTick: 0,
    visitorGroups: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
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
    lastProcessedCalendarDay: 0,
    worldMap: null,
    yearlyStats: [],
    lifetimeStats: createEmptyLifetimeStats(),
    eventLog: [{ id: 0, tick: 0, year: 0, day: 0, type: 'season', message: 'The pioneers have arrived. A new settlement begins.' }],
    eventsThisYear: [],
  };
  syncEventLogIdFromState(state);

  // Generate terrain before placing wildlife so spawn points respect rivers and mountains.
  state.worldMap = generateWorldMap(size, preset ?? 'verdant');

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
      const tx = cx + Math.cos(angle) * dist;
      const ty = cy + Math.sin(angle) * dist;
      if (!isPassableWildlifePosition(state, tx, ty, 4)) continue;
      state.entities.push(createEntity(EntityType.Tree, tx, ty, state.nextEntityId++));
    }
  }

  // Spawn animals across passable terrain (fewer predators, more prey)
  spawnWildlifeAtRandomPassable(state, EntityType.Rabbit, 35);
  spawnWildlifeAtRandomPassable(state, EntityType.Deer, 20);
  spawnWildlifeAtRandomPassable(state, EntityType.Wolf, 1);
  spawnWildlifeAtRandomPassable(state, EntityType.Fox, 4);
  state.wildlifeCounts = computeWildlifeCounts(state.entities);

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
  const father = createEntity(EntityType.Human, centerX - 12, centerY, state.nextEntityId++, 400, false, {
    gender: 'male', generation: 1, surname, ageYears: 30, colonyDay: 0,
    name: getRandomName('male'),
  });
  const mother = createEntity(EntityType.Human, centerX + 12, centerY, state.nextEntityId++, 400, false, {
    gender: 'female', generation: 1, surname, ageYears: 28, colonyDay: 0,
    name: getRandomName('female'),
  });
  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'married';
  father.partnerId = mother.id;
  mother.partnerId = father.id;
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

  state.humanPopulation = state.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
  state.wildlifeCounts = computeWildlifeCounts(state.entities);

  return state;
}
