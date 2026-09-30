/**
 * Low-severity simulation-audit fixes (2026-09-13) — combat, disasters, ecology,
 * the daily economy ledger and yearly statistics.
 *
 * See BUG_REPORTS/2026-09-13-simulation-logic-audit.md: L17, L18, L19, L20, L26, L27,
 * L56, L57, L69, L79 and the two cross-cutting frontierCombat items.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, GameEventLog, OutgoingRaidEvent, RivalSettlement, WorldState } from '../src/game/gameTypes';
import {
  countArmedMilitia,
  respondToOutgoingRaidEvent,
  tickPendingOutgoingRaidEvents,
} from '../src/game/frontierCombat';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { applyEarthquakeDamageToBuildings } from '../src/game/worldEvents';
import { computeRawEcologyStress, tickValleyEcologyStage } from '../src/game/ecologyStage';
import { ValleyEcology } from '../src/game/gameConstants';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { updateStorageCaps } from '../src/game/economy';
import { ECONOMY_SOURCE_LABELS, recordFoodProduced, rollEconomyLedgerForDay } from '../src/game/economyLedger';
import { recordYearlyStats } from '../src/game/stats';
import { maybeOfferRumourLedger } from '../src/game/rumourLedger';
import { storyFlag } from '../src/game/storyHelpers';
import { applyRivalDailyAction, createRivalProfile, selectRivalDailyAction } from '../src/game/rivalProfiles';

function world(seed = 7): WorldState {
  return initGame({ villageName: 'Testholm', size: 'medium', seed });
}

function building(id: number, x: number, y: number, over: Partial<Building> = {}): Building {
  return {
    id,
    type: BuildingType.House,
    x,
    y,
    width: 60,
    height: 48,
    rotation: 0,
    completed: true,
    faction: 'player',
    occupants: [],
    constructionProgress: 100,
    level: 1,
    spriteScale: 1,
    health: 100,
    maxHealth: 100,
    ...over,
  } as never;
}

function rival(): RivalSettlement {
  return {
    id: 'rival-one',
    name: 'North Camp',
    campX: 50,
    campY: 50,
    population: 6,
    entityIds: [],
    buildingIds: [],
    relationship: 'neutral',
    foundedYear: 0,
    daysUntilAction: 10,
    raidCooldownDays: 10,
    peaceTreatyDays: 0,
  };
}

function outgoingEvent(over: Partial<OutgoingRaidEvent> = {}): OutgoingRaidEvent {
  return {
    id: 'out_1',
    rivalId: 'rival-one',
    rivalName: 'North Camp',
    title: 'Raid',
    description: 'Raid',
    emoji: '🏹',
    choices: [],
    createdAtTick: 0,
    expiresAtTick: 1000,
    marchDistanceTiles: 10,
    isCounterRaid: false,
    rivalResponse: 'payoff_offer',
    attackerStrength: 100,
    defenderStrength: 50,
    lootFood: 40,
    lootGold: 10,
    lootWood: 20,
    lootStone: 5,
    ...over,
  };
}

describe('frontierCombat raid spoils (L26, cross-cutting storage-cap clamps)', () => {
  it('never subtracts stores that already sit above the storage cap', () => {
    const state = world();
    state.rivalSettlements = [rival()];
    state.resources.food = state.storageMax.food + 60;
    state.resources.wood = state.storageMax.wood - 10;
    const overCapFood = state.resources.food;
    const event = outgoingEvent({ rivalResponse: 'payoff_offer' });
    state.pendingOutgoingRaidEvents = [event];

    const after = respondToOutgoingRaidEvent(state, event.id, 'accept_payoff');

    // Over-cap stock is left untouched (the old Math.min(room, spoils) removed it)…
    expect(after.resources.food).toBe(overCapFood);
    // …while a capped store still takes only the headroom that exists.
    expect(after.resources.wood).toBe(after.storageMax.wood);
    expect(after.pendingOutgoingRaidEvents ?? []).toHaveLength(0);
  });
});

describe('frontierCombat big news (L27)', () => {
  it('mints unique big-news ids when two notices fire on one capped tick', () => {
    const state = world();
    state.tick = 500;
    state.bigNews = Array.from({ length: 50 }, (_, i) => ({
      id: `seed_${i}`,
      title: 'Earlier news',
      message: 'Earlier news',
      type: 'neutral' as const,
      createdAt: 0,
      dismissed: false,
    }));
    state.pendingOutgoingRaidEvents = [
      outgoingEvent({ id: 'expired_a', rivalId: 'absent_a', rivalName: 'Camp A', expiresAtTick: 500, rivalResponse: 'fight' }),
      outgoingEvent({ id: 'expired_b', rivalId: 'absent_b', rivalName: 'Camp B', expiresAtTick: 500, rivalResponse: 'fight' }),
    ];

    tickPendingOutgoingRaidEvents(state);

    const ids = state.bigNews.map((n) => n.id);
    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    expect(ids.filter((id) => id.startsWith('bn_'))).toHaveLength(2);
  });
});

describe('frontierCombat militia count (cross-cutting dead militia rule)', () => {
  it('counts militia through the militia owner instead of a local arming rule', () => {
    const state = world();
    const ownerCount = computeMilitiaBreakdown(state, state.entities, { includeStructures: false }).adultCount;
    expect(ownerCount).toBeGreaterThan(0);
    expect(countArmedMilitia(state, state.entities)).toBe(ownerCount);
  });
});

describe('worldEvents earthquake (L79)', () => {
  it('damages only completed player buildings inside the quake radius', () => {
    const inside = building(1, 100, 100);
    const justInside = building(2, 140, 100);
    const justOutside = building(3, 180, 100);
    const rivalInside = building(4, 105, 100, { faction: 'rival' as never });
    const unfinishedInside = building(5, 110, 100, { completed: false as never });

    const damaged = applyEarthquakeDamageToBuildings(
      [inside, justInside, justOutside, rivalInside, unfinishedInside],
      100,
      100,
      60,
      1,
    );

    expect(damaged).toEqual([inside, justInside]);
    expect(inside.health).toBe(85);
    expect(justInside.health).toBe(85);
    expect(justOutside.health).toBe(100);
    expect(rivalInside.health).toBe(100);
    expect(unfinishedInside.health).toBe(100);
  });
});

describe('valley ecology stage (L17, L18)', () => {
  const valleySwitch = ValleyEcology as unknown as { ENABLED: boolean };
  let valleyWasEnabled = false;

  beforeEach(() => {
    valleyWasEnabled = valleySwitch.ENABLED;
    valleySwitch.ENABLED = true;
  });

  afterEach(() => {
    valleySwitch.ENABLED = valleyWasEnabled;
  });

  function quietValley(state: WorldState): void {
    state.buildings = [];
    state.wildlifeCounts = { ...state.wildlifeCounts, deer: 1, rabbits: 2, wolves: 3, wildkin: 0, grass: 120 };
    state.pollutionLevel = 0;
  }

  it('suppresses a recovery notice inside the notify cooldown', () => {
    const state = world();
    quietValley(state);
    state.ecosystemHealth = 10; // footprint driver is bad → raw stress 2
    state.valleyStage = 'stable';
    state.valleyStageSinceDay = 0;
    state.valleyLastStageNotifyDay = -999;
    state.valleyRawStressStreakDays = 3; // CONFIRM_UP_DAYS
    state.valleyRawCalmStreakDays = 0;
    state.tick = TICKS_PER_DAY * 20;
    state.eventLog = [];
    state.notifications = [];
    expect(computeRawEcologyStress(state).stressLevel).toBe(2);

    tickValleyEcologyStage(state);
    expect(state.valleyStage).toBe('strained');
    expect(state.valleyLastStageNotifyDay).toBe(20);
    expect(state.notifications.length).toBeGreaterThan(0);

    // Next day the valley recovers one step — one day after the notice, inside the 3-day cooldown.
    state.tick = TICKS_PER_DAY * 21;
    state.ecosystemHealth = 100;
    state.valleyRawStressStreakDays = 0;
    state.valleyRawCalmStreakDays = 2; // RECOVERY_LAG_DAYS
    expect(computeRawEcologyStress(state).stressLevel).toBe(0);
    const notificationsBefore = state.notifications.length;
    const eventsBefore = state.eventLog.length;

    tickValleyEcologyStage(state);

    expect(state.valleyStage).toBe('stable');
    expect(state.notifications.length).toBe(notificationsBefore);
    expect(state.eventLog.length).toBe(eventsBefore);
  });

  it('keeps the grazing driver capped at bad under extreme pressure', () => {
    const state = world();
    state.entities = []; // no living grass to regrow
    state.wildlifeCounts = { ...state.wildlifeCounts, deer: 5000, rabbits: 0, wildkin: 0, wolves: 0, grass: 1 };

    const grazing = computeRawEcologyStress(state).drivers.find((d) => d.id === 'grazing');

    expect(grazing?.stress).toBe(2);
    expect(grazing?.band).toBe('bad');
  });
});

describe('economy storage caps (L19)', () => {
  function capsWorld(): WorldState {
    return {
      buildings: [],
      storageMax: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
      foodSpoilageRate: 0,
    } as unknown as WorldState;
  }

  function capsBuilding(w: WorldState, type: BuildingType): void {
    w.buildings.push({ id: w.buildings.length + 1, type, x: 0, y: 0, completed: true, faction: 'player', level: 1 } as never);
  }

  it('lets one Silo reach the formula 0.8% spoilage instead of clamping it to 1%', () => {
    const w = capsWorld();
    capsBuilding(w, BuildingType.Silo);
    updateStorageCaps(w);
    expect(w.foodSpoilageRate).toBeCloseTo(0.008, 5);
  });
});

describe('economy ledger (L20 and source labels)', () => {
  it('rolls the raw ledger field at the day boundary and archives the finished day', () => {
    const state = world();
    state.tick = TICKS_PER_DAY * 10;
    recordFoodProduced(state, 'farms', 25);
    expect(state.economyLedger?.day).toBe(10);
    const historyBefore = state.foodHistory?.length ?? 0;

    state.tick = TICKS_PER_DAY * 11;
    rollEconomyLedgerForDay(state);

    expect(state.economyLedger?.day).toBe(11);
    expect(state.economyLedger?.produced).toEqual({});
    expect(state.economyLedger?.consumed).toEqual({});
    expect(state.foodHistory?.length).toBe(historyBefore + 1);
    const history = state.foodHistory ?? [];
    expect(history[history.length - 1]).toEqual({
      day: 10,
      produced: { farms: 25 },
      consumed: {},
    });

    // Idempotent: a second call in the same day must not archive again.
    rollEconomyLedgerForDay(state);
    expect(state.foodHistory?.length).toBe(historyBefore + 1);
  });

  it('labels every food source the simulation records', () => {
    // Sources passed to recordFoodProduced/recordFoodConsumed in src/game.
    const recordedSources = ['farms', 'hunting', 'fishing', 'greenhouse', 'silos', 'challenges', 'meals', 'medicine'];
    for (const source of recordedSources) {
      expect(ECONOMY_SOURCE_LABELS[source], `missing ledger label for "${source}"`).toBeTruthy();
    }
  });
});

describe('yearly statistics (L69)', () => {
  it('reports the per-year upgrade delta, not last year delta against the cumulative total', () => {
    const state = world();
    state.buildings = [building(1, 100, 100, { level: 3 })];

    const year1 = recordYearlyStats(state, 1);
    state.yearlyStats.push(year1);
    const year2 = recordYearlyStats(state, 2);
    state.yearlyStats.push(year2);
    const year3 = recordYearlyStats(state, 3);

    expect(year1.buildings.upgraded).toBe(2);
    expect(year2.buildings.upgraded).toBe(0);
    expect(year3.buildings.upgraded).toBe(0);
    expect(year3.buildings.upgradedTotal).toBe(2);
  });
});

describe('rumour ledger source scan (L57)', () => {
  it('reads the newest matching event and records that event id', () => {
    const state = world();
    state.year = 2;
    state.dayInYear = 0;
    state.tick = TICKS_PER_DAY * 720;
    state.buildings.push(building(1, 100, 100, { type: BuildingType.TownHall }));
    state.pendingStoryEvents = [];
    state.storyFlags = {};
    const newest: GameEventLog = { id: 777, tick: 700, year: 2, day: 0, type: 'combat', message: 'Raiders repelled at the palisade' };
    const middle: GameEventLog = { id: 500, tick: 400, year: 1, day: 40, type: 'trade', message: 'A caravan arrived' };
    const oldest: GameEventLog = { id: 11, tick: 10, year: 0, day: 10, type: 'birth', message: 'A child was born' };
    state.eventLog = [newest, middle, oldest];

    maybeOfferRumourLedger(state);

    // SOURCE_KINDS order: family, civic, ecology, frontier, scandal → frontier is 4.
    expect(storyFlag(state, 'rumour_ledger_source_kind')).toBe(4);
    expect(storyFlag(state, 'rumour_ledger_source_event')).toBe(777);
  });
});

describe('rival daily actions (L56)', () => {
  it('only chooses fortify for a shelter rival that can pay the 12 wood', () => {
    const profile = createRivalProfile(2, 'neutral');
    profile.priority = 'shelter';
    profile.ledger.recovery = 100;
    profile.ledger.food = 100;
    profile.ledger.wood = 8;

    // 8 wood cannot pay the action's 12-wood cost, so the rival must not waste the day.
    expect(selectRivalDailyAction(profile, 'neutral', () => 0.99)).toBe('gather');

    profile.ledger.wood = 12;
    expect(selectRivalDailyAction(profile, 'neutral', () => 0.99)).toBe('fortify');
    expect(applyRivalDailyAction(profile, 'fortify').changed).toBe(true);
  });
});
