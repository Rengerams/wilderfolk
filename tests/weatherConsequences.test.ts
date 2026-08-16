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
} from '../src/game/worldEvents';
import { BuildingType, WeatherType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';

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
    const state = initGame({ villageName: 'W', size: 'small' });
    state.weather = WeatherType.Clear;
    state.buildings.push(playerHouse(1, 100));
    applyDailyWeatherEffects(state);
    expect(state.notifications.length).toBe(0);
    expect((state.buildings[0] as Building).health).toBe(100);
  });

  it('notifies + logs once when a storm damages buildings', () => {
    const state = initGame({ villageName: 'W', size: 'small' });
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
    const state = initGame({ villageName: 'W', size: 'small' });
    state.weather = WeatherType.Storm;
    state.buildings.push({ ...playerHouse(1, 100), faction: 'rival' as never });
    const beforeNotifs = state.notifications.length;
    applyDailyWeatherEffects(state);
    expect(state.notifications.slice(beforeNotifs).length).toBe(0);
  });

  it('shows storm-damage feedback on each battered building (FX)', () => {
    const state = initGame({ villageName: 'W', size: 'small' });
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
    const state = initGame({ villageName: 'W', size: 'small' });
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
    for (let t = 1; t <= 71; t++) w = gameTick(w);
    const human = w.entities.find((e) => e.alive && !e.faction);
    if (human) human.homeBuildingId = farmId;
    for (let t = 72; t <= TICKS_PER_DAY * days; t++) w = gameTick(w);
    return w.economyLedger?.produced?.farms ?? 0;
  }

  it('drought yields less than clear weather over the same days', () => {
    const clear = farmsProducedByDay(farmWorld(WeatherType.Clear), 2);
    const drought = farmsProducedByDay(farmWorld(WeatherType.Drought), 2);
    expect(clear).toBeGreaterThan(0);
    expect(drought).toBeLessThan(clear);
  });
});
