/**
 * Regression: youth love is a mutual, daily relationship state for ages 14–17.
 * It is strengthened by school history, may end naturally, and can only hand
 * off into the existing adult courtship system once both settlers reach 18.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import {
  advanceYouthLove,
  isEligibleForYouthLove,
  YOUTH_LOVE_MIN_AGE,
} from '../src/game/simulation/humanRelationships';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';

function stubTeen(id: number, gender: 'male' | 'female', overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: id * 8,
    y: 0,
    energy: 100,
    maxEnergy: 100,
    age: YOUTH_LOVE_MIN_AGE,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    reproductionCooldown: 0,
    alive: true,
    flash: 0,
    gender,
    isJuvenile: false,
    relationshipStatus: 'single',
    childrenIds: [],
    name: gender === 'male' ? 'Erik' : 'Maren',
    surname: 'Vale',
    ...overrides,
  } as Entity;
}

function runDailyYouthLove(humans: Entity[], rng: () => number): void {
  const state = initGame();
  state.entities = humans;
  state.tick = 72;
  advanceYouthLove(state, {
    entityById: new Map(humans.map((human) => [human.id, human])),
    playerHumans: humans,
    humanSocialGrid: undefined,
    width: state.width,
    height: state.height,
  }, rng);
}

describe('youth love lifecycle', () => {
  it('opens only at age 14 and never treats an established youth pair as a marriage', () => {
    const child = stubTeen(1, 'male', { age: 13 });
    const teen = stubTeen(2, 'female', { age: 14 });
    const adult = stubTeen(3, 'male', { age: 18 });

    expect(isEligibleForYouthLove(child)).toBe(false);
    expect(isEligibleForYouthLove(teen)).toBe(true);
    expect(isEligibleForYouthLove(adult)).toBe(false);
  });

  it('lets shared school history make a youth relationship possible where the same roll otherwise fails', () => {
    const unschooledA = stubTeen(1, 'male');
    const unschooledB = stubTeen(2, 'female');
    runDailyYouthLove([unschooledA, unschooledB], () => 0.001);
    expect(unschooledA.youthLovePartnerId).toBeUndefined();

    const schooledA = stubTeen(3, 'male', { schoolDays: 15 });
    const schooledB = stubTeen(4, 'female', { schoolDays: 15 });
    runDailyYouthLove([schooledA, schooledB], () => 0.001);

    expect(schooledA.youthLovePartnerId).toBe(schooledB.id);
    expect(schooledB.youthLovePartnerId).toBe(schooledA.id);
    expect(schooledA.relationshipStatus).toBe('single');
    expect(schooledA.partnerId).toBeUndefined();
  });

  it('allows a youth pair to grow apart without changing adult relationship state', () => {
    const a = stubTeen(1, 'male', {
      age: 16,
      youthLovePartnerId: 2,
      youthLoveProgress: 20,
      youthLoveStartedDay: 1,
    });
    const b = stubTeen(2, 'female', {
      age: 16,
      youthLovePartnerId: 1,
      youthLoveProgress: 20,
      youthLoveStartedDay: 1,
    });

    runDailyYouthLove([a, b], () => 0);

    expect(a.youthLovePartnerId).toBeUndefined();
    expect(b.youthLovePartnerId).toBeUndefined();
    expect(a.relationshipStatus).toBe('single');
    expect(b.relationshipStatus).toBe('single');
  });

  it('reports a one-sided youth-love link without mutating state', () => {
    const a = stubTeen(1, 'male', { youthLovePartnerId: 2 });
    const b = stubTeen(2, 'female');
    const state = initGame();
    state.entities = [a, b];

    expect(collectSimulationInvariantErrors(state)).toContain('human 1 youth-love link with 2 is not mutual');
    expect(a.youthLovePartnerId).toBe(2);
    expect(b.youthLovePartnerId).toBeUndefined();
  });

  it('hands a lasting pair to adult courtship at 18 without marrying them directly', () => {
    const a = stubTeen(1, 'male', {
      age: 18,
      youthLovePartnerId: 2,
      youthLoveProgress: 80,
      youthLoveStartedDay: 1,
    });
    const b = stubTeen(2, 'female', {
      age: 18,
      youthLovePartnerId: 1,
      youthLoveProgress: 80,
      youthLoveStartedDay: 1,
    });

    runDailyYouthLove([a, b], () => 0.99);

    expect(a.youthLovePartnerId).toBeUndefined();
    expect(b.youthLovePartnerId).toBeUndefined();
    expect(a.courtshipPartnerId).toBe(b.id);
    expect(b.courtshipPartnerId).toBe(a.id);
    expect(a.courtshipProgress).toBeGreaterThanOrEqual(25);
    expect(a.relationshipStatus).toBe('single');
    expect(a.partnerId).toBeUndefined();
  });
});
