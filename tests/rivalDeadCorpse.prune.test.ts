/**
 * W-146: a dead legacy rival corpse is not a live camp member. The prune pass must drop it, not
 * leave it in `state.entities` because `alive` is already false.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { pruneOrphanRivalEntities } from '../src/game/rivalEvents';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';

describe('legacy rival corpse pruning', () => {
  it('removes an already-dead rival entity from a legacy save', () => {
    const state = initGame({ skipTerrain: true });
    const corpse = {
      ...state.entities[0],
      id: 999_999,
      type: EntityType.Human,
      faction: 'rival' as const,
      groupId: 'rival_legacy',
      alive: false,
    } as Entity;
    state.entities.push(corpse);

    pruneOrphanRivalEntities(state);

    expect(state.entities.some((entity) => entity.id === corpse.id)).toBe(false);
  });
});
