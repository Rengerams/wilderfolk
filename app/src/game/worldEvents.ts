import type { Entity, WorldState } from './gameTypes';
import { EntityType, Season, WeatherType } from './gameTypes';
import { killHuman, isProductionTick, EVENT_INTERVAL } from './dayCycle';
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
    killHuman(entity, state.buildings, entityById);
  } else {
    entity.alive = false;
    clearHuntTargetsForVictim(state, entity.id);
  }
  createDeathParticles(state, entity.x, entity.y, color, 5, 'smoke');
}

export function updateWeather(state: WorldState) {
  state.weatherTimer++;
  if (state.weatherTimer % 360 === 0) {
    const season = state.season;
    const roll = Math.random();
    if (season === Season.Spring) {
      if (roll < 0.5) state.weather = WeatherType.Rain;
      else if (roll < 0.7) state.weather = WeatherType.Fog;
      else state.weather = WeatherType.Clear;
    } else if (season === Season.Summer) {
      if (roll < 0.15) state.weather = WeatherType.Drought;
      else if (roll < 0.3) state.weather = WeatherType.Rain;
      else if (roll < 0.4) state.weather = WeatherType.Storm;
      else state.weather = WeatherType.Clear;
    } else if (season === Season.Fall) {
      if (roll < 0.35) state.weather = WeatherType.Rain;
      else if (roll < 0.55) state.weather = WeatherType.Fog;
      else state.weather = WeatherType.Clear;
    } else {
      if (roll < 0.4) state.weather = WeatherType.Snow;
      else if (roll < 0.6) state.weather = WeatherType.Fog;
      else state.weather = WeatherType.Clear;
    }
  }
}

export function updateDisasters(state: WorldState) {
  // Random disaster chance
  if (isProductionTick(state.tick, EVENT_INTERVAL.disaster) && state.year > 3 && Math.random() < 0.15) {
    const rollable = hasTech(state, 'medicine_2')
      ? ALL_DISASTER_TYPES.filter((t) => t !== 'plague')
      : ALL_DISASTER_TYPES;
    const type = rollable[Math.floor(Math.random() * rollable.length)];

    const x = Math.random() * state.width;
    const y = Math.random() * state.height;
    const radius = 30 + Math.random() * 50;

    state.disasters.push({ type, x, y, radius, duration: 200, progress: 0 });
    if (state.lifetimeStats) {
      state.lifetimeStats.disastersSurvived += 1;
    }
    impulseScreenShake(state, 8);

    addNotification(state, `Disaster: ${type.charAt(0).toUpperCase() + type.slice(1)}!`, `A ${type} has struck the village!`, 'warning');
    logEvent(state, 'disaster', `A ${type} struck the village`);

    // Apply disaster effects
    const resistMult = getMultiplier(state, 'disaster_resist');
    const entityById = new Map(state.entities.map((ent) => [ent.id, ent]));
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
            killHuman(e, state.buildings, entityById);
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