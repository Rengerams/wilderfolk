import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { tradeWithVisitors } from '@/game/groupEvents';
import type { VisitorGroup } from '@/game/gameTypes';

function testTraderGroup(id = 'visitor_test'): VisitorGroup {
  return {
    id,
    name: 'Wandering Merchants',
    kind: 'traders',
    campX: 100,
    campY: 100,
    daysLeft: 5,
    entityIds: [],
    tradesCompleted: 0,
    giftsGiven: 0,
    refugeeResolved: false,
    leaderTalked: false,
  };
}

describe('tradeWithVisitors', () => {
  it('does not deduct gold when food storage is full on buy_food', () => {
    const state = initGame();
    state.resources.gold = 100;
    state.resources.food = state.storageMax.food;

    const group = testTraderGroup();
    state.visitorGroups = [group];

    const goldBefore = state.resources.gold;
    const foodBefore = state.resources.food;

    const next = tradeWithVisitors(state, group.id, 'buy_food');

    expect(next.resources.gold).toBe(goldBefore);
    expect(next.resources.food).toBe(foodBefore);
  });

  it('completes buy_food when storage has room', () => {
    const state = initGame();
    state.resources.gold = 100;
    state.resources.food = 0;
    state.storageMax.food = 200;

    const group = testTraderGroup();
    state.visitorGroups = [group];

    const next = tradeWithVisitors(state, group.id, 'buy_food');

    expect(next.resources.gold).toBe(75);
    expect(next.resources.food).toBe(40);
  });
});