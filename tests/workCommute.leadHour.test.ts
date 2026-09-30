/**
 * Work-commute departure window.
 *
 * The schedule names when a settler must be *at* work, not when they set off. The hour before the
 * shift start is therefore the commute window (`workSchedule.isOnWorkCommuteHours`), so a worker
 * is standing at their workplace when the bell rings instead of walking through the first hours of
 * the shift. Owner spec (2026-09-14): "they should arrive at begin time at work, they have an hour
 * to commute".
 *
 * The measured reality this depends on is worth keeping in view: at 3 ticks per hour an in-game
 * hour is only ~30 px of walking at the commute rate, so a home→work walk of several hundred px
 * still needs hours — see `scripts/probe-day-budget.mts` and `scripts/probe-commute.mts`.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { createSimFocus } from '../src/game/simFocus';
import { getWorkSchedule, isOnWorkCommuteHours } from '../src/game/workSchedule';
import { TICKS_PER_DAY, TICKS_PER_HOUR, getWeekday } from '../src/game/dayCycleClock';

function workplace(state: WorldState, x: number, y: number): Building {
  const b = {
    id: state.nextBuildingId++, type: BuildingType.LumberMill, x, y, width: 60, height: 48,
    rotation: 0, completed: true, faction: 'player', occupants: [], constructionProgress: 100,
    level: 1, spriteScale: 1, health: 100, maxHealth: 100,
  } as unknown as Building;
  state.buildings.push(b);
  return b;
}

/** A workday at `hour`, so `isWorkDay` is true and the tick is inside that weekday. */
function tickAtHourOnWorkDay(state: WorldState, hour: number): number {
  for (let day = 0; day < 14; day++) {
    const tick = day * TICKS_PER_DAY + hour * TICKS_PER_HOUR + 1;
    const weekday = getWeekday(tick);
    if (weekday !== 5 && weekday !== 6) return tick;
  }
  throw new Error('no workday found');
}

function workerAtHome(state: WorldState): { person: Entity; mill: Building; stand: { x: number; y: number } } {
  const person = state.entities.find((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
  if (!person) throw new Error('no settler');
  const mill = workplace(state, person.x + 240, person.y + 120);
  person.homeBuildingId = mill.id;
  person.job = JobType.Lumberjack;
  mill.occupants.push(person.id);
  return { person, mill, stand: humanBuildingTarget(mill, person.id, false) };
}

describe('work-commute departure window', () => {
  it('sets off in the hour before the shift', () => {
    const state = initGame({ seed: 11 });
    const { person, stand } = workerAtHome(state);
    const schedule = getWorkSchedule(state);
    const commuteHour = schedule.startHour - 1;
    expect(isOnWorkCommuteHours(schedule, commuteHour)).toBe(true);

    state.tick = tickAtHourOnWorkDay(state, commuteHour);
    const before = Math.hypot(stand.x - person.x, stand.y - person.y);
    gameTick(state, createSimFocus(state));

    expect(Math.hypot(stand.x - person.x, stand.y - person.y)).toBeLessThan(before);
  });

  it('does not treat the middle of the night as the commute window', () => {
    const state = initGame({ seed: 11 });
    const { person, stand } = workerAtHome(state);
    const schedule = getWorkSchedule(state);
    const nightHour = Math.max(0, schedule.startHour - 6);
    expect(isOnWorkCommuteHours(schedule, nightHour)).toBe(false);

    state.tick = tickAtHourOnWorkDay(state, nightHour);
    const before = Math.hypot(stand.x - person.x, stand.y - person.y);
    // Outside the window the settler has no reason to close on the workplace this tick.
    for (let i = 0; i < 3; i++) gameTick(state, createSimFocus(state));

    expect(Math.hypot(stand.x - person.x, stand.y - person.y)).toBeGreaterThanOrEqual(before - 4);
  });
});