/**
 * W-65: the wedding story keeps the rival it was offered by, so exterminating that camp cannot
 * retarget the diplomatic outcome to a different neighbour.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { maybeOfferWeddingDiplomacy, resolveWeddingDiplomacy } from '../src/game/weddingDiplomacy';

const FIXTURE_SEED = 20_261_111;

function weddingWorld(): WorldState {
  const world = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  world.tick = 500 * TICKS_PER_DAY;
  world.year = 1;
  world.dayInYear = 140;
  world.storyFlags = {};
  world.buildings.push(
    {
      id: world.nextBuildingId++, type: BuildingType.House, x: 100, y: 100,
      width: 46, height: 40, occupants: [], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100,
    } as never,
    {
      id: world.nextBuildingId++, type: BuildingType.Farm, x: 200, y: 100,
      width: 80, height: 60, occupants: [1], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100,
    } as never,
  );
  world.rivalSettlements.push(
    {
      id: 'rival-wedding-target', name: 'Target Camp', campX: 700, campY: 500,
      population: 8, entityIds: [], relationship: 'neutral', foundedYear: 0,
      daysUntilAction: 200, raidCooldownDays: 200, peaceTreatyDays: 0,
    },
    {
      id: 'rival-other-camp', name: 'Other Camp', campX: 900, campY: 700,
      population: 6, entityIds: [], relationship: 'neutral', foundedYear: 0,
      daysUntilAction: 200, raidCooldownDays: 200, peaceTreatyDays: 0,
    },
  );
  return world;
}

describe('wedding diplomacy rival identity', () => {
  it('does not retarget the outcome when the invited rival camp is exterminated', () => {
    const world = weddingWorld();

    maybeOfferWeddingDiplomacy(world);
    expect(world.pendingStoryEvents?.some((event) => event.storyKey === 'wedding_diplomacy')).toBe(true);
    const other = world.rivalSettlements.find((rival) => rival.id === 'rival-other-camp')!;
    world.rivalSettlements = world.rivalSettlements.filter((rival) => rival.id !== 'rival-wedding-target');

    expect(resolveWeddingDiplomacy(world, 'decline')).toBe(true);
    expect(resolveWeddingDiplomacy(world, 'stay_home_fortify')).toBe(true);

    expect(other.relationship).toBe('neutral');
    const headlines = world.bigNews.map((entry) => `${entry.title} ${entry.message}`).join('\n');
    expect(headlines).toContain('the rival settlement');
    expect(headlines).not.toContain('Other Camp');
  });
});
