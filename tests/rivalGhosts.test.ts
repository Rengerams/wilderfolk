import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  pruneOrphanRivalEntities,
  tickRivalSettlements,
  type RivalEventCallbacks,
} from '../src/game/rivalEvents';
import { indexLivingEntity } from '../src/game/entityIndex';
import { human } from '../src/test/factories';

/** Boundary collaborators the daily layer supplies; only the retirement bookkeeping is under test. */
const callbacks: RivalEventCallbacks = {
  pushNews: () => {},
  pushFloat: () => {},
  logEvent: () => {},
  tickPendingDiplomacyEvents: () => {},
  queueDiplomacyEvent: () => {},
  killWildGameForPoach: () => {},
};

describe('rival ghosts', () => {
  it('prunes a rival entity whose camp no longer exists', () => {
    const world = initGame({ seed: 4242 });
    const ghost = human(999001);
    ghost.faction = 'rival';
    ghost.groupId = 'camp_gone';
    ghost.alive = true;
    world.entities.push(ghost);

    expect(pruneOrphanRivalEntities(world)).toBe(1);
    expect(world.entities.some((entity) => entity.id === ghost.id)).toBe(false);
  });

  it('keeps a rival entity that still belongs to a camp', () => {
    const world = initGame({ seed: 4242 });
    const campId = 'camp_alive';
    world.rivalSettlements = [{
      id: campId, name: 'Camp', campX: 1, campY: 1, population: 1, entityIds: [],
      relationship: 'neutral', foundedYear: 0, daysUntilAction: 30, raidCooldownDays: 0,
      peaceTreatyDays: 0,
    }];
    const resident = human(999002);
    resident.faction = 'rival';
    resident.groupId = campId;
    resident.alive = true;
    world.entities.push(resident);

    expect(pruneOrphanRivalEntities(world)).toBe(0);
    expect(world.entities.some((entity) => entity.id === resident.id)).toBe(true);
  });

  it('retires a legacy roster member through the shared departure owner', () => {
    const world = initGame({ seed: 4243 });
    const campId = 'camp_roster';
    world.rivalSettlements = [{
      id: campId, name: 'Camp', campX: 1, campY: 1, population: 1, entityIds: [999003],
      relationship: 'neutral', foundedYear: 0, daysUntilAction: 100000, raidCooldownDays: 0,
      peaceTreatyDays: 0,
    }];
    const member = human(999003, { faction: 'rival', groupId: campId });
    member.alive = true;
    world.entities.push(member);
    indexLivingEntity(world, member);
    expect(world.entityById?.has(member.id)).toBe(true);
    const alive = world.entities.filter((entity) => entity.alive);

    tickRivalSettlements(world, alive, callbacks);

    expect(member.alive).toBe(false);
    expect(member.departedAlive, 'a legacy camp member leaves rather than dies').toBe(true);
    expect(world.entities.some((entity) => entity.id === member.id), 'stays in the entity roster').toBe(false);
    expect(world.entityById?.has(member.id), 'stays in the live entity index').toBe(false);
  });
});
