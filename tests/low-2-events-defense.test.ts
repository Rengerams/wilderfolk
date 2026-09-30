/**
 * Low-severity audit batch (groupEvents / defenseStructures / prisonGuardDuty).
 *
 * Covers the findings that live in those three modules:
 *   - L31 the first-week visitor window its comment now documents
 *   - L32 visitor trades never pay for goods they cannot receive
 *   - L33 the diplomacy resolver answers through `getDiplomacyChoiceEligibility`
 *   - L34 recurring events carry instance-unique ids (dismissal is id-keyed)
 *   - the cross-cutting economy-ownership item in groupEvents (resourceUtils owner)
 *   - L15 barracks occupancy repair is owned by the assignment/death transitions
 *   - L51 a prison escape re-syncs `prison.occupants` in the same step
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type {
  Building,
  DiplomacyEvent,
  Entity,
  GameEvent,
  RivalSettlement,
  VisitorGroup,
  WorldState,
} from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  getDiplomacyChoiceEligibility,
  respondToDiplomacyEvent,
  rollYearlyWorldEvent,
  spawnVisitorGroup,
  tradeWithVisitors,
  tryFirstWeekVisitor,
} from '../src/game/groupEvents';
import { getBarracksGuardCount } from '../src/game/defenseStructures';
import { tickPrisonGuardDuty } from '../src/game/prisonGuardDuty';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

afterEach(() => {
  resetSimRng();
});

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
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
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
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

function trader(overrides: Partial<VisitorGroup> = {}): VisitorGroup {
  return {
    id: 'trader-1',
    name: 'The Brass Kettle Caravan',
    kind: 'traders',
    campX: 320,
    campY: 280,
    daysLeft: 4,
    entityIds: [],
    giftsGiven: 0,
    tradesCompleted: 0,
    gold: 80,
    refugeeResolved: false,
    leaderTalked: false,
    ...overrides,
  };
}

function worldWithTrader(): WorldState {
  const state = initGame();
  state.visitorGroups = [trader()];
  return state;
}

describe('L31 — first-week visitor window matches the documented contract', () => {
  it('visits only on days 7-13 and only with a completed player House or Mansion', () => {
    const early = initGame();
    early.tick = 6 * TICKS_PER_DAY;
    early.buildings = [building(101, BuildingType.House)];
    expect(tryFirstWeekVisitor(early, early.entities, early.buildings)).toBeNull();
    expect(early.firstWeekVisitorSpawned).toBe(false);

    const noHouse = initGame();
    noHouse.tick = 7 * TICKS_PER_DAY;
    expect(tryFirstWeekVisitor(noHouse, noHouse.entities, noHouse.buildings)).toBeNull();
    expect(noHouse.firstWeekVisitorSpawned).toBe(false);

    const firstDay = initGame();
    firstDay.tick = 7 * TICKS_PER_DAY;
    firstDay.buildings = [building(101, BuildingType.House)];
    const event = tryFirstWeekVisitor(firstDay, firstDay.entities, firstDay.buildings);
    expect(event).not.toBeNull();
    expect(firstDay.firstWeekVisitorSpawned).toBe(true);
    // One-shot: the same window never spawns a second group.
    expect(tryFirstWeekVisitor(firstDay, firstDay.entities, firstDay.buildings)).toBeNull();

    const lastDay = initGame();
    lastDay.tick = 13 * TICKS_PER_DAY;
    lastDay.buildings = [building(101, BuildingType.Mansion)];
    expect(tryFirstWeekVisitor(lastDay, lastDay.entities, lastDay.buildings)).not.toBeNull();

    const tooLate = initGame();
    tooLate.tick = 14 * TICKS_PER_DAY;
    tooLate.buildings = [building(101, BuildingType.House)];
    expect(tryFirstWeekVisitor(tooLate, tooLate.entities, tooLate.buildings)).toBeNull();
    expect(tooLate.firstWeekVisitorSpawned).toBe(false);
  });
});

describe('L34 — recurring events carry instance-unique ids', () => {
  it('does not reuse one id for repeated visitor arrivals', () => {
    const state = initGame();
    state.tick = 7 * TICKS_PER_DAY;
    const first = spawnVisitorGroup(state, state.entities, state.buildings, 'pilgrims');
    state.tick = 21 * TICKS_PER_DAY;
    const second = spawnVisitorGroup(state, state.entities, state.buildings, 'pilgrims');

    // `dismissActiveEvent` (useTransientGameFeedback) keys off this prefix.
    expect(first.id.startsWith('visitor_')).toBe(true);
    expect(second.id).not.toBe(first.id);
  });

  it('does not reuse one id for the same yearly world event in different years', () => {
    const first = yearlyEventAt(100);
    const second = yearlyEventAt(200);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Same seed + same pool ⇒ the same event is picked, so this really compares
    // two instances of one event rather than two different events.
    const baseId = (id: string) => id.replace(/_\d+$/, '');
    expect(baseId(first!.id)).toBe(baseId(second!.id));
    expect(first!.id.endsWith('_100')).toBe(true);
    expect(second!.id.endsWith('_200')).toBe(true);
    expect(second!.id).not.toBe(first!.id);
  });
});

/** Same world, same seeded draw, different tick — the pick must be identical. */
function yearlyEventAt(tick: number): GameEvent | null {
  const state = initGame();
  state.tick = tick;
  setSimSeed(9);
  return rollYearlyWorldEvent(
    state,
    [...state.entities],
    state.buildings,
    state.width,
    state.height,
    () => state.nextEntityId++,
  ).event;
}

describe('groupEvents visitor trade uses the economy owners', () => {
  it('refuses a trade priced in a resource the world does not hold instead of writing NaN', () => {
    const state = worldWithTrader();
    // The private helper read `undefined < cost` as affordable and then deducted
    // NaN into the purse; `canAfford` treats a missing key as 0.
    (state.resources as unknown as Record<string, number | undefined>).gold = undefined;

    const next = tradeWithVisitors(state, 'trader-1', 'buy_food');

    expect(Number.isNaN(next.resources.gold as unknown as number)).toBe(false);
    expect(next.resources.gold).toBeUndefined();
    expect(next.visitorGroups[0]?.tradesCompleted).toBe(0);
    expect(next.floatingTexts.some((f) => f.text.includes('💰'))).toBe(true);
  });

  it('refuses a purchase with no storage headroom before taking any payment (L32)', () => {
    const state = worldWithTrader();
    state.resources.gold = 500;
    state.resources.food = state.storageMax.food;

    const next = tradeWithVisitors(state, 'trader-1', 'buy_food');

    expect(next.resources.gold).toBe(500);
    expect(next.resources.food).toBe(state.resources.food);
    expect(next.visitorGroups[0]?.tradesCompleted).toBe(0);
    expect(
      next.bigNews.some((news) => news.message.includes('not enough storage space')),
    ).toBe(false);
  });
});

describe('L33 — the diplomacy resolver answers through the eligibility owner', () => {
  it('leaves an unaffordable answer open and reports the owner block reason', () => {
    const state = diplomacyWorld('tribute', 10, 0);
    const event = state.pendingDiplomacyEvents![0];
    expect(getDiplomacyChoiceEligibility(state, event, 'pay')).toMatchObject({
      ok: false,
      blockReason: 'Need 30🍖',
    });

    const next = respondToDiplomacyEvent(state, event.id, 'pay');

    expect(next.resources.food).toBe(10);
    expect(next.pendingDiplomacyEvents).toHaveLength(1);
    expect(next.floatingTexts.some((f) => f.text === 'Need 30🍖')).toBe(true);
  });

  it('applies the owner gate to the non-resource militia answer too', () => {
    const state = diplomacyWorld('border_dispute', 100, 100);
    const event = state.pendingDiplomacyEvents![0];
    expect(getDiplomacyChoiceEligibility(state, event, 'militia')).toMatchObject({
      ok: false,
      blockReason: 'Need spears',
    });

    const next = respondToDiplomacyEvent(state, event.id, 'militia');

    expect(next.pendingDiplomacyEvents).toHaveLength(1);
    expect(next.floatingTexts.some((f) => f.text === 'Need spears')).toBe(true);
  });

  it('pays exactly once when the owner says the answer is affordable', () => {
    const state = diplomacyWorld('tribute', 40, 0);
    const event = state.pendingDiplomacyEvents![0];
    expect(getDiplomacyChoiceEligibility(state, event, 'pay').ok).toBe(true);

    const next = respondToDiplomacyEvent(state, event.id, 'pay');

    expect(next.resources.food).toBe(10);
    expect(next.pendingDiplomacyEvents).toHaveLength(0);
  });
});

function diplomacyWorld(
  kind: DiplomacyEvent['kind'],
  food: number,
  gold: number,
): WorldState {
  const event = {
    id: 'dip_1',
    rivalId: 'r1',
    rivalName: 'North Camp',
    kind,
    title: 'A demand',
    description: 'Food requested.',
    emoji: '📜',
    choices: [],
    createdAtTick: 0,
    expiresAtTick: 1000,
  } as DiplomacyEvent;
  const rival = {
    id: 'r1',
    name: 'North Camp',
    campX: 100,
    campY: 100,
    population: 4,
    entityIds: [],
    buildingIds: [],
    relationship: 'neutral',
    foundedYear: 0,
    daysUntilAction: 0,
    raidCooldownDays: 0,
    peaceTreatyDays: 0,
  } as unknown as RivalSettlement;

  return {
    tick: 10,
    resources: { wood: 0, stone: 0, food, gold, iron: 0 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 500 },
    villageReputation: 50,
    humanPopulation: 0,
    unlockedTechs: [],
    researchNodes: [],
    villageForge: { activeOrder: null, progress: 0, completed: {} },
    floatingTexts: [],
    nextFloatingTextId: 1,
    bigNews: [],
    eventLog: [],
    pendingDiplomacyEvents: [event],
    rivalSettlements: [rival],
    buildings: [],
    entities: [],
  } as unknown as WorldState;
}

describe('L15 — barracks occupancy is not pruned by a getter', () => {
  it('counts only live, non-imprisoned soldiers and never rewrites the occupant list', () => {
    const soldier = human(1, { job: JobType.Soldier, homeBuildingId: 8 });
    const deadSoldier = human(2, { job: JobType.Soldier, alive: false, homeBuildingId: 8 });
    const reassigned = human(3, { job: JobType.Settler, homeBuildingId: 8 });
    const barracks = building(8, BuildingType.Barracks, { occupants: [1, 2, 3] });
    const world = {
      entities: [soldier, deadSoldier, reassigned],
      buildings: [barracks],
      tick: 0,
    } as unknown as WorldState;
    const before = [...barracks.occupants];

    expect(getBarracksGuardCount(world, [barracks])).toBe(1);
    // The getter reports; the assignment transition and killHuman repair.
    expect(barracks.occupants).toEqual(before);
  });
});

/** One unguarded prisoner (no guards = 24 unguarded hours) in a completed Prison. */
function prisonWorld(): { world: WorldState; prisoner: Entity; prison: Building } {
  const world = initGame();
  const prisoner = world.entities.find(
    (e) => e.type === EntityType.Human && e.id !== world.villageLeaderId,
  )!;
  const prisonId = 9001;
  prisoner.homeBuildingId = undefined;
  prisoner.prisonBuildingId = prisonId;
  prisoner.prisonerUntilTick = world.tick + 10 * TICKS_PER_DAY;
  prisoner.prisonSentenceCrime = 'scandal';
  const prison = building(prisonId, BuildingType.Prison, { occupants: [prisoner.id] });
  world.buildings = [prison];
  return { world, prisoner, prison };
}

describe('L51 — a prison escape re-syncs the prison occupant list', () => {
  it('drops the escapee from prison.occupants and clears the sentence crime', () => {
    const { world, prisoner, prison } = prisonWorld();
    expect(collectSimulationInvariantErrors(world)).toEqual([]);

    setSimSeed(1);
    let escaped = false;
    for (let day = 0; day < 60 && !escaped; day++) {
      tickPrisonGuardDuty(world);
      escaped = prisoner.prisonBuildingId === undefined;
    }

    expect(escaped).toBe(true);
    expect(prison.occupants).not.toContain(prisoner.id);
    expect(prisoner.prisonSentenceCrime).toBeUndefined();
    // §5 prison invariant: every id in `occupants` is a prisoner or a guard.
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });

  it('is the exact state the prison invariant rejects when the list is left stale', () => {
    const { world, prisoner, prison } = prisonWorld();
    // Pre-fix escape end state: ownership cleared, occupant id left behind.
    prisoner.prisonBuildingId = undefined;
    prisoner.prisonerUntilTick = undefined;

    expect(prison.occupants).toContain(prisoner.id);
    expect(
      collectSimulationInvariantErrors(world).some((e) => e.includes('neither prisoner')),
    ).toBe(true);
  });
});
