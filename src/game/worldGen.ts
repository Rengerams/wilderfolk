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
  PATH_CELL,
  emptyEntityByType,
} from './gameTypes';
import { generateWorldMap, findCampSite } from './terrainGen';
export { generateWorldMap } from './terrainGen';
import { tileAt } from './terrain/terrainGrid';
import {
  enableSeededGlobalRandom,
  getSimRng,
  nativeRandom,
  setSimSeed,
  randomInt,
  randomBool,
  type RngStream,
} from './simRng';
import { loadAutoSavePreference } from './preferences';
import { INITIAL_CHALLENGES } from './challenges';
import { Immigration } from './gameConstants';
import { DEFAULT_WORKFORCE_POLICY } from './workforcePolicy';
import { ensureNamesLoaded, getRandomName, getRandomSurname } from './nameLoader';
import {
  getColonyDay,
  TICKS_PER_HOUR,
} from './dayCycle';
import { syncEventLogIdFromState, logEvent } from './eventLog';
import { indexLivingEntity, rebuildEntityByIdMap } from './entityIndex';
import { syncResearchUnlocks } from './research';
import { computeWildlifeCounts } from './entityCounts';
import { buildEntityByType } from './simFocus';
import { playerHumanCount } from './playerHuman';
import { SPECIES_CONFIG } from './speciesConfig';
import { createEntity, finalizeSettlerAge } from './entityFactory';
import { appointFoundingLeader } from './villageLeadership';
import { clearAllFactionWanderStates } from './factionWander';
import { createInitialForgeState } from './forge';
import { getBuildingFootprint } from './buildingRotation';
import { createEmptyLifetimeStats } from './stats';
import { createGuidedCampaignState } from './guidedCampaign';
import { spawnBlueberryTrees } from './blueberryForaging';
import { computeStorageMax } from './economy';

export { createEntity, finalizeSettlerAge } from './entityFactory';

export interface WildlifeSpawnOptions {
  recordBirthYear?: boolean;
  onSpawn?: (entity: Entity) => void;
}

/** Deterministische simulatie RNG stream voor wereldgeneratie */
function simRandom(): number {
  return getSimRng('worldGen')();
}

/** Deterministische integer helper tussen min en max (inclusief) */
function getRandomInt(min: number, max: number): number {
  return min + Math.floor(simRandom() * (max - min + 1));
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
  const tw = state.worldMap.width > 0 ? state.width / state.worldMap.width : PATH_CELL;
  const th = state.worldMap.height > 0 ? state.height / state.worldMap.height : PATH_CELL;
  const tx = Math.floor(x / tw);
  const ty = Math.floor(y / th);
  if (tx < 0 || ty < 0 || tx >= state.worldMap.width || ty >= state.worldMap.height) {
    return null;
  }
  return tileAt(state.worldMap, tx, ty) ?? null;
}

export function isPassableWildlifePosition(state: WorldState, x: number, y: number, margin = 8): boolean {
  if (x < margin || y < margin || x > state.width - margin || y > state.height - margin) {
    return false;
  }
  const tile = getTileAtWorld(state, x, y);
  if (!tile) {
    return !state.worldMap;
  }
  return !UNPASSABLE_WILDLIFE_TERRAIN.has(tile.type);
}

/** Helper voor het aanmaken en indexeren van gespawnde dieren */
function registerSpawnedWildlife(
  state: WorldState,
  type: EntityType,
  x: number,
  y: number,
  opts?: WildlifeSpawnOptions,
): Entity {
  const spawnedEntity = createEntity(
    type,
    x,
    y,
    state.nextEntityId++,
    SPECIES_CONFIG[type].spawnEnergy,
  );
  if (opts?.recordBirthYear) spawnedEntity.birthYear = state.year;

  // Always register and index entity in world state
  state.entities.push(spawnedEntity);
  indexLivingEntity(state, spawnedEntity);

  if (opts?.onSpawn) {
    opts.onSpawn(spawnedEntity);
  }

  return spawnedEntity;
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
  opts?: WildlifeSpawnOptions & {
    cx?: number;
    cy?: number;
    minDist?: number;
    maxDist?: number;
  },
): void {
  const margin = 16;
  const hasCustomCenter = opts?.cx !== undefined || opts?.cy !== undefined;
  const maxAttempts = Math.min(count * 20, 512);

  let spawned = 0;
  let consecutiveFails = 0;

  for (let attempt = 0; attempt < maxAttempts && spawned < count; attempt++) {
    let x: number;
    let y: number;

    if (hasCustomCenter) {
      const cx = opts?.cx ?? state.width / 2;
      const cy = opts?.cy ?? state.height / 2;
      const effMin = Math.max(0, opts?.minDist ?? 0);
      const effMax = Math.max(effMin, opts?.maxDist ?? Math.min(state.width, state.height) / 2);
      const angle = simRandom() * Math.PI * 2;
      const dist = effMin + simRandom() * (effMax - effMin);
      x = cx + Math.cos(angle) * dist;
      y = cy + Math.sin(angle) * dist;

      if (x < margin || x > state.width - margin || y < margin || y > state.height - margin) {
        consecutiveFails++;
        if (consecutiveFails >= 48) break;
        continue;
      }
    } else {
      x = margin + simRandom() * (state.width - margin * 2);
      y = margin + simRandom() * (state.height - margin * 2);
    }

    if (!isPassableWildlifePosition(state, x, y, margin)) {
      consecutiveFails++;
      if (consecutiveFails >= 48) break;
      continue;
    }
    consecutiveFails = 0;

    registerSpawnedWildlife(state, type, x, y, opts);
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

/**
 * Scatter `count` grass entities around `(cx, cy)`, mirroring `registerSpawnedWildlife`: every
 * entity is pushed to `state.entities`, indexed, and then offered to `opts.onSpawn`. The daily
 * layer passes the canonical `pushNewEntity` routing there, because the array it pushes into is
 * replaced by `gameTick` at the end of the tick.
 */
export function spawnGrassPatch(
  state: WorldState,
  cx: number,
  cy: number,
  count: number,
  patchRadius = 80,
  opts?: WildlifeSpawnOptions,
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
    if (opts?.onSpawn) {
      opts.onSpawn(grass);
    }
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
  opts?: WildlifeSpawnOptions,
): void {
  const { width, height } = state;
  const margin = 16;
  const maxRadius = maxRingRadiusFromCenter(cx, cy, width, height, margin);

  if (maxRadius <= 0 || maxRadius < minDist) {
    spawnWildlifeAtRandomPassable(state, type, count, {
      cx, cy, minDist, maxDist, recordBirthYear: opts?.recordBirthYear, onSpawn: opts?.onSpawn,
    });
    return;
  }

  const effMax = Math.min(maxDist, maxRadius);
  const effMin = Math.min(Math.max(0, minDist), effMax);

  let spawned = 0;
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = simRandom() * Math.PI * 2;
      const dist = effMin + simRandom() * Math.max(0, effMax - effMin);
      const sx = cx + Math.cos(angle) * dist;
      const sy = cy + Math.sin(angle) * dist;

      if (sx < margin || sx > width - margin || sy < margin || sy > height - margin) continue;
      if (state.worldMap && !isPassableWildlifePosition(state, sx, sy, margin)) continue;

      registerSpawnedWildlife(state, type, sx, sy, opts);
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
  const grassCount = counts.grass;

  const MIN_GRASS = 65;
  const MIN_PREY_GRASS = MIN_GRASS - 20;
  const MIN_RABBITS = 35;
  const TARGET_RABBITS = 55;
  const MIN_DEER = 12;
  const TARGET_DEER = 20;
  const MIN_FOXES = 8;
  const TARGET_FOXES = 14;
  const MIN_WOLVES = 5;
  const TARGET_WOLVES = 6;

  const cx = state.width / 2;
  const cy = state.height / 2;

  let grassReplenished = false;
  const needsGrass = grassCount < MIN_GRASS;

  if (needsGrass) {
    for (let p = 0; p < 7; p++) {
      const angle = (p / 7) * Math.PI * 2;
      spawnGrassPatch(state, cx + Math.cos(angle) * 230, cy + Math.sin(angle) * 190, 14, 110, { onSpawn });
    }
    grassReplenished = true;
  }

  // The patches land in `state.entities` (the list `gameTick` replaces at the end of the tick) *and*,
  // through `onSpawn` → `pushNewEntity`, in `ctx.newEntities`, which `gameTick` drains back into the
  // authoritative entity list. So every patch counted here is a patch that really lands — the prey
  // gate below no longer credits pasture that was thrown away (S-2).
  const grassAfterReplenish = needsGrass
    ? computeWildlifeCounts(state.entities).grass
    : grassCount;
  const sufficientGrass = grassAfterReplenish >= MIN_PREY_GRASS;

  const needsRabbits = (rabbits < MIN_RABBITS && sufficientGrass) || rabbits < 4;
  const needsDeer = (deer < MIN_DEER && sufficientGrass) || deer < 2;
  const sufficientPreyForFoxes = rabbits >= 20;
  const needsFoxes = (foxes < MIN_FOXES && sufficientPreyForFoxes) || foxes < 2;
  const totalWolfPrey = deer + foxes + rabbits;
  const sufficientPreyForWolves = totalWolfPrey >= 30;
  const needsWolves = (wolves < MIN_WOLVES && sufficientPreyForWolves) || wolves < 2;

  const needsWildlife = needsRabbits || needsDeer || needsFoxes || needsWolves;
  if (!needsWildlife && !grassReplenished) return false;

  let wildlifeSpawned = false;

  if (needsRabbits) {
    spawnWildlifeRing(state, EntityType.Rabbit, cx, cy, TARGET_RABBITS - rabbits, 120, 320, {
      recordBirthYear: true, onSpawn,
    });
    wildlifeSpawned = true;
  }

  if (needsDeer) {
    spawnWildlifeRing(state, EntityType.Deer, cx, cy, TARGET_DEER - deer, 220, 440, {
      recordBirthYear: true, onSpawn,
    });
    wildlifeSpawned = true;
  }

  if (needsFoxes) {
    const countToSpawn = Math.max(2, TARGET_FOXES - foxes);
    spawnWildlifeRing(state, EntityType.Fox, cx, cy, countToSpawn, 160, 320, {
      recordBirthYear: true, onSpawn,
    });
    wildlifeSpawned = true;
  }

  if (needsWolves) {
    const countToSpawn = Math.max(2, TARGET_WOLVES - wolves);
    spawnWildlifeRing(state, EntityType.Wolf, cx, cy, countToSpawn, 340, 540, {
      recordBirthYear: true, onSpawn,
    });
    wildlifeSpawned = true;
  }

  state.wildlifeCounts = computeWildlifeCounts(state.entities);

  const colonyDay = getColonyDay(state);
  const lastLog = state.lastWildlifeReplenishLogDay ?? -999;
  const logGap = colonyDay - lastLog;

  if (logGap >= 40) {
    if (wildlifeSpawned) {
      if (wolves < 2 || foxes < 2) {
        logEvent(state, 'event', 'Predators have migrated into the valley following game trails.');
      } else {
        logEvent(state, 'event', 'Wildlife returned to the frontier meadows.');
      }
    } else {
      logEvent(state, 'event', 'Fresh grass is spreading on the frontier meadows.');
    }
    state.lastWildlifeReplenishLogDay = colonyDay;
  }

  return true;
}

export function createImmigrantSettler(
  state: WorldState,
  x: number,
  y: number,
  maxMembers = 2,
  rng: RngStream = getSimRng('dailyPopulation'),
): Entity[] {
  if (maxMembers < 1) return [];

  ensureNamesLoaded();
  const colonyDay = getColonyDay(state);

  // 1. A young settler arriving alone (10%): a youth — old enough to work, court and be
  //    educated further, too young to marry. Never a child: a child only comes with its parents.
  if (randomBool(rng, Immigration.LONE_YOUTH_CHANCE)) {
    const isFemale = randomBool(rng, 0.5);
    const gender: 'male' | 'female' = isFemale ? 'female' : 'male';
    const youth = createEntity(EntityType.Human, x, y, state.nextEntityId++, undefined, undefined, {
      gender,
      name: getRandomName(gender),
      surname: getRandomSurname(),
      ageYears: randomInt(rng, Immigration.YOUTH_AGE_MIN, Immigration.YOUTH_AGE_MAX),
      colonyDay,
      generation: 2,
      relationshipStatus: 'single',
    });
    return [youth];
  }

  // 2. Married couple (12% of the remaining parties), optionally with children.
  if (maxMembers >= 2 && randomBool(rng, Immigration.COUPLE_CHANCE)) {
    const age = randomInt(rng, Immigration.ADULT_AGE_MIN, Immigration.ADULT_AGE_MAX);
    const familySurname = getRandomSurname();
    const husbandName = getRandomName('male');
    const wifeName = getRandomName('female');
    const wifeMaidenSurname = getRandomSurname();
    const isPregnant = randomBool(rng, Immigration.PREGNANT_WIFE_CHANCE);

    const husband = createEntity(EntityType.Human, x - 6, y, state.nextEntityId++, undefined, false, {
      gender: 'male',
      name: husbandName,
      surname: familySurname,
      ageYears: age,
      colonyDay,
    });
    husband.relationshipStatus = 'married';

    const wife = createEntity(EntityType.Human, x + 6, y, state.nextEntityId++, undefined, false, {
      gender: 'female',
      name: wifeName,
      surname: familySurname,
      maidenSurname: wifeMaidenSurname,
      // Both partners arrive already married, so both must be at the marriage floor
      // (`HUMAN_MOVE_OUT_MIN_AGE` = 18) rather than the adult-work floor of 16.
      ageYears: Math.max(Immigration.ADULT_AGE_MIN, age - 2),
      colonyDay,
      pregnant: isPregnant,
      pregnancyProgress: isPregnant ? randomInt(rng, 10, 60) : 0,
      partnerId: husband.id,
      pregnantById: isPregnant ? husband.id : undefined,
    });
    wife.relationshipStatus = 'married';
    husband.partnerId = wife.id;

    finalizeSettlerAge(husband, state);
    finalizeSettlerAge(wife, state);

    // Children need a slot each, so a colony with two free beds gets the couple only.
    const childSlots = Math.min(Immigration.FAMILY_MAX_CHILDREN, maxMembers - 2);
    const children: Entity[] = [];
    if (childSlots > 0 && randomBool(rng, Immigration.FAMILY_WITH_CHILD_CHANCE)) {
      const childCount = randomInt(rng, 1, childSlots);
      for (let index = 0; index < childCount; index++) {
        const childGender: 'male' | 'female' = randomBool(rng, 0.5) ? 'female' : 'male';
        const child = createEntity(
          EntityType.Human,
          x + (index === 0 ? -14 : 14),
          y + 4,
          state.nextEntityId++,
          undefined,
          undefined, // let the factory derive juvenile status from the age it is given
          {
            gender: childGender,
            name: getRandomName(childGender),
            surname: familySurname,
            ageYears: randomInt(rng, Immigration.CHILD_AGE_MIN, Immigration.CHILD_AGE_MAX),
            colonyDay,
            generation: 2,
            relationshipStatus: 'single',
            fatherId: husband.id,
            motherId: wife.id,
          },
        );
        children.push(child);
        husband.childrenIds = [...(husband.childrenIds ?? []), child.id];
        wife.childrenIds = [...(wife.childrenIds ?? []), child.id];
      }
    }

    return [husband, wife, ...children];
  }

  // 3. Single adult (the rest)
  const isFemale = randomBool(rng, 0.5);
  const gender: 'male' | 'female' = isFemale ? 'female' : 'male';
  const firstName = getRandomName(gender);
  const familySurname = getRandomSurname();

  const newcomer = createEntity(EntityType.Human, x, y, state.nextEntityId++, undefined, false, {
    gender,
    name: firstName,
    surname: familySurname,
    ageYears: randomInt(rng, Immigration.ADULT_AGE_MIN, Immigration.ADULT_AGE_MAX),
    colonyDay,
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
    skipTerrain = false,
  } = options;

  const mapSeed = seed ?? Math.floor(nativeRandom() * 1_000_000);
  setSimSeed(mapSeed);
  enableSeededGlobalRandom();

  const dims = MAP_SIZE_DIMENSIONS[size] ?? MAP_SIZE_DIMENSIONS[MapSize.Medium];
  const width = options.width ?? dims.width;
  const height = options.height ?? dims.height;

  // The caps a fresh colony starts with come from the *owner* (`economy.computeStorageMax`), the same
  // rule `updateStorageCaps` applies every day. This used to be a second literal
  // (`1000 / 500 / 1000 / 2000 / 500`) that disagreed with the rule's `800 / 300 / 800 / 20000 / 300`,
  // and since the daily layer does not run until tick 72, that literal was the ceiling the player
  // actually played the first days against — gold 10× too low, materials 25–67 % too high
  //
  // The empty list is literal rather than a placeholder: `initGame` builds `buildings: []` below and
  // generation never adds one — nothing in this module pushes to `state.buildings` (the only writers
  // are `buildingPlacementActions`, `groupEvents` and `rivalEvents`, all post-init) — so a fresh
  // colony's real building set *is* the empty set. `updateStorageCaps` derives the same numbers on
  // its first pass. Guarded by `tests/storageCap.test.ts`.
  const storageMax = computeStorageMax([]);

  const state: WorldState = {
    entities: [],
    entityByType: emptyEntityByType(),
    buildings: [],
    deathParticles: [],
    floatingTexts: [],
    tick: TICKS_PER_HOUR * 8, // 08:00 AM
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
    workforcePolicy: DEFAULT_WORKFORCE_POLICY,
    villageReputation: 10,
    resources: {
      wood: Math.min(220, storageMax.wood),
      stone: Math.min(70, storageMax.stone),
      food: Math.min(530, storageMax.food),
      gold: Math.min(80, storageMax.gold),
      iron: Math.min(30, storageMax.iron),
    },
    storageMax,
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
    deathsThisYear: { humans: 0, animals: 0 },
  };

  syncEventLogIdFromState(state);

  // 2. Procedural World Map Generation (passing explicit width & height)
  if (!skipTerrain) {
    state.worldMap = generateWorldMap(width, height, mapSeed, size, preset ?? 'continental');
  }

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

  if (state.worldMap) {
    const map = state.worldMap;
    const tw = width / map.width;
    const th = height / map.height;

    for (let ty = 0; ty < map.height; ty += 2) {
      for (let tx = 0; tx < map.width; tx += 2) {
        const t = tileAt(map, tx, ty);
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
  spawnWildlifeAtRandomPassable(state, EntityType.Rabbit, 42);
  spawnWildlifeAtRandomPassable(state, EntityType.Deer, 14);
  spawnWildlifeAtRandomPassable(state, EntityType.Fox, 10);
  spawnWildlifeAtRandomPassable(state, EntityType.Wolf, 4);

  // 6. Camp Selection & Founding Pioneers
  const houseFootprint = BUILDING_CONFIGS[BuildingType.House];
  const camp = state.worldMap
    ? findCampSite(
        state.worldMap,
        width,
        height,
        houseFootprint.width,
        houseFootprint.height,
        width / 2,
        height / 2,
      )
    : { x: width / 2, y: height / 2 };

  const centerX = camp.x;
  const centerY = camp.y;

  spawnBlueberryTrees(state, size, centerX, centerY, isPassableWildlifePosition);

  const surname = getRandomSurname();
  const motherMaidenSurname = getRandomSurname();
  const fatherFirstName = getRandomName('male');
  const motherFirstName = getRandomName('female');

  const father = createEntity(EntityType.Human, centerX - 12, centerY, state.nextEntityId++, 400, false, {
    gender: 'male',
    generation: 1,
    surname,
    name: fatherFirstName,
    ageYears: getRandomInt(22, 40),
    colonyDay: 0,
  });

  const mother = createEntity(EntityType.Human, centerX + 12, centerY, state.nextEntityId++, 400, false, {
    gender: 'female',
    generation: 1,
    surname,
    maidenSurname: motherMaidenSurname,
    name: motherFirstName,
    ageYears: getRandomInt(20, 38),
    colonyDay: 0,
  });

  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'married';
  father.partnerId = mother.id;
  mother.partnerId = father.id;

  finalizeSettlerAge(father, state);
  finalizeSettlerAge(mother, state);

  father.generation = 1;
  mother.generation = 1;

  state.entities.push(father, mother);
  indexLivingEntity(state, father);
  indexLivingEntity(state, mother);

  // 7. Camp Pastures & Wildlife Buffer Rings
  spawnGrassPatch(state, centerX + 140, centerY + 90, 12, 100);
  spawnGrassPatch(state, centerX - 150, centerY - 80, 12, 100);
  spawnGrassPatch(state, centerX + 60, centerY - 160, 10, 85);

  spawnWildlifeRing(state, EntityType.Rabbit, centerX, centerY, 13, 120, 280);
  spawnWildlifeRing(state, EntityType.Deer, centerX, centerY, 6, 180, 360);
  spawnWildlifeRing(state, EntityType.Fox, centerX, centerY, 4, 200, 380);
  spawnWildlifeRing(state, EntityType.Wolf, centerX, centerY, 2, 340, 520);

  // 8. Research, Leadership, and Index Finalization
  syncResearchUnlocks(state);
  appointFoundingLeader(state, father);

  state.humanPopulation = playerHumanCount(state.entities);
  state.wildlifeCounts = computeWildlifeCounts(state.entities);
  state.entityByType = buildEntityByType(state.entities);
  rebuildEntityByIdMap(state);

  return state;
}