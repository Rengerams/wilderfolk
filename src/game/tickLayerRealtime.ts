/**
 * Realtime layer — every tick.
 *
 * Prisoner release, moon howler, renffr, spatial/scent, human AI,
 * stats sampling, particles, hunt visuals.
 * Wildlife → systems; grass/buildings → daily.
 */
import { pruneHuntVisuals } from './huntvisuals';
import type {
  WorldState, DeathParticle, FloatingText, PopulationHistoryEntry, Entity,
} from './gameTypes';
import { EntityType } from './gameTypes';
import {
  USE_SPATIAL_GRID,
  syncMobileSimGrid,
  syncGrassRenderGrid,
} from './spatialGrid';
import { USE_SCENT_GRID, ensureScentGrid, tickScentGrid } from './scentGrid';
import { computePopulationCounts } from './entityCounts';
import { tickHumans } from './lifeSimulation';
import type { TickContext } from './lifeSimulation';
import { releasePrisoners } from './workforce';
import { maybeTriggerRenffrOmen, tickRenffrOmen } from './renffrStar';
import {
  isNightHour,
  getAbsoluteCalendarDay,
  isResidenceOccupantEntity,
  syncResidenceOccupants,
} from './dayCycle';
import { logEvent } from './eventLog';
import {
  isActiveMoonHowler,
  tickMoonHowlerCycle,
} from './moonHowler';
import { isPlayerHuman } from './playerHuman';
import { tickHotelLodging } from './hotelStay';
import { tickElectionCeremony } from './villageLeadership';
import { addBigNews, addNotification, impulseScreenShake } from './simEffects';

/** How often we sample world metrics into populationHistory. */
export const STATS_SAMPLE_INTERVAL_TICKS = 10;

/** Rolling buffer length — 300 samples × STATS_SAMPLE_INTERVAL_TICKS (≈42 game days at 72 ticks/day). */
export const POPULATION_HISTORY_MAX = 300;

function rebuildPredators(byType: TickContext['byType'], playerHumans?: readonly Entity[]): Entity[] {
  const out: Entity[] = [
    ...byType[EntityType.Wolf],
    ...byType[EntityType.Fox],
    ...byType[EntityType.Werewolf],
  ];
  const settlers = playerHumans ?? byType[EntityType.Human].filter(isPlayerHuman);
  for (const h of settlers) {
    if (h.alive && !h.isJuvenile) out.push(h);
  }
  for (const h of byType[EntityType.Human]) {
    if (h.alive && h.faction === 'rival') out.push(h);
  }
  return out;
}

export function tickLayerRealtime(state: WorldState, ctx: TickContext): void {
  const { width, height } = ctx;

  // --- Pre-AI world pulses (formerly free-floating in gameTick) ---
  releasePrisoners(state);
  // Visitor hotel check-in / checkout (evening & night)
  tickHotelLodging(state);

  // Election ceremony advances every sim tick (phase lengths are in ticks, not days)
  if (state.electionCeremony) {
    const electionReveal = tickElectionCeremony(state, state.year);
    if (electionReveal) {
      addBigNews(state, electionReveal.title, electionReveal.message, 'positive');
      addNotification(state, electionReveal.title, electionReveal.message, 'event');
      impulseScreenShake(state, 4);
    }
  }

  const aliveEntities = state.entities.filter((e) => e.alive);
  const colonyDay = getAbsoluteCalendarDay(state.tick);
  const moonResult = tickMoonHowlerCycle(
    state,
    aliveEntities,
    state.buildings,
    colonyDay,
    ctx.hourOfDay,
    ctx.entityById,
  );
  if (moonResult.changed) {
    ctx.byType = moonResult.byType;
    ctx.playerHumans = ctx.byType[EntityType.Human].filter(isPlayerHuman);
  }
  ctx.predators = rebuildPredators(ctx.byType, ctx.playerHumans);

  if (aliveEntities.some(isActiveMoonHowler)) {
    syncResidenceOccupants(
      aliveEntities.filter(isResidenceOccupantEntity),
      ctx.updatedBuildings,
    );
  }

  if (maybeTriggerRenffrOmen(state, state.entities, isNightHour(ctx.hourOfDay))) {
    logEvent(
      state,
      'event',
      'A star scratched "Renffr" across the night sky. The letters fell out of alignment.',
      'Renffr',
    );
  }
  state.renffrOmen = tickRenffrOmen(state.renffrOmen);

  // Spatial grid sync (must run before AI uses the grids)
  const mobileGrid = USE_SPATIAL_GRID
    ? syncMobileSimGrid(state.mobileGrid, width, height, aliveEntities)
    : undefined;
  state.mobileGrid = mobileGrid;
  ctx.mobileGrid = mobileGrid;

  const grassGrid = USE_SPATIAL_GRID
    ? syncGrassRenderGrid(state.grassGrid, width, height, ctx.byType[EntityType.Grass] ?? [])
    : undefined;
  state.grassGrid = grassGrid ?? undefined;
  ctx.grassGrid = grassGrid;

  // Scent grid
  const scentGrid = USE_SCENT_GRID ? ensureScentGrid(state) : undefined;
  if (scentGrid) tickScentGrid(state, ctx.predators);
  ctx.scentGrid = scentGrid;

  // Human AI — fauna → systems; grass → daily
  tickHumans(state, ctx);

  // Stats sampling (every 10 ticks)
  if (state.tick % STATS_SAMPLE_INTERVAL_TICKS === 0) {
    if (!state.populationHistory) {
      state.populationHistory = [];
    }

    const counts = computePopulationCounts(state.entities.filter((e) => e.alive));
    let completedBuildings = 0;
    for (const b of state.buildings) {
      if (b.completed && b.faction !== 'rival') completedBuildings++;
    }

    const snapshot: PopulationHistoryEntry = {
      tick: state.tick,
      year: state.year,
      day: state.dayInYear,
      season: state.season,
      humans: counts.humans,
      werewolves: counts.werewolves,
      wildkin: counts.wildkin,
      rabbits: counts.rabbits,
      deer: counts.deer,
      wolves: counts.wolves,
      foxes: counts.foxes,
      grass: counts.grass,
      buildings: completedBuildings,
      gold: state.resources.gold,
      food: state.resources.food,
      wood: state.resources.wood,
      stone: state.resources.stone,
      pollution: state.pollutionLevel,
      ecosystemHealth: state.ecosystemHealth,
      biodiversity: state.biodiversityIndex,
    };

    state.populationHistory.push(snapshot);
    while (state.populationHistory.length > POPULATION_HISTORY_MAX) {
      state.populationHistory.shift();
    }
  }

  // Particle animation
  const newParticles: DeathParticle[] = [];
  for (const p of state.deathParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
    p.life--;
    if (p.life > 0) newParticles.push(p);
  }
  state.deathParticles = newParticles;

  // Floating-text animation
  const newFloatingTexts: FloatingText[] = [];
  for (const ft of state.floatingTexts) {
    ft.y -= 0.7;
    ft.life--;
    ft.scale = ft.life < 6 ? ft.life / 6 : 1;
    if (ft.life > 0) newFloatingTexts.push(ft);
  }
  state.floatingTexts = newFloatingTexts;

  pruneHuntVisuals(state);
}
