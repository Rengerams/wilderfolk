import { pruneHuntVisuals } from './huntvisuals';
import type {
  WorldState, PopulationHistoryEntry, Entity,
} from './gameTypes';
import { EntityType, BuildingType } from './gameTypes';
import {
  USE_SPATIAL_GRID,
  syncMobileSimGrid,
  syncHumanSocialGrid,
  syncGrassRenderGrid,
  syncTreeGrid,
} from './spatialGrid';
import { USE_SCENT_GRID, ensureScentGrid, tickScentGrid } from './scentGrid';
import { computePopulationCounts } from './entityCounts';
import { tickHumans } from './humanTick';
import type { TickContext } from './simulation/simulationTypes';
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
import { getSimRng } from './simRng';
import { tickHotelLodging } from './hotelStay';
import { tickElectionCeremony } from './villageLeadership';
import { addBigNews, addNotification, impulseScreenShake } from './simEffects';

/** How often we sample world metrics into populationHistory. */
export const STATS_SAMPLE_INTERVAL_TICKS = 10;

/** Rolling buffer length — 300 samples × STATS_SAMPLE_INTERVAL_TICKS (≈42 game days at 72 ticks/day). */
export const POPULATION_HISTORY_MAX = 300;

/** 🚀 OPTIMIZED: Zero-allocation array building instead of spread operator concatenation. */
function rebuildPredators(byType: TickContext['byType'], playerHumans?: readonly Entity[]): Entity[] {
  const out: Entity[] = [];
  
  const pushType = (entities: Entity[] | undefined) => {
    if (entities) {
      for (const e of entities) out.push(e);
    }
  };

  pushType(byType[EntityType.Wolf]);
  pushType(byType[EntityType.Fox]);
  pushType(byType[EntityType.Werewolf]);

  const settlers = playerHumans ?? (byType[EntityType.Human]?.filter(isPlayerHuman) ?? []);
  for (const h of settlers) {
    if (h.alive && !h.isJuvenile) out.push(h);
  }
  
  const humans = byType[EntityType.Human] ?? [];
  for (const h of humans) {
    if (h.alive && h.faction === 'rival') out.push(h);
  }
  
  return out;
}

export function tickLayerRealtime(state: WorldState, ctx: TickContext): void {
  const { width, height } = ctx;

  // --- Pre-AI world pulses ---
  releasePrisoners(state);
  tickHotelLodging(state);

  // Election ceremony advances every sim tick
  if (state.electionCeremony) {
    const electionReveal = tickElectionCeremony(state, state.year);
    if (electionReveal) {
      addBigNews(state, electionReveal.title, electionReveal.message, 'positive');
      const hall = state.buildings.find(
        (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival',
      );
      addNotification(
        state,
        electionReveal.title,
        electionReveal.message,
        'event',
        hall ? { x: hall.x + hall.width / 2, y: hall.y + hall.height / 2 } : undefined,
      );
      impulseScreenShake(state, 4);
    }
  }

  const aliveEntities = ctx.aliveEntities;
  const colonyDay = getAbsoluteCalendarDay(state.tick);
  
  const moonResult = tickMoonHowlerCycle(
    state,
    aliveEntities,
    state.buildings,
    colonyDay,
    ctx.hourOfDay,
    ctx.entityById,
    ctx.byType,
    // Pass the module's own owner stream: the default Math.random would leave the lifecycle
    // rolls on the shared global stream instead of the named 'moonHowler' owner.
    getSimRng('moonHowler'),
  );
  
  if (moonResult.changed) {
    ctx.byType = moonResult.byType;
    ctx.playerHumans = ctx.byType[EntityType.Human].filter(isPlayerHuman);
    ctx.predators = rebuildPredators(ctx.byType, ctx.playerHumans);
  }

  // 🚀 OPTIMIZED: Check only the Werewolf array for active moon howlers (O(W) instead of O(N))
  const werewolves = ctx.byType[EntityType.Werewolf] ?? [];
  const activeMoonHowler = werewolves.some(isActiveMoonHowler);

  // Only a legacy save loaded mid-full-moon-night needs this repair: a normal transformed
  // howler has residenceBuildingId cleared and the form change already re-syncs occupants, so
  // an unconditional full-population scan + occupants rewrite every tick was pure churn.
  if (
    activeMoonHowler
    && werewolves.some((e) => isResidenceOccupantEntity(e) && e.residenceBuildingId != null)
  ) {
    const occupants: Entity[] = [];
    for (const entity of aliveEntities) {
      if (isResidenceOccupantEntity(entity)) occupants.push(entity);
    }
    syncResidenceOccupants(occupants, ctx.updatedBuildings);
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

  const humanSocialGrid = USE_SPATIAL_GRID
    ? syncHumanSocialGrid(state.humanSocialGrid, width, height, aliveEntities)
    : undefined;
  state.humanSocialGrid = humanSocialGrid;
  ctx.humanSocialGrid = humanSocialGrid;

  const grassGrid = USE_SPATIAL_GRID
    ? syncGrassRenderGrid(state.grassGrid, width, height, ctx.byType[EntityType.Grass] ?? [])
    : undefined;
  state.grassGrid = grassGrid ?? undefined;
  ctx.grassGrid = grassGrid;

  const treeGrid = USE_SPATIAL_GRID
    ? syncTreeGrid(state.treeGrid, width, height, ctx.byType[EntityType.Tree] ?? [])
    : undefined;
  state.treeGrid = treeGrid;
  ctx.treeGrid = treeGrid;

  const scentGrid = USE_SCENT_GRID ? ensureScentGrid(state) : undefined;
  if (scentGrid) tickScentGrid(state, ctx.predators);
  ctx.scentGrid = scentGrid;

  // Human AI
  tickHumans(state, ctx);

  // Stats sampling (every 10 ticks)
  if (state.tick % STATS_SAMPLE_INTERVAL_TICKS === 0) {
    if (!state.populationHistory) {
      state.populationHistory = [];
    }

    // 🚀 OPTIMIZED: Reuse ctx.aliveEntities instead of filtering state.entities again
    const counts = computePopulationCounts(ctx.aliveEntities);
    
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
    // Keep buffer bounded (V8 optimizes shift() well for small arrays, but slice is also safe)
    if (state.populationHistory.length > POPULATION_HISTORY_MAX) {
      state.populationHistory.shift();
    }
  }

  // 🚀 OPTIMIZED: Zero-allocation particle animation (in-place mutation + truncate)
  let particleWriteIdx = 0;
  for (let i = 0; i < state.deathParticles.length; i++) {
    const p = state.deathParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
    p.life--;
    if (p.life > 0) {
      state.deathParticles[particleWriteIdx++] = p;
    }
  }
  state.deathParticles.length = particleWriteIdx; // Truncate array, zero GC pressure

  // 🚀 OPTIMIZED: Zero-allocation floating-text animation
  let textWriteIdx = 0;
  for (let i = 0; i < state.floatingTexts.length; i++) {
    const ft = state.floatingTexts[i];
    ft.y -= 0.7;
    ft.life--;
    ft.scale = ft.life < 6 ? ft.life / 6 : 1;
    if (ft.life > 0) {
      state.floatingTexts[textWriteIdx++] = ft;
    }
  }
  state.floatingTexts.length = textWriteIdx; // Truncate array, zero GC pressure

  pruneHuntVisuals(state);
}