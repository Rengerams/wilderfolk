/**
 * The auto-play verdict the owner read as "no action needed — colony looks healthy" while the
 * header painted a near-empty larder red and the stone chip read zero.
 *
 * These guards drive the REAL ladder (`decideVirtualPlayerAction`) and the REAL HUD projection
 * (`virtualPlayerWaitingReason` + `virtualPlayerStatusText`), on the owner's own numbers, so a
 * regression that makes the status line lie again fails here rather than in the owner's game.
 */
import { describe, expect, it } from 'vitest';
import {
  BuildingType,
  BUILDING_CONFIGS,
  EntityType,
  JobType,
  MapPreset,
  MapSize,
  ResearchType,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type {
  Building,
  Entity,
  ResearchNode,
  RivalSettlement,
  WorldMap,
  WorldState,
} from '../src/game/gameTypes';
import { decideVirtualPlayerAction, virtualPlayerWaitingReason } from '../src/game/virtualPlayer';
import { VIRTUAL_PLAYER_IDLE_STATUS, virtualPlayerStatusText } from '../src/hooks/useVirtualPlayer';
import { applyWorkerCommand } from '../src/game/simWorker/commands';
import { canAfford, isFoodAlert } from '../src/game/resourceUtils';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { formatResourceCostNeed } from '../src/game/resourceCost';
import { getOpenPlayerBeds } from '../src/game/populationGrowth';
import { countHomelessSettlers } from '../src/game/residencyOccupancy';
import { REPAIR_COST } from '../src/game/buildingMaintenanceActions';

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

/** All-grassland map, so placement depends only on the rules under test. */
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

/** A research node as the ladder reads it: `researched` is what unlocks a locked building. */
function researchNode(overrides: Partial<ResearchNode> = {}): ResearchNode {
  return {
    id: 'agriculture_1', type: ResearchType.Agriculture, name: 'Crop Rotation', description: '',
    cost: { wood: 10, stone: 0, food: 0, gold: 0, iron: 0 }, unlocked: true, researched: false,
    prerequisites: [], effects: [], icon: '', tier: 1, ...overrides,
  };
}

/** A rival camp next to the village. */
function rival(overrides: Partial<RivalSettlement> = {}): RivalSettlement {
  return {
    id: 'rival_ravenhold', name: 'Ravenhold', campX: CAMP_X, campY: CAMP_Y, population: 6,
    entityIds: [], buildingIds: [], relationship: 'tense', foundedYear: 0, daysUntilAction: 10,
    raidCooldownDays: 0, peaceTreatyDays: 0, ...overrides,
  };
}

/** All-water map: no building can legally be placed anywhere inside the search. */
function unbuildableWorldMap(): WorldMap {
  const map = buildableWorldMap();
  // Sea level defaults to 0.24, so elevation 0 everywhere classifies to DeepWater.
  return { ...map, elevation: new Float32Array(map.cols! * map.rows!) };
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
    nextFloatingTextId: 1, nextBuildingId: 900, nextEntityId: 900, eventLog: [],
    screenShakeImpulse: 0, totalBuildingsCompleted: 0, humanPopulation: entities.length,
    maxHumanPopulation: 80, workingSettlers: 0, idleSettlers: 0, villageName: 'Botville',
    villageReputation: 62, challenges: [], autoSave: false,
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

/**
 * The owner's reporting numbers: `count` adults, all housed and all at a post, on the stated stores.
 *
 * `mills`/`farms` are the producers the colony already owns, each crewed to its own 3-post cap — so
 * no fixture crew is overstaffed (which the surplus step would otherwise trim) — over that many
 * Houses of the real 6-bed capacity, plus `spareHouses` empty ones.
 */
function ownerColony(
  count: number,
  overrides: Partial<WorldState> = {},
  options: {
    mills?: number;
    farms?: number;
    foodProducer?: 'staffed' | 'building' | 'none';
    spareHouses?: number;
    extraBuildings?: Building[];
    leaderHouse?: boolean;
  } = {},
): WorldState {
  const {
    mills = 1, farms = 1, foodProducer = 'staffed',
    spareHouses = 2, extraBuildings = [], leaderHouse = true,
  } = options;
  const ids = Array.from({ length: count }, (_, index) => index + 1);
  const posts: Array<{ id: number; type: BuildingType }> = [];
  if (foodProducer !== 'none') {
    for (let index = 0; index < (foodProducer === 'building' ? 0 : farms); index++) {
      posts.push({ id: 300 + index, type: BuildingType.Farm });
    }
  }
  for (let index = 0; index < mills; index++) posts.push({ id: 200 + index, type: BuildingType.LumberMill });
  const houseCount = Math.ceil(count / 6) + spareHouses;
  const houseIds = Array.from({ length: houseCount }, (_, index) => 100 + index);
  const homeOf = new Map<number, number>();
  const crewOf = new Map<number, number[]>();
  let next = 0;
  for (const post of posts) {
    // Each post takes only its own crew cap (a Farm holds 2, a Mill 3): a fixture crew over its cap
    // is exactly what the surplus step would trim instead of the step under test.
    const crew = ids.slice(next, next + BUILDING_CONFIGS[post.type].maxOccupants);
    next += crew.length;
    crewOf.set(post.id, crew);
    crew.forEach((id) => homeOf.set(id, post.id));
  }

  for (const extra of extraBuildings) {
    if (!extra.completed || extra.faction === 'rival') continue;
    for (const id of extra.occupants) {
      if (!homeOf.has(id)) homeOf.set(id, extra.id);
    }
  }

  const entities = ids.map((id) => human(id, {
    residenceBuildingId: houseIds[Math.floor((id - 1) / 6)],
    ...(homeOf.has(id) ? { workerBuildingId: homeOf.get(id) } : {}),
  }));
  const buildings: Building[] = [
    ...(leaderHouse ? [building(90, BuildingType.LeaderHouse, { x: 60, y: 60 })] : []),
    ...houseIds.map((id, index) => building(id, BuildingType.House, {
      x: 260 + index * 70, y: 300,
      occupants: ids.filter((other) => Math.floor((other - 1) / 6) === index),
    })),
    ...posts.map((post, index) => building(post.id, post.type, {
      // Close enough to the village centre that the road step has no target here (its
      // `ROAD_MIN_LINK_DISTANCE` is 260), so a fixture about storage is not paved instead.
      x: 380 + index * 14, y: 360,
      occupants: crewOf.get(post.id) ?? [],
    })),
    ...(foodProducer === 'building'
      ? [building(40, BuildingType.Farm, { x: 460, y: 380, completed: false, constructionProgress: 20 })]
      : []),
    ...extraBuildings,
  ];
  return makeWorld(entities, buildings, overrides);
}

/** What the header beside the toggle would actually read. */
function hudStatus(world: WorldState): string | null {
  return virtualPlayerStatusText(true, virtualPlayerWaitingReason(world) ?? VIRTUAL_PLAYER_IDLE_STATUS, false);
}

describe('the health verdict at the owner numbers', () => {
  it('never calls a near-empty larder healthy, and names the food need it waits on', () => {
    // Owner report 2: 36 settlers, food 8 painted red, stone already recovered.
    const famine = ownerColony(36, {
      resources: { food: 8, wood: 584, stone: 288, gold: 391, iron: 130 },
    }, { foodProducer: 'building', mills: 12 });

    // The fixture really is the header's red chip, read from the header's own owner.
    expect(isFoodAlert(famine)).toBe(true);
    // Every food producer is already going up, so the ladder is right to wait — but the wait must
    // be stated, and never as "colony looks healthy".
    expect(decideVirtualPlayerAction(famine)).toBeNull();
    const reason = virtualPlayerWaitingReason(famine);
    expect(reason).not.toBeNull();
    expect(reason).toContain('larder');
    expect(hudStatus(famine)).not.toBe(VIRTUAL_PLAYER_IDLE_STATUS);
  });

  it('builds food rather than idling when the larder is short and a producer is placeable', () => {
    const famine = ownerColony(36, {
      resources: { food: 8, wood: 584, stone: 288, gold: 391, iron: 130 },
    }, { mills: 12 });

    const decision = decideVirtualPlayerAction(famine);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding' });
    expect(decision!.reason).toContain('food');
  });

  it('plans farms for all mouths, not just adults who can staff them', () => {
    // Eighteen working-age people and twelve children consume food, even though
    // only adults can take a Farm assignment. Three farms satisfy the old
    // adult-only target (18 / 9), but not the real thirty-person food need.
    const colony = ownerColony(30, {}, { mills: 0, farms: 3 });
    for (const person of colony.entities.slice(18)) person.isJuvenile = true;

    const decision = decideVirtualPlayerAction(colony);
    expect(decision?.command).toMatchObject({ op: 'startBuilding', type: BuildingType.Farm });
  });

  it('upgrades staffed farm production instead of constructing unstaffable farms when food flow is negative', () => {
    const colony = ownerColony(12, {
      tick: 4 * TICKS_PER_DAY,
      foodHistory: [1, 2, 3].map((day) => ({
        day, produced: { farms: 25 }, consumed: { meals: 90 },
      })),
    }, { mills: 0, farms: 2 });

    const decision = decideVirtualPlayerAction(colony);
    expect(decision?.command).toMatchObject({ op: 'upgradeBuilding', buildingId: 300 });
    expect(decision?.reason).toContain('food production');
  });

  it('never calls a zero-stone colony healthy, and staffs the Quarry nobody works', () => {
    // Owner report 1: ~18 settlers, 0 stone, wood and gold in store, beds free.
    const unmanned = ownerColony(18, {
      resources: { food: 489, wood: 115, stone: 0, gold: 275, iron: 30 },
    }, {
      mills: 5, farms: 2,
      // The Quarry stands complete with nobody assigned to it, and the Mills are the over-crewed
      // donors the auto-staff owner rebalances out of (`findOverstaffedDonorBuilding`).
      extraBuildings: [building(12, BuildingType.Quarry, { x: 700, y: 380 })],
    });

    const decision = decideVirtualPlayerAction(unmanned);

    expect(decision).not.toBeNull();
    expect(decision!.command.op).toBe('autoStaffWorkers');
    expect(decision!.reason).toContain('Quarry');
    // …and the command the ladder proposes really ends the shortage: a hand lands on the Quarry,
    // so the step cannot re-propose the same no-op hour after hour.
    const applied = applyWorkerCommand(unmanned, decision!.command);
    const quarry = applied.buildings.find((candidate) => candidate.type === BuildingType.Quarry)!;
    expect(quarry.occupants.length).toBeGreaterThan(0);
    expect(decideVirtualPlayerAction(applied)?.command.op).not.toBe('autoStaffWorkers');
  });

  it('says which producer is short when no settler can be spared for it', () => {
    // One settler with no spare hand to rebalance: the ladder genuinely cannot act, and the status
    // line must name the stone rather than the colony's health. Every building is at its top level,
    // so no upgrade can take the hour instead.
    const alone = makeWorld(
      [human(1, { residenceBuildingId: 1, workerBuildingId: 2 })],
      [
        building(90, BuildingType.LeaderHouse, { x: 60, y: 60 }),
        building(1, BuildingType.House, { x: 300, y: 300, occupants: [1], level: 3 }),
        building(2, BuildingType.LumberMill, { x: 400, y: 300, occupants: [1], level: 3 }),
        building(3, BuildingType.Farm, { x: 500, y: 300, occupants: [1], level: 3 }),
        building(4, BuildingType.Quarry, { x: 600, y: 300, level: 3 }),
      ],
      { resources: { food: 489, wood: 150, stone: 0, gold: 275, iron: 30 } },
    );

    expect(decideVirtualPlayerAction(alone)).toBeNull();
    expect(virtualPlayerWaitingReason(alone)).not.toBe('Quarry');
    expect(hudStatus(alone)).not.toBe(VIRTUAL_PLAYER_IDLE_STATUS);
  });

  it('still reports healthy for a colony that really has everything', () => {
    const stocked = ownerColony(9, {
      resources: { food: 500, wood: 500, stone: 500, gold: 500, iron: 150 },
    }, {
      extraBuildings: [
        building(12, BuildingType.Quarry, { x: 700, y: 380, occupants: [7] }),
        building(13, BuildingType.Mine, { x: 760, y: 380, occupants: [8] }),
      ],
    });
    expect(countHomelessSettlers(stocked)).toBe(0);
    expect(getOpenPlayerBeds(stocked)).toBeGreaterThanOrEqual(3);

    expect(virtualPlayerWaitingReason(stocked)).toBeNull();
    expect(hudStatus(stocked)).toBe(VIRTUAL_PLAYER_IDLE_STATUS);
  });
});

describe('the ladder builds ahead of need, bounded by the owners', () => {
  it('raises a House while every settler is still housed', () => {
    // 48 settlers filling eight 6-bed Houses with no spare: the housing owner calls that pressure
    // `tight` (`collectHousingDiagnostics`), and the assignable spare beds are gone — the
    // one-birth-away state the bot used to wait out until somebody was actually homeless.
    const crowded = ownerColony(48, {}, {
      mills: 16,
      spareHouses: 0,
      leaderHouse: false,
      extraBuildings: [building(91, BuildingType.LeaderHouse, { x: 60, y: 60, completed: false, constructionProgress: 10 })],
    });
    expect(countHomelessSettlers(crowded)).toBe(0);
    expect(getOpenPlayerBeds(crowded)).toBe(0);

    const decision = decideVirtualPlayerAction(crowded);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.House });
  });

  it('upgrades an occupied Farm first when measured food losses persist', () => {
    const world = ownerColony(24, {
      tick: 4 * TICKS_PER_DAY,
      resources: { food: 500, wood: 500, stone: 500, gold: 500, iron: 30 },
      foodHistory: [1, 2, 3].map((day) => ({
        day, produced: { farms: 40 }, consumed: { meals: 66, spoilage: 4 },
      })),
    }, { mills: 1, farms: 4 });

    // The deficit response must improve a staffed producer before creating an idle site.
    const decision = decideVirtualPlayerAction(world);
    expect(decision?.command.op).toBe('upgradeBuilding');
    if (!decision || decision.command.op !== 'upgradeBuilding') throw new Error('expected a farm upgrade');
    const target = world.buildings.find((site) => site.id === decision.command.buildingId);
    expect(target?.type).toBe(BuildingType.Farm);
    expect(target?.occupants.length).toBeGreaterThan(0);
    expect(decision.reason).toContain('measured food production does not cover consumption');
  });

  it('staffs an idle Farm before ordering another during a measured deficit', () => {
    const world = ownerColony(12, {
      tick: 4 * TICKS_PER_DAY,
      resources: { food: 150, wood: 500, stone: 500, gold: 500, iron: 30 },
      foodHistory: [1, 2, 3].map((day) => ({
        day, produced: { farms: 20 }, consumed: { meals: 40 },
      })),
    }, {
      mills: 3, farms: 1,
      extraBuildings: [building(77, BuildingType.Farm, { x: 700, y: 350 })],
    });

    const decision = decideVirtualPlayerAction(world);
    expect(decision?.command.op).toBe('autoStaffWorkers');
    expect(decision?.reason).toContain('food production needs workers');
    const staffed = applyWorkerCommand(world, decision!.command);
    expect(staffed.entities.filter((entity) => entity.workerBuildingId === 77).length).toBeGreaterThan(0);
  });

  it('does not keep building idle Farms when no worker can be reassigned', () => {
    const world = ownerColony(2, {
      tick: 4 * TICKS_PER_DAY,
      resources: { food: 0, wood: 500, stone: 500, gold: 500, iron: 30 },
    }, {
      mills: 0, farms: 1,
      extraBuildings: [building(77, BuildingType.Farm, { x: 700, y: 350 })],
    });
    // The two existing workers have just transferred, so the workforce owner
    // cannot legally move either to the idle Farm for sixty days.
    for (const entity of world.entities) entity.lastAutoJobTransferTick = world.tick;
    expect(decideVirtualPlayerAction(world)?.command)
      .not.toMatchObject({ op: 'startBuilding', type: BuildingType.Farm });
  });

  it('keeps adding producers as the village grows instead of stopping at the first', () => {
    // One Lumber Mill for 24 settlers is under the ladder's own one-per-12 line, so the village has
    // outgrown what it built — the state the trigger-only ladder sat in.
    const world = ownerColony(24, {
      resources: { food: 500, wood: 500, stone: 500, gold: 500, iron: 30 },
    }, { mills: 1, farms: 7 });

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.LumberMill });
    expect(decision!.reason).toContain('24 settlers');
  });

  it('names the price and the resource it is saving for', () => {
    // 18 settlers and no industry at all, on 5 wood and no stone: every producer the ladder wants is
    // priced out, so the status line must state the price rather than the colony's health.
    const broke = ownerColony(18, {
      resources: { food: 489, wood: 5, stone: 0, gold: 275, iron: 30 },
    }, { mills: 0, farms: 1 });

    expect(decideVirtualPlayerAction(broke)).toBeNull();
    const reason = virtualPlayerWaitingReason(broke)!;
    expect(reason).toMatch(/Need \d+(w|s|f|g|i)[^]*for a [A-Z]/);
  });

  it('will not spend the repair materials on a building the colony could otherwise afford', () => {
    // 36 settlers want four food producers and own one. 20 wood pays for a Farm (25?) only if the
    // repair owner's 10 wood is left behind — the reserve, not the price, is what must refuse it,
    // since the larder is deep enough that no shortage would justify the spend.
    const thin = ownerColony(36, {
      resources: { food: 500, wood: 30, stone: 500, gold: 500, iron: 30 },
    }, { mills: 12, farms: 1 });
    expect(canAfford(thin, BUILDING_CONFIGS[BuildingType.Farm].cost)).toBe(true);
    expect(REPAIR_COST.wood).toBeGreaterThan(5);

    expect(decideVirtualPlayerAction(thin)?.command ?? null)
      .not.toMatchObject({ op: 'startBuilding', type: BuildingType.Farm });
    expect(virtualPlayerWaitingReason(thin)).not.toBeNull();
  });

  it('grows the building count across many days instead of idling', () => {
    // One action per in-game hour is the bot's contract; a simulated day lets construction finish
    // and refills the shelves, so the ladder is judged on its next decision, not on build time.
    const start = ownerColony(36, {
      resources: { food: 500, wood: 500, stone: 500, gold: 500, iron: 30 },
    }, { mills: 1, farms: 1, spareHouses: 0, leaderHouse: false });
    start.buildings.push(
      building(91, BuildingType.LeaderHouse, { x: 60, y: 60, completed: false, constructionProgress: 10 }),
    );
    let world = start;
    const acts: string[] = [];

    for (let day = 0; day < 12; day++) {
      const before = world.buildings.length;
      for (let hour = 0; hour < 3; hour++) {
        const decision = decideVirtualPlayerAction(world);
        if (!decision) continue;
        acts.push(decision.reason);
        world = applyWorkerCommand(world, decision.command);
      }
      expect(world.buildings.length).toBeGreaterThanOrEqual(before);
      // The day passes: sites finish and the shelves are restocked.
      world = {
        ...world,
        buildings: world.buildings.map((candidate) => (
          candidate.completed ? candidate : { ...candidate, completed: true, constructionProgress: 100 }
        )),
        resources: { ...start.resources },
      };
    }

    expect(acts.length).toBeGreaterThanOrEqual(6);
    expect(world.buildings.length).toBeGreaterThan(start.buildings.length + 3);
    const producers = ['Farm', 'Lumber Mill', 'Quarry'].filter(
      (label) => acts.some((reason) => reason.includes(label)),
    );
    expect(producers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the storage buildings the owner reported missing', () => {
  it('builds a Silo when the store it widens — food — is nearly full', () => {
    // The storage owner's own table (`computeStorageMax`): a Silo adds 600 food and cuts spoilage,
    // and holds no gold at all, so the old `storageNearlyFull('gold')` gate made it unbuildable.
    const world = ownerColony(12, {
      resources: { food: 560, wood: 300, stone: 200, gold: 100, iron: 150 },
      storageMax: { wood: 800, stone: 300, food: 800, gold: 20000, iron: 300 },
    }, {
      mills: 4, farms: 2,
      extraBuildings: [
        building(12, BuildingType.Well, { x: 360, y: 260 }),
        building(13, BuildingType.Tavern, { x: 400, y: 250 }),
        building(14, BuildingType.Church, { x: 440, y: 250 }),
      ],
    });

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.Silo });
  });

  it('builds a Barn when the wood shelf is nearly full, even on a lean larder', () => {
    // 12 settlers eat 36 a day, so 100 food is under the strict community reserve but over the
    // general food buffer the storage entries wait on.
    const world = ownerColony(12, {
      resources: { food: 100, wood: 700, stone: 200, gold: 100, iron: 150 },
      storageMax: { wood: 900, stone: 300, food: 800, gold: 20000, iron: 300 },
    }, {
      mills: 4, farms: 2,
      extraBuildings: [
        building(12, BuildingType.Well, { x: 360, y: 260 }),
        building(13, BuildingType.Tavern, { x: 400, y: 250 }),
        building(14, BuildingType.Church, { x: 440, y: 250 }),
      ],
    });

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.Barn });
  });
});

/**
 * Every building the catalogue offers that the ladder used to have no step for, so the owner's
 * *"all buildings should be buildable by the bot"* is a checkable claim rather than a hope.
 */
const SETTLED_BUILDINGS: readonly BuildingType[] = [
  BuildingType.House, BuildingType.Farm, BuildingType.Greenhouse, BuildingType.Barn,
  BuildingType.Silo, BuildingType.WoodStorehouse, BuildingType.LumberMill, BuildingType.Quarry,
  BuildingType.Mine, BuildingType.Mill, BuildingType.Blacksmith, BuildingType.Workshop,
  BuildingType.Store, BuildingType.School, BuildingType.Hospital, BuildingType.TownHall,
  BuildingType.LeaderHouse, BuildingType.Church, BuildingType.Prison, BuildingType.Well,
  BuildingType.Mansion, BuildingType.TamingPost, BuildingType.Watchtower, BuildingType.Barracks,
  BuildingType.HuntingSpot, BuildingType.FishingSpot, BuildingType.WildlifePreserve,
  BuildingType.Tavern, BuildingType.Hotel, BuildingType.Bridge, BuildingType.Garden,
  BuildingType.Statue, BuildingType.Lamp, BuildingType.Wall, BuildingType.WallGate,
  BuildingType.Fence,
];

/** The types the ladder must be able to raise on its own. `Road` is built by its own step. */
const BOT_BUILDABLE = [
  ...SETTLED_BUILDINGS, BuildingType.Market,
];

/**
 * A village whose every other rung is satisfied, which owns every building except `missing` and has
 * the research for all of them — so the one action the ladder proposes is the missing building.
 */
function villageMissing(missing: BuildingType, overrides: Partial<WorldState> = {}): WorldState {
  const owned = BOT_BUILDABLE.filter((type) => type !== missing);
  const requirements = new Set<string>();
  for (const type of [...owned, missing]) {
    const requirement = BUILDING_CONFIGS[type].unlockRequirement;
    if (requirement) requirements.add(requirement);
  }
  const world = ownerColony(10, {
    // Wood under the road step's own 200 line, so a fixture about a building is not paved instead.
    resources: { wood: 150, stone: 500, gold: 300, food: 400, iron: 30 },
    unlockedTechs: [...requirements],
    researchNodes: [...requirements].map((id) => researchNode({ id, researched: true })),
    ...overrides,
  }, { mills: 2, farms: 2 });
  world.buildings.push(...owned.map((type, index) => building(700 + index, type, {
    x: 760 + (index % 8) * 70, y: 760 + Math.floor(index / 8) * 70,
    // Sites, not finished buildings: the owned types exist so every earlier rung is satisfied, while
    // an unfinished one cannot be tuned, repaired, upgraded or crewed instead of the type under test.
    completed: false, constructionProgress: 10,
  })));
  return world;
}

describe('every building type is buildable by the bot', () => {
  for (const type of [
    BuildingType.Market, BuildingType.Hospital, BuildingType.Prison, BuildingType.Mansion,
    BuildingType.Garden, BuildingType.Statue, BuildingType.Lamp,
  ]) {
    it(`raises a ${type} once the village is settled`, () => {
      const world = villageMissing(type);

      const decision = decideVirtualPlayerAction(world);

      expect(decision?.command ?? null).toMatchObject({ op: 'startBuilding', type });
    });
  }

  for (const type of [
    BuildingType.Watchtower, BuildingType.Barracks, BuildingType.Wall, BuildingType.WallGate,
    BuildingType.Fence,
  ]) {
    it(`fortifies with a ${type} once gifting has failed`, () => {
      const world = villageMissing(type, { rivalSettlements: [rival({ giftsGiven: 1 })] });

      const decision = decideVirtualPlayerAction(world);

      expect(decision?.command ?? null).toMatchObject({ type });
    });
  }

  it('still offers the gift before the wall', () => {
    const ungifted = villageMissing(BuildingType.Wall, { rivalSettlements: [rival()] });

    const decision = decideVirtualPlayerAction(ungifted);

    expect(decision?.command ?? null).not.toMatchObject({ type: BuildingType.Wall });
  });
});

describe('the hunting spot is sited by the hunting owner', () => {
  it('never takes a spot that could only reach a wolf — a spot that can only hunt wolves loses hunters', () => {
    // The food step reaches a Hunting Spot only when a Farm, Greenhouse and Fishing Spot all have no
    // site, so this fixture blocks the Farm with the placement owner's own map rule (all water) and
    // leaves the Greenhouse locked. Whatever the ladder answers, it must not be an unprepared spot.
    const world = ownerColony(10, {
      resources: { food: 20, wood: 300, stone: 200, gold: 100, iron: 30 },
      worldMap: unbuildableWorldMap(),
    }, { mills: 4, farms: 1 });
    world.entities.push(human(900, { type: EntityType.Wolf, x: 600, y: 450 }));

    const decision = decideVirtualPlayerAction(world);

    expect(decision?.command ?? null).not.toMatchObject({ type: BuildingType.HuntingSpot });
  });

  it('prefers a Farm over hunting while the larder is short and land is free', () => {
    // The order the owner asked about: with a farm site free, food comes from farming, so the
    // Hunting Spot is the fallback it always was — and now also needs safe game in reach.
    const world = ownerColony(10, {
      resources: { food: 20, wood: 300, stone: 200, gold: 100, iron: 30 },
    }, { mills: 4, farms: 1 });
    world.entities.push(human(900, { type: EntityType.Deer, x: 600, y: 450 }));

    const decision = decideVirtualPlayerAction(world);

    expect(decision?.command ?? null).toMatchObject({ op: 'startBuilding', type: BuildingType.Farm });
  });
});
