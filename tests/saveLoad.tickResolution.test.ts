import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsed } from '../src/game/saveLoad';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { createInitialView } from '../src/game/viewState';
import { EntityType, MapSize } from '../src/game/gameTypes';

describe('save tick-resolution migration', () => {
  it('preserves the calendar day and clock hour of an existing 72-tick/day save', () => {
    const world = initGame({ seed: 1122, size: MapSize.Medium });
    const oldTick = 7 * 72 + 9 * 3;
    world.tick = oldTick;
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    payload._ticksPerDay = 72;
    payload.tick = oldTick;

    const loaded = loadGameFromParsed(payload);
    expect(loaded).not.toBeNull();
    expect(loaded!.world.tick).toBe(7 * TICKS_PER_DAY + 9 * TICKS_PER_HOUR);
    expect(loaded!.world.dayInYear).toBe(7);
    expect(payload.tick).toBe(oldTick);
  });

  it('scales every persisted tick field a 72-tick save carries', () => {
    const world = initGame({ seed: 1122, size: MapSize.Medium });
    const oldDay = 72;
    world.tick = 20 * oldDay;
    world.lastMoonHowlerExorcismTick = 3 * oldDay;
    world.moonHowlerPriestsFleeUntil = 4 * oldDay;
    world.graveRecords = [{ name: 'Old Timer', faction: 'player', tick: 7 * oldDay }];
    world.eventLog = [{
      id: 1, tick: 8 * oldDay, year: 0, day: 8, type: 'event', message: 'A quiet day',
    }];
    const human = world.entities.find((entity) => entity.type === EntityType.Human && entity.alive)!;
    human.lastAutoJobTransferTick = 9 * oldDay;
    human.pastPartnerTicks = { 7: 10 * oldDay };
    human.dialogueRecentScenes = { greeting: { id: 'greeting', tick: 11 * oldDay } };
    human.needs = {
      nutrition: 80, rest: 80, stamina: 80,
      lastMealTick: 12 * oldDay, lastAdvancedTick: 13 * oldDay, sleepRecoveryUntilTick: 14 * oldDay,
    };

    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    payload._ticksPerDay = oldDay;
    payload._version = '0.6.5.0';
    payload.tick = world.tick;

    const loaded = loadGameFromParsed(payload);
    expect(loaded).not.toBeNull();
    const scaled = loaded!.world;
    const scale = TICKS_PER_DAY / oldDay;
    expect(scaled.lastMoonHowlerExorcismTick).toBe(3 * oldDay * scale);
    expect(scaled.moonHowlerPriestsFleeUntil).toBe(4 * oldDay * scale);
    expect(scaled.graveRecords?.[0]?.tick).toBe(7 * oldDay * scale);
    expect(scaled.eventLog[0]?.tick).toBe(8 * oldDay * scale);
    const loadedHuman = scaled.entities.find((entity) => entity.id === human.id)!;
    expect(loadedHuman.lastAutoJobTransferTick).toBe(9 * oldDay * scale);
    expect(loadedHuman.pastPartnerTicks?.[7]).toBe(10 * oldDay * scale);
    expect(loadedHuman.dialogueRecentScenes?.greeting?.tick).toBe(11 * oldDay * scale);
    expect(loadedHuman.needs?.lastMealTick).toBe(12 * oldDay * scale);
    expect(loadedHuman.needs?.lastAdvancedTick).toBe(13 * oldDay * scale);
    expect(loadedHuman.needs?.sleepRecoveryUntilTick).toBe(14 * oldDay * scale);
  });

  it('keeps a live festival when the event-log tick is scaled with it', () => {
    const world = initGame({ seed: 1122, size: MapSize.Medium });
    world.tick = 100 * 72;
    world.festival = { active: true, name: 'Harvest Festival', daysLeft: 2 };
    world.eventLog = [{
      id: 1, tick: 75 * 72, year: 0, day: 75, type: 'event',
      message: 'The Harvest Festival began in the village.',
    }];
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    payload._ticksPerDay = 72;
    payload.tick = world.tick;

    const loaded = loadGameFromParsed(payload);
    expect(loaded).not.toBeNull();
    expect(loaded!.world.festival?.name).toBe('Harvest Festival');
  });

  it('writes the new resolution and does not rescale it on load', () => {
    const world = initGame({ seed: 1122, size: MapSize.Medium });
    world.tick = 4 * TICKS_PER_DAY + 11 * TICKS_PER_HOUR;
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    expect(payload._ticksPerDay).toBe(TICKS_PER_DAY);

    const loaded = loadGameFromParsed(payload);
    expect(loaded).not.toBeNull();
    expect(loaded!.world.tick).toBe(world.tick);
  });
});
