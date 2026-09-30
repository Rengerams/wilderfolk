/**
 * Medium-tier persistence and cadence fixes (audit report, 2026-09-13).
 *
 * - M21 — the rare Moon Howler replacement roll was attempted on every tick of the nightfall
 *   hour, turning a 15% per-moon event into ~39%.
 * - M24 — `migrateTickTimeline` scaled `pregnancyProgress` but not the due threshold it is
 *   compared against, nor the pending story-card deadlines.
 * - M26 — Big News ids were re-minted from a module counter, so a realm that received a world
 *   (or a world whose log had been trimmed) could re-issue an id the player had dismissed, and
 *   the UI then hid the new card.
 * - M20/M25/M34 — Moon Howler rite cooldowns, `villageHappiness` and `chronicleChapters` were
 *   written by the simulation but missing from the save allow-list and/or the worker transport.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, GameEventLog, WorldState } from '../src/game/gameTypes';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import { addBigNews } from '../src/game/simEffects';
import { tickMoonHowlerCycle, MOON_HOWLER_REPLACEMENT_CHANCE } from '../src/game/moonHowler';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { DAYS_PER_MOON_CYCLE, NIGHT_START } from '../src/game/dayCycleConstants';

const FIXTURE_SEED = 20240913;

function adult(id: number): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100 + id,
    y: 100,
    energy: 200,
    maxEnergy: 200,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: id % 2 === 0 ? 'male' : 'female',
    name: `H${id}`,
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    relationshipStatus: 'single',
  } as Entity;
}

describe('M21 — the rare moon-howler roll is a per-moon decision', () => {
  it('does not roll again on the later ticks of the nightfall hour', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    // Full moon, nightfall, first tick of the hour, six cursable settlers, no active curse.
    state.tick = DAYS_PER_MOON_CYCLE * TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR;
    const humans = [1, 2, 3, 4, 5, 6].map(adult);
    state.entities = humans;
    const entityById = new Map(humans.map((h) => [h.id, h]));

    // First tick fails the 15% roll; the next two ticks would each have passed it.
    const rolls = [MOON_HOWLER_REPLACEMENT_CHANCE + 0.5, 0, 0];
    const rng = () => rolls.shift() ?? 0;

    for (let i = 0; i < TICKS_PER_HOUR; i++) {
      tickMoonHowlerCycle(state, state.entities, [], DAYS_PER_MOON_CYCLE, NIGHT_START, entityById, undefined, rng);
      state.tick += 1;
    }

    expect(state.entities.filter((e) => e.moonHowlerCursed)).toHaveLength(0);
    // The later ticks must not have consumed a replacement roll at all.
    expect(rolls).toHaveLength(2);
  });

  it('still rolls on the first tick of the hour', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.tick = DAYS_PER_MOON_CYCLE * TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR;
    const humans = [1, 2, 3, 4, 5, 6].map(adult);
    state.entities = humans;
    const entityById = new Map(humans.map((h) => [h.id, h]));

    tickMoonHowlerCycle(state, state.entities, [], DAYS_PER_MOON_CYCLE, NIGHT_START, entityById, undefined, () => 0);

    expect(state.entities.filter((e) => e.moonHowlerCursed)).toHaveLength(1);
  });
});

describe('M26 — Big News ids never collide with ids the world already used', () => {
  it('continues above a trimmed log and a dismissed id', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.bigNews = [
      { id: 'bn_12', title: 'a', message: 'a', type: 'neutral', createdAt: 0, dismissed: false },
    ] as unknown as WorldState['bigNews'];
    state.dismissedBigNewsIds = ['bn_40'];

    addBigNews(state, 'title', 'message');

    expect(state.bigNews[state.bigNews.length - 1].id).toBe('bn_41');
  });
});

describe('M20/M25/M34 — simulation state round-trips', () => {
  it('keeps the moon-howler cooldowns, village happiness and chronicle in the save allow-list', () => {
    for (const key of ['lastMoonHowlerExorcismTick', 'moonHowlerPriestsFleeUntil', 'villageHappiness', 'chronicleChapters']) {
      expect(WORLD_STATE_SAVE_KEYS).toContain(key);
    }
  });

  it('survives a save/load round-trip', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.lastMoonHowlerExorcismTick = 1234;
    state.moonHowlerPriestsFleeUntil = 4321;
    state.villageHappiness = 73;
    state.chronicleChapters = ['first_harvest'];

    const raw = JSON.stringify(buildSaveData(state, createInitialView(state.width, state.height)));
    const parsed = parseSaveJson(raw);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid || !parsed.parsed) throw new Error('save invalid');
    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded).not.toBeNull();

    expect(loaded!.world.lastMoonHowlerExorcismTick).toBe(1234);
    expect(loaded!.world.moonHowlerPriestsFleeUntil).toBe(4321);
    expect(loaded!.world.villageHappiness).toBe(73);
    expect(loaded!.world.chronicleChapters).toEqual(['first_harvest']);
  });

  it('is carried by the worker prep payload in both directions', () => {
    const source = initGame({ seed: FIXTURE_SEED });
    source.lastMoonHowlerExorcismTick = 555;
    source.moonHowlerPriestsFleeUntil = 666;
    source.chronicleChapters = ['a', 'b'];

    const prep = extractSimPrep(source);
    const target = initGame({ seed: FIXTURE_SEED });
    applySimPrep(target, prep);

    expect(target.lastMoonHowlerExorcismTick).toBe(555);
    expect(target.moonHowlerPriestsFleeUntil).toBe(666);
    expect(target.chronicleChapters).toEqual(['a', 'b']);
  });
});

describe('M24 — a legacy day length scales every absolute threshold', () => {
  it('scales pregnancyDueProgress and pending story-card deadlines with the timeline', () => {
    const state = initGame({ seed: FIXTURE_SEED });
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
