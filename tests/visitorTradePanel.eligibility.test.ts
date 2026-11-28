import { formatResourceAmounts } from '../src/game/resourceTypes';
import { MapSize } from '../src/game/gameTypes';
/**
 * The visitor trade buttons must be gated by the owner `groupEvents.getVisitorTradeEligibility`, which
 * also rejects a leaving caravan, a group out of gold, and insufficient storage for what it receives.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  getRefugeeChoiceEligibility,
  getVisitorTradeEligibility,
  getVisitorTradeTerms,
  VISITOR_TRADE_COSTS,
} from '../src/game/groupEvents';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;
const GROUP_ID = 'visitors-1';
/** Small gold cap so "the store cannot take the payment" is one assignment away. */
const GOLD_CAP = 100;

function worldWithTrader(options: { gold?: number; daysLeft?: number; groupGold?: number } = {}): WorldState {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const { gold = 500, daysLeft = 3, groupGold = 500 } = options;
  state.storageMax.gold = GOLD_CAP;
  state.resources.gold = gold;
  state.resources.food = 400;
  state.visitorGroups = [
    {
      id: GROUP_ID,
      name: 'Traders',
      kind: 'traders',
      daysLeft,
      gold: groupGold,
      campX: 100,
      campY: 100,
    } as never,
  ];
  return state;
}

function worldWithRefugees(options: { food?: number; maxPopulation?: number } = {}): WorldState {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const { food = 100, maxPopulation = 500 } = options;
  state.resources.food = food;
  state.maxHumanPopulation = maxPopulation;
  state.visitorGroups = [
    {
      id: GROUP_ID,
      name: 'Refugees',
      kind: 'refugees',
      daysLeft: 3,
      gold: 0,
      campX: 100,
      campY: 100,
    } as never,
  ];
  return state;
}

describe('legacy visitor trade eligibility', () => {
  it('quotes prices from the owner, not from a second implementation', () => {
    const state = worldWithTrader();
    state.villageReputation = 100; // >= 80 → 0.8 on gold paid, 1.15 on gold received
    expect(getVisitorTradeTerms(state, 'buy_food').effectivePay.gold).toBe(20);
    expect(getVisitorTradeTerms(state, 'buy_food').effectiveReceive.food).toBe(40);
    expect(getVisitorTradeTerms(state, 'sell_food').effectiveReceive.gold).toBe(28); // floor(25 × 1.15)
    expect(getVisitorTradeTerms(state, 'sell_wood').effectivePay.wood).toBe(40);

    // The catalogue the owner reads is the one the panel must not re-derive.
    expect(VISITOR_TRADE_COSTS.buy_food.pay.gold).toBe(25);
    expect(VISITOR_TRADE_COSTS.sell_food.pay.food).toBe(30);
    expect(VISITOR_TRADE_COSTS.buy_iron.receive.iron).toBe(12);
    expect(VISITOR_TRADE_COSTS.sell_iron.pay.iron).toBe(15);
  });

  it('refuses a sale the store cannot take, which is why the button must be disabled', () => {
    const state = worldWithTrader({ gold: GOLD_CAP });
    const gate = getVisitorTradeEligibility(state, GROUP_ID, 'sell_food');
    expect(gate.ok).toBe(false);
    expect(gate.blockReason).toBe('Cannot store more gold');

    const roomy = worldWithTrader({ gold: 0 });
    expect(getVisitorTradeEligibility(roomy, GROUP_ID, 'sell_food').ok).toBe(true);
  });

  it('refuses a leaving caravan and a group with no gold', () => {
    const leaving = worldWithTrader({ daysLeft: 0 });
    expect(getVisitorTradeEligibility(leaving, GROUP_ID, 'sell_food').blockReason).toBe('The caravan is leaving');

    const broke = worldWithTrader({ groupGold: 0 });
    const gate = getVisitorTradeEligibility(broke, GROUP_ID, 'sell_food');
    expect(gate.ok).toBe(false);
    expect(gate.blockReason).toBe('They are out of gold');
  });


});

/**
 * Refugee choice buttons read `getRefugeeChoiceEligibility` for both price and reason, so a refusal
 * names which gate failed instead of surfacing as a floating text at the camp.
 */
describe('legacy refugee choice eligibility (R5)', () => {
  it('prices each offer from the owner and names the reason it refuses', () => {
    const poor = worldWithRefugees({ food: 39 });
    const welcome = getRefugeeChoiceEligibility(poor, GROUP_ID, 'welcome');
    expect(welcome.ok).toBe(false);
    expect(welcome.blockReason).toBe('Need 40🍖');
    // The cheaper offer is still affordable at 39 food — the two gates are not one threshold.
    expect(getRefugeeChoiceEligibility(poor, GROUP_ID, 'screen').ok).toBe(true);

    const rich = worldWithRefugees({ food: 100, maxPopulation: 0 });
    expect(getRefugeeChoiceEligibility(rich, GROUP_ID, 'welcome').blockReason).toBe('Population cap reached');
    expect(getRefugeeChoiceEligibility(rich, GROUP_ID, 'screen').blockReason).toBe('Population cap reached');
  });

  it('always allows turning a group away', () => {
    const state = worldWithRefugees({ food: 0, maxPopulation: 0 });
    expect(getRefugeeChoiceEligibility(state, GROUP_ID, 'turn_away').ok).toBe(true);
  });


});

describe('Stone trade and resource amount formatting', () => {
  /**
   * A minimal world with a player trader and the given store, built from `initGame` so every field the
   * owners read exists. The trader is the shared fixture for the two stone-trade cases.
   */
  function traderWorld(resources: Partial<WorldState['resources']> = {}): WorldState {
    const world = initGame({ villageName: 'Stone', seed: 20260921, size: MapSize.Medium });
    world.visitorGroups = [
      {
        id: 'trader-1',
        name: 'Traders',
        kind: 'traders',
        daysLeft: 3,
        gold: 500,
        campX: 100,
        campY: 100,
        tradesCompleted: 0,
        giftsGiven: 0,
      } as unknown as WorldState['visitorGroups'][number],
    ];
    world.resources = { wood: 100, stone: 100, food: 100, gold: 500, iron: 50, ...resources };
    world.storageMax = { wood: 5000, stone: 5000, food: 5000, gold: 5000, iron: 5000 };
    return world;
  }

  describe('visitor trade can buy and sell stone (audit: no stone route to a caravan)', () => {
    it('quotes both stone actions from the owner', () => {
      // Reputation deliberately at the neutral band, so the multipliers are 1 and the raw catalogue
      // prices are what these assertions read.
      const world = traderWorld();
      world.villageReputation = 50;
      const buy = getVisitorTradeTerms(world, 'buy_stone');
      expect(buy.effectivePay.gold).toBe(20);
      expect(buy.effectiveReceive.stone).toBe(25);

      const sell = getVisitorTradeTerms(world, 'sell_stone');
      expect(sell.effectivePay.stone).toBe(35);
      expect(sell.effectiveReceive.gold).toBe(20);
    });

    it('gates them like every other action — price, then what the store can take', () => {
      const affordable = traderWorld({ gold: 100 });
      affordable.villageReputation = 50;
      expect(getVisitorTradeEligibility(affordable, 'trader-1', 'buy_stone').ok).toBe(true);

      const broke = traderWorld({ gold: 0 });
      broke.villageReputation = 50;
      const brokeGate = getVisitorTradeEligibility(broke, 'trader-1', 'buy_stone');
      expect(brokeGate.ok).toBe(false);
      expect(brokeGate.blockReason).toBe('Need 20💰');

      // Selling needs the stone *and* room for the gold it pays — the same two-sided gate as sell_iron.
      const noStone = traderWorld({ stone: 0 });
      noStone.villageReputation = 50;
      expect(getVisitorTradeEligibility(noStone, 'trader-1', 'sell_stone').ok).toBe(false);

      const fullPurse = traderWorld();
      fullPurse.villageReputation = 50;
      fullPurse.storageMax.gold = 500;
      fullPurse.resources.gold = 500;
      const fullGate = getVisitorTradeEligibility(fullPurse, 'trader-1', 'sell_stone');
      expect(fullGate.ok).toBe(false);
      expect(fullGate.blockReason).toBe('Cannot store more gold');
    });

    it('retains both legacy stone trade command keys in the catalogue', () => {
      // The command validator derives its accepted actions from this table, so an action missing here
      // is rejected as an invalid `WorkerCommand` before it reaches the owner.
      expect(Object.keys(VISITOR_TRADE_COSTS)).toContain('buy_stone');
      expect(Object.keys(VISITOR_TRADE_COSTS)).toContain('sell_stone');


    });
  });

  describe('a multi-resource trade float names every resource, not only the last', () => {
    it('accumulates instead of overwriting', () => {
      // The two-resource trade bundles are why the float accumulates; the formatter is what it now
      // reads, so this pins the exact string a two-resource deal produces.
      expect(formatResourceAmounts({ gold: 30, iron: 15 })).toBe('30 💰 · 15 🔩');
      expect(formatResourceAmounts({ stone: 80, gold: 60 })).toBe('80 🪨 · 60 💰');
      // A single-resource deal is unchanged from the old `+N<emoji>` shape apart from the separator.
      expect(formatResourceAmounts({ wood: 30 })).toBe('30 🪵');
      expect(formatResourceAmounts({})).toBe('');
    });


  });
});
