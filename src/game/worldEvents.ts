import type { Entity, WorldState } from './gameTypes';
import { EntityType, Season, WeatherType } from './gameTypes';
import type { Building } from './gameTypes';
import { killHuman, isProductionTick, EVENT_INTERVAL, systemsPulsesFromLegacy } from './dayCycle';
import { ensureEntityByIdMap, unindexLivingEntity } from './entityIndex';
import { formatCitizenName, formatDeathLog } from './citizenId';
import { logEvent } from './eventLog';
import {
  createDeathParticles,
  addNotification,
  addFloatingText,
  impulseScreenShake,
  getMultiplier,
  hasTech,
} from './gameEngine';

type DisasterType = 'fire' | 'flood' | 'plague' | 'tornado' | 'earthquake';

const ALL_DISASTER_TYPES: DisasterType[] = ['fire', 'flood', 'plague', 'tornado', 'earthquake'];

function clearHuntTargetsForVictim(state: WorldState, victimId: number): void {
  for (const entity of state.entities) {
    if (entity.huntTargetId === victimId) entity.huntTargetId = undefined;
  }
}

function killEntityInDisaster(
  state: WorldState,
  entity: Entity,
  color: string,
  entityById: Map<number, Entity>,
  killedThisTick: Set<number>,
): void {
  if (!entity.alive || killedThisTick.has(entity.id)) return;
  killedThisTick.add(entity.id);

  if (entity.type === EntityType.Human) {
    killHuman(entity, state.buildings, entityById, state.tick);
  } else {
    entity.alive = false;
    unindexLivingEntity(state, entity);
    clearHuntTargetsForVictim(state, entity.id);
  }
  createDeathParticles(state, entity.x, entity.y, color, 5, 'smoke');
}

/**
 * Systems pulses between weather rolls.
 * Legacy 360 ≈ 60 colony days was so rare players never saw rain.
 * Target: re-roll about every ~2.5–3 colony days (readable weather, not constant spam).
 * At 72 TPD / systems every 4 ticks → 18 systems pulses/day → ~50 pulses ≈ 2.8 days.
 */
const WEATHER_ROLL_SYSTEMS_PULSES = systemsPulsesFromLegacy(50 / 3);
// 50/3 * TICKS_PER_HOUR ≈ 50 systems pulses when TICKS_PER_HOUR=3

export function updateWeather(state: WorldState) {
  state.weatherTimer++;
  if (state.weatherTimer % Math.max(1, WEATHER_ROLL_SYSTEMS_PULSES) !== 0) return;

  const season = state.season;
  const roll = Math.random();
  // Slight bias to leave "event" weather after a spell (feels like weather, not a stuck state)
  if (state.weather !== WeatherType.Clear && roll < 0.35) {
    state.weather = WeatherType.Clear;
    return;
  }

  if (season === Season.Spring) {
    if (roll < 0.45) state.weather = WeatherType.Rain;
    else if (roll < 0.6) state.weather = WeatherType.Fog;
    else if (roll < 0.68) state.weather = WeatherType.Storm;
    else state.weather = WeatherType.Clear;
  } else if (season === Season.Summer) {
    if (roll < 0.12) state.weather = WeatherType.Drought;
    else if (roll < 0.28) state.weather = WeatherType.Rain;
    else if (roll < 0.36) state.weather = WeatherType.Storm;
    else state.weather = WeatherType.Clear;
  } else if (season === Season.Fall) {
    if (roll < 0.4) state.weather = WeatherType.Rain;
    else if (roll < 0.55) state.weather = WeatherType.Fog;
    else if (roll < 0.62) state.weather = WeatherType.Storm;
    else state.weather = WeatherType.Clear;
  } else {
    // Winter
    if (roll < 0.42) state.weather = WeatherType.Snow;
    else if (roll < 0.55) state.weather = WeatherType.Fog;
    else if (roll < 0.62) state.weather = WeatherType.Rain;
    else state.weather = WeatherType.Clear;
  }
}

/**
 * Storm damage per day per building (Phase 3.4). Halved by Fortification
 * research (`disaster_resist`), floored at 20 HP so weather never destroys
 * a building — it is recoverable via the Repair button. Player buildings only.
 * Returns the buildings that lost health (empty when the storm bit nothing).
 */
export function applyStormDamageToBuildings(
  buildings: readonly Building[],
  resistMult: number,
  damagePerDay = 6,
): Building[] {
  const damaged: Building[] = [];
  for (const b of buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    const dmg = Math.max(1, Math.round(damagePerDay * resistMult));
    const before = b.health ?? b.maxHealth;
    b.health = Math.max(20, before - dmg);
    if (b.health < before) damaged.push(b);
  }
  return damaged;
}

/**
 * Daily weather consequences — call from the daily layer once per day.
 * Storm days slowly damage player buildings, raise a notification, and paint
 * the damage on the map (per-building floating text + wind-blown debris) so
 * the consequence is visible, not just a toast. Other weather types change
 * farm yields (see `getWeatherFarmMultiplier`), needing no per-day effect.
 */
export function applyDailyWeatherEffects(state: WorldState): void {
  if (state.weather !== WeatherType.Storm) return;
  const resistMult = getMultiplier(state, 'disaster_resist');
  const damaged = applyStormDamageToBuildings(state.buildings, resistMult);
  if (damaged.length > 0) {
    for (const b of damaged) {
      addFloatingText(
        state,
        b.x + b.width / 2,
        b.y - 12,
        'Storm damage!',
        '#93c5fd',
        'brief',
      );
      createDeathParticles(
        state,
        b.x + b.width / 2,
        b.y + b.height / 2,
        '#7dd3fc',
        5,
        'smoke',
      );
    }
    const noun = damaged.length === 1 ? 'building' : 'buildings';
    addNotification(
      state,
      '⛈️ Storm damage',
      `The storm battered ${damaged.length} ${noun}. Repair them with the 🔧 button.`,
      'warning',
      { x: state.width / 2, y: state.height / 2 },
    );
    logEvent(state, 'event', `A storm damaged ${damaged.length} ${noun}`);
  }
}

export function updateDisasters(state: WorldState) {
  // Domain-specific cadence: disasters are a rare calendar-aligned event.
  // tickLayerSystems calls this every 4 ticks; the internal gate keeps the
  // intended ~40-day interval so the layer does not need to know disaster tuning.
  if (isProductionTick(state.tick, EVENT_INTERVAL.disaster) && state.year > 3 && Math.random() < 0.15) {
    const rollable = hasTech(state, 'medicine_2')
      ? ALL_DISASTER_TYPES.filter((t) => t !== 'plague')
      : ALL_DISASTER_TYPES;
    const type = rollable[Math.floor(Math.random() * rollable.length)];

    const x = Math.random() * state.width;
    const y = Math.random() * state.height;
    const radius = 30 + Math.random() * 50;

    // Duration counted in systems pulses — scale via dayCycle helper (no raw tick math)
    state.disasters.push({
      type, x, y, radius,
      duration: systemsPulsesFromLegacy(200),
      progress: 0,
    });
    if (state.lifetimeStats) {
      state.lifetimeStats.disastersSurvived += 1;
    }
    impulseScreenShake(state, 8);

    addNotification(state, `Disaster: ${type.charAt(0).toUpperCase() + type.slice(1)}!`, `A ${type} has struck the village!`, 'warning');
    logEvent(state, 'disaster', `A ${type} struck the village`);

    // Apply disaster effects
    const resistMult = getMultiplier(state, 'disaster_resist');
    const entityById = ensureEntityByIdMap(state);
    const killedThisTick = new Set<number>();

    if (type === 'fire') {
      // Damage buildings near the fire
      for (const b of state.buildings) {
        const dx = b.x - x, dy = b.y - y;
        if (Math.sqrt(dx*dx + dy*dy) < radius) {
          b.health = Math.max(10, b.health - 30 * resistMult);
        }
      }
      // Kill entities
      for (const e of state.entities) {
        if (!e.alive) continue;
        const dx = e.x - x, dy = e.y - y;
        if (Math.sqrt(dx*dx + dy*dy) < radius) {
          killEntityInDisaster(state, e, '#ff4500', entityById, killedThisTick);
        }
      }
    } else if (type === 'flood') {
      for (const e of state.entities) {
        if (!e.alive || e.type === EntityType.Tree) continue;
        const dx = e.x - x, dy = e.y - y;
        if (Math.sqrt(dx*dx + dy*dy) < radius) {
          if (Math.random() < 0.3) {
            killEntityInDisaster(state, e, '#4682b4', entityById, killedThisTick);
          }
        }
      }
    } else if (type === 'tornado') {
      // Tornado moves entities around
      for (const e of state.entities) {
        if (!e.alive) continue;
        const dx = e.x - x, dy = e.y - y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < radius) {
          e.vx += (Math.random() - 0.5) * 5;
          e.vy += (Math.random() - 0.5) * 5;
          if (dist < radius * 0.3 && Math.random() < 0.1) {
            killEntityInDisaster(state, e, '#888888', entityById, killedThisTick);
          }
        }
      }
    } else if (type === 'earthquake') {
      impulseScreenShake(state, 15);
      for (const b of state.buildings) {
        b.health = Math.max(10, b.health - 15 * resistMult);
      }
    } else if (type === 'plague') {
      let infected = 0;
      for (const e of state.entities) {
        if (!e.alive || e.type !== EntityType.Human) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        if (Math.sqrt(dx * dx + dy * dy) >= radius) continue;
        if (Math.random() < 0.2) {
          if (!killedThisTick.has(e.id)) {
            killedThisTick.add(e.id);
            killHuman(e, state.buildings, entityById, state.tick);
            clearHuntTargetsForVictim(state, e.id);
            infected++;
            createDeathParticles(state, e.x, e.y, '#4a6741', 6, 'smoke');
            logEvent(state, 'death', formatDeathLog(e, 'succumbed to plague'), formatCitizenName(e));
          }
        } else {
          e.energy = Math.max(0, e.energy - 100);
          e.flash = 10;
        }
      }
      state.resources.food = Math.max(0, Math.floor(state.resources.food * 0.85));
      if (infected > 0) {
        addFloatingText(state, x, y - 20, `Plague: ${infected} lost`, '#ef4444');
      }
    }
  }

  // Update active disasters
  const remaining: typeof state.disasters = [];
  for (const d of state.disasters) {
    d.progress++;
    if (d.progress < d.duration) remaining.push(d);
  }
  state.disasters = remaining;
}