import { describe, expect, it } from 'vitest';
import { EntityType, type Entity } from '../src/game/gameTypes';
import { canMoonHowlerCurse } from '../src/game/moonHowler';
import { clearHuntersTargetingPrey } from '../src/game/simulation/simulationEntities';

function human(faction?: Entity['faction']): Entity {
  return {
    id: 1, alive: true, type: EntityType.Human, age: 30,
    isJuvenile: false, faction, moonHowlerCursed: false,
  } as Entity;
}

describe('foreign curse eligibility and prey removal cleanup', () => {
  it('allows only player settlers to acquire the Moon Howler curse', () => {
    expect(canMoonHowlerCurse(human())).toBe(true);
    expect(canMoonHowlerCurse(human('visitor'))).toBe(false);
    expect(canMoonHowlerCurse(human('rival'))).toBe(false);
    expect(canMoonHowlerCurse(human('trade_caravan'))).toBe(false);
  });

  it('clears a departing deer from both target-index and same-tick hunter buckets', () => {
    const indexed = { id: 2, alive: true, type: EntityType.Wolf, huntTargetId: 9 } as Entity;
    const acquiredLater = { id: 3, alive: true, type: EntityType.Human, huntTargetId: 9 } as Entity;
    const byId = new Map([[2, indexed], [3, acquiredLater]]);
    const byType = { [EntityType.Wolf]: [indexed], [EntityType.Human]: [acquiredLater] };
    const targetIndex = new Map([[9, new Set([2])]]);
    clearHuntersTargetingPrey(9, byId, targetIndex, byType);
    expect(indexed.huntTargetId).toBeUndefined();
    expect(acquiredLater.huntTargetId).toBeUndefined();
    expect(targetIndex.has(9)).toBe(false);
  });
});
