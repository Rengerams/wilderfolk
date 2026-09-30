import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { BuildingType, MapSize, EntityType } from '../src/game/gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR, prefersHomeTonight } from '../src/game/dayCycle';
import { getHumanActivityProjection } from '../src/game/humanStatus';

describe('selected human activity projection', () => {
  it('returns stable read-only fields from the authoritative world', () => {
    const world = initGame({ villageName: 'Projection', size: MapSize.Medium, seed: 101 });
    const human = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    if (!human) throw new Error('Expected an initial human');
    const before = { tick: world.tick, x: human.x, y: human.y };

    const projection = getHumanActivityProjection(world, human);

    expect(projection.activity).toBeTypeOf('string');
    expect(projection.schedule.label).toMatch(/^\d{2}:00–\d{2}:00$/);
    expect(projection.schedule.startHour).toBeLessThan(projection.schedule.endHour);
    expect(projection.observedAtTick).toBe(world.tick);
    expect(projection.transition).toBeNull();
    expect(world.tick).toBe(before.tick);
    expect(human.x).toBe(before.x);
    expect(human.y).toBe(before.y);
  });

  it('reports a presentation-only activity transition when the label changes', () => {
    const world = initGame({ villageName: 'Projection', size: MapSize.Medium, seed: 303 });
    const human = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    if (!human) throw new Error('Expected an initial human');

    const projection = getHumanActivityProjection(world, human, 'Previous activity');

    expect(projection.transition).toEqual({
      from: 'Previous activity',
      to: projection.activity,
      observedAtTick: world.tick,
    });
  });

  it('explains an assigned home that no longer exists', () => {
    const world = initGame({ villageName: 'Projection', size: MapSize.Medium, seed: 202 });
    const human = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    if (!human) throw new Error('Expected an initial human');
    human.residenceBuildingId = 999_999;

    const projection = getHumanActivityProjection(world, human);

    expect(projection.home).toBeNull();
    expect(projection.blockedReason).toBe('Assigned home is unavailable');
    expect(projection.observedAtTick).toBe(world.tick);
  });

  it('reports an intentional evening outing instead of implying a failed home return', () => {
    const world = initGame({ villageName: 'Projection', size: MapSize.Medium, seed: 404 });
    const human = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    if (!human) throw new Error('Expected an initial human');
    human.homeBuildingId = undefined;
    human.residenceBuildingId = undefined;

    const eveningTick = Array.from({ length: 100 }, (_, day) => day * TICKS_PER_DAY + 19 * TICKS_PER_HOUR)
      .find((tick) => !prefersHomeTonight(human.id, tick, 19));
    if (eveningTick === undefined) throw new Error('Expected a deterministic evening outing sample');
    world.tick = eveningTick;

    const projection = getHumanActivityProjection(world, human);

    expect(projection.activity).toBe('Socialising — evening outing');
    expect(projection.blockedReason).toBeNull();
    expect(projection.target?.label).toBe('Evening outing');
  });

  it('distinguishes a stale workplace from a missing residence', () => {
    const world = initGame({ villageName: 'Projection', size: MapSize.Medium, seed: 505 });
    const human = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    if (!human) throw new Error('Expected an initial human');
    const home = {
      id: 90_001,
      type: BuildingType.House,
      x: 80,
      y: 80,
      width: 40,
      height: 40,
      occupants: [],
      level: 1,
      constructionProgress: 1,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    };
    world.buildings.push(home);
    human.residenceBuildingId = home.id;
    human.homeBuildingId = 999_999;

    const projection = getHumanActivityProjection(world, human);

    expect(projection.home?.id).toBe(home.id);
    expect(projection.workplace).toBeNull();
    expect(projection.blockedReason).toBe('Assigned workplace is unavailable');
  });
});