import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import { seedTutorialSeenForExistingState } from '@/game/contextualTutorial';

describe('seedTutorialSeenForExistingState', () => {
  it('does not mark first_birth for founding juveniles without a recorded birth', () => {
    const state = initGame();
    const child = createEntity(EntityType.Human, 10, 10, 9001, 200, true, { generation: 1 });
    state.entities.push(child);
    const seen = seedTutorialSeenForExistingState(state);
    expect(seen).not.toContain('first_birth');
  });

  it('marks first_birth when a child has a motherId', () => {
    const state = initGame();
    const child = createEntity(EntityType.Human, 10, 10, 9002, 200, true, {
      generation: 2,
      motherId: 1,
    });
    state.entities.push(child);
    const seen = seedTutorialSeenForExistingState(state);
    expect(seen).toContain('first_birth');
  });
});