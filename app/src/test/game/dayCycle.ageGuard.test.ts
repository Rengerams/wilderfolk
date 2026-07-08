import { describe, expect, it } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import { computeHumanAgeYears } from '@/game/dayCycle';

describe('computeHumanAgeYears', () => {
  it('falls back to stored age when birthYear is corrupted', () => {
    const human = createEntity(EntityType.Human, 0, 0, 1, 200);
    human.birthYear = Number.NaN;
    human.birthDay = Number.NaN;
    human.age = 22;
    expect(computeHumanAgeYears(human, 500)).toBe(22);
  });
});