import { describe, expect, it } from 'vitest';
import { WeatherType, type Entity } from '../src/game/gameTypes';
import { tickHumanChildLeisure } from '../src/game/humanLeisureBehavior';
import { isPlayerHuman } from '../src/game/playerHuman';
import { personDayRoll, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { initGame } from '../src/game/worldGen';

function playerChild(prototype: Entity, id: number, overrides: Partial<Entity> = {}): Entity {
  return Object.assign(structuredClone(prototype), {
    id,
    alive: true,
    isJuvenile: true,
    age: 10,
    energy: 90,
    maxEnergy: 100,
    x: 100,
    y: 100,
    motherId: undefined,
    fatherId: undefined,
  }, overrides);
}

function childFixture(): { state: ReturnType<typeof initGame>; child: Entity } {
  const state = initGame({ seed: 4242 });
  const prototype = state.entities.find((entity) => isPlayerHuman(entity) && entity.alive);
  if (!prototype) throw new Error('worldGen produced no player settler for the child leisure test');
  state.entities = [];
  state.buildings = [];
  state.weather = WeatherType.Clear;
  return { state, child: playerChild(prototype, 10) };
}

function playTickFor(child: Entity, start = 1, end = 500): number {
  for (let tick = start; tick < end; tick++) {
    const tickBucket = Math.floor(tick / TICKS_PER_HOUR);
    if (personDayRoll(child.id, tick, 718 + tickBucket) < 0.72) return tick;
  }
  throw new Error('could not find a child play tick');
}

function nextPlayHour(child: Entity): { firstCheck: number; sameHourCheck: number; nextCheck: number } {
  for (let hour = 0; hour < 500; hour++) {
    const nextCheck = (hour + 1) * TICKS_PER_HOUR;
    const nextBucket = Math.floor(nextCheck / TICKS_PER_HOUR);
    if (personDayRoll(child.id, nextCheck, 718 + nextBucket) < 0.72) {
      return {
        firstCheck: hour * TICKS_PER_HOUR + 1,
        sameHourCheck: hour * TICKS_PER_HOUR + 2,
        nextCheck,
      };
    }
  }
  throw new Error('could not find consecutive child play hours');
}

function tickChild(state: ReturnType<typeof initGame>, child: Entity, allHumans: Entity[], tick: number): boolean {
  state.tick = tick;
  return tickHumanChildLeisure({
    state,
    entity: child,
    speed: 5,
    hourOfDay: 12,
    onSchedule: false,
    allHumans,
    updatedBuildings: [],
    buildingById: new Map(),
    humanSocialGrid: undefined,
    width: state.width,
    height: state.height,
    livingHumanAt: () => undefined,
    suppressIdleInitial: false,
  });
}

describe('tickHumanChildLeisure', () => {
  it('steers children toward a playmate in the neighborhood', () => {
    const { state, child } = childFixture();
    const nearby = playerChild(child, 11, { x: 120, y: 100 });
    const distant = playerChild(child, 12, { x: 1000, y: 100 });

    expect(tickChild(state, child, [child, nearby, distant], playTickFor(child))).toBe(true);
    expect(child.vx).toBeGreaterThan(0);
  });

  it('does not select a child outside the neighborhood', () => {
    const { state, child } = childFixture();
    const distant = playerChild(child, 12, { x: 1000, y: 100 });

    expect(tickChild(state, child, [child, distant], playTickFor(child))).toBe(false);
    expect(child.vx).toBe(0);
    expect(child.vy).toBe(0);
  });

  it('refreshes neighborhood selection every hour while keeping the mate between checks', () => {
    const { state, child } = childFixture();
    const nearby = playerChild(child, 11, { x: 120, y: 100 });
    const { firstCheck, sameHourCheck, nextCheck } = nextPlayHour(child);

    expect(tickChild(state, child, [child], firstCheck)).toBe(false);
    expect(tickChild(state, child, [child, nearby], sameHourCheck)).toBe(false);
    expect(tickChild(state, child, [child, nearby], nextCheck)).toBe(true);
    expect(child.vx).toBeGreaterThan(0);
    expect(tickChild(state, child, [child, nearby], nextCheck + 1)).toBe(true);
  });
});
