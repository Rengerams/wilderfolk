import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize, EntityType } from '../src/game/gameTypes';
import { DAYS_PER_YEAR, getColonyDay, TICKS_PER_DAY } from '../src/game/dayCycle';
import { countTamedAnimals, getAnimalCareStatus, tickAnimalCare } from '../src/game/animalCare';

function setColonyDay(state: ReturnType<typeof initGame>, day: number): void {
  state.year = Math.floor(day / DAYS_PER_YEAR);
  state.dayInYear = day % DAYS_PER_YEAR;
}

function addTamed(state: ReturnType<typeof initGame>): void {
  state.entities.push({
    id: state.nextEntityId++,
    type: EntityType.Deer,
    x: 200,
    y: 200,
    alive: true,
    tamedBy: 1,
  } as never);
}

describe('A1 post-taming animal care', () => {
  it('counts tamed animals', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    addTamed(state);
    expect(countTamedAnimals(state)).toBe(1);
  });

  it('consumes 15% of a human daily ration per tamed animal and stays fed', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    addTamed(state);
    state.resources.food = 50;
    setColonyDay(state, 10);
    tickAnimalCare(state);
    expect(state.resources.food).toBeCloseTo(50 - 0.45);
    expect(getAnimalCareStatus(state)).toBe('fed');
  });

  it('consumes 0.45 per animal when multiple tamed animals exist', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    addTamed(state);
    addTamed(state);
    state.resources.food = 50;
    setColonyDay(state, 10);
    tickAnimalCare(state);
    expect(state.resources.food).toBeCloseTo(50 - 0.9);
    expect(getAnimalCareStatus(state)).toBe('fed');
  });

  it('warns when no food is available', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    addTamed(state);
    state.resources.food = 0;
    setColonyDay(state, 10);
    tickAnimalCare(state);
    expect(getAnimalCareStatus(state)).toBe('warning');
  });

  it('escalates warning to shortage and re-warns after recovery', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    addTamed(state);
    state.resources.food = 0;

    setColonyDay(state, 10);
    tickAnimalCare(state);
    expect(getAnimalCareStatus(state)).toBe('warning');

    setColonyDay(state, 11);
    tickAnimalCare(state);
    expect(getAnimalCareStatus(state)).toBe('warning');

    setColonyDay(state, 12);
    tickAnimalCare(state);
    expect(getAnimalCareStatus(state)).toBe('shortage');

    // Recovery resets the warning/shortage markers.
    state.resources.food = 10;
    setColonyDay(state, 13);
    tickAnimalCare(state);
    expect(getAnimalCareStatus(state)).toBe('fed');
    expect(state.resources.food).toBeCloseTo(10 - 0.45);

    // A later hungry day warns again instead of silently staying fed.
    state.resources.food = 0;
    setColonyDay(state, 14);
    tickAnimalCare(state);
    expect(getAnimalCareStatus(state)).toBe('warning');
  });

  it('gives the owner an energy bonus when animals are fed', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    state.entities.push({
      id: state.nextEntityId++,
      type: EntityType.Human,
      x: 200,
      y: 200,
      alive: true,
      energy: 50,
      maxEnergy: 100,
    } as never);
    const ownerId = state.entities[state.entities.length - 1].id;
    addTamed(state);
    state.entities[state.entities.length - 1].tamedBy = ownerId;
    state.resources.food = 50;
    setColonyDay(state, 10);
    tickAnimalCare(state);
    expect(state.entities.find((e) => e.id === ownerId)?.energy).toBe(58);
    expect(state.entities.find((e) => e.id === ownerId)?.needs?.stamina).toBeCloseTo(58);
  });

  it('does nothing without tamed animals', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    state.resources.food = 1;
    setColonyDay(state, 10);
    tickAnimalCare(state);
    expect(state.resources.food).toBe(1);
  });
});

describe('M1 — the animal-shortage warning fires once per episode', () => {
  it('does not re-notify on the following days of the same shortage', () => {
    const state = initGame({ seed: 20240913 });
    state.resources.food = 0;
    // Day 5 so the warning marker (day-2) is a real past day rather than a negative one.
    state.dayInYear = 5;
    state.tick = 5 * TICKS_PER_DAY;
    // One tamed animal whose owner is a real settler.
    const animal = state.entities.find((e) => e.type === EntityType.Rabbit)!;
    const owner = state.entities.find((e) => e.type === EntityType.Human)!;
    animal.tamedBy = owner.id;

    const firstDay = getColonyDay(state);
    state.storyFlags = { animal_care_warning_day: firstDay - 2 };
    state.notifications = [];

    tickAnimalCare(state);
    const afterFirst = state.notifications.filter((n) => n.title.includes('Animal shortage')).length;

    // Next colony day, still unfed: the shortage continues but must not re-announce.
    state.dayInYear += 1;
    state.tick += TICKS_PER_DAY;
    tickAnimalCare(state);
    const afterSecond = state.notifications.filter((n) => n.title.includes('Animal shortage')).length;

    expect(afterFirst).toBe(1);
    expect(afterSecond).toBe(1);
  });
});
