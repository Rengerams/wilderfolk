import { describe, expect, it } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import { initGame } from '@/game/gameEngine';
import { computeVictoryProgress } from '@/game/victory';
import { createEntity } from '@/game/worldGen';

describe('computeVictoryProgress — harmony', () => {
  it('counts untamed wolves only, not tamed ones', () => {
    const state = initGame();
    const beforeWild = state.entities.filter(
      (e) => e.alive && e.type === EntityType.Wolf && e.tamedBy == null,
    ).length;
    const before = computeVictoryProgress(state).find((v) => v.path === 'harmony')!.progress;

    const tamed = createEntity(EntityType.Wolf, 60, 60, 9002, 200);
    tamed.tamedBy = 1;
    state.entities.push(tamed);

    const after = computeVictoryProgress(state).find((v) => v.path === 'harmony')!.progress;
    expect(beforeWild).toBeGreaterThan(0);
    expect(after).toBe(before);
  });
});