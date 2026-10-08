import { describe, expect, it } from 'vitest';
import {
  BuildingType,
  BUILDING_CONFIGS,
  EntityType,
  JobType,
  MapPreset,
  MapSize,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldMap, WorldState } from '../src/game/gameTypes';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 900;
const CAMP_X = 600;
const CAMP_Y = 450;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id, type: EntityType.Human, x: CAMP_X, y: CAMP_Y, energy: 500, maxEnergy: 500,
    age: 30, birthYear: 0, birthMonth: 0, birthDay: 0, alive: true, size: 10, speed: 2,
    vx: 0, vy: 0, flash: 0, animFrame: 0, spriteAngle: 0, childrenIds: [], generation: 0,
    isJuvenile: false, job: JobType.Settler, name: `Settler${id}`, ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  const config = BUILDING_CONFIGS[type];
  return {
    id, type, x: 200, y: 200, width: config.width, height: config.height, occupants: [],
    level: 1, constructionProgress: 100, completed: true, health: 100, maxHealth: 100,
    spriteScale: 1, buildAnimTimer: 0, ...overrides,
  } as Building;
}

function buildableWorldMap(): WorldMap {
  const cols = Math.ceil(MAP_WIDTH / 64);
  const rows = Math.ceil(MAP_HEIGHT / 64);
  return {
    width: Math.ceil(MAP_WIDTH / 10), height: Math.ceil(MAP_HEIGHT / 10), seed: 1, rivers: [],
    preset: MapPreset.Continental, size: MapSize.Medium, cols, rows,
    elevation: new Float32Array(cols * rows).fill(0.3),
    moisture: new Float32Array(cols * rows).fill(0.5),
    temperature: new Float32Array(cols * rows).fill(0.5),
    terrain: new Uint8Array(cols * rows),
    riverDist: new Float32Array(cols * rows),
  };
}

function makeWorld(
  entities: Entity[],
  buildings: Building[],
  overrides: Partial<WorldState> = {},
): WorldState {
  return {
    entities, buildings, tick: 0, paused: false, speed: 1, width: MAP_WIDTH, height: MAP_HEIGHT,
    resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 30 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Spring, weather: WeatherType.Clear, year: 0, dayInYear: 0,
    notifications: [], bigNews: [], floatingTexts: [], deathParticles: [],
    nextFloatingTextId: 1, nextBuildingId: 500, nextEntityId: 500, eventLog: [],
    screenShakeImpulse: 0, totalBuildingsCompleted: 0, humanPopulation: entities.length,
    maxHumanPopulation: 30, workingSettlers: 0, idleSettlers: 0, villageName: 'Botville',
    villageReputation: 0, challenges: [], autoSave: false,
    wildlifeCounts: { grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0 },
    worldMap: buildableWorldMap(), yearlyStats: [], lifetimeStats: {}, visitorGroups: [],
    rivalSettlements: [], pendingDiplomacyEvents: [], pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [], ecoHealthYearsAbove80: 0, firstWeekVisitorSpawned: false,
    villageLeaderId: null, leaderSinceYear: 0, lastElectionYear: -1, pendingElectionYear: null,
    electionBuildupNotifiedYear: null, electionCeremony: null, researchNodes: [],
    unlockedTechs: [], activeResearch: null, researchProgress: 0, festival: null,
    ...overrides,
  } as unknown as WorldState;
}

/** 18 adults; 12 housed in `houseCount` houses, the rest employed at a Lumber Mill. */
function ownerWorld(options: {
  quark?: boolean;
  quarry?: 'none' | 'unstaffed' | 'staffed';
  extraBuildings?: Building[];
  resources?: Partial<WorldState['resources']>;
  employed?: number;
  homeless?: number;
}): WorldState {
  const {
    quarry = 'none', extraBuildings = [], resources = {}, employed = 18, homeless = 0,
  } = options;
  const ids = Array.from({ length: 18 }, (_, index) => index + 1);
  const entities = ids.map((id) => {
    const isHomeless = homeless > 0 && id > 18 - homeless;
    const isEmployed = !isHomeless && id <= employed;
    return human(id, {
      ...(isHomeless ? {} : { residenceBuildingId: 1 }),
      ...(isEmployed ? { homeBuildingId: 10 } : {}),
    });
  });
  const buildings: Building[] = [
    building(90, BuildingType.LeaderHouse, { x: 100, y: 100 }),
    building(1, BuildingType.House, { x: 300, y: 300, occupants: ids.filter((id) => id <= 18 - homeless) }),
    building(10, BuildingType.LumberMill, { x: 400, y: 300, occupants: ids.filter((id) => id <= employed) }),
    building(11, BuildingType.Farm, { x: 500, y: 300, occupants: [1, 2, 3] }),
    ...extraBuildings,
  ];
  if (quarry === 'unstaffed') buildings.push(building(12, BuildingType.Quarry, { x: 600, y: 300 }));
  if (quarry === 'staffed') {
    buildings.push(building(12, BuildingType.Quarry, { x: 600, y: 300, occupants: [4, 5, 6] }));
  }
  return makeWorld(entities, buildings, {
    resources: { food: 489, wood: 115, gold: 275, stone: 0, iron: 30, ...resources },
  });
}

function report(label: string, world: WorldState): void {
  const decision = decideVirtualPlayerAction(world);
  console.log(`[PROBE] ${label} => ${decision ? `${decision.command.op} :: ${decision.reason}` : 'NULL (healthy)'}`);
}

describe('probe', () => {
  it('owner numbers', () => {
    expect(true).toBe(true);
    report('A no quarry, 18 employed, no homeless', ownerWorld({}));
    report('B quarry unstaffed', ownerWorld({ quarry: 'unstaffed' }));
    report('C quarry staffed', ownerWorld({ quarry: 'staffed' }));
    report('D no quarry, iron 0', ownerWorld({ resources: { iron: 0 } }));
    report('E no quarry, 6 homeless', ownerWorld({ homeless: 6 }));
    report('F no quarry, 12 employed (6 idle)', ownerWorld({ employed: 12 }));
    report(
      'G no quarry + lumbermill under construction',
      ownerWorld({ extraBuildings: [building(13, BuildingType.LumberMill, { completed: false, constructionProgress: 10 })] }),
    );
    report('H no quarry, iron 0, 6 homeless', ownerWorld({ homeless: 6, resources: { iron: 0 } }));
  });
});
