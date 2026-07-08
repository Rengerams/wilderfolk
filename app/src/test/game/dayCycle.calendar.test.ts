import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import {
  assignMissingResidences,
  DAYS_PER_MOON_CYCLE,
  getAbsoluteCalendarDay,
  isFullMoonDay,
  isFullMoonNight,
  isNewCalendarDayTick,
  markCalendarDayProcessed,
  NIGHT_START,
  TICKS_PER_DAY,
} from '@/game/dayCycle';
import { BuildingType } from '@/game/gameTypes';
import { createBuilding } from '@/game/worldGen';
import { createInitialView } from '@/game/viewState';
import { saveGame, readSavePayload } from '@/game/saveLoad';

describe('calendar day rollover', () => {
  it('does not re-fire daily events on the same absolute day', () => {
    const state = initGame();
    state.tick = TICKS_PER_DAY;
    state.lastProcessedCalendarDay = getAbsoluteCalendarDay(state.tick);

    expect(isNewCalendarDayTick(state)).toBe(false);
  });

  it('fires once when advancing to a new absolute day', () => {
    const state = initGame();
    state.tick = TICKS_PER_DAY;
    state.lastProcessedCalendarDay = 0;

    expect(isNewCalendarDayTick(state)).toBe(true);
    markCalendarDayProcessed(state);
    expect(isNewCalendarDayTick(state)).toBe(false);
  });
});

describe('full moon cycle', () => {
  it('uses absolute colony days so year boundaries keep a 14-day gap', () => {
    const lastMoon = 350;
    expect(isFullMoonDay(lastMoon)).toBe(true);
    expect(isFullMoonDay(lastMoon + 10)).toBe(false);
    expect(isFullMoonDay(lastMoon + DAYS_PER_MOON_CYCLE)).toBe(true);
  });

  it('treats pre-dawn on the day after a full moon as full-moon night', () => {
    const colonyDay = 15;
    expect(isFullMoonNight(colonyDay, NIGHT_START)).toBe(false);
    expect(isFullMoonNight(colonyDay, 5)).toBe(true);
  });
});

describe('save load calendar alignment', () => {
  it('preserves lastProcessedCalendarDay so daily events do not replay mid-day', () => {
    const state = initGame();
    state.tick = TICKS_PER_DAY * 3 + 12;
    state.lastProcessedCalendarDay = 3;
    const view = createInitialView(state.width, state.height);

    const original = localStorage.getItem('ecosim_save');
    try {
      const result = saveGame(state, view);
      expect(result.success).toBe(true);
      const payload = readSavePayload();
      expect(payload.valid).toBe(true);
      if (!payload.valid) return;
      expect(payload.parsed.lastProcessedCalendarDay).toBe(3);
    } finally {
      if (original == null) localStorage.removeItem('ecosim_save');
      else localStorage.setItem('ecosim_save', original);
    }
  });
});

describe('assignMissingResidences', () => {
  it('clears residence assignments for dead settlers', () => {
    const state = initGame();
    const house = createBuilding(BuildingType.House, 200, 200, 10, 0);
    house.completed = true;
    state.buildings.push(house);

    const dead = state.entities.find((e) => e.alive)!;
    dead.alive = false;
    dead.residenceBuildingId = house.id;
    house.occupants.push(dead.id);

    assignMissingResidences(state.entities, state.buildings);

    expect(dead.residenceBuildingId).toBeUndefined();
    expect(house.occupants).not.toContain(dead.id);
  });
});