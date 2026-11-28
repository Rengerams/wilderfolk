import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { createInitialView } from '../src/game/viewState';
import { EntityType, MapSize, BuildingType, type GameEventLog, type WorldState } from '../src/game/gameTypes';
import { building } from '../src/test/factories';

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
    human.chatTicks = 5;
    human.combatTicks = 6;
    human.schoolTicksToday = 12;
    human.scheduleWorkedTicksToday = 18;
    human.schedulePresentTicksToday = 15;
    human.needs = {
      nutrition: 80, rest: 80, stamina: 80,
      lastMealTick: 12 * oldDay, lastAdvancedTick: 13 * oldDay, sleepRecoveryUntilTick: 14 * oldDay,
      severeHungerTicks: 20,
    };
    const huntingSpot = world.buildings[0] ?? (world.buildings.push(building(9001, BuildingType.House)), world.buildings[0]);
    huntingSpot.huntingSpotInReachTick = 21 * oldDay;

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
    expect(loadedHuman.chatTicks).toBe(5 * scale);
    expect(loadedHuman.combatTicks).toBe(6 * scale);
    expect(loadedHuman.schoolTicksToday).toBe(12 * scale);
    expect(loadedHuman.scheduleWorkedTicksToday).toBe(18 * scale);
    expect(loadedHuman.schedulePresentTicksToday).toBe(15 * scale);
    expect(loadedHuman.needs?.severeHungerTicks).toBe(20 * scale);
    expect(scaled.buildings.find((entry) => entry.id === huntingSpot.id)?.huntingSpotInReachTick)
      .toBe(21 * oldDay * scale);
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

describe('M24 — a legacy day length scales every absolute threshold', () => {
  it('scales pregnancyDueProgress and pending story-card deadlines with the timeline', () => {
    const state = initGame({ skipTerrain: true, seed: 20240913 });
    const mother = state.entities.find((e) => e.type === EntityType.Human)!;
    mother.pregnant = true;
    mother.pregnancyDueProgress = 1200;
    mother.pregnancyProgress = 600;
    state.pendingStoryEvents = [
      { id: 'card', storyKey: 'k', title: 't', description: 'd', emoji: '🎭', choices: [], createdAtTick: 100, expiresAtTick: 400 } as unknown as NonNullable<WorldState['pendingStoryEvents']>[number],
    ];

    const raw = JSON.stringify({ ...buildSaveData(state, createInitialView(state.width, state.height)), _ticksPerDay: 24 });
    const parsed = parseSaveJson(raw);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid || !parsed.parsed) throw new Error('save invalid');
    const loaded = loadGameFromParsed(parsed.parsed);
    const scale = TICKS_PER_DAY / 24;

    const loadedMother = loaded!.world.entities.find((e) => e.id === mother.id)!;
    expect(loadedMother.pregnancyProgress).toBe(Math.round(600 * scale));
    expect(loadedMother.pregnancyDueProgress).toBe(Math.round(1200 * scale));
    const card = loaded!.world.pendingStoryEvents?.[0] as unknown as GameEventLog & { createdAtTick: number; expiresAtTick: number };
    expect(card.createdAtTick).toBe(Math.round(100 * scale));
    expect(card.expiresAtTick).toBe(Math.round(400 * scale));
  });
});
