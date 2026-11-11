/** One pass drops every covered family: the worker pays one roster copy per tick instead of two. */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, type Entity, type WorldState } from '../src/game/gameTypes';
import { PROFILE_REVISION, RELATIONSHIP_REVISION, revisionOf } from '../src/game/entityRevision';
import {
  extractSimTickDelta,
  profileFieldCoverage,
  relationshipFieldCoverage,
  stripCoveredEntityFields,
} from '../src/game/simBuffers/simDelta';

function colony(): { world: WorldState; settler: Entity } {
  const world = initGame({ seed: 4242 });
  const settler = createEntity(EntityType.Human, 1000, 1000, 200, 300);
  settler.alive = true;
  settler.skills = { farmer: 3 };
  settler.friendships = { friend_201: 70 };
  world.entities = [settler];
  return { world, settler };
}

function alive(world: WorldState): Entity[] {
  return world.entities.filter((entity) => entity.alive);
}

describe('covered entity field stripping', () => {
  it('drops both families in one pass once the replica holds their revisions', () => {
    const { world, settler } = colony();
    const profileSent = new Map<number, { revision: number; tick: number }>();
    const relationshipSent = new Map<number, number>();
    const profileRevision = () => new Map([[settler.id, revisionOf(settler, PROFILE_REVISION)]]);
    const relationshipRevision = () => new Map([[settler.id, revisionOf(settler, RELATIONSHIP_REVISION)]]);

    const first = extractSimTickDelta(world, alive(world));
    stripCoveredEntityFields(first, [
      profileFieldCoverage(profileRevision(), profileSent, 1),
      relationshipFieldCoverage(relationshipRevision(), relationshipSent),
    ]);
    expect(first.aliveEntities[0].skills).toEqual({ farmer: 3 });
    expect(first.aliveEntities[0].friendships).toEqual({ friend_201: 70 });

    const second = extractSimTickDelta(world, alive(world));
    stripCoveredEntityFields(second, [
      profileFieldCoverage(profileRevision(), profileSent, 2),
      relationshipFieldCoverage(relationshipRevision(), relationshipSent),
    ]);
    const shipped = second.aliveEntities[0];
    expect(shipped.skills).toBeUndefined();
    expect(shipped.friendships).toBeUndefined();
    // Uncovered fields still ship, and the live entity keeps its own values.
    expect(shipped.id).toBe(settler.id);
    expect(shipped.x).toBe(settler.x);
    expect(settler.skills).toEqual({ farmer: 3 });
  });

  it('keeps a changed family in the payload and records its new revision', () => {
    const { world, settler } = colony();
    const relationshipSent = new Map<number, number>();
    const before = revisionOf(settler, RELATIONSHIP_REVISION);

    const first = extractSimTickDelta(world, alive(world));
    stripCoveredEntityFields(first, [
      relationshipFieldCoverage(new Map([[settler.id, before]]), relationshipSent),
    ]);
    expect(first.aliveEntities[0].friendships).toEqual({ friend_201: 70 });

    const after = before + 1;
    const changed = extractSimTickDelta(world, alive(world));
    stripCoveredEntityFields(changed, [
      relationshipFieldCoverage(new Map([[settler.id, after]]), relationshipSent),
    ]);
    expect(changed.aliveEntities[0].friendships).toEqual({ friend_201: 70 });
    expect(relationshipSent.get(settler.id)).toBe(after);
  });

  it('leaves the roster untouched when no family is covered', () => {
    const { world } = colony();
    const delta = extractSimTickDelta(world, alive(world));
    const liveEntity = delta.aliveEntities[0];
    stripCoveredEntityFields(delta, []);
    expect(delta.aliveEntities[0]).toBe(liveEntity);
  });
});
