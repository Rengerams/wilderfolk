/**
 * Regression: earned titles (Moonslayer, Howlerbane) grant an election merit
 * bonus — deeds speak in the vote. Two otherwise-identical candidates must be
 * separated by the title, and the title must show in the score breakdown and
 * the candidate's name.
 */
import { describe, it, expect } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import {
  formatSettlerName,
  getLeadershipScoreBreakdown,
  rankLeadershipCandidates,
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

function stubState(entities: Entity[]): WorldState {
  return {
    entities,
    villageLeaderId: null,
    year: 5,
    dayInYear: 10,
    tick: 500,
    buildings: [],
    resources: { wood: 0, stone: 0, food: 0, gold: 0 },
    storageMax: { wood: 0, stone: 0, food: 0, gold: 0 },
    tradeRoutes: [],
    villageReputation: 0,
    humanPopulation: entities.length,
  } as WorldState;
}

describe('leadership title bonus', () => {
  it('a titled candidate gains +8 titlePoints in the score breakdown', () => {
    const hero = stubHuman(1, { title: 'Moonslayer' });
    const state = stubState([hero]);

    const breakdown = getLeadershipScoreBreakdown(state, hero);
    expect(breakdown.titlePoints).toBe(8);
    expect(breakdown.totalScore).toBe(breakdown.skillPoints + breakdown.experiencePoints + 8);
  });

  it('an untitled candidate gets no title bonus', () => {
    const plain = stubHuman(2);
    const breakdown = getLeadershipScoreBreakdown(stubState([plain]), plain);
    expect(breakdown.titlePoints).toBe(0);
  });

  it('the title decides between otherwise-identical candidates', () => {
    const hero = stubHuman(1, { title: 'Howlerbane', name: 'Ingrid', surname: 'Priestess' });
    const plain = stubHuman(2, { name: 'Bjorn', surname: 'Smith' });
    const state = stubState([hero, plain]);

    const ranked = rankLeadershipCandidates(state);
    expect(ranked[0]!.entityId).toBe(1);
    expect(ranked[0]!.totalScore).toBe(ranked[1]!.totalScore + 8);
  });

  it('the title shows after the candidate name', () => {
    expect(formatSettlerName(stubHuman(1, { title: 'Moonslayer' }))).toBe('Asha Reed Moonslayer');
    expect(formatSettlerName(stubHuman(2))).toBe('Asha Reed');
  });
});
