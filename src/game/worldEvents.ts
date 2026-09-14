import type { Entity, WorldState, Building } from './gameTypes';
import { EntityType, Season, WeatherType } from './gameTypes';
import { killHuman, isProductionTick, EVENT_INTERVAL, systemsPulsesFromLegacy } from './dayCycle';
import { ensureEntityByIdMap, unindexLivingEntity } from './entityIndex';
import { formatCitizenName, formatDeathLog } from './citizenId';
import { logDeath, logEvent } from './eventLog';
import {
  createDeathParticles,
  addNotification,
  addFloatingText,
  impulseScreenShake,
} from './simEffects';
import { getMultiplier, hasTech } from './simHelpers';
import { getSimRng } from './simRng';

type DisasterType = 'fire' | 'flood' | 'plague' | 'tornado' | 'earthquake';

const ALL_DISASTER_TYPES: readonly DisasterType[] = [
  'fire',
  'flood',
  'plague',
  'tornado',
  'earthquake',
];

function clearHuntTargetsForVictim(state: WorldState, victimId: number): void {
  for (let i = 0; i < state.entities.length; i++) {
    const entity = state.entities[i];
    if (entity.huntTargetId === victimId) {
      entity.huntTargetId = undefined;
    }
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
    logDeath(
      state,
      formatDeathLog(entity, 'died in a disaster'),
      formatCitizenName(entity),
      { x: entity.x, y: entity.y },
    );
  } else {
    entity.alive = false;
    unindexLivingEntity(state, entity);
    clearHuntTargetsForVictim(state, entity.id);
  }

  createDeathParticles(state, entity.x, entity.y, color, 5, 'smoke');
}

/**
 * Systems pulses between weather rolls.
 * Re-rolls about every ~2.5–3 colony days.
 */
const WEATHER_ROLL_SYSTEMS_PULSES = systemsPulsesFromLegacy(50 / 3);

export function updateWeather(state: WorldState): void {
  state.weatherTimer++;
  if (state.weatherTimer % Math.max(1, WEATHER_ROLL_SYSTEMS_PULSES) !== 0) return;

  const season = state.season;
  const roll = getSimRng('worldEvents')();

  // Bias to leave "event" weather after a spell
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

/** Weather never destroys a building completely — storm damage stops here (repair restores HP). */
export const STORM_DAMAGE_HEALTH_FLOOR = 20;

/**
 * Storm damage per day per building. Floored at the health floor so weather never destroys
 * a building completely — repairable via the Repair action.
 */
export function applyStormDamageToBuildings(
  buildings: readonly Building[],
  resistMult: number,
  damagePerDay = 6,
): Building[] {
  const damaged: Building[] = [];
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (!b.completed || b.faction === 'rival') continue;
    const dmg = Math.max(1, Math.round(damagePerDay * resistMult));
    const before = b.health ?? b.maxHealth;
    // A building already at or below the weather floor must not be touched: the old
    // `Math.max(20, before - dmg)` raised a 15 HP building back to 20 (storm "healing" it) and
    // the `health < before` test then hid that from the damage report.
    if (before <= STORM_DAMAGE_HEALTH_FLOOR) continue;
    b.health = Math.max(STORM_DAMAGE_HEALTH_FLOOR, before - dmg);
    if (b.health < before) damaged.push(b);
  }
  return damaged;
}

/**
 * Earthquake damage per affected building: completed player buildings inside the quake's own
 * radius only. The branch previously damaged every building on the map regardless of distance,
 * completion or owner, so the x/y/radius rolled for the quake had no effect.
 */
export function applyEarthquakeDamageToBuildings(
  buildings: readonly Building[],
  quakeX: number,
  quakeY: number,
  radius: number,
  resistMult: number,
  damage = 15,
): Building[] {
  const damaged: Building[] = [];
  const radiusSq = radius * radius;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (!b.completed || b.faction === 'rival') continue;
    const dx = b.x - quakeX;
    const dy = b.y - quakeY;
    if (dx * dx + dy * dy >= radiusSq) continue;
    const currentHp = b.health ?? b.maxHealth;
    b.health = Math.max(10, Math.round(currentHp - damage * resistMult));
    damaged.push(b);
  }
  return damaged;
}

/**
 * Daily weather consequences — called from the daily layer.
 */
export function applyDailyWeatherEffects(state: WorldState): void {
  if (state.weather !== WeatherType.Storm) return;
  const resistMult = getMultiplier(state, 'disaster_resist');
  const damaged = applyStormDamageToBuildings(state.buildings, resistMult);

  if (damaged.length > 0) {
    for (let i = 0; i < damaged.length; i++) {
      const b = damaged[i];
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

export function updateDisasters(state: WorldState): void {
  if (
    isProductionTick(state.tick, EVENT_INTERVAL.disaster) &&
    state.year > 3 &&
    getSimRng('worldEvents')() < 0.15
  ) {
    const rollable = hasTech(state, 'medicine_2')
      ? ALL_DISASTER_TYPES.filter((t) => t !== 'plague')
      : ALL_DISASTER_TYPES;
    const type = rollable[Math.floor(getSimRng('worldEvents')() * rollable.length)];

    const x = getSimRng('worldEvents')() * state.width;
    const y = getSimRng('worldEvents')() * state.height;
    const radius = 30 + getSimRng('worldEvents')() * 50;
    const radiusSq = radius * radius;

    state.disasters.push({
      type,
      x,
      y,
      radius,
      duration: systemsPulsesFromLegacy(200),
      progress: 0,
    });

    if (state.lifetimeStats) {
      state.lifetimeStats.disastersSurvived += 1;
    }

    impulseScreenShake(state, 8);
    addNotification(
      state,
      `Disaster: ${type.charAt(0).toUpperCase() + type.slice(1)}!`,
      `A ${type} has struck the village!`,
      'warning',
    );
    logEvent(state, 'disaster', `A ${type} struck the village`);

    const resistMult = getMultiplier(state, 'disaster_resist');
    const entityById = ensureEntityByIdMap(state);
    const killedThisTick = new Set<number>();

    if (type === 'fire') {
      for (let i = 0; i < state.buildings.length; i++) {
        const b = state.buildings[i];
        const dx = b.x - x;
        const dy = b.y - y;
        if (dx * dx + dy * dy < radiusSq) {
          const currentHp = b.health ?? b.maxHealth;
          b.health = Math.max(10, Math.round(currentHp - 30 * resistMult));
        }
      }
      for (let i = 0; i < state.entities.length; i++) {
        const e = state.entities[i];
        if (!e.alive) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        if (dx * dx + dy * dy < radiusSq) {
          killEntityInDisaster(state, e, '#ff4500', entityById, killedThisTick);
        }
      }
    } else if (type === 'flood') {
      for (let i = 0; i < state.entities.length; i++) {
        const e = state.entities[i];
        if (!e.alive || e.type === EntityType.Tree) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        if (dx * dx + dy * dy < radiusSq && getSimRng('worldEvents')() < 0.3) {
          killEntityInDisaster(state, e, '#4682b4', entityById, killedThisTick);
        }
      }
    } else if (type === 'tornado') {
      const coreRadiusSq = radius * 0.3 * (radius * 0.3);
      for (let i = 0; i < state.entities.length; i++) {
        const e = state.entities[i];
        if (!e.alive) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const distSq = dx * dx + dy * dy;

        if (distSq < radiusSq) {
          e.vx += (getSimRng('worldEvents')() - 0.5) * 5;
          e.vy += (getSimRng('worldEvents')() - 0.5) * 5;
          if (distSq < coreRadiusSq && getSimRng('worldEvents')() < 0.1) {
            killEntityInDisaster(state, e, '#888888', entityById, killedThisTick);
          }
        }
      }
    } else if (type === 'earthquake') {
      impulseScreenShake(state, 15);
      applyEarthquakeDamageToBuildings(state.buildings, x, y, radius, resistMult);
    } else if (type === 'plague') {
      let infected = 0;
      for (let i = 0; i < state.entities.length; i++) {
        const e = state.entities[i];
        if (!e.alive || e.type !== EntityType.Human) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        if (dx * dx + dy * dy >= radiusSq) continue;

        if (getSimRng('worldEvents')() < 0.2) {
          if (!killedThisTick.has(e.id)) {
            killedThisTick.add(e.id);
            killHuman(e, state.buildings, entityById, state.tick);
            clearHuntTargetsForVictim(state, e.id);
            infected++;
            createDeathParticles(state, e.x, e.y, '#4a6741', 6, 'smoke');
            logDeath(
              state,
              formatDeathLog(e, 'succumbed to plague'),
              formatCitizenName(e),
              { x: e.x, y: e.y },
            );
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

  // Update active disasters progress
  const remaining: typeof state.disasters = [];
  for (let i = 0; i < state.disasters.length; i++) {
    const d = state.disasters[i];
    d.progress++;
    if (d.progress < d.duration) {
      remaining.push(d);
    }
  }
  state.disasters = remaining;
}