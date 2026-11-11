/**
 * Moving food in a visitor trade must reach the economy ledger: the spend goes through
 * `spendFood(state, 'trade', …)` and the store records what storage actually accepted.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { getVisitorTradeTerms, tradeWithVisitors, VISITOR_TRADE_COSTS } from '../src/game/groupEvents';
import { summarizeFoodLedger } from '../src/game/economyLedger';
import type { VisitorGroup, WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_920;
const TRADER_ID = 'trader-1';

function trader(): VisitorGroup {
  return {
    id: TRADER_ID,
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
  };
}

function world(): WorldState {
  const state = initGame({ villageName: 'Ledger', size: 'medium', seed: FIXTURE_SEED });
  state.visitorGroups = [trader()];
  return state;
}

describe('E-2 — visitor-trade food reaches the ledger', () => {
  it('records the food sold to a caravan under the `trade` sink', () => {
    const state = world();
    state.resources.food = 100;
    const sold = VISITOR_TRADE_COSTS.sell_food.pay.food;

    const next = tradeWithVisitors(state, TRADER_ID, 'sell_food');

    expect(next.resources.food).toBe(100 - sold);
    // The sale records its food as a `trade` sink, so the store and ledger agree.
    expect(summarizeFoodLedger(next).consumed).toEqual([{ source: 'trade', amount: sold }]);
    expect(summarizeFoodLedger(next).net).toBe(-sold);
  });

  it('records the food bought from a caravan as produced trade food', () => {
    const state = world();
    state.resources.gold = 500;
    state.resources.food = 0;
    const bought = VISITOR_TRADE_COSTS.buy_food.receive.food;

    const next = tradeWithVisitors(state, TRADER_ID, 'buy_food');

    expect(next.resources.food).toBe(bought);
    expect(summarizeFoodLedger(next).produced).toEqual([{ source: 'trade', amount: bought }]);
    expect(summarizeFoodLedger(next).net).toBe(bought);
  });

  it('credits iron bought from a caravan into the iron store', () => {
    const state = world();
    state.resources.gold = 500;
    state.resources.iron = 0;
    const bought = VISITOR_TRADE_COSTS.buy_iron.receive.iron;

    const next = tradeWithVisitors(state, TRADER_ID, 'buy_iron');
    const goldPaid = getVisitorTradeTerms(state, 'buy_iron').effectivePay.gold ?? 0;

    expect(next.resources.iron).toBe(bought);
    expect(next.resources.gold).toBe(500 - goldPaid);
  });
});
