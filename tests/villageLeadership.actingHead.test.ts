/**
 * Village head must stay resolvable while in temporary Moon Howler form (EJ-10).
 * Vacancy must not fire just because type flipped to Werewolf.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import {
  getVillageLeader,
  isActingVillageHead,
  isEligibleForLeadership,
  isVillageLeader,
} from '../src/game/villageLeadership';

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

function stubState(entities: Entity[], leaderId: number | null): WorldState {
  return {
    entities,
    villageLeaderId: leaderId,
    year: 5,
    dayInYear: 10,
    tick: 500,
  } as WorldState;
}

describe('acting village head (Moon Howler night)', () => {
  it('human incumbent is eligible and resolvable', () => {
    const leader = stubHuman(7);
    const state = stubState([leader], 7);
    expect(isEligibleForLeadership(leader, state)).toBe(true);
    expect(getVillageLeader(state)?.id).toBe(7);
    expect(isVillageLeader(state, 7)).toBe(true);
  });

  it('werewolf-form incumbent remains acting head for UI (not vacancy)', () => {
    const leader = stubHuman(7, {
      type: EntityType.Werewolf,
      moonHowlerCursed: true,
    });
    const state = stubState([leader], 7);

    // Merit races still want human form — that is fine
    expect(isEligibleForLeadership(leader, state)).toBe(false);
    // But they still hold office while cursed and transformed
    expect(isActingVillageHead(leader, state)).toBe(true);
    expect(getVillageLeader(state)?.id).toBe(7);
    expect(isVillageLeader(state, 7)).toBe(true);
  });

  it('dead or foreign faction does not keep the crown', () => {
    const dead = stubHuman(1, { alive: false });
    const visitor = stubHuman(2, { faction: 'visitor' });
    expect(isActingVillageHead(dead)).toBe(false);
    expect(isActingVillageHead(visitor)).toBe(false);
    expect(getVillageLeader(stubState([dead], 1))).toBeNull();
  });
});
