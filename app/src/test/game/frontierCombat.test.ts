import { describe, expect, it, vi } from 'vitest';
import { initGame } from '@/game/gameEngine';
import type { RivalSettlement } from '@/game/gameTypes';
import type { RaidEvent } from '@/game/frontierCombat';
import {
  cancelPendingRaidsForRival,
  getOutgoingRaidFoodCost,
  getRivalDefenseStrength,
  getRivalRaidStrength,
  resolveCounterRaidRatio,
  respondToRaidEvent,
  launchRaidOnRival,
  respondToOutgoingRaidEvent,
  canLaunchRaidOnRival,
  getOutgoingRaidActionLabel,
  isCounterRaidOnRival,
  rollRivalOutgoingRaidResponse,
  maybeQueueRaid,
  getRaidCasualtyBounds,
  raidEventLoot,
} from '@/game/frontierCombat';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';
import { isRivalAtPeace, signPeaceTreaty } from '@/game/groupEvents';

function minimalRaid(id: string, rivalId: string): RaidEvent {
  return {
    id,
    rivalId,
    rivalName: 'Camp',
    title: 'Raid',
    description: 'Incoming',
    emoji: '⚔️',
    choices: [],
    createdAtTick: 0,
    expiresAtTick: 100,
    marchDistanceTiles: 20,
    attackerStrength: 100,
    lootFood: 40,
    lootGold: 15,
    lootWood: 50,
    lootStone: 20,
  };
}

function mockRival(overrides: Partial<RivalSettlement> = {}): RivalSettlement {
  return {
    id: 'rival_1',
    name: 'Iron Camp',
    campX: 400,
    campY: 400,
    population: 8,
    entityIds: [],
    relationship: 'tense',
    foundedYear: 1,
    daysUntilAction: 30,
    peaceTreatyDays: 0,
    raidCooldownDays: 0,
    buildingIds: [],
    ...overrides,
  };
}

describe('isRivalAtPeace', () => {
  it('is true when peaceTreatyDays > 0', () => {
    expect(isRivalAtPeace(mockRival({ peaceTreatyDays: 10 }))).toBe(true);
    expect(isRivalAtPeace(mockRival({ peaceTreatyDays: 0 }))).toBe(false);
  });
});

describe('cancelPendingRaidsForRival', () => {
  it('removes pending raids for the signed rival', () => {
    const state = initGame();
    state.pendingRaidEvents = [
      minimalRaid('r1', 'rival_1'),
      minimalRaid('r2', 'rival_2'),
    ];
    expect(cancelPendingRaidsForRival(state, 'rival_1')).toBe(true);
    expect(state.pendingRaidEvents).toHaveLength(1);
    expect(state.pendingRaidEvents[0].rivalId).toBe('rival_2');
  });
});

describe('signPeaceTreaty', () => {
  it('cancels pending raids for that rival', () => {
    const state = initGame();
    state.resources = { wood: 100, stone: 100, food: 100, gold: 100 };
    state.rivalSettlements = [mockRival({ relationship: 'competitive' })];
    state.pendingRaidEvents = [minimalRaid('r1', 'rival_1')];

    const next = signPeaceTreaty(state, 'rival_1');
    expect(next.pendingRaidEvents).toHaveLength(0);
    expect(next.rivalSettlements[0].peaceTreatyDays).toBeGreaterThan(0);
  });
});

describe('getRivalRaidStrength / getRivalDefenseStrength', () => {
  it('scales with population and adds home-turf bonus on defense', () => {
    const rival = mockRival({ population: 10, relationship: 'tense' });
    const attack = getRivalRaidStrength(rival);
    const defense = getRivalDefenseStrength(rival);
    expect(defense).toBeGreaterThan(attack);
  });
});

describe('getOutgoingRaidFoodCost', () => {
  it('increases with march distance', () => {
    const near = getOutgoingRaidFoodCost(50);
    const far = getOutgoingRaidFoodCost(200);
    expect(far).toBeGreaterThan(near);
  });
});

describe('getRaidCasualtyBounds', () => {
  it('keeps small-village floors for early raids', () => {
    expect(getRaidCasualtyBounds('victory', 8)).toEqual([1, 2]);
    expect(getRaidCasualtyBounds('heavy', 8)).toEqual([6, 8]);
  });

  it('scales to meaningful losses around year-1 population (~200)', () => {
    expect(getRaidCasualtyBounds('victory', 200)).toEqual([2, 4]);
    expect(getRaidCasualtyBounds('costly', 200)).toEqual([4, 8]);
    expect(getRaidCasualtyBounds('moderate', 200)).toEqual([8, 14]);
    expect(getRaidCasualtyBounds('heavy', 200)).toEqual([15, 26]);
  });
});

describe('resolveCounterRaidRatio', () => {
  it('classifies decisive, meager, and fail tiers', () => {
    expect(resolveCounterRaidRatio(140, 100)).toBe('success');
    expect(resolveCounterRaidRatio(110, 100)).toBe('meager');
    expect(resolveCounterRaidRatio(80, 100)).toBe('fail');
  });
});

describe('respondToRaidEvent', () => {
  it('kills 1–2 defenders even on a decisive militia victory', () => {
    const state = initGame();
    state.resources = { wood: 200, stone: 200, food: 500, gold: 200 };
    state.unlockedTechs = [...state.unlockedTechs, 'defense_2'];
    state.researchNodes = state.researchNodes.map((n) => (
      n.id === 'defense_2' ? { ...n, researched: true } : n
    ));
    state.rivalSettlements = [mockRival()];
    const adults = Array.from({ length: 12 }, (_, i) => {
      const e = createEntity(EntityType.Human, 100 + i, 100, 100 + i, 400, false, {
        gender: i % 2 === 0 ? 'male' : 'female',
        ageYears: 30,
      });
      e.isJuvenile = false;
      return e;
    });
    state.entities = adults;
    state.pendingRaidEvents = [{
      ...minimalRaid('sim_win', 'rival_1'),
      attackerStrength: 40,
      lootFood: 20,
      lootGold: 5,
    }];

    const next = respondToRaidEvent(state, 'sim_win', 'defend');
    const warDeaths = next.eventLog.filter((e) => e.type === 'death' && e.message.includes('fell defending'));
    expect(next.pendingRaidEvents).toHaveLength(0);
    expect(next.eventLog.some((e) => e.type === 'combat' && e.message.includes('routed'))).toBe(true);
    expect(warDeaths.length).toBeGreaterThanOrEqual(1);
    expect(warDeaths.length).toBeLessThanOrEqual(2);
  });

  it('kills many defenders when the militia is overrun', () => {
    const state = initGame();
    state.resources = { wood: 200, stone: 200, food: 500, gold: 200 };
    state.unlockedTechs = [...state.unlockedTechs, 'defense_2'];
    state.researchNodes = state.researchNodes.map((n) => (
      n.id === 'defense_2' ? { ...n, researched: true } : n
    ));
    state.rivalSettlements = [mockRival()];
    const adults = Array.from({ length: 8 }, (_, i) => {
      const e = createEntity(EntityType.Human, 100 + i, 100, 100 + i, 400, false, {
        gender: i % 2 === 0 ? 'male' : 'female',
        ageYears: 30,
      });
      e.isJuvenile = false;
      return e;
    });
    state.entities = adults;
    state.pendingRaidEvents = [{
      ...minimalRaid('sim_defeat', 'rival_1'),
      attackerStrength: 500,
      lootFood: 20,
      lootGold: 5,
    }];

    const next = respondToRaidEvent(state, 'sim_defeat', 'defend');
    const alive = next.entities.filter((e) => e.alive && e.type === EntityType.Human).length;
    const warDeaths = next.eventLog.filter((e) => e.type === 'death' && e.message.includes('fell defending'));
    expect(next.pendingRaidEvents).toHaveLength(0);
    expect(alive).toBeLessThan(8);
    expect(warDeaths.length).toBeGreaterThanOrEqual(6);
    expect(next.eventLog.some((e) => e.type === 'combat' && e.message.includes('overran the militia'))).toBe(true);
    expect(next.eventLog.some((e) => e.type === 'combat' && e.message.includes('fell defending against'))).toBe(true);
    expect(next.resources.food).toBeLessThan(500);
    expect(next.resources.wood).toBeLessThan(200);
    expect(next.resources.gold).toBeLessThan(200);
  });

  it('incoming defeat loots food, wood, stone, and gold', () => {
    const state = initGame();
    state.resources = { wood: 300, stone: 200, food: 500, gold: 200 };
    state.unlockedTechs = [...state.unlockedTechs, 'defense_2'];
    state.researchNodes = state.researchNodes.map((n) => (
      n.id === 'defense_2' ? { ...n, researched: true } : n
    ));
    state.rivalSettlements = [mockRival()];
    state.entities = Array.from({ length: 8 }, (_, i) => {
      const e = createEntity(EntityType.Human, 100 + i, 100, 100 + i, 400, false, {
        gender: i % 2 === 0 ? 'male' : 'female',
        ageYears: 30,
      });
      e.isJuvenile = false;
      return e;
    });
    state.pendingRaidEvents = [{
      ...minimalRaid('loot_test', 'rival_1'),
      attackerStrength: 500,
    }];
    const loot = raidEventLoot(state.pendingRaidEvents[0]);
    const next = respondToRaidEvent(state, 'loot_test', 'defend');
    expect(next.resources.food).toBe(500 - loot.food);
    expect(next.resources.wood).toBe(300 - loot.wood);
    expect(next.resources.stone).toBe(200 - loot.stone);
    expect(next.resources.gold).toBe(200 - loot.gold);
  });
});

describe('outgoing raid labels', () => {
  it('calls a first strike a raid, not a counter-raid', () => {
    const state = initGame();
    state.rivalSettlements = [mockRival()];
    expect(isCounterRaidOnRival(state, 'rival_1')).toBe(false);
    expect(getOutgoingRaidActionLabel(state, 'rival_1').verb).toBe('Raid');
    expect(getOutgoingRaidActionLabel(state, 'rival_1').buttonLabel).toBe('Raid their camp');
  });

  it('calls a retaliation a counter-raid when their war-band is marching', () => {
    const state = initGame();
    state.rivalSettlements = [mockRival()];
    state.pendingRaidEvents = [minimalRaid('raid_1', 'rival_1')];
    expect(isCounterRaidOnRival(state, 'rival_1')).toBe(true);
    expect(getOutgoingRaidActionLabel(state, 'rival_1').verb).toBe('Counter-raid');
    expect(getOutgoingRaidActionLabel(state, 'rival_1').buttonLabel).toBe('Counter-raid their camp');
  });
});

function raidReadyState(counterRaid = false) {
  const state = initGame();
  state.resources = { wood: 100, stone: 100, food: 600, gold: 50 };
  state.unlockedTechs = [...state.unlockedTechs, 'defense_2'];
  state.researchNodes = state.researchNodes.map((n) => (
    n.id === 'defense_2' ? { ...n, researched: true } : n
  ));
  state.rivalSettlements = [mockRival({ population: 4, relationship: 'competitive' })];
  if (counterRaid) {
    state.pendingRaidEvents = [minimalRaid('raid_1', 'rival_1')];
  }
  const adults = Array.from({ length: 20 }, (_, i) => {
    const e = createEntity(EntityType.Human, 100 + i, 100, 200 + i, 400, false, {
      gender: i % 2 === 0 ? 'male' : 'female',
      ageYears: 30,
    });
    e.isJuvenile = false;
    return e;
  });
  state.entities = adults;
  state.humanPopulation = adults.length;
  return state;
}

describe('rollRivalOutgoingRaidResponse', () => {
  it('can offer tribute or choose to fight', () => {
    const rival = mockRival({ relationship: 'competitive' });
    expect(rollRivalOutgoingRaidResponse(200, 100, rival, () => 0)).toBe('payoff_offer');
    expect(rollRivalOutgoingRaidResponse(200, 100, rival, () => 0.99)).toBe('fight');
  });
});

describe('launchRaidOnRival', () => {
  it('dispatches a war-band and waits for player response', () => {
    const state = raidReadyState();
    expect(canLaunchRaidOnRival(state, state.rivalSettlements[0]).ok).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const next = launchRaidOnRival(state, 'rival_1');
    expect(next.pendingOutgoingRaidEvents).toHaveLength(1);
    expect(next.eventLog.some((e) => e.message.includes('dispatched'))).toBe(true);
    expect(next.eventLog.some((e) => e.message.includes('succeeded'))).toBe(false);
  });

  it('logs counter-raid wording when striking back after an incoming raid', () => {
    const state = raidReadyState(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const next = launchRaidOnRival(state, 'rival_1');
    expect(next.eventLog.some((e) => e.message.startsWith('Counter-raid dispatched'))).toBe(true);
    expect(next.pendingOutgoingRaidEvents?.[0]?.isCounterRaid).toBe(true);
  });

  it('queues accept and decline choices when the rival offers tribute', () => {
    const state = raidReadyState();
    let n = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (n++ === 0 ? 0.1 : 0.5));
    const next = launchRaidOnRival(state, 'rival_1');
    const evt = next.pendingOutgoingRaidEvents![0];
    expect(evt.rivalResponse).toBe('payoff_offer');
    expect(evt.choices.map((c) => c.id)).toEqual(['accept_payoff', 'decline_payoff']);
  });

  it('queues fight choice when the rival refuses to negotiate', () => {
    const state = raidReadyState();
    let n = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (n++ === 0 ? 0.99 : 0.5));
    const next = launchRaidOnRival(state, 'rival_1');
    const evt = next.pendingOutgoingRaidEvents![0];
    expect(evt.rivalResponse).toBe('fight');
    expect(evt.choices.map((c) => c.id)).toEqual(['fight']);
  });
});

describe('respondToOutgoingRaidEvent', () => {
  it('grants tribute when the player accepts a payoff offer', () => {
    const state = raidReadyState();
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const launched = launchRaidOnRival(state, 'rival_1');
    const evt = launched.pendingOutgoingRaidEvents![0];
    expect(evt.rivalResponse).toBe('payoff_offer');
    const before = { ...launched.resources };
    const next = respondToOutgoingRaidEvent(launched, evt.id, 'accept_payoff');
    expect(next.pendingOutgoingRaidEvents).toHaveLength(0);
    expect(next.resources.food).toBeGreaterThan(before.food);
    expect(next.eventLog.some((e) => e.message.includes('accepted tribute'))).toBe(true);
    expect(next.eventLog.some((e) => e.message.includes('succeeded'))).toBe(false);
  });

  it('resolves combat when the player declines tribute', () => {
    const state = raidReadyState();
    let n = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (n++ <= 1 ? 0.1 : 0.99));
    const launched = launchRaidOnRival(state, 'rival_1');
    const evt = launched.pendingOutgoingRaidEvents![0];
    const before = { ...launched.resources };
    const next = respondToOutgoingRaidEvent(launched, evt.id, 'decline_payoff');
    expect(next.pendingOutgoingRaidEvents).toHaveLength(0);
    expect(next.resources.wood).toBeGreaterThan(before.wood);
    expect(next.eventLog.some((e) => e.message.includes('succeeded'))).toBe(true);
  });

  it('resolves combat when the rival chose to fight', () => {
    const state = raidReadyState();
    let n = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (n++ === 0 ? 0.99 : 0.99));
    const launched = launchRaidOnRival(state, 'rival_1');
    const evt = launched.pendingOutgoingRaidEvents![0];
    const next = respondToOutgoingRaidEvent(launched, evt.id, 'fight');
    expect(next.pendingOutgoingRaidEvents).toHaveLength(0);
    expect(next.eventLog.some((e) => e.message.includes('succeeded'))).toBe(true);
  });
});

describe('maybeQueueRaid', () => {
  it('does not queue raids from wiped-out rivals', () => {
    const state = initGame();
    const house = state.buildings.find((b) => b.completed);
    if (!house) {
      state.buildings.push({
        id: 99,
        type: 'house' as never,
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        completed: true,
        constructionProgress: 100,
        occupants: [],
        health: 100,
        maxHealth: 100,
        level: 1,
        buildAnimTimer: 0,
        spriteScale: 1,
      });
    }
    const rival = mockRival({ population: 0, relationship: 'tense' });
    state.rivalSettlements = [rival];
    const alive = state.entities.filter((e) => e.alive);

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      maybeQueueRaid(state, rival, alive);
    } finally {
      Math.random = originalRandom;
    }

    expect(state.pendingRaidEvents ?? []).toHaveLength(0);
  });
});