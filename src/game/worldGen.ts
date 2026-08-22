import type {
  WorldState, Entity, Building, MapPreset,
} from './gameTypes';
import {
  BuildingType, EntityType, TerrainType,
  Season, WeatherType,
  BUILDING_CONFIGS,
  createInitialResearchNodes,
  MapSize, MAP_SIZE_DIMENSIONS,
  DEFAULT_WORKSHOP_RECIPE_ID,
} from './gameTypes';
import { generateWorldMap, findCampSite } from './terrainGen';
import { loadAutoSavePreference } from './preferences';
import { INITIAL_CHALLENGES } from './challenges';
import { ensureNamesLoaded, getRandomName, getRandomSurname } from './nameLoader';
import {
  getColonyDay,
  HUMAN_ADULT_MIN_AGE,
  TICKS_PER_HOUR,
} from './dayCycle';
import { syncEventLogIdFromState } from './eventLog';
import { indexLivingEntity, rebuildEntityByIdMap } from './entityIndex';
import { syncResearchUnlocks } from './research';
import { logEvent } from './eventLog';
import { computeWildlifeCounts } from './entityCounts';
import { isPlayerHuman } from './playerHuman';
import { SPECIES_CONFIG } from './speciesConfig';
import { createEntity, finalizeSettlerAge } from './entityFactory';
import { appointFoundingLeader } from './villageLeadership';
import { clearAllFactionWanderStates } from './factionWander';
import { createInitialForgeState } from './forge';
import { getBuildingFootprint } from './buildingRotation';
import { createEmptyLifetimeStats } from './stats';
import { createGuidedCampaignState } from './guidedCampaign';

export { createEntity, finalizeSettlerAge } from './entityFactory';

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

const BLUEBERRY_TREE_INITIAL_YIELD = 6;
const BLUEBERRY_TREE_SPAWN_BY_MAP_SIZE: Record<MapSize, number> = {
  [MapSize.Small]: 1,
  [MapSize.Medium]: 2,
  [MapSize.Large]: 3,
};

/**
 * Rare forage landmarks, deliberately separate from the ordinary forest loops.
 * The cap is part of the balance contract: blueberries are a local fallback,
 * never a generated food forest.
 */
function spawnBlueberryTrees(
  state: WorldState,
  size: MapSize,
  campX: number,
  campY: number,
): void {
  const target = BLUEBERRY_TREE_SPAWN_BY_MAP_SIZE[size];
  let spawned = 0;
  for (let attempt = 0; attempt < target * 72 && spawned < target; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 155 + Math.random() * Math.min(state.width, state.height) * 0.28;
    const x = campX + Math.cos(angle) * dist;
    const y = campY + Math.sin(angle) * dist;
    if (!isPassableWildlifePosition(state, x, y, 18)) continue;
    const tooNearAnotherBlueberry = state.entities.some((entity) => (
      entity.alive
      && entity.forageKind === 'blueberry'
      && Math.hypot(entity.x - x, entity.y - y) < 165
    ));
    if (tooNearAnotherBlueberry) continue;

    const tree = createEntity(EntityType.Tree, x, y, state.nextEntityId++);
    tree.forageKind = 'blueberry';
    tree.blueberryYield = BLUEBERRY_TREE_INITIAL_YIELD;
    tree.blueberryNextRegrowthDay = 4;
    state.entities.push(tree);
    spawned++;
  }
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
  opts?: { cx?: number; cy?: number; minDist?: number; maxDist?: number; recordBirthYear?: boolean },
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
    const angle = Math.random() * Math.PI * 2;
    const dist = effMin + Math.random() * Math.max(0, effMax - effMin);
    const x = Math.max(margin, Math.min(state.width - margin, cx + Math.cos(angle) * dist));
    const y = Math.max(margin, Math.min(state.height - margin, cy + Math.sin(angle) * dist));
    if (!isPassableWildlifePosition(state, x, y, margin)) {
      consecutiveFails++;
      if (consecutiveFails >= 48) break;
      continue;
    }
    consecutiveFails = 0;
    const spawnedEntity = createEntity(type, x, y, state.nextEntityId++, SPECIES_CONFIG[type].spawnEnergy);
    if (opts?.recordBirthYear) spawnedEntity.birthYear = state.year;
    state.entities.push(spawnedEntity);
    indexLivingEntity(state, spawnedEntity);
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
    const gx = cx + Math.cos(angle) * dist;
    const gy = cy + Math.sin(angle) * dist;
    if (gx < 0 || gx > width || gy < 0 || gy > height) continue;
    if (state.worldMap && !isPassableWildlifePosition(state, gx, gy, 4)) continue;
    const grass = createEntity(EntityType.Grass, gx, gy, state.nextEntityId++, SPECIES_CONFIG[EntityType.Grass].spawnEnergy);
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
  opts?: { recordBirthYear?: boolean },
): void {
  const { width, height } = state;
  const margin = 16;
  const maxRadius = maxRingRadiusFromCenter(cx, cy, width, height, margin);
  if (maxRadius <= 0) {
    spawnWildlifeAtRandomPassable(state, type, count, { cx, cy, minDist, maxDist, recordBirthYear: opts?.recordBirthYear });
    return;
  }
  const effMax = Math.min(maxDist, maxRadius);
  const effMin = Math.min(Math.max(0, minDist), effMax);
  if (effMax <= 0) {
    spawnWildlifeAtRandomPassable(state, type, count, { cx, cy, minDist, maxDist, recordBirthYear: opts?.recordBirthYear });
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
      const spawnedEntity = createEntity(type, sx, sy, state.nextEntityId++, SPECIES_CONFIG[type].spawnEnergy);
      if (opts?.recordBirthYear) spawnedEntity.birthYear = state.year;
      state.entities.push(spawnedEntity);
      indexLivingEntity(state, spawnedEntity);
      spawned++;
      placed = true;
      break;
    }
    if (!placed) continue;
  }
  if (spawned < count) {
    spawnWildlifeAtRandomPassable(state, type, count - spawned, {
      cx, cy, minDist: effMin, maxDist: effMax, recordBirthYear: opts?.recordBirthYear,
    });
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
  const grassCount = counts.grass;

  // Soft floor — don't wait until the valley is empty (players saw "all gone" by ~half year).
  const needsRabbits = rabbits < 18;
  const needsDeer = deer < 10;
  const needsWildlife = needsRabbits || needsDeer;
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
    spawnWildlifeRing(state, EntityType.Rabbit, cx, cy, Math.max(0, 22 - rabbits), 160, 420, { recordBirthYear: true });
    wildlifeSpawned = true;
  }
  if (needsDeer) {
    spawnWildlifeRing(state, EntityType.Deer, cx, cy, Math.max(0, 12 - deer), 200, 480, { recordBirthYear: true });
    wildlifeSpawned = true;
  }
  // Only top up predators when prey is healthy enough to support them
  const preyHealthyForPredators = rabbits + deer >= 20;
  if (preyHealthyForPredators && wolves < 1) {
    spawnWildlifeRing(state, EntityType.Wolf, cx, cy, 1, 320, 520, { recordBirthYear: true });
    wildlifeSpawned = true;
  }
  if (preyHealthyForPredators && foxes < 2) {
    spawnWildlifeRing(state, EntityType.Fox, cx, cy, 2 - foxes, 280, 500, { recordBirthYear: true });
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

/**
 * Player settler from immigration — may arrive as an expecting couple with father linked.
 * `maxMembers` caps how many may be created (respects open pop-cap slots; couples need 2).
 */
export function createImmigrantSettler(
  state: WorldState,
  x: number,
  y: number,
  maxMembers = 2,
): Entity[] {
  if (maxMembers < 1) return [];

  const colonyDay = getColonyDay(state);
  const age = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 25);

  if (maxMembers >= 2 && Math.random() < 0.12) {
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
      pregnantById: husband.id,
    });
    husband.partnerId = wife.id;
    wife.relationshipStatus = 'married';
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
    size = MapSize.Small,
    preset,
    villageName,
  } = options;
  const dims = MAP_SIZE_DIMENSIONS[size];
  const width = options.width ?? dims.width;
  const height = options.height ?? dims.height;
  const state: WorldState = {
    entities: [], buildings: [],
    deathParticles: [], floatingTexts: [],
    // Start at 08:00 (not tick 0 / midnight) — the founding scene shouldn't
    // open in pitch darkness; settlers arrive to a lit valley with visible water.
    tick: TICKS_PER_HOUR * 8, season: Season.Spring, year: 0, dayInYear: 0,
    populationHistory: [], chronicleChapters: [], width, height,
    nextEntityId: 0, nextBuildingId: 0, nextFloatingTextId: 0,
    paused: false, speed: 1,
    activeEvent: null, lastEventYear: 0,
    bountifulHarvest: false,
    humanPopulation: 0, maxHumanPopulation: 8,
    wildlifeCounts: { grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0 },
    workingSettlers: 0,
    idleSettlers: 0,
    villageName: villageName || 'New Frontier',
    workSchedule: { startHour: 7, endHour: 18 },
    villageReputation: 10,
    resources: { wood: 220, stone: 70, food: 530, gold: 80, iron: 0 },
    storageMax: { wood: 800, stone: 300, food: 800, gold: 20000, iron: 300 },
    foodSpoilageRate: 0.03,
    ecosystemHealth: 100, biodiversityIndex: 1.0, pollutionLevel: 0,
    valleyStage: 'stable',
    valleyStageSinceDay: 0,
    valleyRawStressStreakDays: 0,
    valleyRawCalmStreakDays: 0,
    valleyLastStageNotifyDay: -999,
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
    eventLog: [{ id: 0, tick: 0, year: 0, day: 0, type: 'season', message: 'The pioneers have arrived. A new settlement begins.' }],
    eventsThisYear: [],
  };
  syncEventLogIdFromState(state);

  // Generate terrain before placing wildlife so spawn points respect rivers and mountains.
  state.worldMap = generateWorldMap(size, preset ?? 'verdant');

  // Grass meadows — prey need grazing patches to survive the day/night calendar.
  // Phase C: more / larger patches so open ground feels living
  for (let p = 0; p < 12; p++) {
    const cx = width * 0.1 + Math.random() * width * 0.8;
    const cy = height * 0.1 + Math.random() * height * 0.8;
    spawnGrassPatch(state, cx, cy, 12, 70 + Math.random() * 90);
  }

  // Spawn tree clusters (Phase C: more clusters, denser groves)
  for (let c = 0; c < 12; c++) {
    const cx = width * 0.12 + Math.random() * width * 0.76;
    const cy = height * 0.12 + Math.random() * height * 0.76;
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 72;
      const tx = cx + Math.cos(angle) * dist;
      const ty = cy + Math.sin(angle) * dist;
      if (!isPassableWildlifePosition(state, tx, ty, 4)) continue;
      state.entities.push(createEntity(EntityType.Tree, tx, ty, state.nextEntityId++));
    }
  }

  // Extra trees on forest tiles when map data exists (fills sparse procedural woods)
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
        const isForest =
          t.type === TerrainType.Forest || t.type === TerrainType.DarkForest;
        if (!isForest || Math.random() > 0.22) continue;
        const px = (tx + 0.35 + Math.random() * 0.3) * tw;
        const py = (ty + 0.35 + Math.random() * 0.3) * th;
        if (!isPassableWildlifePosition(state, px, py, 4)) continue;
        state.entities.push(createEntity(EntityType.Tree, px, py, state.nextEntityId++));
      }
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
  spawnBlueberryTrees(state, size, centerX, centerY);
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

  // No visitor group at founding — the first-week visitor event (day 4–7, after
  // the player builds a house) already brings friendly visitors, without the
  // startup clutter of an instant camp + notification flood.

  appointFoundingLeader(state, father);

  state.humanPopulation = state.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
  state.wildlifeCounts = computeWildlifeCounts(state.entities);
  rebuildEntityByIdMap(state);

  return state;
}
