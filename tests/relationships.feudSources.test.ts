/**
 * The daily social pulse's feud source: conflicting aptitudes raise a pair's friction, and sharing a
 * home, workplace or job drifts them into a feud, mirroring friendship growth.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { advanceSocialRelationships, feudScore } from '../src/game/relationships';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { genomeFrom } from './helpers/genome';

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

describe('feuds from incompatible aptitudes', () => {
  it('drifts two housemates with clashing aptitudes into a mutual feud', () => {
    const genomeV2 = genomeFrom({ riskTaking: 95 });
    const a = settler(1, { residenceBuildingId: 10, genomeV2 });
    const b = settler(2, { residenceBuildingId: 10, genomeV2 });
    const world = state();

    advanceSocialRelationships(world, [a, b], undefined, alwaysPasses);

    expect(feudScore(a, b.id)).toBeGreaterThan(0);
    expect(feudScore(b, a.id)).toBe(feudScore(a, b.id));
    expect(world.eventLog.some((event) => event.message.includes('feud is brewing'))).toBe(true);
  });

  it('never feuds housemates whose aptitudes keep the pair below average friction', () => {
    const genomeV2 = genomeFrom({ cooperation: 95, flexibility: 90, patience: 90 });
    const a = settler(1, { residenceBuildingId: 10, genomeV2 });
    const b = settler(2, { residenceBuildingId: 10, genomeV2 });
    const world = state();

    // The forced roll passes every day, so only the missing friction can keep the pair apart.
    for (let day = 0; day < 400; day++) {
      advanceSocialRelationships(world, [a, b], undefined, alwaysPasses);
    }

    expect(feudScore(a, b.id)).toBe(0);
  });
});
