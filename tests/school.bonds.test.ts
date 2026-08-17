/**
 * Regression: schoolyard bonds — kids at school befriend classmates, and those
 * childhood bonds follow them into adulthood, nudging who they court (a friend
 * counts as half the distance). Bonds are mutual, capped at 3, and form on
 * school-day milestones.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { tryFormSchoolyardBond, findCourtshipPartner } from '../src/game/simulation/humanRelationships';
import { getAbsoluteCalendarDay } from '../src/game/dayCycle';

function stubHuman(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 100,
    maxEnergy: 100,
    age: 25,
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
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function bondState(children: Entity[]) {
  const state = initGame();
  state.entities = children;
  return state;
}

describe('schoolyard bonds', () => {
  it('two classmates become friends mutually at a school-day milestone', () => {
    const child = stubHuman(1, { name: 'Loki', gender: 'male', isJuvenile: true, schoolDays: 5 });
    const pal = stubHuman(2, { name: 'Sigrid', gender: 'female', isJuvenile: true });
    const state = bondState([child, pal]);

    tryFormSchoolyardBond(state, child, () => 0);

    expect(child.childhoodFriendsIds).toContain(2);
    expect(pal.childhoodFriendsIds).toContain(1);
    expect(child.schoolBondDay).toBe(getAbsoluteCalendarDay(state.tick));
  });

  it('a lone child has nobody to befriend', () => {
    const child = stubHuman(1, { name: 'Loki', gender: 'male', isJuvenile: true, schoolDays: 5 });
    const state = bondState([child]);

    tryFormSchoolyardBond(state, child, () => 0);

    expect(child.childhoodFriendsIds ?? []).toHaveLength(0);
  });

  it('no bond before the 5-school-day milestone', () => {
    const child = stubHuman(1, { name: 'Loki', gender: 'male', isJuvenile: true, schoolDays: 3 });
    const pal = stubHuman(2, { name: 'Sigrid', gender: 'female', isJuvenile: true });
    const state = bondState([child, pal]);

    tryFormSchoolyardBond(state, child, () => 0);

    expect(child.childhoodFriendsIds ?? []).toHaveLength(0);
  });

  it('friendships cap at 3', () => {
    const child = stubHuman(1, {
      name: 'Loki', gender: 'male', isJuvenile: true, schoolDays: 10,
      childhoodFriendsIds: [10, 11, 12],
    });
    const pal = stubHuman(2, { name: 'Sigrid', gender: 'female', isJuvenile: true });
    const state = bondState([child, pal]);

    tryFormSchoolyardBond(state, child, () => 0);

    expect(child.childhoodFriendsIds).toHaveLength(3);
    expect(pal.childhoodFriendsIds ?? []).toHaveLength(0);
  });

  it('a childhood friend wins courtship over a physically closer stranger', () => {
    const hero = stubHuman(1, { name: 'Erik', gender: 'male', x: 0, y: 0, childhoodFriendsIds: [2] });
    const friend = stubHuman(2, { name: 'Maren', gender: 'female', x: 120, y: 0 });
    const stranger = stubHuman(3, { name: 'Unn', gender: 'female', x: 65, y: 0 });
    const fallback = [hero, friend, stranger];

    // Friend at 120px counts as ~60px (half distance) → beats the stranger at 65px.
    expect(findCourtshipPartner(hero, false, 200, undefined, new Map(), fallback)?.id).toBe(2);

    // Control: without the bond, the closer stranger wins.
    hero.childhoodFriendsIds = undefined;
    expect(findCourtshipPartner(hero, false, 200, undefined, new Map(), fallback)?.id).toBe(3);
  });
});
