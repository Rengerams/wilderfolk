/**
 * In-app virtual player ("auto-play") — the PURE decision engine.
 *
 * The engine only *proposes* real `WorkerCommand` objects. These tests pin the
 * priority order (cards → staffing → housing → food → research → festival), the
 * card answers, affordability, purity, and the "one action per world" rule: a
 * proposal must not repeat itself once it has actually been applied.
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
  TradeRoute,
  VisitorGroup,
  VisitorQuest,
  WorldMap,
  WorldState,
} from '../src/game/gameTypes';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { gameTick, initGame } from '../src/game/gameEngine';
import { shouldVirtualPlayerAct, virtualPlayerStatusText } from '../src/hooks/useVirtualPlayer';
import { applyWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
import { canLaunchRaidOnRival, getRaidChoiceEligibility } from '../src/game/frontierCombat';
import { getOpenBeds, getOpenPlayerBeds } from '../src/game/populationGrowth';
import { canPlaceBuilding } from '../src/game/buildingPlacementActions';
import { canAssignWorkerToBuilding } from '../src/game/buildingStaffingActions';
import { getRepairBuildingEligibility } from '../src/game/buildingMaintenanceActions';
import { getForgeBlockReason, isForgeOrderComplete } from '../src/game/forge';
import { getRecruitSettlerEligibility } from '../src/game/settlerInteractionActions';
import { getVisitorTradeEligibility } from '../src/game/groupEvents';
import { TOWN_HALL_FESTIVAL_COST } from '../src/game/townHall';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 900;
/** Where every stub settler stands — the camp anchor while the village is empty. */
const CAMP_X = 600;
const CAMP_Y = 450;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: CAMP_X,
    y: CAMP_Y,
    energy: 500,
    maxEnergy: 500,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    name: `Settler${id}`,
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  const config = BUILDING_CONFIGS[type];
  return {
    id,
    type,
    x: 200,
    y: 200,
    width: config.width,
    height: config.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

function researchNode(overrides: Partial<ResearchNode> = {}): ResearchNode {
  return {
    id: 'agriculture_1',
    type: ResearchType.Agriculture,
    name: 'Crop Rotation',
    description: '',
    cost: { wood: 10, stone: 0, food: 0, gold: 0, iron: 0 },
    unlocked: true,
    researched: false,
    prerequisites: [],
    effects: [],
    icon: '',
    tier: 1,
    ...overrides,
  };
}

/**
 * All-grassland map so placement validity depends only on the rules under test.
 *
 * Teraforge keeps no per-tile grid, so the terrain is stated as the L2 continuous fields the
 * tile projection reads: every cell at the same elevation/moisture classifies to Grassland.
 */
function buildableWorldMap(): WorldMap {
  const cols = Math.ceil(MAP_WIDTH / 64);
  const rows = Math.ceil(MAP_HEIGHT / 64);
  return {
    width: Math.ceil(MAP_WIDTH / 10),
    height: Math.ceil(MAP_HEIGHT / 10),
    seed: 1,
    rivers: [],
    preset: MapPreset.Continental,
    size: MapSize.Medium,
    cols,
    rows,
    elevation: new Float32Array(cols * rows).fill(0.3),
    moisture: new Float32Array(cols * rows).fill(0.5),
    temperature: new Float32Array(cols * rows).fill(0.5),
    terrain: new Uint8Array(cols * rows),
    riverDist: new Float32Array(cols * rows),
  };
}

/** Id of the Leader's House a settled fixture starts with. */
const LEADER_HOUSE_ID = 90;
/** Id of the farm a settled fixture starts with, worked by its own settlers. */
const FARM_ID = 92;
/**
 * How far a fixture's farm stands from the camp anchor when the fixture has no
 * House to sit beside. Closer than `VirtualPlayer.ROAD_MIN_LINK_DISTANCE` (260), so
 * the road step has nothing to pave, and far enough not to occupy the anchor's own
 * build ring.
 */
const FARM_STANDOFF_FROM_CAMP = 200;

/**
 * Minimal stand-in for the authoritative world. The engine only reads these
 * fields, and the real command owners run against the same stub when a test
 * applies a proposal.
 *
 * World generation never places a Leader's House, and the bot's first colony act
 * is that free build — so a fixture that is about any later priority starts with
 * one already standing. Tests that are about the Leader's House itself pass
 * `{ leaderHouse: false }`.
 *
 * The same reasoning applies to food: world generation places no food producer
 * either, and step 5 now builds one whenever the colony owns none, so a fixture
 * that reaches any later step has to own one — otherwise it models a colony the
 * ladder can never be in. Tests about food production itself pass
 * `{ foodProducer: false }`.
 */
function makeWorld(
  entities: Entity[],
  buildings: Building[],
  overrides: Partial<WorldState> = {},
  options: { leaderHouse?: boolean; foodProducer?: boolean } = {},
): WorldState {
  const leaderHouse = options.leaderHouse === false
    ? []
    : [building(LEADER_HOUSE_ID, BuildingType.LeaderHouse, { x: 100, y: 100 })];
  // Staffed, so it is not an open workplace that step 2 would want to fill first:
  // the first settlers without a job work it, exactly as they would in a colony
  // that has been running for an hour.
  const farmPosts = BUILDING_CONFIGS[BuildingType.Farm].maxOccupants;
  // Crewed from the *end* of the settler list: a fixture's first settler is the one
  // its assertions name, so it stays free for the step under test.
  const crew = options.foodProducer === false
    ? []
    : entities.filter((entity) => entity.homeBuildingId == null).slice(-farmPosts);
  const crewIds = new Set(crew.map((entity) => entity.id));
  const worldEntities = entities.map((entity) =>
    crewIds.has(entity.id) ? { ...entity, homeBuildingId: FARM_ID } : entity,
  );
  // And it stands *in* the village — beside the houses, or a short walk from the
  // camp when the fixture has none. `getPlayerCampCenter` reads exactly those two,
  // and a farm planted away from them would make step 21 lay a road to it, which is
  // not what a fixture about research, forging or recruiting is asking about.
  // The standoff keeps it off the camp anchor's own build ring, because the
  // placement tests read the first spot that ring finds.
  const farmConfig = BUILDING_CONFIGS[BuildingType.Farm];
  const house = buildings.find((b) => b.completed && b.type === BuildingType.House);
  const farmX = house ? house.x : CAMP_X - farmConfig.width / 2;
  const farmY = house ? house.y : CAMP_Y - FARM_STANDOFF_FROM_CAMP - farmConfig.height / 2;
  const foodProducer = options.foodProducer === false
    ? []
    : [building(FARM_ID, BuildingType.Farm, { x: farmX, y: farmY, occupants: [...crewIds] })];
  return {
    entities: worldEntities,
    buildings: [...leaderHouse, ...foodProducer, ...buildings],
    tick: 0,
    paused: false,
    speed: 1,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    // A supplied colony: step 9 answers any resource above its own shortage line,
    // so the default world holds enough iron (the Mine's line is 20) and the tests
    // that care about a shortage set their own stores.
    resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 30 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Spring,
    weather: WeatherType.Clear,
    year: 0,
    dayInYear: 0,
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextBuildingId: 100,
    nextEntityId: 100,
    eventLog: [],
    screenShakeImpulse: 0,
    totalBuildingsCompleted: 0,
    humanPopulation: entities.length,
    maxHumanPopulation: 20,
    workingSettlers: 0,
    idleSettlers: 0,
    villageName: 'Botville',
    villageReputation: 0,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
    worldMap: buildableWorldMap(),
    yearlyStats: [],
    lifetimeStats: {},
    visitorGroups: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: false,
    villageLeaderId: null,
    leaderSinceYear: 0,
    lastElectionYear: -1,
    pendingElectionYear: null,
    electionBuildupNotifiedYear: null,
    electionCeremony: null,
    researchNodes: [],
    unlockedTechs: [],
    activeResearch: null,
    researchProgress: 0,
    festival: null,
    ...overrides,
  } as unknown as WorldState;
}

/** A settled village: one completed House that sleeps every resident. */
function housedVillage(settlerCount: number): WorldState {
  const ids = Array.from({ length: settlerCount }, (_, index) => index + 1);
  return makeWorld(
    ids.map((id) => human(id, { residenceBuildingId: 1 })),
    [building(1, BuildingType.House, { occupants: ids })],
  );
}

function raidEvent() {
  return {
    id: 'raid_42',
    rivalId: 'rival_ravenhold',
    rivalName: 'Ravenhold',
    title: 'Ravenhold is marching',
    description: 'A war-band is on the road.',
    emoji: '⚔️',
    choices: [
      { id: 'defend', label: 'Defend the palisade', hint: 'Fight them at the walls.' },
      { id: 'payoff', label: 'Pay them off', hint: 'Gold for peace.' },
    ],
    createdAtTick: 0,
    expiresAtTick: 100,
    marchDistanceTiles: 6,
    attackerStrength: 20,
    defenderStrength: 10,
    lootFood: 10,
    lootGold: 5,
    lootWood: 0,
    lootStone: 0,
  };
}

function villageRequest() {
  return {
    id: 'vreq_caravan_provisions_traders_1_3',
    kind: 'caravan_provisions' as const,
    sourceVisitorGroupId: 'traders_1',
    sourceName: 'The Salt Road',
    emoji: '🥣',
    title: 'Caravan Provisions Offer',
    description: '',
    choices: [
      { id: 'accept' as const, label: 'Accept provisions', detail: '' },
      { id: 'decline' as const, label: 'Decline politely', detail: '' },
    ],
    expiresDay: 6,
  };
}

/** The in-game hour the bot may recruit a settler (see `VirtualPlayer`). */
const RECRUIT_MORNING_TICK = 9 * TICKS_PER_HOUR;

/** A rival camp next to the village — the fixture for gift / treaty / raid policy. */
function rival(overrides: Partial<RivalSettlement> = {}): RivalSettlement {
  return {
    id: 'rival_ravenhold',
    name: 'Ravenhold',
    campX: CAMP_X,
    campY: CAMP_Y,
    population: 6,
    entityIds: [],
    buildingIds: [],
    relationship: 'tense',
    foundedYear: 0,
    daysUntilAction: 10,
    raidCooldownDays: 0,
    peaceTreatyDays: 0,
    ...overrides,
  };
}

/** A visitor camp standing next to the village. */
function visitorGroup(overrides: Partial<VisitorGroup> = {}): VisitorGroup {
  return {
    id: 'visitors_traders_1',
    name: 'The Salt Road',
    kind: 'traders',
    campX: CAMP_X + 60,
    campY: CAMP_Y + 60,
    daysLeft: 3,
    entityIds: [],
    giftsGiven: 0,
    tradesCompleted: 0,
    gold: 200,
    refugeeResolved: false,
    leaderTalked: false,
    ...overrides,
  };
}

/** The traveling smith's deliver quest, as `maybeStartVisitorQuest` writes it. */
function visitorQuest(overrides: Partial<VisitorQuest> = {}): VisitorQuest {
  return {
    id: 'smith_wood',
    emoji: '⚒️',
    title: 'The traveling smith',
    description: '',
    goalType: 'deliver',
    goalResource: 'wood',
    goalAmount: 20,
    progress: 0,
    status: 'active',
    rewardGold: 30,
    rewardReputation: 4,
    expiresDay: 5,
    ...overrides,
  };
}

function tradeRoute(overrides: Partial<TradeRoute> = {}): TradeRoute {
  return {
    id: 'route_saltport',
    targetName: 'Saltport',
    resourcesGiven: { wood: 10, stone: 0, food: 0, gold: 0, iron: 0 },
    resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 20, iron: 0 },
    reputationRequired: 0,
    active: false,
    ...overrides,
  };
}

/** All-water map: no building can legally be placed anywhere inside the search. */
function unbuildableWorldMap(): WorldMap {
  const map = buildableWorldMap();
  // Sea level defaults to 0.24, so elevation 0 everywhere classifies to DeepWater.
  return { ...map, elevation: new Float32Array(map.cols! * map.rows!) };
}

/**
 * A settled village whose earlier priorities are all satisfied — everyone housed
 * and at work, stores healthy — so a test about a later step actually reaches it.
 */
function settledVillage(settlerCount: number, overrides: Partial<WorldState> = {}): WorldState {
  const ids = Array.from({ length: settlerCount }, (_, index) => index + 1);
  return makeWorld(
    ids.map((id) => human(id, { residenceBuildingId: 1, homeBuildingId: 2 })),
    [
      building(1, BuildingType.House, { occupants: ids }),
      building(2, BuildingType.LumberMill, { occupants: ids }),
    ],
    overrides,
  );
}

/**
 * A village with every tunable building standing and all earlier priorities
 * satisfied: the Mine, Hunting Spot and Workshop are the only open choices left.
 */
function tunableVillage(overrides: Partial<WorldState> = {}): WorldState {
  return makeWorld(
    [human(1, { residenceBuildingId: 1, homeBuildingId: 2 })],
    [
      building(1, BuildingType.House, { occupants: [1] }),
      building(2, BuildingType.LumberMill, { occupants: [1] }),
      building(3, BuildingType.Quarry, { occupants: [1] }),
      building(4, BuildingType.Store, { occupants: [1] }),
      building(5, BuildingType.Mine),
      building(6, BuildingType.HuntingSpot),
      building(7, BuildingType.Workshop),
    ],
    overrides,
  );
}

describe('virtual player decision engine', () => {
  it('proposes a House when a settler is homeless and placement is legal', () => {
    const world = makeWorld([human(1), human(2), human(3)], []);

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    const command = decision!.command;
    expect(command.op).toBe('startBuilding');
    if (command.op !== 'startBuilding') throw new Error('expected a startBuilding proposal');

    expect(command.proto).toBe(WORKER_CMD_PROTO);
    expect(command.type).toBe(BuildingType.House);
    expect(decision!.reason).toBe('build a House — 3 settlers homeless');

    // The spot is one a human click could also take: the real placement owner agrees.
    expect(canPlaceBuilding(world, command.type, command.x, command.y, command.rotation)).toBe(true);
    // Snapped from the camp anchor at (600, 450) onto the 20-unit build grid.
    expect({ x: command.x, y: command.y }).toEqual({ x: 600, y: 460 });
    expect(decision!.reason).toContain('House');
  });

  it("builds the free Leader's House first, before any other colony work", () => {
    // World generation places no Leader's House and the build costs nothing, so a
    // broke colony still gets its official residence before anything else.
    const world = makeWorld([human(1)], [], {
      resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    }, { leaderHouse: false });

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    if (decision!.command.op !== 'startBuilding') throw new Error('expected a startBuilding proposal');
    expect(decision!.command.type).toBe(BuildingType.LeaderHouse);
    expect(decision!.reason).toContain("Leader's House");
    // The real placement owner accepts the spot the bot picked.
    expect(
      canPlaceBuilding(
        world,
        decision!.command.type,
        decision!.command.x,
        decision!.command.y,
        decision!.command.rotation,
      ),
    ).toBe(true);
  });

  it("never proposes a second Leader's House — it is unique", () => {
    // Already standing (every settled fixture) …
    const built = makeWorld([human(1, { residenceBuildingId: 1 })], []);
    // … or already on its way: a second proposal would be refused by `unique`.
    const underway = makeWorld([human(1, { residenceBuildingId: 1 })], [], {}, { leaderHouse: false });
    underway.buildings.push(
      building(91, BuildingType.LeaderHouse, { completed: false, constructionProgress: 10 }),
    );

    expect(decideVirtualPlayerAction(built)?.command).not.toMatchObject({ type: BuildingType.LeaderHouse });
    expect(decideVirtualPlayerAction(underway)?.command).not.toMatchObject({ type: BuildingType.LeaderHouse });
  });

  it("keeps housing the homeless while only the Leader's House has free beds", () => {
    // The Leader's House has 12 beds, but they belong to the leader's household:
    // `leaderHouse.syncLeaderHouseResidency` evicts anyone else and re-homes them.
    // Spare beds there must not read as "this settler was simply never assigned".
    const world = makeWorld([human(1), human(2), human(3)], []);

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.House });
    expect(getOpenBeds(world)).toBeGreaterThan(0); // the all-beds count says there is room …
    expect(getOpenPlayerBeds(world)).toBe(0); // … but none of it is assignable housing
  });

  it('answer an open story card with an answer the story owner accepts', () => {
    // The Traveling Theatre's stage-2 card leads with a 20-food hospitality offer.
    // This colony has no food, so the resolver would refuse it and re-queue the
    // card — the bot must pick an answer that actually lands.
    const world = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      pendingStoryEvents: [{
        id: 'story_theatre',
        emoji: '🎭',
        title: 'Build the Production',
        description: '',
        choices: [
          { id: 'support_hospitality', label: 'Provide food and lodging (20 food)', detail: '' },
          { id: 'support_venue', label: 'Provide a venue and materials (15 wood)', detail: '' },
          { id: 'support_improvise', label: 'Let them perform with whatever they have', detail: '' },
          { id: 'cancel_show', label: 'Cancel the show', detail: '' },
        ],
        createdAtTick: 0,
        expiresAtTick: 100,
        storyKey: 'traveling_theatre' as const,
      }],
      resources: { wood: 500, stone: 500, food: 0, gold: 500, iron: 0 },
    });

    expect(decideVirtualPlayerAction(world)!.command).toMatchObject({
      op: 'respondToStoryEvent',
      eventId: 'story_theatre',
      choiceId: 'support_venue',
    });
  });

  it('falls back to the free story answer when every paid answer is out of reach', () => {
    const world = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      pendingStoryEvents: [{
        id: 'story_theatre',
        emoji: '🎭',
        title: 'Build the Production',
        description: '',
        choices: [
          { id: 'support_hospitality', label: 'Provide food and lodging (20 food)', detail: '' },
          { id: 'support_venue', label: 'Provide a venue and materials (15 wood)', detail: '' },
          { id: 'support_improvise', label: 'Let them perform with whatever they have', detail: '' },
          { id: 'cancel_show', label: 'Cancel the show', detail: '' },
        ],
        createdAtTick: 0,
        expiresAtTick: 100,
        storyKey: 'traveling_theatre' as const,
      }],
      resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    });

    // `support_improvise` costs nothing, so the card is always answerable — the
    // bot never has to leave a story card open.
    expect(decideVirtualPlayerAction(world)!.command).toMatchObject({
      op: 'respondToStoryEvent',
      eventId: 'story_theatre',
      choiceId: 'support_improvise',
    });
  });

  it('returns null when there is nothing to fix', () => {
    const world = housedVillage(2);

    expect(decideVirtualPlayerAction(world)).toBeNull();
  });

  it('answers an open raid card with the card own id and an answer the raid owner accepts', () => {
    const world = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      pendingRaidEvents: [raidEvent()],
    });

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command.op).toBe('respondToRaidEvent');
    // `defend` is the preferred reading of this card, but the stub colony has no
    // spears, so the real raid owner would refuse it and leave the card open.
    // The tribute is affordable (the card asks 10 food), so the bot pays instead.
    expect(decision!.command).toMatchObject({
      op: 'respondToRaidEvent',
      eventId: 'raid_42',
      choiceId: 'payoff',
    });

    // …and the proposal really resolves the card through the real command owner.
    const resolved = applyWorkerCommand(world, decision!.command);
    expect(resolved.pendingRaidEvents).toHaveLength(0);
  });

  it('gates a raid answer on the raid owner own guards', () => {
    const broke = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      pendingRaidEvents: [raidEvent()],
      resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    });
    const brokeEvent = broke.pendingRaidEvents![0];

    // No spears, no barricade timber, no tribute: every declared answer is refused.
    expect(getRaidChoiceEligibility(broke, brokeEvent, 'defend').ok).toBe(false);
    expect(getRaidChoiceEligibility(broke, brokeEvent, 'barricade').ok).toBe(false);
    expect(getRaidChoiceEligibility(broke, brokeEvent, 'payoff').ok).toBe(false);

    const stocked = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      pendingRaidEvents: [raidEvent()],
    });
    const stockedEvent = stocked.pendingRaidEvents![0];

    // Stores answer two of the three; the militia still has no spears to defend with.
    expect(getRaidChoiceEligibility(stocked, stockedEvent, 'barricade').ok).toBe(true);
    expect(getRaidChoiceEligibility(stocked, stockedEvent, 'payoff').ok).toBe(true);
    expect(getRaidChoiceEligibility(stocked, stockedEvent, 'defend').ok).toBe(false);
  });

  it('lets the colony ladder run instead of spending every hour on a refused raid answer', () => {
    const world = makeWorld([human(1), human(2), human(3)], [], {
      pendingRaidEvents: [raidEvent()],
      // Enough for a House (40 wood · 10 stone · 5 gold), nothing for the tribute.
      resources: { wood: 100, stone: 100, food: 0, gold: 100, iron: 0 },
    });

    // The card offers no answer the owner would take, so the bot must not claim the
    // hour with a refused `defend` — it answers the colony's housing need instead.
    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.House });
    expect(decision!.reason).toContain('homeless');
  });

  it('proposes nothing at all when a raid cannot be answered and the colony is healthy', () => {
    const world = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      pendingRaidEvents: [raidEvent()],
      resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    });

    // Every answer is refused and nothing else needs fixing: no command is issued,
    // and `useVirtualPlayer` reports the idle status for the hour.
    expect(decideVirtualPlayerAction(world)).toBeNull();
  });

  it('answers other card types with their own id and falls back to the first choice', () => {
    const outgoing = makeWorld([human(1)], [], {
      pendingOutgoingRaidEvents: [{
        id: 'out_9',
        rivalId: 'r',
        rivalName: 'Ravenhold',
        title: 'Your war-band arrives',
        description: '',
        emoji: '',
        choices: [
          { id: 'accept_payoff', label: 'Take the payoff', hint: '' },
          { id: 'fight', label: 'Fight', hint: '' },
        ],
        createdAtTick: 0,
        expiresAtTick: 100,
        marchDistanceTiles: 5,
        isCounterRaid: false,
        rivalResponse: 'payoff_offer' as const,
        attackerStrength: 0,
        defenderStrength: 0,
        lootFood: 0,
        lootGold: 0,
        lootWood: 0,
        lootStone: 0,
      }],
    });
    expect(decideVirtualPlayerAction(outgoing)!.command).toMatchObject({
      op: 'respondToOutgoingRaidEvent',
      eventId: 'out_9',
      choiceId: 'accept_payoff',
    });

    const diplomacy = makeWorld([human(1)], [], {
      pendingDiplomacyEvents: [{
        id: 'dip_3',
        rivalId: 'r',
        rivalName: 'Ravenhold',
        kind: 'border_dispute' as const,
        title: 'Border dispute',
        description: '',
        emoji: '',
        choices: [
          { id: 'concede', label: 'Offer hunting rights', hint: '' },
          { id: 'stand_firm', label: 'Stand firm', hint: '' },
          { id: 'militia', label: 'Parade militia', hint: '' },
        ],
        createdAtTick: 0,
      }],
    });
    expect(decideVirtualPlayerAction(diplomacy)!.command).toMatchObject({
      op: 'respondToDiplomacyEvent',
      eventId: 'dip_3',
      choiceId: 'stand_firm',
    });

    // Choice ids that match no preference fall back to the card's first choice.
    const story = makeWorld([human(1)], [], {
      pendingStoryEvents: [{
        id: 'story_7',
        emoji: '🧒',
        title: 'Ten children at the gate',
        description: '',
        choices: [
          { id: 'shelter_them', label: 'Open the houses', detail: '' },
          { id: 'turn_away', label: 'Turn them away', detail: '' },
        ],
        createdAtTick: 0,
        expiresAtTick: 100,
        storyKey: 'children_shelter' as const,
      }],
    });
    expect(decideVirtualPlayerAction(story)!.command).toMatchObject({
      op: 'respondToStoryEvent',
      eventId: 'story_7',
      choiceId: 'shelter_them',
    });
  });

  it('answers an active Village Request with the request own id', () => {
    const request = villageRequest();

    const affordable = makeWorld([human(1)], [], { activeVillageRequest: request });
    expect(decideVirtualPlayerAction(affordable)!.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'resolveVillageRequest',
      requestId: request.id,
      choice: 'accept',
    });

    const broke = makeWorld([human(1)], [], {
      activeVillageRequest: request,
      resources: { wood: 500, stone: 500, food: 500, gold: 5, iron: 0 },
    });
    const decision = decideVirtualPlayerAction(broke)!;
    expect(decision.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'resolveVillageRequest',
      requestId: request.id,
      choice: 'decline',
    });
    expect(decision.reason).toContain('decline');
  });

  it('staffs an empty workplace before building anything', () => {
    // The fixture brings its own farm; the default one would take the single idle
    // settler the staffing rule is about.
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1 })],
      [building(1, BuildingType.House, { occupants: [1] }), building(2, BuildingType.Farm)],
      {},
      { foodProducer: false },
    );

    const decision = decideVirtualPlayerAction(world);

    expect(decision!.command).toEqual({ proto: WORKER_CMD_PROTO, op: 'autoStaffWorkers' });
    expect(decision!.reason).toContain('Farm');
  });

  it('proposes no auto-staffing when only a transfer could fill a post', () => {
    // The reported defect as a world: every job building stands non-empty, one has an
    // open post, and the only settler without a job is pregnant — so no *idle* settler
    // can be placed. `canAssignWorkerToBuilding` still answers "yes" here, because it
    // asks the *manual* path's question (a transfer out of the overstaffed Lumber Mill
    // could free one up), while `autoStaffWorkers` places idle settlers and only ever
    // rebalances into an *empty* building. Pairing those two made the bot re-propose
    // the same no-op command every in-game hour, with every later step waiting behind it.
    const world = makeWorld(
      [
        human(1, { residenceBuildingId: 1, homeBuildingId: 2 }),
        human(2, { residenceBuildingId: 1, homeBuildingId: 2 }),
        human(3, { residenceBuildingId: 1, homeBuildingId: 3 }),
        human(4, { residenceBuildingId: 1, homeBuildingId: 4 }),
        // Employed, so nobody is idle: pregnancy stopped being an exclusion on 2026-09-17 (owner
        // ruling, `LIVE-FINDINGS-STATUS.md` L4), so the previous "a pregnant settler is not a worker"
        // fixture no longer leaves the colony without an assignable settler. The point of this case is
        // the transfer path, and employment is what makes a transfer the only way to fill the post.
        human(5, { residenceBuildingId: 1, homeBuildingId: 4 }),
      ],
      [
        building(1, BuildingType.House, { occupants: [1, 2, 3, 4, 5] }),
        // Two workers: an overstaffed donor for the manual transfer path.
        building(2, BuildingType.LumberMill, { occupants: [1, 2] }),
        // One of four: an open post, but not an empty building.
        building(3, BuildingType.Quarry, { occupants: [3] }),
        building(4, BuildingType.Farm, { occupants: [4, 5] }),
      ],
      {},
      { foodProducer: false },
    );

    // The owner agrees a worker *could* be moved there by hand…
    expect(canAssignWorkerToBuilding(world, 3)).toBe(true);
    // …but the generic command cannot, so the bot must not spend the hour asking.
    expect(decideVirtualPlayerAction(world)).toBeNull();
  });

  it("makes the player's staffing call at a manual workplace explicit (the Church)", () => {
    // Generic auto-staffing never fills a manual workplace (Church, Prison,
    // Barracks, School, Town Hall) — that choice is the player's. The bot *is* the
    // player, so it makes the choice itself, with one explicit `assignWorker` for
    // that building instead of a blanket `autoStaffWorkers`.
    const world = makeWorld(
      [
        human(1, { residenceBuildingId: 1 }),
        human(2, { residenceBuildingId: 1 }),
        human(3, { residenceBuildingId: 1 }),
      ],
      [building(1, BuildingType.House, { occupants: [1, 2, 3] }), building(2, BuildingType.Church)],
    );

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'assignWorker', buildingId: 2 });
    expect(decision!.command.op).not.toBe('autoStaffWorkers');
    expect(decision!.reason).toContain('Church');

    // …and the staffing owner really accepts it: the settler takes the post.
    const applied = applyWorkerCommand(world, decision!.command);
    expect(applied.entities.find((entity) => entity.id === 1)?.homeBuildingId).toBe(2);
  });

  it('proposes nothing the colony cannot afford', () => {
    const broke = makeWorld([human(1), human(2)], [], {
      resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
      researchNodes: [researchNode()],
    });

    expect(decideVirtualPlayerAction(broke)).toBeNull();
  });

  it('proposes a food producer when stores fall below the buffer', () => {
    const world = makeWorld(
      [1, 2, 3, 4].map((id) => human(id, { residenceBuildingId: 1 })),
      [building(1, BuildingType.House, { occupants: [1, 2, 3, 4] })],
      // 4 settlers × 3 food/day × the 2-day buffer = 24 needed; 5 is not enough.
      { resources: { wood: 500, stone: 500, food: 5, gold: 500, iron: 0 } },
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command.op).toBe('startBuilding');
    if (decision.command.op !== 'startBuilding') throw new Error('expected a startBuilding proposal');
    expect(decision.command.type).toBe(BuildingType.Farm);
    expect(decision.reason).toContain('food left');
  });

  it('starts research only when the research owner would accept it', () => {
    // Unlocked, but its prerequisite is not researched — the command would be rejected.
    const gated = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      researchNodes: [researchNode({ prerequisites: ['agriculture_0'] })],
    });
    expect(decideVirtualPlayerAction(gated)).toBeNull();

    const ready = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      researchNodes: [researchNode()],
    });
    expect(decideVirtualPlayerAction(ready)!.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'startResearch',
      researchId: 'agriculture_1',
    });
  });

  it('researches the node that unlocks the building it wants, not the first one listed', () => {
    // The game's own node order opens with the Agriculture chain, so "first acceptable node"
    // ground `agriculture_1 → _2 → …` and never reached `forestry_1` — the Blacksmith's gate,
    // which the civic step above keeps asking for (and the colony's only route to the forge).
    const world = settledVillage(2, {
      researchNodes: [
        researchNode({ id: 'agriculture_1', type: ResearchType.Agriculture, name: 'Advanced Farming' }),
        researchNode({ id: 'forestry_1', type: ResearchType.Forestry, name: 'Carpentry' }),
      ],
    });

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'startResearch', researchId: 'forestry_1' });
    expect(decision.reason).toContain('Blacksmith');
  });

  it('falls back to the first acceptable research when nothing needed is gated', () => {
    // No node behind the Blacksmith is on offer, so the need cannot be answered and the step
    // keeps its original behaviour: the first node the owner accepts.
    const world = settledVillage(2, {
      researchNodes: [researchNode({ id: 'mining_1', type: ResearchType.Mining, name: 'Deep Mining' })],
    });

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'startResearch', researchId: 'mining_1' });
  });

  it('hosts a festival only when the town hall can actually host one', () => {
    const resident = [human(1, { residenceBuildingId: 1 })];
    const ready = makeWorld(resident, [
      building(1, BuildingType.House, { occupants: [1] }),
      building(2, BuildingType.TownHall, { occupants: [1] }),
    ]);
    expect(decideVirtualPlayerAction(ready)!.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'hostTownFestival',
      buildingId: 2,
    });

    // Cooldown still running — a festival proposal would be rejected every hour.
    // (The hour may still hold other work, so assert on the festival itself.)
    const cooling = makeWorld(resident, [
      building(1, BuildingType.House, { occupants: [1] }),
      building(2, BuildingType.TownHall, { occupants: [1] }),
    ], { tick: 10, townHallFestivalCooldownUntilTick: 500 });
    expect(decideVirtualPlayerAction(cooling)?.command ?? null).not.toMatchObject({
      op: 'hostTownFestival',
    });

    // Not enough food in store for the festival either.
    const hungry = makeWorld(resident, [
      building(1, BuildingType.House, { occupants: [1] }),
      building(2, BuildingType.TownHall, { occupants: [1] }),
    ], {
      resources: {
        wood: 500,
        stone: 500,
        food: TOWN_HALL_FESTIVAL_COST.food - 1,
        gold: 500,
        iron: 0,
      },
    });
    expect(decideVirtualPlayerAction(hungry)?.command ?? null).not.toMatchObject({
      op: 'hostTownFestival',
    });
  });

  it('builds the economy building it is short of instead of stalling', () => {
    // 100 wood is below the wood threshold with a Lumber Mill affordable and legal:
    // the bot answers the shortage rather than idling once it cannot afford Houses.
    const world = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      resources: { wood: 100, stone: 500, food: 500, gold: 500, iron: 0 },
    });

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.LumberMill });
    expect(decision!.reason).toContain('wood');
  });

  it('mines iron without waiting for a Blacksmith — the Mine has no unlock requirement', () => {
    // The owner data is the authority: `BUILDING_CONFIGS.Mine` carries no
    // `unlockRequirement` (the game lets a Mine dig gold as well as iron), so the
    // old "wait for a smith" precondition was a bot rule the game does not have.
    expect(BUILDING_CONFIGS[BuildingType.Mine].unlockRequirement).toBeUndefined();

    const world = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 0 },
    });

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.Mine });
    // …and the placement owner really accepts it: the game raises the Mine.
    const applied = applyWorkerCommand(world, decision!.command);
    expect(applied.buildings.some((building) => building.type === BuildingType.Mine)).toBe(true);
  });

  it('builds the Blacksmith once its research is in, so the forge is reachable', () => {
    // forestry_1 is the Blacksmith's research gate, and the placement owner wants
    // the *node* researched — not merely listed in `unlockedTechs`.
    const world = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      unlockedTechs: ['forestry_1'],
      researchNodes: [researchNode({ id: 'forestry_1', researched: true })],
    });

    const decision = decideVirtualPlayerAction(world);

    expect(decision).not.toBeNull();
    expect(decision!.command).toMatchObject({ op: 'startBuilding', type: BuildingType.Blacksmith });
    expect(decision!.reason).toContain('Blacksmith');
  });

  it('leaves the Blacksmith alone until its research is unlocked', () => {
    const world = makeWorld([human(1, { residenceBuildingId: 1 })], []);

    // No forestry_1 in `unlockedTechs`: the placement owner reports the building
    // locked, so no spot exists and the step proposes nothing.
    expect(decideVirtualPlayerAction(world)).toBeNull();
  });

  it('is deterministic and never mutates the world it reads', () => {
    const world = makeWorld([human(1), human(2)], []);
    const before = JSON.stringify(world);

    const first = decideVirtualPlayerAction(world);
    const second = decideVirtualPlayerAction(world);

    expect(second).toEqual(first);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('never proposes the same action twice for the same world', () => {
    const homeless = makeWorld([human(1)], []);
    const first = decideVirtualPlayerAction(homeless)!;
    expect(first.command).toMatchObject({ op: 'startBuilding', type: BuildingType.House });

    // Applying the proposal runs the real command owner…
    const applied = applyWorkerCommand(homeless, first.command);
    expect(applied.buildings.some((b) => b.type === BuildingType.House && !b.completed)).toBe(true);
    // …so the housing need is already being served and is not proposed again.
    expect(decideVirtualPlayerAction(applied)).toBeNull();

    const researchReady = makeWorld([human(1, { residenceBuildingId: 1 })], [], {
      researchNodes: [researchNode()],
    });
    const researchDecision = decideVirtualPlayerAction(researchReady)!;
    expect(researchDecision.command.op).toBe('startResearch');

    const afterResearch = applyWorkerCommand(researchReady, researchDecision.command);
    expect(afterResearch.activeResearch).toBe('agriculture_1');
    expect(decideVirtualPlayerAction(afterResearch)).toBeNull();
  });
});

describe('virtual player remaining action surface', () => {
  it('repairs the worst damage the repair owner would actually pay for', () => {
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 2 })],
      [
        building(1, BuildingType.House, { occupants: [1], health: 30 }),
        building(2, BuildingType.Farm, { occupants: [1], health: 70 }),
      ],
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'repairBuilding', buildingId: 1 });
    expect(decision.reason).toContain('70% damaged');
    // The worst-damaged building is the only acceptable repair target either way.
    expect(getRepairBuildingEligibility(world, 1).ok).toBe(true);
    expect(getRepairBuildingEligibility(world, 2).ok).toBe(true);

    // …and the maintenance owner really restores it.
    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.buildings.find((b) => b.id === 1)?.health).toBe(100);
    expect(applied.resources.wood).toBe(490);
  });

  it('does not spend an hour on a scratch', () => {
    // 90% health is above the bot's repair threshold: no owner-refused repair is
    // proposed, and nothing else needs the hour.
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1 })],
      [building(1, BuildingType.House, { occupants: [1], health: 90 })],
    );

    expect(decideVirtualPlayerAction(world)).toBeNull();
  });

  it('queues the best forge order a staffed Blacksmith can start', () => {
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 2 })],
      [
        building(1, BuildingType.House, { occupants: [1] }),
        building(2, BuildingType.Blacksmith, { occupants: [1] }),
      ],
      {
        resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 50 },
        unlockedTechs: ['defense_4'],
        villageForge: { activeOrder: null, progress: 0, completed: {} },
      },
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'queueForgeOrder', buildingId: 2, orderId: 'iron_spears' });
    expect(decision.reason).toContain('Iron Spears');
    // The forge owner agrees the order is startable…
    expect(getForgeBlockReason(world, 'iron_spears')).toBeNull();

    // …and starting it really takes.
    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.villageForge?.activeOrder).toBe('iron_spears');
  });

  it('never re-queues a forged order and waits for the research behind the next one', () => {
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 2 })],
      [
        building(1, BuildingType.House, { occupants: [1] }),
        building(2, BuildingType.Blacksmith, { occupants: [1] }),
      ],
      {
        resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 50 },
        unlockedTechs: ['defense_4'],
        villageForge: { activeOrder: null, progress: 0, completed: { iron_spears: true } },
      },
    );

    expect(isForgeOrderComplete(world.villageForge, 'iron_spears')).toBe(true);
    expect(getForgeBlockReason(world, 'iron_spears')).toContain('already forged');
    // Shields and pickaxes need defense_5 / mining_2, so no order is startable.
    expect(decideVirtualPlayerAction(world)).toBeNull();
  });

  it('proposes no forge order for an unstaffed Blacksmith', () => {
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 1 })],
      [
        building(1, BuildingType.House, { occupants: [1] }),
        building(2, BuildingType.Blacksmith),
      ],
      {
        resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 50 },
        unlockedTechs: ['defense_4'],
        villageForge: { activeOrder: null, progress: 0, completed: {} },
      },
    );

    expect(getForgeBlockReason(world, 'iron_spears')).toBe('Staff the Blacksmith to forge');
    expect(decideVirtualPlayerAction(world)).toBeNull();
  });

  it('works the gold seam when the treasury is low', () => {
    // Iron is deliberately not short here: this test is about the *treasury* rule.
    const world = tunableVillage({
      resources: { wood: 500, stone: 500, food: 500, gold: 40, iron: 50 },
    });

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'setMineMode', buildingId: 5, mode: 'gold' });
    expect(decision.reason).toContain('gold');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.buildings.find((b) => b.id === 5)?.mineMode).toBe('gold');
  });

  it('digs iron when the colony is short of it, even with a low treasury', () => {
    // The reported defect: with 0 iron the mine dug gold because the treasury was low,
    // so iron never rose and nothing in the colony addressed the shortage.
    const world = tunableVillage({
      resources: { wood: 500, stone: 500, food: 500, gold: 40, iron: 0 },
    });
    world.buildings.find((b) => b.id === 5)!.mineMode = 'gold';

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'setMineMode', buildingId: 5, mode: 'iron' });
    expect(decision.reason).toContain('iron');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.buildings.find((b) => b.id === 5)?.mineMode).toBe('iron');
  });

  it('sends the Hunting Spot back to auto once food is healthy again', () => {
    const world = tunableVillage({
      resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 50 },
    });
    world.buildings.find((b) => b.id === 5)!.mineMode = 'iron';
    world.buildings.find((b) => b.id === 6)!.huntingSpotPrey = 'deer';

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'setHuntingSpotPrey', buildingId: 6, prey: 'auto' });

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.buildings.find((b) => b.id === 6)?.huntingSpotPrey).toBe('auto');
    // The Mine is already on iron, so its own step retires and proposes nothing.
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({ op: 'setMineMode' });
  });

  it('runs the workshop recipe the colony can actually supply', () => {
    const world = tunableVillage({
      resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 50 },
    });
    world.buildings.find((b) => b.id === 5)!.mineMode = 'iron';

    const decision = decideVirtualPlayerAction(world)!;

    // Furniture pays the most gold and 500 wood / 500 stone covers its inputs.
    expect(decision.command).toMatchObject({ op: 'setWorkshopRecipe', buildingId: 7, recipeId: 'furniture' });

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.buildings.find((b) => b.id === 7)?.workshopRecipeId).toBe('furniture');
  });

  it('recruits a settler in the morning, from spare beds and a deep larder', () => {
    const world = settledVillage(2, { tick: RECRUIT_MORNING_TICK });

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({ proto: WORKER_CMD_PROTO, op: 'recruitSettler' });
    expect(decision.reason).toContain('spare beds');
    // The recruitment owner agrees: the cap and the price are both satisfied.
    expect(getRecruitSettlerEligibility(world).ok).toBe(true);

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.entities.length).toBe(world.entities.length + 1);
  });

  it('buys settlers only in its morning window, not every hour', () => {
    const world = settledVillage(2, { tick: 0 });

    // Everything else the village needs is already done, so the idle hour is real.
    expect(decideVirtualPlayerAction(world)).toBeNull();
  });

  it("does not count the Leader's House beds as room for a recruit", () => {
    // Both settlers live in the Leader's House, which is not spare housing
    // (`getOpenPlayerBeds` excludes it), so there is no bed for a newcomer.
    const world = makeWorld(
      [
        human(1, { residenceBuildingId: LEADER_HOUSE_ID, homeBuildingId: 2 }),
        human(2, { residenceBuildingId: LEADER_HOUSE_ID, homeBuildingId: 2 }),
      ],
      [building(2, BuildingType.LumberMill, { occupants: [1, 2] })],
      { tick: RECRUIT_MORNING_TICK },
    );

    expect(getOpenPlayerBeds(world)).toBe(0);
    // The beds are the point: no recruit is proposed. The hour may still hold other
    // work (the Lumber Mill wants a road), so assert on recruitment itself.
    expect(decideVirtualPlayerAction(world)?.command ?? null).not.toMatchObject({
      op: 'recruitSettler',
    });
  });

  it('speaks with a visitor leader once per visit', () => {
    const world = settledVillage(2, { visitorGroups: [visitorGroup()] });

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'talkToVisitorLeader', groupId: 'visitors_traders_1' });
    expect(decision.reason).toContain('The Salt Road');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.visitorGroups[0].leaderTalked).toBe(true);
    // One audience per visit — the talk step retires itself.
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({
      op: 'talkToVisitorLeader',
    });
  });

  it("delivers the smith's quest when the goods are in store", () => {
    const world = settledVillage(2, {
      visitorGroups: [visitorGroup({ leaderTalked: true })],
      visitorQuest: visitorQuest(),
    });

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({ proto: WORKER_CMD_PROTO, op: 'deliverVisitorQuest' });
    expect(decision.reason).toContain('The traveling smith');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.visitorQuest?.status).toBe('completed');
    expect(applied.resources.wood).toBe(480);
  });

  it('buys food from a caravan when the stores are short', () => {
    const ids = [1, 2];
    const world = makeWorld(
      ids.map((id) => human(id, { residenceBuildingId: 1, homeBuildingId: 2 })),
      [
        building(1, BuildingType.House, { occupants: ids }),
        building(2, BuildingType.LumberMill, { occupants: ids }),
        // A Farm already on the way, so the food step stands down and the caravan
        // deal is the next thing the colony can actually do about the shortage.
        building(3, BuildingType.Farm, { completed: false, constructionProgress: 10 }),
      ],
      {
        resources: { wood: 500, stone: 500, food: 5, gold: 500, iron: 30 },
        visitorGroups: [visitorGroup({ leaderTalked: true })],
        // Neutral standing: reputation ≥ 31 keeps trade at the listed price, so the
        // bought food costs exactly the 25 gold the caravan asks.
        villageReputation: 50,
      },
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({
      op: 'tradeWithVisitors',
      groupId: 'visitors_traders_1',
      action: 'buy_food',
    });
    // The trade owner prices this deal the same way.
    expect(getVisitorTradeEligibility(world, 'visitors_traders_1', 'buy_food').ok).toBe(true);

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.resources.food).toBe(45);
    expect(applied.resources.gold).toBe(475);
  });

  it('takes the manual post once, then has no idle adult left to place', () => {
    const world = makeWorld(
      [
        human(1, { residenceBuildingId: 1 }),
        human(2, { residenceBuildingId: 1 }),
        human(3, { residenceBuildingId: 1 }),
      ],
      [building(1, BuildingType.House, { occupants: [1, 2, 3] }), building(2, BuildingType.Church)],
    );

    const decision = decideVirtualPlayerAction(world)!;
    expect(decision.command).toMatchObject({ op: 'assignWorker', buildingId: 2 });

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.entities.find((entity) => entity.id === 1)?.homeBuildingId).toBe(2);
    // Every settler now has a post, so the step retires instead of re-firing (the
    // next hour may move on to making that Church crew explicit — step 16).
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({
      op: 'assignWorker',
    });
  });

  it('expands a home when the homeless have nowhere left to build', () => {
    const occupants = [1, 2, 3, 4, 5, 6];
    const world = makeWorld(
      [
        ...occupants.map((id) => human(id, { residenceBuildingId: 1 })),
        human(7),
      ],
      [building(1, BuildingType.House, { occupants })],
      { worldMap: unbuildableWorldMap() },
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'upgradeBuilding', buildingId: 1 });
    expect(decision.reason).toContain('no room left to build');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.buildings.find((b) => b.id === 1)?.level).toBe(2);
  });

  it('tames a creature a Taming Post can reach, from a deep larder', () => {
    const deer = { ...human(5), type: EntityType.Deer, x: 300, y: 300 } as Entity;
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1 }), deer],
      [
        building(1, BuildingType.House, { occupants: [1] }),
        building(3, BuildingType.TamingPost, { x: 300, y: 300 }),
      ],
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toMatchObject({ op: 'tameEntity', entityId: 5, humanId: 1 });
    expect(decision.reason).toContain('Taming Post');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.entities.find((entity) => entity.id === 5)?.tamedBy).toBe(1);
  });

  it('sends food to a tense neighbour only while the larder is deep', () => {
    const world = settledVillage(2, { rivalSettlements: [rival()] });

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'sendRivalGift',
      rivalId: 'rival_ravenhold',
    });

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.rivalSettlements[0].relationship).toBe('competitive');
  });

  it('signs a truce with the neighbour who will talk', () => {
    const world = settledVillage(2, { rivalSettlements: [rival({ relationship: 'competitive' })] });

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'signPeaceTreaty',
      rivalId: 'rival_ravenhold',
    });

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.rivalSettlements[0].peaceTreatyDays).toBeGreaterThan(0);
  });

  it('opens a trade route once a completed Market stands', () => {
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 2 })],
      [
        building(1, BuildingType.House, { occupants: [1] }),
        building(2, BuildingType.Market, { occupants: [1] }),
      ],
      { tradeRoutes: [tradeRoute()] },
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'establishTradeRoute',
      routeId: 'route_saltport',
    });

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.tradeRoutes[0].active).toBe(true);
  });

  it('raids a tense rival only with provisions to spare, and prefers peace when rich', () => {
    const ids = Array.from({ length: 12 }, (_, index) => index + 1);
    // Everyone is at home rather than at a workplace: this fixture is about rival
    // policy, and no job building means no crew or road work can preempt it.
    const crowded = (food: number) => makeWorld(
      [
        ...ids.slice(0, 6).map((id) => human(id, { residenceBuildingId: 1, homeBuildingId: 1 })),
        ...ids.slice(6).map((id) => human(id, { residenceBuildingId: 2, homeBuildingId: 2 })),
      ],
      [
        building(1, BuildingType.House, { occupants: ids.slice(0, 6) }),
        building(2, BuildingType.House, { occupants: ids.slice(6) }),
      ],
      {
        resources: { wood: 500, stone: 500, food, gold: 500, iron: 30 },
        unlockedTechs: ['defense_2'],
        rivalSettlements: [rival()],
      },
    );

    // 12 settlers eat 36 a day: 100 food is under the 4-day reserve the gift step
    // wants but still triple the 18-food march provisions.
    const lean = crowded(100);
    expect(canLaunchRaidOnRival(lean, lean.rivalSettlements[0]).ok).toBe(true);
    expect(decideVirtualPlayerAction(lean)!.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'launchRaidOnRival',
      rivalId: 'rival_ravenhold',
    });

    // With a full larder the bot mends fences instead of marching: no warmonger.
    const rich = crowded(500);
    expect(decideVirtualPlayerAction(rich)!.command).toMatchObject({
      op: 'sendRivalGift',
      rivalId: 'rival_ravenhold',
    });
  });
  it('marks a staffed manual workplace manual, and releases an empty stale one', () => {
    // The Church keeps a crew the player placed by hand: make that explicit so a
    // blanket auto-staff can never rearrange it.
    const church = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 2 })],
      [building(1, BuildingType.House, { occupants: [1] }), building(2, BuildingType.Church, { occupants: [1] })],
    );

    const decision = decideVirtualPlayerAction(church)!;
    expect(decision.command).toMatchObject({
      op: 'setBuildingStaffingMode',
      buildingId: 2,
      mode: 'manual',
    });
    expect(decision.reason).toContain('Church');

    const applied = applyWorkerCommand(church, decision.command);
    expect(applied.buildings.find((b) => b.id === 2)?.staffingMode).toBe('manual');
    // …and the step retires once the mode is explicit.
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({
      op: 'setBuildingStaffingMode',
    });

    // An empty Farm still flagged manual is holding the colony back: release it.
    const stale = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 3 })],
      [
        building(1, BuildingType.House, { occupants: [1] }),
        building(3, BuildingType.Store, { occupants: [1] }),
        building(2, BuildingType.Farm, { staffingMode: 'manual' }),
      ],
    );
    const released = decideVirtualPlayerAction(stale)!;
    expect(released.command).toMatchObject({
      op: 'setBuildingStaffingMode',
      buildingId: 2,
      mode: 'auto',
    });

    // A staffed Farm the player chose to run manually is left exactly as it is.
    const chosen = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 2 })],
      [
        building(1, BuildingType.House, { occupants: [1] }),
        building(2, BuildingType.Farm, { occupants: [1], staffingMode: 'manual' }),
      ],
    );
    expect(decideVirtualPlayerAction(chosen)?.command ?? null).not.toMatchObject({
      op: 'setBuildingStaffingMode',
    });
  });

  it('releases the least skilled hand from an over-crewed workplace', () => {
    // The fixture's own farm is the over-crewed workplace under test.
    const world = makeWorld(
      [
        human(1, { residenceBuildingId: 1, homeBuildingId: 2, skills: { [JobType.Farmer]: 10 } }),
        human(2, { residenceBuildingId: 1, homeBuildingId: 2, skills: { [JobType.Farmer]: 80 } }),
        human(3, { residenceBuildingId: 1, homeBuildingId: 2, skills: { [JobType.Farmer]: 45 } }),
      ],
      [
        building(1, BuildingType.House, { occupants: [1, 2, 3] }),
        // A Farm holds two: the third hand is a surplus auto-staffing never makes.
        building(2, BuildingType.Farm, { occupants: [1, 2, 3] }),
      ],
      {},
      { foodProducer: false },
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'removeWorker',
      buildingId: 2,
      humanId: 1,
    });
    expect(decision.reason).toContain('3 hands for 2 posts');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.entities.find((entity) => entity.id === 1)?.homeBuildingId).toBeUndefined();
    // The crew now fits its posts, so the step retires.
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({
      op: 'removeWorker',
    });
  });

  it('returns the work day and the venue hours to the owner defaults', () => {
    const offStandard = settledVillage(2, {
      workSchedule: { startHour: 5, endHour: 21 },
      tavernSchedule: { startHour: 10, endHour: 14 },
    });
    offStandard.buildings.push(building(3, BuildingType.Tavern));

    const workDay = decideVirtualPlayerAction(offStandard)!;
    expect(workDay.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'setWorkSchedule',
      startHour: 7,
      endHour: 16,
    });
    expect(workDay.reason).toContain('07:00–16:00');

    // With the work day already standard, the same world moves on to the tavern.
    const afterWorkDay = applyWorkerCommand(offStandard, workDay.command);
    const venue = decideVirtualPlayerAction(afterWorkDay)!;
    expect(venue.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'setVenueSchedule',
      venue: 'tavern',
      startHour: 17,
      endHour: 23,
    });

    const applied = applyWorkerCommand(afterWorkDay, venue.command);
    expect(applied.workSchedule).toEqual({ startHour: 7, endHour: 16 });
    expect(applied.tavernSchedule).toEqual({ startHour: 17, endHour: 23 });
    // Both schedules now match their owners' defaults — and with no hotel standing
    // the venue step has nothing left either.
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({
      op: 'setVenueSchedule',
    });
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({
      op: 'setWorkSchedule',
    });
  });

  it('leaves a schedule that already matches the owner default alone', () => {
    // A fresh game has no schedule field at all, and the owners read their own
    // defaults, so neither step has anything to do.
    const fresh = settledVillage(2);

    expect(decideVirtualPlayerAction(fresh)?.command ?? null).not.toMatchObject({
      op: 'setWorkSchedule',
    });
    expect(decideVirtualPlayerAction(fresh)?.command ?? null).not.toMatchObject({
      op: 'setVenueSchedule',
    });
  });

  it('lays a short road chain to a production building that stands a real walk away', () => {
    const world = makeWorld(
      [human(1, { residenceBuildingId: 1, homeBuildingId: 1 })],
      [
        building(1, BuildingType.House, { occupants: [1] }),
        building(3, BuildingType.LumberMill, { x: 900, y: 700 }),
      ],
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command.op).toBe('placeStripChain');
    if (decision.command.op !== 'placeStripChain') throw new Error('expected a road chain');
    expect(decision.command.type).toBe(BuildingType.Road);
    expect(decision.command.segments.length).toBeGreaterThan(0);
    expect(decision.command.segments.length).toBeLessThanOrEqual(12);
    // Every tile in the chain is one the placement owner validated, so the road
    // cannot cut through a building.
    expect(decision.command.segments.every((segment) => segment.valid)).toBe(true);
    expect(decision.reason).toContain('Lumber Mill');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.buildings.some((building_) => building_.type === BuildingType.Road)).toBe(true);
    expect(applied.resources.wood).toBeLessThan(world.resources.wood);
  });

  it('leaves paving alone while the wood shelf is short', () => {
    const world = settledVillage(2, {
      resources: { wood: 100, stone: 500, food: 500, gold: 500, iron: 0 },
    });

    expect(decideVirtualPlayerAction(world)?.command ?? null).not.toMatchObject({
      op: 'placeStripChain',
    });
  });

  it('clears a redundant empty outbuilding when the village has no room left', () => {
    const occupants = [1, 2, 3, 4, 5, 6];
    const world = makeWorld(
      [
        ...occupants.map((id) => human(id, { residenceBuildingId: 1, homeBuildingId: 1 })),
        human(7, { homeBuildingId: 1 }),
      ],
      [
        building(1, BuildingType.House, { occupants }),
        building(3, BuildingType.Quarry, { occupants: [] }),
        building(4, BuildingType.Quarry, { occupants: [] }),
      ],
      { worldMap: unbuildableWorldMap() },
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'demolishBuilding',
      buildingId: 3,
    });
    expect(decision.reason).toContain('no room left to build');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.buildings.some((building_) => building_.id === 3)).toBe(false);
    // One duplicate is gone, so the step retires with it.
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({
      op: 'demolishBuilding',
    });
  });

  it('never demolishes a home, however crowded the village is', () => {
    const first = [1, 2, 3, 4, 5, 6];
    const second = [7, 8, 9, 10, 11, 12];
    const world = makeWorld(
      [
        ...first.map((id) => human(id, { residenceBuildingId: 1 })),
        ...second.map((id) => human(id, { residenceBuildingId: 2 })),
        human(13),
      ],
      [
        building(1, BuildingType.House, { occupants: first }),
        building(2, BuildingType.House, { occupants: second }),
      ],
      { worldMap: unbuildableWorldMap() },
    );

    // Two identical homes and a homeless settler, but a residence is never a
    // candidate: the colony expands a home instead (step 22).
    expect(decideVirtualPlayerAction(world)?.command ?? null).not.toMatchObject({
      op: 'demolishBuilding',
    });
  });

  it('shows the militia when a tense neighbour cannot be bought off', () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const world = makeWorld(
      ids.map((id) => human(id, { residenceBuildingId: 1, homeBuildingId: 1 })),
      [
        building(1, BuildingType.House, { occupants: ids }),
        // A Farm on the way keeps the food step from proposing instead.
        building(2, BuildingType.Farm, { completed: false, constructionProgress: 10 }),
      ],
      {
        // 10 food cannot cover the 25-food gift, but the spears and settlers can.
        resources: { wood: 500, stone: 500, food: 10, gold: 500, iron: 30 },
        unlockedTechs: ['defense_2'],
        rivalSettlements: [rival()],
      },
    );

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'showStrengthToRival',
      rivalId: 'rival_ravenhold',
    });
    expect(decision.reason).toContain('spears to show');

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.rivalSettlements[0].relationship).toBe('competitive');
  });

  it('signs a trade pact with a rival when a treaty is out of reach', () => {
    const world = settledVillage(2, {
      // Too little food for the 20-food treaty, but 500 gold covers the 40-gold pact.
      resources: { wood: 500, stone: 500, food: 5, gold: 500, iron: 30 },
      rivalSettlements: [rival({ relationship: 'competitive' })],
    });
    // A Farm on the way keeps the food step from proposing instead.
    world.buildings.push(building(9, BuildingType.Farm, { completed: false, constructionProgress: 10 }));

    const decision = decideVirtualPlayerAction(world)!;

    expect(decision.command).toEqual({
      proto: WORKER_CMD_PROTO,
      op: 'establishRivalTradePact',
      rivalId: 'rival_ravenhold',
    });

    const applied = applyWorkerCommand(world, decision.command);
    expect(applied.rivalSettlements[0].relationship).toBe('friendly');
    // Friendly is the end of the road: the pact step retires.
    expect(decideVirtualPlayerAction(applied)?.command ?? null).not.toMatchObject({
      op: 'establishRivalTradePact',
    });
  });

  it('welcomes a refugee camp from a deep larder, and screens one it can only feed', () => {
    const refugeeGroup = (overrides: Partial<VisitorGroup> = {}) => visitorGroup({
      id: 'visitors_refugees_1',
      name: 'The Displaced',
      kind: 'refugees',
      entityIds: [31],
      ...overrides,
    });
    const refugeeCamp = { ...human(31), faction: 'visitor' as const, groupId: 'visitors_refugees_1' };

    const deepLarder = settledVillage(2, {
      visitorGroups: [refugeeGroup()],
    });
    deepLarder.entities.push(refugeeCamp as Entity);

    const welcome = decideVirtualPlayerAction(deepLarder)!;
    expect(welcome.command).toMatchObject({
      op: 'negotiateRefugees',
      groupId: 'visitors_refugees_1',
      choice: 'welcome',
    });
    expect(welcome.reason).toContain('beds stand free');

    const joined = applyWorkerCommand(deepLarder, welcome.command);
    expect(joined.resources.food).toBe(460);
    expect(joined.entities.find((entity) => entity.id === 31)?.faction).toBeUndefined();

    // 20 food is past the welcome reserve but short of it: screen instead.
    const shallow = settledVillage(2, {
      resources: { wood: 500, stone: 500, food: 20, gold: 500, iron: 30 },
      visitorGroups: [refugeeGroup({ id: 'visitors_refugees_2' })],
    });
    shallow.entities.push({ ...refugeeCamp, groupId: 'visitors_refugees_2' } as Entity);

    const screen = decideVirtualPlayerAction(shallow)!;
    expect(screen.command).toMatchObject({
      op: 'negotiateRefugees',
      groupId: 'visitors_refugees_2',
      choice: 'screen',
    });
  });
});

describe('virtual player opening on a real colony', () => {
  // `readonly BuildingType[]`, not the inferred four-member literal union: the question below
  // ("is this building a food producer?") is meaningful for every `BuildingType`, and the
  // building being tested comes from a world, so its `type` is the full union.
  const FOOD_TYPES: readonly BuildingType[] = [
    BuildingType.Farm,
    BuildingType.Greenhouse,
    BuildingType.FishingSpot,
    BuildingType.HuntingSpot,
  ];

  /**
   * The reported illogic, on the real world rather than a fixture: a fresh
   * settlement has a large larder and no producer at all, so a buffer-only food
   * rule let the ladder research "Advanced Farming" — `farm_yield ×1.2`, and the
   * Greenhouse unlock — with no farm for the research to improve, and then only
   * react to hunger at two days of food, i.e. after a three-day build.
   */
  it('starts a new colony with enough iron for a first forge order', () => {
    // Iron is the one material nothing a colony builds costs (the buildings' own configs
    // carry no iron), and only the Mine makes it — so a new colony is handed a first
    // order's worth (`worldGen.initGame`) instead of waiting days for the Mine.
    const world = initGame({ size: MapSize.Medium, seed: 4242 });

    expect(world.resources.iron).toBe(30);
    expect(world.storageMax.iron).toBeGreaterThanOrEqual(world.resources.iron);
    expect(
      Object.values(BUILDING_CONFIGS).filter((config) => (config.cost.iron ?? 0) > 0),
    ).toHaveLength(0);
  });

  it('builds a food producer before it researches farm technology', () => {
    let world = initGame({ size: MapSize.Medium, seed: 4242 });
    const producers = () =>
      world.buildings.filter(
        (building) => building.faction !== 'rival' && FOOD_TYPES.includes(building.type),
      );
    expect(producers()).toHaveLength(0);
    // The larder is the whole food system here, which is exactly the trap.
    expect(world.resources.food).toBeGreaterThan(0);

    const acts: string[] = [];
    let lastActedTick: number | null = null;
    for (let tick = 0; tick < 60 && acts.length < 6; tick++) {
      world = gameTick(world);
      if (!shouldVirtualPlayerAct(true, world, lastActedTick)) continue;
      lastActedTick = world.tick;
      const decision = decideVirtualPlayerAction(world);
      if (!decision) continue;
      acts.push(decision.reason);
      world = applyWorkerCommand(world, decision.command);
    }

    const farm = acts.findIndex((reason) => reason.includes('build a Farm'));
    const research = acts.findIndex((reason) => reason.startsWith('research'));
    expect(farm).toBeGreaterThanOrEqual(0);
    expect(research === -1 || farm < research).toBe(true);
    expect(producers().length).toBeGreaterThan(0);
  });
});

describe('virtual player cadence gate', () => {
  const onTheHour = { paused: false, tick: TICKS_PER_HOUR * 4 };

  it('acts only when auto-play is on and the world is running', () => {
    expect(shouldVirtualPlayerAct(false, onTheHour, null)).toBe(false);
    expect(shouldVirtualPlayerAct(true, { ...onTheHour, paused: true }, null)).toBe(false);
    expect(shouldVirtualPlayerAct(true, onTheHour, null)).toBe(true);
  });

  it('acts at most once per in-game hour', () => {
    expect(shouldVirtualPlayerAct(true, { paused: false, tick: 0 }, null)).toBe(true);
    expect(shouldVirtualPlayerAct(true, { paused: false, tick: 1 }, null)).toBe(false);
    expect(shouldVirtualPlayerAct(true, { paused: false, tick: 2 }, null)).toBe(false);
    expect(shouldVirtualPlayerAct(true, { paused: false, tick: TICKS_PER_HOUR }, null)).toBe(true);
    // A re-render of the same tick must not double-fire the hour.
    expect(shouldVirtualPlayerAct(true, { paused: false, tick: TICKS_PER_HOUR }, TICKS_PER_HOUR)).toBe(false);
    // …but the next hour is free again.
    expect(shouldVirtualPlayerAct(true, { paused: false, tick: TICKS_PER_HOUR * 2 }, TICKS_PER_HOUR)).toBe(true);
  });

  it('keeps opening hour after hour on a world the loop mutates in place', () => {
    // The game loop mutates ONE `WorldState` object (`GameLoop.frame` on the main
    // thread, the worker host's `worldRef` in worker mode), so App's `world` state
    // keeps the same identity for the whole session. An effect keyed on that object
    // alone therefore never re-runs after the click that enabled auto-play — the
    // "Auto-play does nothing" regression — which is why `useVirtualPlayer` keys its
    // act effect on `world.tick` / `world.paused` as well. This pins the contract
    // those keys rely on: the gate opens again on every in-game hour of a stable
    // object, so the tick alone is a usable "new hour arrived" signal.
    const world = { paused: false, tick: TICKS_PER_HOUR * 4 };
    const sameObject = world;
    let lastActedTick: number | null = null;
    const actedOn: number[] = [];

    for (let step = 0; step < TICKS_PER_HOUR * 3; step++) {
      if (shouldVirtualPlayerAct(true, world, lastActedTick)) {
        actedOn.push(world.tick);
        lastActedTick = world.tick;
      }
      world.tick += 1;
    }

    expect(world).toBe(sameObject);
    expect(actedOn).toEqual([TICKS_PER_HOUR * 4, TICKS_PER_HOUR * 5, TICKS_PER_HOUR * 6]);
  });
});

describe('virtual player status line', () => {
  it('says why an enabled bot is idle instead of falling silent', () => {
    expect(virtualPlayerStatusText(true, null, false)).toBe('waiting for the next in-game hour');
    expect(virtualPlayerStatusText(true, null, true)).toBe('paused — the world is not advancing');
  });

  it('prefers the latest act reason and is null while auto-play is off', () => {
    expect(virtualPlayerStatusText(true, 'build a House', true)).toBe('build a House');
    expect(virtualPlayerStatusText(false, 'build a House', false)).toBe(null);
    expect(virtualPlayerStatusText(false, null, false)).toBe(null);
  });
});
