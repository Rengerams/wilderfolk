/**
 * The construction progress bar must move between the daily steps, not jump once per colony day.
 *
 * `tickBuildingProgress` decides `building.constructionProgress` once per colony day (daily
 * cadence), so the raw value is frozen for a whole game day — 48 real seconds at 1x — and then
 * steps. `displayedConstructionProgress` ramps the *displayed* value across the day and lands
 * exactly on the authoritative one. Owner report: "when they building the % is not going up for
 * completeness ... it should be updated real life".
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building } from '../src/game/gameTypes';
import { displayedConstructionProgress } from '../src/game/buildingProgressDisplay';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function site(id: number, progress: number): Building {
  return {
    id,
    type: BuildingType.Store,
    x: 0,
    y: 0,
    width: 60,
    height: 48,
    completed: false,
    constructionProgress: progress,
    occupants: [],
  } as unknown as Building;
}

describe('displayed construction progress', () => {
  it('moves between two daily values and lands on each one', () => {
    const building = site(1, 0);
    let tick = 1000;
    expect(displayedConstructionProgress(building, tick)).toBe(0);

    // The owner advances the site by 45% on the next colony day.
    const dayStart = tick;
    tick += TICKS_PER_DAY;
    building.constructionProgress = 45;
    expect(displayedConstructionProgress(building, tick)).toBe(0);

    // A quarter of the way through the new day the bar has visibly moved…
    const quarter = displayedConstructionProgress(building, dayStart + TICKS_PER_DAY + TICKS_PER_DAY / 4);
    expect(quarter).toBeGreaterThan(5);
    expect(quarter).toBeLessThan(45);

    // …and it reaches the authoritative value exactly when the next day arrives.
    tick = dayStart + 2 * TICKS_PER_DAY;
    building.constructionProgress = 90;
    expect(displayedConstructionProgress(building, tick)).toBe(45);
  });

  it('is monotonic inside a day and never overshoots the authoritative value', () => {
    const building = site(2, 0);
    const base = 5000;
    displayedConstructionProgress(building, base);
    building.constructionProgress = 30;
    let previous = -1;
    for (let offset = 0; offset <= TICKS_PER_DAY; offset += 6) {
      const shown = displayedConstructionProgress(building, base + offset);
      expect(shown).toBeGreaterThanOrEqual(previous);
      expect(shown).toBeLessThanOrEqual(30);
      previous = shown;
    }
  });

  it('shows a finished build as 100 immediately', () => {
    const building = site(3, 60);
    displayedConstructionProgress(building, 10);

    building.constructionProgress = 100;

    expect(displayedConstructionProgress(building, 10 + TICKS_PER_DAY)).toBe(100);
  });
});
