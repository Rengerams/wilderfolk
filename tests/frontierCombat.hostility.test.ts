/**
 * Player-initiated hostility (`provokeRival`) — the frontier stand-off fix.
 *
 * A friendly or welcoming camp refused `launchRaidOnRival` before weapons, population or food were
 * ever considered, and every write of `relationship = 'tense'` in the sim was reactive, so a
 * friendly neighbour could never be attacked. These cases pin the door out of that stand-off.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, RivalSettlement, WorldState } from '../src/game/gameTypes';
import { applyWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
import {
  canLaunchRaidOnRival,
  canProvokeRival,
  getRaidLootScale,
  getRaidGrowthScale,
  RAID_GROWTH_BASE_ADULTS,
  RAID_LOOT_MAX_SCALE,
  provokeRival,
  launchRaidOnRival,
  respondToOutgoingRaidEvent,
  tickPendingOutgoingRaidEvents,
  getOutgoingRaidCasualtyLimit,
  raiseRaidLootToFloor,
} from '../src/game/frontierCombat';
import { tickRivalSettlements } from '../src/game/rivalEvents';
import { createRivalProfile } from '../src/game/rivalProfiles';
import { setSimSeed } from '../src/game/simRng';
import { DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';

const CAMP_X = 600;
const CAMP_Y = 450;

function human(id: number): Entity {
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
    job: JobType.Soldier,
    name: `Settler${id}`,
    maxAge: 90,
    reproductionCooldown: 0,
  } as Entity;
}

function house(id: number): Building {
  return {
    id,
    type: BuildingType.House,
    x: 200,
    y: 200,
    width: 30,
    height: 30,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  } as Building;
}

function rival(overrides: Partial<RivalSettlement> = {}): RivalSettlement {
  return {
    id: 'rival_oakcrossing',
    name: 'OakCrossing',
    campX: 900,
    campY: 700,
    population: 5,
    entityIds: [],
    buildingIds: [],
    relationship: 'friendly',
    foundedYear: 1,
    daysUntilAction: 12,
    raidCooldownDays: 0,
    peaceTreatyDays: 0,
    ...overrides,
  };
}

/** Twelve armed adults, a stocked larder and a completed house — nothing but relations blocks the raid. */
function village(rivals: RivalSettlement[] = [rival()]): WorldState {
  return {
    tick: 0,
    width: 1200,
    height: 900,
    entities: Array.from({ length: 12 }, (_, index) => human(index + 1)),
    buildings: [house(1)],
    humanPopulation: 12,
    resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 30 },
    unlockedTechs: ['defense_2'],
    villageReputation: 40,
    villageName: 'Rivertown',
    rivalSettlements: rivals,
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
    bigNews: [],
    notifications: [],
    dismissedBigNewsIds: [],
    eventLog: [],
    lifetimeStats: { totalResourcesGathered: { food: 0, wood: 0, stone: 0, gold: 0 } },
  } as unknown as WorldState;
}

describe('declaring hostility on a friendly rival', () => {
  it('refuses to raid a friendly camp, and lets the player provoke it instead', () => {
    const world = village();
    const target = world.rivalSettlements[0];

    expect(canLaunchRaidOnRival(world, target).blockReason).toBe('Friendly relations');
    expect(canProvokeRival(world, target).ok).toBe(true);
  });

  it('turns relations tense so the raid gate opens, at a reputation cost', () => {
    const world = village();
    const before = world.villageReputation;

    const provoked = provokeRival(world, 'rival_oakcrossing');

    expect(provoked.rivalSettlements[0].relationship).toBe('tense');
    expect(canLaunchRaidOnRival(provoked, provoked.rivalSettlements[0]).ok).toBe(true);
    expect(provoked.villageReputation).toBeLessThan(before);
    // The world it was handed is untouched: the owner clones, like every other frontier action.
    expect(world.rivalSettlements[0].relationship).toBe('friendly');
  });

  it('refuses a rival whose relations are already tense', () => {
    const world = village([rival({ relationship: 'tense' })]);
    const target = world.rivalSettlements[0];

    expect(canProvokeRival(world, target).ok).toBe(true);
    expect(provokeRival(world, target.id).rivalSettlements[0].relationship).toBe('tense');
  });

  it('walks the command path the UI button uses', () => {
    const world = village();
    const provoked = applyWorkerCommand(world, {
      proto: WORKER_CMD_PROTO,
      op: 'provokeRival',
      rivalId: 'rival_oakcrossing',
    });

    expect(provoked.rivalSettlements[0].relationship).toBe('tense');
    expect(canLaunchRaidOnRival(provoked, provoked.rivalSettlements[0]).ok).toBe(true);
  });

  it('reports no such rival rather than opening the raid gate by accident', () => {
    const world = village();
    expect(canProvokeRival(world, { ...rival({ id: 'rival_ghost' }) }).ok).toBe(false);
    expect(provokeRival(world, 'rival_ghost').rivalSettlements[0].relationship).toBe('friendly');
  });
});

describe('proportional raid casualties', () => {
  it('does not scale our deaths with a huge army facing five weak defenders', () => {
    expect(getOutgoingRaidCasualtyLimit(150, 5, 5, 150)).toBeLessThanOrEqual(1);
    expect(getOutgoingRaidCasualtyLimit(1500, 5, 5, 150)).toBeLessThanOrEqual(1);
    expect(getOutgoingRaidCasualtyLimit(150, 0, 0, 150)).toBe(0);
  });

  it('allows more danger in even or losing battles without excessive losses', () => {
    const overwhelming = getOutgoingRaidCasualtyLimit(150, 5, 5, 150);
    const contested = getOutgoingRaidCasualtyLimit(150, 150, 80, 150);
    expect(contested).toBeGreaterThan(overwhelming);
    expect(contested).toBeLessThanOrEqual(150);
  });
});

describe('mobilized raid lifecycle', () => {
  it('deploys all eligible soldiers and allows recall without instant village defense', () => {
    const world = village([rival({ relationship: 'tense' })]);
    const launched = launchRaidOnRival(world, 'rival_oakcrossing');
    const army = launched.pendingOutgoingRaidEvents[0]!;
    expect(army.phase).toBe('marching');
    expect(army.soldierIds).toHaveLength(12);
    expect(launched.entities.filter((person) => person.raidDeploymentId === army.id)).toHaveLength(12);
    expect(launched.entities.every((person) => person.raidDeploymentId === army.id)).toBe(true);

    const premature = respondToOutgoingRaidEvent(launched, army.id, army.rivalResponse === 'fight' ? 'fight' : 'accept_payoff');
    expect(premature.pendingOutgoingRaidEvents[0]?.phase).toBe('marching');

    launched.tick = army.createdAtTick + Math.floor((army.arrivalAtTick! - army.createdAtTick) / 2);
    const recalled = respondToOutgoingRaidEvent(launched, army.id, 'recall');
    expect(recalled.pendingOutgoingRaidEvents[0]?.phase).toBe('returning');
    expect(recalled.entities.filter((person) => person.raidDeploymentId === army.id)).toHaveLength(12);
    recalled.tick = recalled.pendingOutgoingRaidEvents[0]!.returnAtTick!;
    tickPendingOutgoingRaidEvents(recalled);
    expect(recalled.pendingOutgoingRaidEvents).toHaveLength(0);
    expect(recalled.entities.every((person) => !person.raidDeploymentId)).toBe(true);
  });

  it('reaches the enemy before allowing combat, and then sends survivors home', () => {
    const state = launchRaidOnRival(village([rival({ relationship: 'tense' })]), 'rival_oakcrossing');
    const event = state.pendingOutgoingRaidEvents[0]!;
    state.tick = event.arrivalAtTick!;
    tickPendingOutgoingRaidEvents(state);
    const result = event.rivalResponse === 'fight'
      ? state
      : respondToOutgoingRaidEvent(state, event.id, 'accept_payoff');
    if (event.rivalResponse === 'fight') {
      expect(result.pendingOutgoingRaidEvents[0]?.phase).toBe('fighting');
      expect(result.pendingOutgoingRaidEvents[0]?.battleChronicle?.length).toBeGreaterThan(0);
      result.tick += 6 * TICKS_PER_HOUR;
      tickPendingOutgoingRaidEvents(result);
    }
    expect(result.pendingOutgoingRaidEvents[0]?.phase).toBe('returning');
    expect(result.entities.some((person) => person.alive && person.raidDeploymentId === event.id)).toBe(true);
    result.tick = result.pendingOutgoingRaidEvents[0]!.returnAtTick!;
    tickPendingOutgoingRaidEvents(result);
    expect(result.entities.every((person) => !person.raidDeploymentId)).toBe(true);
  });

  it('streams factual text commentary in chronological stages without replaying deaths', () => {
    const world = launchRaidOnRival(village([rival({ relationship: 'tense' })]), 'rival_oakcrossing');
    let raid = world.pendingOutgoingRaidEvents![0]!;
    world.tick = raid.arrivalAtTick!;
    tickPendingOutgoingRaidEvents(world);
    if (raid.rivalResponse !== 'fight') {
      const fighting = respondToOutgoingRaidEvent(world, raid.id, 'decline_payoff');
      Object.assign(world, fighting);
      raid = world.pendingOutgoingRaidEvents[0];
    }

    const started = raid.battleStartedAtTick!;
    expect(raid.battleChronicle).toHaveLength(1);
    world.tick = started + 2 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    expect(raid.battleChronicle).toHaveLength(2);
    const halfHour = [...raid.battleChronicle!];
    tickPendingOutgoingRaidEvents(world);
    expect(raid.battleChronicle).toEqual(halfHour);

    world.tick = started + 3 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    expect(raid.battleChronicle).toHaveLength(3);
    expect(raid.battleCasualtiesApplied).toBe(true);
    expect(raid.battleChronicle![2]).toMatch(/Fallen in the fighting|no village deaths confirmed/);
    const deadAtMidpoint = world.entities.filter((person) => !person.alive).length;
    tickPendingOutgoingRaidEvents(world);
    expect(world.entities.filter((person) => !person.alive)).toHaveLength(deadAtMidpoint);

    world.tick = started + 5 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    expect(raid.battleChronicle).toHaveLength(4);

    world.tick = started + 6 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    expect(raid.phase).toBe('returning');
    expect(raid.battleChronicle).toHaveLength(5);
    const graveCount = world.graveRecords?.length ?? 0;
    tickPendingOutgoingRaidEvents(world);
    expect(world.graveRecords?.length ?? 0).toBe(graveCount);
  });

  it('does not allow a war declaration during an active treaty', () => {
    const state = village([rival({ relationship: 'neutral', peaceTreatyDays: 14 })]);
    expect(canProvokeRival(state, state.rivalSettlements[0]!).ok).toBe(false);
  });
});

/** The growth roll the rival day pulse asks — a healthy larder feeds a camp, an empty one does not. */
describe('rival camps grow from their own stores', () => {
  function growWorld(food: number, days: number): WorldState {
    // Legacy local actors retire on the first pulse; strategic population remains authoritative.
    const founders = Array.from({ length: 5 }, (_, index) => human(index + 1));
    for (const founder of founders) {
      founder.faction = 'rival';
      founder.groupId = 'rival_oakcrossing';
    }
    const camp = rival({ entityIds: founders.map((founder) => founder.id), foundedYear: 0 });
    // Unrelated player houses survive cleanup even when legacy metadata references their ids.
    const campBuildings = Array.from({ length: 7 }, (_, index) => house(index + 100));
    camp.buildingIds = campBuildings.map((building) => building.id);
    camp.profile = {
      ...createRivalProfile(3, 'friendly'),
      ledger: { food, wood: 8, gold: 13, morale: 70, recovery: 67 },
    };
    const world = {
      ...village([camp]),
      tick: 0,
      year: 2,
      dayInYear: 0,
      entities: founders,
      buildings: campBuildings,
      humanPopulation: 10,
      pendingDiplomacyEvents: [],
      nextEntityId: 500,
      nextBuildingId: 500,
      lifetimeStats: { totalResourcesGathered: { food: 0, wood: 0, stone: 0, gold: 0 } },
    } as unknown as WorldState;
    for (let day = 0; day < days; day++) {
      // The pulse is a *new-calendar-day* hook, so the loop advances whole days, not ticks.
      world.tick += TICKS_PER_DAY;
      world.dayInYear = (world.dayInYear + 1) % DAYS_PER_YEAR;
      tickRivalSettlements(world, world.entities, {
        pushNews: () => {},
        pushFloat: () => {},
        logEvent: () => {},
        tickPendingDiplomacyEvents: () => {},
        queueDiplomacyEvent: () => {},
        killWildGameForPoach: () => {},
      });
    }
    return world;
  }

  it('gains settlers on its own cadence when the larder supports them', () => {
    setSimSeed(4242);
    const world = growWorld(90, 240);

    expect(world.rivalSettlements[0].population).toBeGreaterThan(5);
  });

  it('stays put when the larder is empty, however long you wait', () => {
    setSimSeed(4242);
    const world = growWorld(0, 240);

    expect(world.rivalSettlements[0].population).toBe(5);
  });

  it('never grows past the ceiling the rule sets', () => {
    setSimSeed(99);
    const world = growWorld(200, 1200);

    expect(world.rivalSettlements[0].population).toBeLessThanOrEqual(12);
  });
});

/**
 * Raid pressure and prize. The measured complaint: a 1 663-settler colony was raided at 54 strength,
 * a 523:1 ratio, for 43 food out of ~14 800 — nothing at stake in either direction.
 */
describe('raid prize scales with what is at stake', () => {
  it('keeps the colony-side raid multiple linear, so a big village is never a walkover', () => {
    const base = RAID_GROWTH_BASE_ADULTS;

    expect(getRaidGrowthScale(base)).toBe(1);
    // `frontierCombat.raidGold.test.ts` pins this contract: militia grows with the same adults, so
    // the ratio is flat by design. Escalation is the camp's own growth, not this multiplier.
    expect(getRaidGrowthScale(base * 16)).toBe(16);
    expect(getRaidGrowthScale(Number.NaN)).toBe(1);
  });

  it('carries the prize with the raid but never past its own ceiling', () => {
    expect(getRaidLootScale(1)).toBe(1);
    expect(getRaidLootScale(2.5)).toBe(2.5);
    expect(getRaidLootScale(50)).toBe(RAID_LOOT_MAX_SCALE);
    expect(getRaidLootScale(Number.NaN)).toBe(1);
  });

  it('never lets a small camp take more than the stores are holding', () => {
    const lean = { ...village(), resources: { wood: 100, stone: 50, food: 40, gold: 10, iron: 0 } } as WorldState;
    const floor = raiseRaidLootToFloor({ food: 500, wood: 500, stone: 500, gold: 500 }, lean);

    expect(floor).toEqual({ food: 40, wood: 100, stone: 50, gold: 10 });
  });

  it('raises a rolled prize to the floor but never lowers it', () => {
    const rich = { ...village(), resources: { wood: 20_000, stone: 10_000, food: 14_800, gold: 20_000, iron: 0 } } as WorldState;

    const raised = raiseRaidLootToFloor({ food: 43, wood: 50, stone: 27, gold: 6 }, rich);
    expect(raised.food).toBe(74);
    expect(raised.wood).toBe(100);
    expect(raised.stone).toBe(50);
    expect(raised.gold).toBe(400);

    const already = raiseRaidLootToFloor({ food: 900, wood: 900, stone: 900, gold: 900 }, rich);
    expect(already).toEqual({ food: 900, wood: 900, stone: 900, gold: 900 });
  });
});
