/**
 * Regression: kids are gossip couriers — a child enrolled in school whose
 * parent carries an established affair may let it slip, exposing the affair
 * as a rumor (the schoolyard does the church's gossip work). One slip per
 * child per day; early flings are not worth blabbing about.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { trySchoolyardGossip } from '../src/game/lifeSimulation';
import { getAbsoluteCalendarDay } from '../src/game/dayCycle';

function stubHuman(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
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
    name: 'Asha',
    surname: 'Reed',
    gender: 'female',
    isJuvenile: false,
    ...overrides,
  } as Entity;
}

function gossipFixture(parentProgress: number) {
  const state = initGame();
  const parent = stubHuman(1, {
    name: 'Halvard', surname: 'Root', gender: 'male',
    relationshipStatus: 'married', partnerId: 4,
    affairPartnerId: 2, affairProgress: parentProgress,
  });
  const lover = stubHuman(2, {
    name: 'Maren', surname: 'Ash', gender: 'female',
    relationshipStatus: 'married', partnerId: 5,
    affairPartnerId: 1, affairProgress: parentProgress,
  });
  const spouse = stubHuman(4, { name: 'Gudrun', surname: 'Root', gender: 'female', relationshipStatus: 'married', partnerId: 1 });
  const child = stubHuman(3, { name: 'Loki', surname: 'Root', gender: 'male', isJuvenile: true, fatherId: 1 });
  const entities = [parent, lover, spouse, child];
  state.entities = entities;
  const entityById = new Map(entities.map((e) => [e.id, e]));
  return { state, parent, lover, child, entityById, entities };
}

describe('schoolyard gossip (kids as gossip couriers)', () => {
  it('a child without parents blabs nothing', () => {
    const { state, parent, child, entityById, entities } = gossipFixture(60);
    child.fatherId = undefined;
    child.motherId = undefined;
    trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
    expect(parent.affairPartnerId).toBe(2);
  });

  it('a parent without an affair gives the kids nothing to say', () => {
    const { state, parent, child, entityById, entities } = gossipFixture(60);
    parent.affairPartnerId = undefined;
    trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
    expect(parent.affairProgress).toBe(60);
  });

  it('an established affair gets exposed as a rumor when the kid slips', () => {
    const { state, parent, child, entityById, entities } = gossipFixture(60);
    trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
    expect(parent.affairPartnerId).toBeUndefined();
    expect(parent.affairProgress).toBe(0);
    expect(child.schoolGossipDay).toBe(getAbsoluteCalendarDay(state.tick));
  });

  it('an early fling (progress < 45) is not worth blabbing about', () => {
    const { state, parent, child, entityById, entities } = gossipFixture(20);
    trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
    expect(parent.affairPartnerId).toBe(2);
    expect(parent.affairProgress).toBe(20);
  });

  it('only one slip per child per day — the gate holds even with a fresh secret', () => {
    const { state, parent, child, entityById, entities } = gossipFixture(60);
    // A different secret the same day — but the child already blabbed today.
    child.schoolGossipDay = getAbsoluteCalendarDay(state.tick);
    trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
    expect(parent.affairPartnerId).toBe(2);
  });
});
