import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { pruneOrphanRivalEntities } from '../src/game/rivalEvents';
import { human } from '../src/test/factories';

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
});
