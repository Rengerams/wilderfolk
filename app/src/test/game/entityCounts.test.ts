import { describe, expect, it } from 'vitest';
import { createEntity } from '@/game/worldGen';
import { withLifeAge } from '@/test/fixtures/gameFixtures';
import { EntityType } from '@/game/gameTypes';
import { computePopulationCounts, computeWildlifeCounts } from '@/game/entityCounts';
import { curseMoonHowler, transformToWerewolfForm } from '@/game/moonHowler';

describe('computeWildlifeCounts', () => {
  it('counts wildlife buckets without calling moon-howler logic on humans', () => {
    const human = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(human, 22);
    curseMoonHowler(human);

    const rabbit = createEntity(EntityType.Rabbit, 10, 0, 2, 100);
    const wolf = createEntity(EntityType.Wolf, 20, 0, 3, 200);

    const counts = computeWildlifeCounts([human, rabbit, wolf]);
    expect(counts.rabbits).toBe(1);
    expect(counts.wolves).toBe(1);
    expect(counts.werewolves).toBe(0);
  });

  it('counts active moon howlers only when werewolf type', () => {
    const human = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(human, 22);
    curseMoonHowler(human);
    transformToWerewolfForm(human);

    const plainWolf = createEntity(EntityType.Werewolf, 30, 0, 2, 200);

    const counts = computeWildlifeCounts([human, plainWolf]);
    expect(counts.werewolves).toBe(1);
  });
});

describe('computePopulationCounts', () => {
  it('matches gameTick rules — player humans separate from moon howlers', () => {
    const settler = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(settler, 22);

    const cursed = createEntity(EntityType.Human, 10, 0, 2, 250, false);
    withLifeAge(cursed, 24);
    curseMoonHowler(cursed);
    transformToWerewolfForm(cursed);

    const visitor = createEntity(EntityType.Human, 20, 0, 3, 250, false);
    withLifeAge(visitor, 20);
    visitor.faction = 'visitor';

    const deer = createEntity(EntityType.Deer, 40, 0, 4, 200);

    const counts = computePopulationCounts([settler, cursed, visitor, deer]);
    expect(counts.humans).toBe(1);
    expect(counts.werewolves).toBe(1);
    expect(counts.deer).toBe(1);
  });
});