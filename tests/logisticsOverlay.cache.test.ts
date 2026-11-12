/**
 * The logistics projection is memoised on the exact inputs it reads — buildings and settler
 * home↔work links — so a bare tick or camera move never re-runs it, while a paused edit does.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeLogisticsOverlay,
  computeLogisticsOverlayCached,
  resetLogisticsOverlayCache,
} from '../src/game/logisticsOverlayData';
import { BuildingType, EntityType, type Building, type Entity, type WorldState } from '../src/game/gameTypes';

function building(id: number, type: BuildingType, x: number, y: number): Building {
  return {
    id,
    type,
    x,
    y,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  } as unknown as Building;
}

function settler(id: number, workerBuildingId: number, residenceBuildingId: number): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    alive: true,
    speed: 1,
    workerBuildingId,
    residenceBuildingId,
  } as unknown as Entity;
}

function world(buildings: Building[], entities: Entity[] = []): WorldState {
  return { buildings, entities, tick: 100, width: 2000, height: 2000 } as unknown as WorldState;
}

/** One far commute (home at 0,0, work at 500,0) so the projection has content to compare. */
function commuterWorld(): WorldState {
  return world(
    [building(1, BuildingType.House, 0, 0), building(2, BuildingType.Farm, 500, 0)],
    [settler(10, 2, 1)],
  );
}

describe('the logistics projection is memoised per world revision', () => {
  beforeEach(() => {
    resetLogisticsOverlayCache();
  });

  it('returns the same projection on a repeat call at the same revision', () => {
    const w = commuterWorld();
    const first = computeLogisticsOverlayCached(w);

    expect(computeLogisticsOverlayCached(w)).toBe(first);
    expect(first).toEqual(computeLogisticsOverlay(w));
    expect(first.commutes).toHaveLength(1);
  });

  it('keeps the projection when only the tick advances', () => {
    const w = commuterWorld();
    const first = computeLogisticsOverlayCached(w);

    w.tick += 1;

    expect(computeLogisticsOverlayCached(w)).toBe(first);
  });

  it('recomputes on a paused building edit, without waiting for a reset', () => {
    const w = commuterWorld();
    const before = computeLogisticsOverlayCached(w);

    w.buildings.push(building(3, BuildingType.House, 900, 900));

    const after = computeLogisticsOverlayCached(w);
    expect(after).not.toBe(before);
    expect(after.poorlyConnected).toHaveLength(before.poorlyConnected.length + 1);
  });

  it('recomputes when a settler changes workplace or home', () => {
    const w = commuterWorld();
    w.buildings.push(building(4, BuildingType.Farm, 50, 0));
    const before = computeLogisticsOverlayCached(w);

    w.entities[0].workerBuildingId = 4;

    const after = computeLogisticsOverlayCached(w);
    expect(after).not.toBe(before);
    // Same settler, short leg: the classification follows the new workplace.
    expect(after.commutes).toHaveLength(1);
    expect(after.commutes[0].workBuildingId).toBe(4);
    expect(after.commutes[0].severity).toBe('over_budget');
    expect(before.commutes[0].severity).toBe('extreme');
  });

  it('reuses the projection for an equal-world replacement and rebuilds for a different one', () => {
    const w = commuterWorld();
    const first = computeLogisticsOverlayCached(w);

    const equalReplacement = { ...w, buildings: [...w.buildings], entities: [...w.entities] } as WorldState;
    expect(computeLogisticsOverlayCached(equalReplacement)).toBe(first);

    equalReplacement.buildings[0] = building(7, BuildingType.House, 0, 0);
    expect(computeLogisticsOverlayCached(equalReplacement)).not.toBe(first);
  });

  it('recomputes after an explicit reset', () => {
    const w = commuterWorld();
    const first = computeLogisticsOverlayCached(w);

    resetLogisticsOverlayCache();
    const second = computeLogisticsOverlayCached(w);

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
