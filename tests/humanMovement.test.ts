import { describe, expect, it } from 'vitest';
import { commutePathCacheKey, crowdGatherPosition, homeStandPosition, nearestActiveMoonHowler, venueGatherPosition } from '../src/game/simulation/humanMovement';
import { EntityType } from '../src/game/gameTypes';
import { isActiveMoonHowler } from '../src/game/moonHowler';
import type { Building, Entity } from '../src/game/gameTypes';

const building = {
  id: 7,
  x: 100,
  y: 80,
  width: 40,
  height: 30,
} as Building;

function werewolf(id: number, x: number, y: number, active: boolean): Entity {
  return {
    id,
    type: EntityType.Werewolf,
    x,
    y,
    alive: true,
    moonHowlerCursed: active,
  } as Entity;
}

describe('human movement helpers', () => {
  it('keeps commute cache keys stable only when both endpoint tiles match', () => {
    const first = commutePathCacheKey(building.id, false, 101, 81, 200, 120);
    const sameTiles = commutePathCacheKey(building.id, false, 109, 89, 207, 127);
    const nextStartTile = commutePathCacheKey(building.id, false, 111, 81, 200, 120);
    const nextTargetTile = commutePathCacheKey(building.id, false, 101, 81, 216, 120);

    expect(first).toBe(sameTiles);
    expect(nextStartTile).not.toBe(first);
    expect(nextTargetTile).not.toBe(first);
    expect(commutePathCacheKey(building.id, true, 101, 81, 200, 120)).not.toBe(first);
  });

  it('keeps home stand positions deterministic per resident and building', () => {
    expect(homeStandPosition(building, 3)).toEqual(homeStandPosition(building, 3));
    expect(homeStandPosition(building, 3)).not.toEqual(homeStandPosition(building, 4));
  });

  /**
   * The owner reported this clump twice — *"why are they all standing at side of the village?"* and
   * later, with no event running at all, *"they again in a circle"*. The leisure crowd was sent to one
   * coordinate on the venue (`b.x + b.width / 2`, `b.y + b.height * 0.92`) and stopped within 20 px of
   * it, so a village's day-off crowd stacked into a ring around a single pixel. A venue is a place with
   * room in it.
   */
  it('gives each settler their own place in a venue crowd, in front of the building', () => {
    const venue = { ...building, x: 400, y: 300, width: 60, height: 40 };

    // Deterministic, like every other stand position: no RNG, same answer every time.
    expect(venueGatherPosition(venue, 7)).toEqual(venueGatherPosition(venue, 7));

    // A crowd is many places, not one pixel: 40 settlers must not pile up.
    const spots = Array.from({ length: 40 }, (_, i) => venueGatherPosition(venue, i + 1));
    const distinct = new Set(spots.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
    expect(distinct.size).toBeGreaterThanOrEqual(20);

    // In front of the venue (south of its centre line) and never inside the walls.
    const left = venue.x;
    const right = venue.x + venue.width;
    const top = venue.y;
    const bottom = venue.y + venue.height;
    for (const spot of spots) {
      expect(spot.y).toBeGreaterThan(venue.y + venue.height / 2);
      const insideFootprint = spot.x > left && spot.x < right && spot.y > top && spot.y < bottom;
      expect(insideFootprint).toBe(false);
    }
  });

  /**
   * The festival branch used to place its crowd on 35 repeating slots (`id % 7` × `floor(id / 7) % 5`),
   * so a whole village stacked tens deep on those few points — the owner's *"they again in a circle"*,
   * with no election running. A crowd needs places, not a lattice that repeats.
   */
  it('spreads a festival crowd over many places instead of repeating a small lattice', () => {
    expect(crowdGatherPosition(500, 400, 3)).toEqual(crowdGatherPosition(500, 400, 3));

    const spots = Array.from({ length: 200 }, (_, i) => crowdGatherPosition(500, 400, i + 1));
    const distinct = new Set(spots.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
    expect(distinct.size).toBeGreaterThanOrEqual(150);

    // Nobody stands on top of the stage, and the crowd stays in the neighbourhood rather than spanning it.
    for (const spot of spots) {
      const distance = Math.hypot(spot.x - 500, spot.y - 400);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThan(320);
    }
  });

  it('returns only the nearest active living Moon Howler', () => {
    const target = { id: 1, type: EntityType.Human, x: 0, y: 0, alive: true } as Entity;
    const inactive = werewolf(2, 10, 0, false);
    const activeFar = werewolf(3, 30, 0, true);
    const activeNear = werewolf(4, 5, 0, true);
    const deadNear = { ...werewolf(5, 2, 0, true), alive: false } as Entity;

    expect(isActiveMoonHowler(activeNear)).toBe(true);
    expect(nearestActiveMoonHowler(target, [inactive, activeFar, activeNear, deadNear])?.id).toBe(4);
  });
});
