/**
 * Regression: the Moon Howler exorcism overhaul —
 *   • churches hold up to 4 priests (cure 35% → 71%)
 *   • the rite needs the priest within MOON_HOWLER_EXORCISM_RANGE of the howler
 *   • Barracks guards nearby roll (extra roll, not guaranteed) to save the priest
 *   • a fallen priest scares the survivors (flee window), and breaking a curse
 *     earns the priest the "Howlerbane" title
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  tryMoonHowlerChurchCures,
  moonHowlerRiteWeights,
  MOON_HOWLER_CURE_CHANCE_MAX,
  MOON_HOWLER_EXORCISM_INTERVAL_HOURS,
} from '../src/game/moonHowler';
import { BUILDING_CONFIGS, BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';

/** Staffed church + priest + cursed howler fixture. Returns a fresh setup each call. */
function exorcismFixture(howlerX: number) {
  const state = initGame();
  const human = state.entities.find((e) => e.type === EntityType.Human && e.alive)!;

  const priest: Entity = {
    ...human,
    id: 9000,
    name: 'Ingrid',
    surname: 'Priestess',
    job: JobType.Priest,
    occupation: 'priest',
    alive: true,
    x: 100,
    y: 100,
    homeBuildingId: 8000,
  };
  const howler: Entity = {
    ...human,
    id: 9001,
    name: 'Bjorn',
    surname: 'Cursed',
    type: EntityType.Werewolf,
    moonHowlerCursed: true,
    alive: true,
    x: howlerX,
    y: 100,
  };
  const church: Building = {
    ...state.buildings[0]!,
    id: 8000,
    type: BuildingType.Church,
    completed: true,
    occupants: [9000],
    faction: undefined,
    x: 90,
    y: 90,
    width: 50,
    height: 56,
  };
  return { state, priest, howler, church, entities: [priest, howler], buildings: [church] };
}

describe('Moon Howler exorcism overhaul', () => {
  it('churches hold up to 4 priests and 4 priests cap the cure at 71%', () => {
    expect(BUILDING_CONFIGS[BuildingType.Church].maxOccupants).toBe(4);
    const w = moonHowlerRiteWeights(4);
    expect(w.cure).toBeCloseTo(0.71, 5);
    expect(w.cure).toBeLessThanOrEqual(MOON_HOWLER_CURE_CHANCE_MAX);
  });

  it('skips when the priest is out of exorcism range — no teleport', () => {
    const f = exorcismFixture(500); // priest at (100,100), howler at (500,100) → 400px
    const res = tryMoonHowlerChurchCures(
      f.state,
      f.entities,
      f.buildings,
      0, // full-moon night
      22,
      new Map(f.entities.map((e) => [e.id, e])),
    );
    expect(res.skippedReason).toBe('priest_too_far');
    expect(res.attempted).toBe(false);
  });

  it('attempts when the priest has hunted the howler down into range', () => {
    const f = exorcismFixture(150); // 50px — well within range
    const res = tryMoonHowlerChurchCures(
      f.state,
      f.entities,
      f.buildings,
      0,
      22,
      new Map(f.entities.map((e) => [e.id, e])),
      () => 0.1, // roll < cure (0.35) → cured
    );
    expect(res.attempted).toBe(true);
    expect(res.outcome).toBe('cured');
    expect(f.howler.moonHowlerCursed).toBe(false);
  });

  it('breaking a curse earns the priest the Howlerbane title', () => {
    const f = exorcismFixture(150);
    const res = tryMoonHowlerChurchCures(
      f.state,
      f.entities,
      f.buildings,
      0,
      22,
      new Map(f.entities.map((e) => [e.id, e])),
      () => 0.1,
    );
    expect(res.outcome).toBe('cured');
    expect(f.priest.title).toBe('Howlerbane');
  });

  it('a nearby Barracks Soldier rolls to save the priest (extra roll, not guaranteed)', () => {
    const f = exorcismFixture(150);
    // Soldier within MOON_HOWLER_GUARD_PROTECT_RANGE of the priest at (100,100).
    const guard: Entity = {
      ...f.priest,
      id: 9002,
      name: 'Sven',
      job: JobType.Soldier,
      occupation: 'Soldier',
      x: 120,
      y: 90,
      homeBuildingId: 8001,
    };
    const barracks: Building = {
      ...f.church,
      id: 8001,
      type: BuildingType.Barracks,
      occupants: [9002],
      x: 110,
      y: 80,
      width: 40,
      height: 40,
    };
    const entities = [...f.entities, guard];
    const buildings = [...f.buildings, barracks];

    // rng 0.49 → rite rolls priest_killed (0.35 ≤ 0.49 < 0.75), guard roll 0.49 < 0.5 → saved.
    const res = tryMoonHowlerChurchCures(
      f.state,
      entities,
      buildings,
      0,
      22,
      new Map(entities.map((e) => [e.id, e])),
      () => 0.49,
    );
    expect(res.outcome).toBe('priest_fled');
    expect(res.priestsKilled).toHaveLength(0);
    expect(f.priest.alive).toBe(true);
  });

  it('without a guard the priest dies and the survivors are scared', () => {
    const f = exorcismFixture(150);
    const res = tryMoonHowlerChurchCures(
      f.state,
      f.entities,
      f.buildings,
      0,
      22,
      new Map(f.entities.map((e) => [e.id, e])),
      () => 0.49, // priest_killed, no guard to save
    );
    expect(res.outcome).toBe('priest_killed');
    expect(res.priestsKilled).toHaveLength(1);
    expect(f.priest.alive).toBe(false);
    // Survivors retreat for a cooldown → next attempt is skipped as scared.
    expect(f.state.moonHowlerPriestsFleeUntil).toBe(
      f.state.tick + MOON_HOWLER_EXORCISM_INTERVAL_HOURS * TICKS_PER_HOUR,
    );
    const again = tryMoonHowlerChurchCures(
      f.state,
      f.entities,
      f.buildings,
      0,
      22,
      new Map(f.entities.map((e) => [e.id, e])),
      () => 0.49,
    );
    expect(again.skippedReason).toBe('priests_scared');
  });
});
