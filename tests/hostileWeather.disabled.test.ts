/**
 * The temporary owner switch that turns hostile weather off.
 *
 * `worldEvents.HOSTILE_WEATHER_ENABLED` (set `false` 2026-09-17) makes `updateDisasters` and
 * `applyDailyWeatherEffects` return immediately, so no disaster spawns and a storm damages nothing.
 * Weather itself still rolls — rain, fog, snow, drought, their visuals and the farm multiplier are
 * untouched — this removes the harm, not the sky.
 *
 * The first test pins the switch. That is deliberate: a temporary product switch should fail loudly
 * if someone flips it back, rather than silently changing what the rest of this file asserts. When
 * hostile weather is re-enabled, delete that test together with the `skipIf` guards in
 * `tests/weatherConsequences.test.ts`, which then run again unchanged.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  HOSTILE_WEATHER_ENABLED,
  applyDailyWeatherEffects,
  updateDisasters,
} from '../src/game/worldEvents';
import { EVENT_INTERVAL, isProductionTick } from '../src/game/dayCycle';
import { BuildingType, WeatherType } from '../src/game/gameTypes';
import type { Building } from '../src/game/gameTypes';

function playerHouse(id: number, health: number): Building {
  return {
    id,
    type: BuildingType.House,
    x: 100,
    y: 100,
    width: 60,
    height: 48,
    rotation: 0,
    completed: true,
    faction: 'player',
    occupants: [],
    constructionProgress: 100,
    level: 1,
    spriteScale: 1,
    health,
    maxHealth: 100,
  } as never;
}

describe('hostile weather is switched off', () => {
  it('the switch is off', () => {
    expect(HOSTILE_WEATHER_ENABLED).toBe(false);
  });

  it('spawns no disaster on a tick the gate would otherwise accept', () => {
    const state = initGame({ villageName: 'Calm', size: 'medium' });
    state.year = 5;
    state.tick = EVENT_INTERVAL.disaster; // 2880 = 40 in-game days — the gate's own interval
    state.disasters = [];
    state.lifetimeStats.disastersSurvived = 0;

    // Prove the tick is a real disaster tick, so "nothing spawned" is the switch's doing and not a
    // gate that happened to be closed.
    expect(state.year).toBeGreaterThan(3);
    expect(isProductionTick(state.tick, EVENT_INTERVAL.disaster)).toBe(true);

    updateDisasters(state);

    expect(state.disasters).toEqual([]);
    expect(state.lifetimeStats.disastersSurvived).toBe(0);
  });

  it('leaves a building untouched on a storm day', () => {
    const state = initGame({ villageName: 'Calm', size: 'medium' });
    state.weather = WeatherType.Storm;
    state.buildings.push(playerHouse(1, 100));

    applyDailyWeatherEffects(state);

    expect((state.buildings[0] as Building).health).toBe(100);
    expect(state.notifications.some((n) => n.title.includes('Storm'))).toBe(false);
    expect(state.deathParticles.some((p) => p.color === '#7dd3fc')).toBe(false);
  });
});
