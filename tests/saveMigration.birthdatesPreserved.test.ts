/**
 * Regression: loading a save must not rewrite a settler's birth date.
 *
 * The load path re-derived `birthYear`/`birthMonth`/`birthDay` from a whole-year age, so a
 * settler's exact birthday moved forward every time a save was opened, even though the saved date
 * is the authoritative record and the age is only a projection of it.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { computeHumanAgeYears, getColonyDay } from '../src/game/dayCycle';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { isPlayerHuman } from '../src/game/playerHuman';

function roundTrip(world: WorldState): WorldState {
  const raw = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
  const parsed = parseSaveJson(raw);
  expect(parsed.valid).toBe(true);
  if (!parsed.valid || !parsed.parsed) throw new Error('save invalid');
  const loaded = loadGameFromParsed(parsed.parsed);
  expect(loaded).not.toBeNull();
  return loaded!.world;
}

const players = (world: WorldState): Entity[] => world.entities.filter(isPlayerHuman);

/** The stored birthday, as the settler panel prints it. */
const birthday = (entity: Entity): string =>
  `${entity.birthYear}-${entity.birthMonth}-${entity.birthDay}`;

describe('saved birthdates survive a load', () => {
  it('keeps every settler’s exact birthday across a save, load and save again', () => {
    const state = initGame({ villageName: 'Birthdays', size: 'medium' });
    // Two hundred days in: lived days are no longer a whole number of age years, so a birthday
    // re-derived from the age cannot land back on the settler's own date.
    state.tick = 200 * TICKS_PER_DAY;
    const before = new Map(players(state).map((human) => [human.id, birthday(human)]));
    expect(before.size).toBeGreaterThan(0);

    const loaded = roundTrip(state);
    const after = new Map(players(loaded).map((human) => [human.id, birthday(human)]));

    for (const [id, date] of before) {
      expect(after.get(id), `settler ${id}`).toBe(date);
    }
  });

  it('still recovers an age for a save whose birth calendar is missing', () => {
    const state = initGame({ villageName: 'Legacy', size: 'medium' });
    const storedAges = new Map(players(state).map((human) => [human.id, human.age]));
    expect(storedAges.size).toBeGreaterThan(0);
    for (const human of players(state)) {
      human.birthYear = 0;
      human.birthMonth = 0;
      human.birthDay = 0;
    }

    const loaded = roundTrip(state);
    const colonyDay = getColonyDay(loaded);
    for (const human of players(loaded)) {
      const stored = storedAges.get(human.id);
      if (stored === undefined) continue;
      expect(Math.abs(computeHumanAgeYears(human, colonyDay) - stored)).toBeLessThan(1);
    }
  });

  it('keeps a January 1 birthday, whose day and month are both zero', () => {
    const state = initGame({ villageName: 'NewYear', size: 'medium' });
    state.tick = 400 * TICKS_PER_DAY;
    const settlers = players(state);
    expect(settlers.length).toBeGreaterThan(0);
    for (const human of settlers) {
      // Day 0 of month 0 is January 1: the year is what tells that date from an absent one.
      human.birthYear = 1;
      human.birthMonth = 0;
      human.birthDay = 0;
    }

    const loaded = roundTrip(state);

    expect(players(loaded).length).toBeGreaterThan(0);
    for (const human of players(loaded)) {
      expect(birthday(human), `settler ${human.id}`).toBe('1-0-0');
    }
  });
});
