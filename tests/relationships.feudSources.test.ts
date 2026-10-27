/**
 * The daily social pulse's own feud source: two settlers whose traits clash and who share a home,
 * workplace or job drift into a feud, mirroring how the same grouping grows a friendship.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { advanceSocialRelationships, feudScore } from '../src/game/relationships';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    alive: true,
    energy: 100,
    maxEnergy: 100,
    ...overrides,
  } as Entity;
}

function state(): WorldState {
  return {
    entities: [],
    buildings: [],
    tick: TICKS_PER_DAY,
    year: 1,
    dayInYear: 1,
    eventLog: [],
    notifications: [],
    bigNews: [],
    storyFlags: {},
    pendingStoryEvents: [],
    resources: {},
    floatingTexts: [],
    nextFloatingTextId: 1,
    villageReputation: 0,
  } as unknown as WorldState;
}

/** A roll that always passes, so the assertions below are about the rule, not about luck. */
const alwaysPasses = () => 0;

describe('feuds from incompatible pairs', () => {
  it('drifts two housemates with clashing traits into a mutual feud', () => {
    const a = settler(1, { residenceBuildingId: 10, traits: ['fierce'] });
    const b = settler(2, { residenceBuildingId: 10, traits: ['stoic'] });
    const world = state();

    advanceSocialRelationships(world, [a, b], undefined, alwaysPasses);

    expect(feudScore(a, b.id)).toBeGreaterThan(0);
    expect(feudScore(b, a.id)).toBe(feudScore(a, b.id));
    expect(world.eventLog.some((event) => event.message.includes('feud is brewing'))).toBe(true);
  });

  it('never feuds housemates whose traits do not clash', () => {
    const a = settler(1, { residenceBuildingId: 10, traits: ['hardy'] });
    const b = settler(2, { residenceBuildingId: 10, traits: ['lucky'] });
    const world = state();

    // The forced roll passes every day, so only the missing clash can keep the pair apart.
    for (let day = 0; day < 400; day++) {
      advanceSocialRelationships(world, [a, b], undefined, alwaysPasses);
    }

    expect(feudScore(a, b.id)).toBe(0);
  });
});
