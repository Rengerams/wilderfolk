/**
 * Weather is not info-only: drought cuts farm yields while rain boosts them. Storm damage and its
 * feedback exist but hostile weather is switched off, so the suite also pins that production gate.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { getWeatherFarmMultiplier } from '../src/game/grassEcology';
import {
  applyDailyWeatherEffects,
  applyStormDamageToBuildings,
  HOSTILE_WEATHER_ENABLED,
} from '../src/game/worldEvents';
import { BuildingType, EntityType, JobType, WeatherType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import {
  daylightTint,
  listWeather,
  weatherRegistry,
  type WeatherFrame,
} from '../src/game/renderer/weather';

describe('getWeatherFarmMultiplier', () => {
  it('returns the exact weather table', () => {
    expect(getWeatherFarmMultiplier(WeatherType.Clear)).toBe(1);
    expect(getWeatherFarmMultiplier(WeatherType.Fog)).toBe(1);
    expect(getWeatherFarmMultiplier(WeatherType.Snow)).toBe(1);
    expect(getWeatherFarmMultiplier(WeatherType.Rain)).toBe(1.15);
    expect(getWeatherFarmMultiplier(WeatherType.Storm)).toBe(0.9);
    expect(getWeatherFarmMultiplier(WeatherType.Drought)).toBe(0.5);
  });
});

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

describe('applyStormDamageToBuildings', () => {
  it('damages completed player buildings by 6 HP per storm day', () => {
    const house = playerHouse(1, 100);
    const damaged = applyStormDamageToBuildings([house], 1);
    expect(damaged).toEqual([house]);
    expect(house.health).toBe(94);
  });

  it('halves damage when Fortification research (disaster_resist) is active', () => {
    const house = playerHouse(1, 100);
    const damaged = applyStormDamageToBuildings([house], 0.5);
    expect(damaged).toEqual([house]);
    expect(house.health).toBe(97);
  });

  it('never drops a building below the 20 HP floor', () => {
    const house = playerHouse(1, 25);
    applyStormDamageToBuildings([house], 1);
    expect(house.health).toBe(20);
  });

  it('leaves rival and uncompleted buildings untouched', () => {
    const rival = { ...playerHouse(1, 100), faction: 'rival' as never };
    const skeleton = { ...playerHouse(2, 100), completed: false as never };
    const damaged = applyStormDamageToBuildings([rival, skeleton], 1);
    expect(damaged).toEqual([]);
    expect(rival.health).toBe(100);
    expect(skeleton.health).toBe(100);
  });
});

describe('applyDailyWeatherEffects', () => {
  it('does nothing on clear weather (no notification, no damage)', () => {
    const state = initGame({ villageName: 'W', size: 'medium' });
    state.weather = WeatherType.Clear;
    state.buildings.push(playerHouse(1, 100));
    applyDailyWeatherEffects(state);
    expect(state.notifications.length).toBe(0);
    expect((state.buildings[0] as Building).health).toBe(100);
  });

  /**
   * The storm notification + per-building FX block is dormant: `HOSTILE_WEATHER_ENABLED` is false, so
   * `applyDailyWeatherEffects` returns before it. This pins the gate that keeps it off.
   */
  it('keeps storm damage and feedback gated off while hostile weather is disabled', () => {
    expect(HOSTILE_WEATHER_ENABLED).toBe(false);
    const state = initGame({ villageName: 'W', size: 'medium' });
    state.weather = WeatherType.Storm;
    state.buildings.push(playerHouse(1, 100), playerHouse(2, 100));
    const beforeNotifs = state.notifications.length;
    const beforeTexts = state.floatingTexts.length;
    const beforeParticles = state.deathParticles.length;
    const beforeLogs = state.eventLog.length;

    applyDailyWeatherEffects(state);

    expect(state.notifications).toHaveLength(beforeNotifs);
    expect(state.floatingTexts).toHaveLength(beforeTexts);
    expect(state.deathParticles).toHaveLength(beforeParticles);
    expect(state.eventLog.slice(beforeLogs).some((e) => e.message.includes('storm'))).toBe(false);
    expect((state.buildings[0] as Building).health).toBe(100);
    expect((state.buildings[1] as Building).health).toBe(100);
  });
});

describe('farm yield responds to weather (integration)', () => {
  function farmWorld(weather: WeatherType): WorldState {
    // The map seed is pinned because this fixture puts a completed farm at a fixed coordinate and
    // measures what the weather does to its yield.
    const state = initGame({ villageName: 'W', size: 'medium', seed: 20260924 });
    state.weather = weather;
    state.resources.food = 0;
    state.resources.wood = 99999;
    // Completed farm owned by the player.
    state.buildings.push({
      id: state.nextBuildingId++,
      type: BuildingType.Farm,
      x: 400,
      y: 300,
      width: 80,
      height: 60,
      rotation: 0,
      completed: true,
      faction: 'player',
      occupants: [],
      constructionProgress: 100,
      level: 1,
      spriteScale: 1,
    } as never);
    return state;
  }

  function farmsProducedByDay(world: WorldState, days: number): number {
    let w = world;
    const farm = w.buildings[w.buildings.length - 1];
    const human = w.entities.find((e) => e.alive && e.type === EntityType.Human && !e.faction);
    if (!human) throw new Error('farm production fixture needs a living player settler');
    // Assign a real farmer before the shift begins, with a workplace they can reach.
    human.workerBuildingId = farm.id;
    human.job = JobType.Farmer;
    human.x = farm.x + farm.width / 2;
    human.y = farm.y + farm.height / 2;
    farm.occupants = [human.id];
    for (let t = 1; t <= TICKS_PER_DAY * days; t++) w = gameTick(w);
    const archived = (w.foodHistory ?? []).reduce((sum, day) => sum + (day.produced.farms ?? 0), 0);
    return archived + (w.economyLedger?.produced?.farms ?? 0);
  }

  it('drought yields less than clear weather over the same days', () => {
    const clear = farmsProducedByDay(farmWorld(WeatherType.Clear), 2);
    const drought = farmsProducedByDay(farmWorld(WeatherType.Drought), 2);
    expect(clear).toBeGreaterThan(0);
    expect(drought).toBeLessThan(clear);
  });
});

/**
 * The Teraforge weather registry: every `WeatherType` resolves to an effect, and every effect survives
 * a frame against a real 2D context surface.
 */
describe('Teraforge weather registry', () => {
  const frame: WeatherFrame = { width: 640, height: 480, zoom: 1.45, camX: 1200, camY: 900, time: 12.5, dt: 0.016 };

  /** Minimal 2D context — just the surface the ported effects touch. */
  function stubCtx(): CanvasRenderingContext2D {
    const gradient = { addColorStop: () => {} };
    return {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      fillRect: () => {},
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
    } as unknown as CanvasRenderingContext2D;
  }

  it('registers exactly one effect per weather state', () => {
    const ids = listWeather().map((p) => p.id).sort();
    expect(ids).toEqual(Object.values(WeatherType).slice().sort());
    for (const plugin of listWeather()) {
      expect(plugin.label.length, `${plugin.id}: label`).toBeGreaterThan(0);
      expect(typeof plugin.create, `${plugin.id}: create`).toBe('function');
    }
  });

  it('every effect updates and draws a frame without throwing', () => {
    for (const weather of Object.values(WeatherType)) {
      const effect = weatherRegistry.get(weather)!.create();
      const tint = effect.tint?.(frame) ?? null;
      if (tint) {
        // The contract the caller honours: a colour, an alpha and a blend mode.
        expect(tint.alpha, `${weather}: tint alpha`).toBeGreaterThanOrEqual(0);
        expect(tint.op.length, `${weather}: tint blend mode`).toBeGreaterThan(0);
      }
      const ctx = stubCtx();
      expect(() => {
        for (let i = 0; i < 3; i++) effect.update?.(frame.dt, frame);
        effect.draw?.(ctx, frame);
      }, `${weather}: a frame`).not.toThrow();
    }
  });

  it('pins the ported daylight terms', () => {
    // Daylight, where the weather temperature cast lives: heat haze, cold cast, or nothing.
    expect(daylightTint(12, 0)).toBeNull();
    expect(daylightTint(12, 1)?.color).toBe('#ffe8a0');
    expect(daylightTint(12, -1)?.color).toBe('#d0e8f8');
    // Dusk and night belong to the disabled day/night overlay — ported, not wired in `drawWeather`.
    expect(daylightTint(4)?.color).toBe('#0d1b3a');
    expect(daylightTint(22)?.color).toBe('#0d1b3a');
    expect(daylightTint(6)?.color).toBe('#3a3f6b');
    expect(daylightTint(19.5)?.color).toBe('#ff9c5b');
    expect(daylightTint(13)).toBeNull();
  });
});
