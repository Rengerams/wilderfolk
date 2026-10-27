/**
 * Immigration is a **once-per-colony-day** decision.
 *
 * `tickImmigration` rolls the `dailyPopulation` stream against `immigrationChance`; that is only a
 * daily decision because `gameTick` calls `tickLayerDaily` solely on `tick % TICKS_PER_DAY === 0`,
 * and the daily layer is the single caller. Nothing structurally prevents a second call in the same
 * day — and a second call would roll again and admit a second family — so this test pins the
 * cadence: at most one arrival per day, with the gate tuned so arrivals actually happen (otherwise
 * the assertion would pass vacuously).
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function house(state: WorldState, x: number, y: number): void {
  state.buildings.push({
    id: state.nextBuildingId++, type: BuildingType.House, x, y, width: 60, height: 48,
    rotation: 0, completed: true, faction: 'player', occupants: [], constructionProgress: 100,
    level: 1, spriteScale: 1, health: 100, maxHealth: 100,
  } as unknown as Building);
}

const arrivalCount = (state: WorldState): number =>
  state.eventLog.filter((entry) => entry.type === 'migration').length;

describe('immigration cadence', () => {
  it('admits at most one family per colony day', () => {
    const state = initGame({ seed: 11 });
    // A high reputation plus standing housing puts the roll at its ceiling, so arrivals are the
    // norm rather than a rare event the assertion could pass without ever exercising.
    state.villageReputation = 120;
    state.maxHumanPopulation = 200;
    for (let i = 0; i < 6; i += 1) house(state, 300 + i * 70, 400);

    const perDay: number[] = [];
    for (let day = 0; day < 4; day += 1) {
      const before = arrivalCount(state);
      for (let tick = 0; tick < TICKS_PER_DAY; tick += 1) gameTick(state);
      perDay.push(arrivalCount(state) - before);
    }

    expect(perDay.every((arrivals) => arrivals <= 1)).toBe(true);
    // Non-vacuous: the fixture really does produce arrivals, and a family is 1-2 settlers.
    expect(perDay.reduce((sum, arrivals) => sum + arrivals, 0)).toBeGreaterThanOrEqual(2);
    expect(state.entities.filter((e) => e.alive && e.type === EntityType.Human).length).toBeGreaterThan(2);
  });
});
