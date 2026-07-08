import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { detectContextualTutorials } from '@/game/contextualTutorial';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';

describe('detectContextualTutorials', () => {
  it('does not queue first_birth when a newborn dies the same tick', () => {
    const prev = initGame();
    const curr = structuredClone(prev) as typeof prev;
    curr.tick += 1;

    const newborn = createEntity(EntityType.Human, 10, 10, 9003, 200, true, { generation: 2 });
    newborn.motherId = 1;
    newborn.alive = false;
    curr.entities.push(newborn);
    curr.eventLog.push({
      id: 1,
      tick: curr.tick,
      year: curr.year,
      day: 1,
      type: 'birth',
      message: 'A child was born',
    });

    const tips = detectContextualTutorials(prev, curr);
    expect(tips.map((t) => t.id)).not.toContain('first_birth');
  });

  it('queues first_birth when a birth is logged and the child survives', () => {
    const prev = initGame();
    const curr = structuredClone(prev) as typeof prev;
    curr.tick += 1;

    const newborn = createEntity(EntityType.Human, 10, 10, 9004, 200, true, { generation: 2 });
    newborn.motherId = 1;
    curr.entities.push(newborn);
    curr.eventLog.push({
      id: 1,
      tick: curr.tick,
      year: curr.year,
      day: 1,
      type: 'birth',
      message: 'A child was born',
    });

    const tips = detectContextualTutorials(prev, curr);
    expect(tips.map((t) => t.id)).toContain('first_birth');
  });
});