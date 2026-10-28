import { describe, expect, it } from 'vitest';
import { projectStrategicCamp, STRATEGIC_VILLAGE_POINT } from '../src/game/strategicMapProjection';

const world = { width: 1600, height: 1200 };
const village = { x: 800, y: 600 };

describe('New Frontier strategic illustration projection', () => {
  it('keeps the village aligned to the illustrated central settlement', () => {
    expect(projectStrategicCamp({ campX: 800, campY: 600 }, village, world))
      .toEqual(STRATEGIC_VILLAGE_POINT);
  });

  it('preserves real bearings and stable camp coordinates regardless of other rivals', () => {
    const west = projectStrategicCamp({ campX: 540, campY: 550 }, village, world);
    const east = projectStrategicCamp({ campX: 1040, campY: 650 }, village, world);
    expect(west.x).toBeLessThan(STRATEGIC_VILLAGE_POINT.x);
    expect(east.x).toBeGreaterThan(STRATEGIC_VILLAGE_POINT.x);
    expect(west.y).toBeLessThan(STRATEGIC_VILLAGE_POINT.y);
    expect(east.y).toBeGreaterThan(STRATEGIC_VILLAGE_POINT.y);
    expect(projectStrategicCamp({ campX: 540, campY: 550 }, village, world)).toEqual(west);
  });

  it('keeps outlying camps inside the illustrated map, away from the border and legend', () => {
    const far = projectStrategicCamp({ campX: 99999, campY: -99999 }, village, world);
    expect(far.x).toBe(1075);
    expect(far.y).toBe(116);
  });

  it('does not mutate the world, the village or the rival data', () => {
    const camp = Object.freeze({ campX: 1100, campY: 900 });
    const frozenVillage = Object.freeze({ ...village });
    const frozenWorld = Object.freeze({ ...world });
    projectStrategicCamp(camp, frozenVillage, frozenWorld);
    expect(camp.campX).toBe(1100);
    expect(frozenVillage.x).toBe(800);
    expect(frozenWorld.width).toBe(1600);
  });
});
