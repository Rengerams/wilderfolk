/**
 * Weather consequences (Phase 3.4) — weather stops being info-only:
 *  - Drought cuts farm yields, Rain boosts them (getWeatherFarmMultiplier).
 *  - Storm days slowly damage player buildings (recoverable via Repair),
 *    halved by Fortification research (disaster_resist), never destroying
 *    a building (health floor), and announced once when it bites.
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
import { BuildingType, WeatherType } from '../src/game/gameTypes';
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
   * These two assert that a storm *announces* itself, which only happens while
   * `HOSTILE_WEATHER_ENABLED` is on: the switch is enforced inside `applyDailyWeatherEffects`, and the
   * owner ruling recorded in the roadmap (`Roadmap_V0_6.4.1.MD`, F6 / the climate note) keeps it off —
   * "weather still rolls visually, it just does no harm". Skipping rather than deleting keeps the
   * assertions ready for the day the switch flips, and the damage-only tests above still run at full
   * strength because `applyStormDamageToBuildings` is deliberately not gated.
   */
  it.skipIf(!HOSTILE_WEATHER_ENABLED)('notifies + logs once when a storm damages buildings', () => {
    const state = initGame({ villageName: 'W', size: 'medium' });
    state.weather = WeatherType.Storm;
    state.buildings.push(playerHouse(1, 100));
    const beforeNotifs = state.notifications.length;
    applyDailyWeatherEffects(state);
    const newNotifs = state.notifications.slice(beforeNotifs);
    expect(newNotifs.some((n) => n.title.includes('Storm'))).toBe(true);
    expect(state.eventLog.some((e) => e.message.includes('storm'))).toBe(true);
    expect((state.buildings[0] as Building).health).toBe(94);
  });

  it('stays silent when the storm damages nothing (all rival/skeleton)', () => {
    const state = initGame({ villageName: 'W', size: 'medium' });
    state.weather = WeatherType.Storm;
    state.buildings.push({ ...playerHouse(1, 100), faction: 'rival' as never });
    const beforeNotifs = state.notifications.length;
    applyDailyWeatherEffects(state);
    expect(state.notifications.slice(beforeNotifs).length).toBe(0);
  });

  it.skipIf(!HOSTILE_WEATHER_ENABLED)('shows storm-damage feedback on each battered building (FX)', () => {
    const state = initGame({ villageName: 'W', size: 'medium' });
    state.weather = WeatherType.Storm;
    state.buildings.push(playerHouse(1, 100), playerHouse(2, 100));
    const beforeParticles = state.deathParticles.length;
    applyDailyWeatherEffects(state);
    // One floating-text warning per damaged building.
    const stormTexts = state.floatingTexts.filter((ft) => ft.text.includes('Storm'));
    expect(stormTexts.length).toBe(2);
    // Wind-blown debris particles spawned at the battered buildings.
    expect(state.deathParticles.length).toBeGreaterThan(beforeParticles);
  });
});

describe('farm yield responds to weather (integration)', () => {
  function farmWorld(weather: WeatherType): WorldState {
    // The map seed is pinned because this fixture puts a completed farm at a **fixed** coordinate
    // (400, 300) and then measures what the *weather* does to its yield. `initGame` otherwise seeds the
    // map from `nativeRandom()`, so the fixture silently depended on what the terrain happened to be
    // there: the 2026-09-24 hydrology carve made some seeds put that spot on a river bed, and the whole
    // assertion (`clear` production > 0) then failed in a full-suite run while passing in isolation.
    // Pinning the seed makes the map — and therefore the fixture — reproducible; the weather rule under
    // test is untouched.
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
    // Pin a pioneer to the farm just before the first day boundary so the
    // farm is staffed when production fires (homeBuildingId = workplace).
    const farmId = w.buildings[w.buildings.length - 1].id;
    for (let t = 1; t <= TICKS_PER_DAY - 1; t++) w = gameTick(w);
    const human = w.entities.find((e) => e.alive && !e.faction);
    if (human) human.homeBuildingId = farmId;
    for (let t = TICKS_PER_DAY; t <= TICKS_PER_DAY * days; t++) w = gameTick(w);
    return w.economyLedger?.produced?.farms ?? 0;
  }

  it('drought yields less than clear weather over the same days', () => {
    const clear = farmsProducedByDay(farmWorld(WeatherType.Clear), 2);
    const drought = farmsProducedByDay(farmWorld(WeatherType.Drought), 2);
    expect(clear).toBeGreaterThan(0);
    expect(drought).toBeLessThan(clear);
  });
});

/**
 * The Teraforge weather registry (ported 2026-09-24): every state resolves to an effect, and every
 * effect survives a frame against a real 2D context surface. The registry is what `drawWeather` looks up
 * per frame, so a `WeatherType` with no plugin would silently paint nothing.
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
