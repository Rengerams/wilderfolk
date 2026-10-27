import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import { TICKS_PER_DAY } from './dayCycle';
import { GRASS_GROWTH_PER_TICK } from './grassEcology';
import { SPECIES_CONFIG } from './speciesConfig';
import { buildGrassPopulationSnapshot, grassPopulationTotal } from './simQueries';
import { createEntity } from './entityFactory';
import { getGrassPopulationCap, markGrassDead, pushNewEntity, syncEntityGrids } from './simulation/simulationEntities';
import { seededRandomForRun } from './simRng';

export function tickGrassDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive?: Entity[],
): void {
  const { width, height, byType, grassMult, reproMult, newEntities } = ctx;

  if (!ctx.grassPopulation) {
    ctx.grassPopulation = buildGrassPopulationSnapshot(byType, newEntities);
  }
  if (ctx.grassCap === undefined) {
    ctx.grassCap = getGrassPopulationCap(width, height);
  }

  const grassConfig = SPECIES_CONFIG[EntityType.Grass];
  const growth = GRASS_GROWTH_PER_TICK * grassMult * TICKS_PER_DAY;
  // Approximate former per-tick spawn chance over a full day.
  const dailyReproChance = Math.min(
    1,
    1 - Math.pow(1 - grassConfig.reproductionChance, TICKS_PER_DAY),
  );

  const grassList = byType[EntityType.Grass] ?? [];
  for (const grass of grassList) {
    if (!grass.alive) continue;

    grass.age++;
    if (grass.age >= grass.maxAge) {
      markGrassDead(ctx, grass);
      syncEntityGrids(ctx, grass);
      continue;
    }

    grass.energy = Math.min(grass.maxEnergy, grass.energy + growth);
    grass.flash = Math.max(0, (grass.flash ?? 0) - 1);

    const total = grassPopulationTotal(ctx.grassPopulation);
    // Seeded per blade and tick: a blade either reproduces or not on this day of this seed,
    // independent of how many other blades were drawn earlier in the loop.
    const blade = `grass-repro:${grass.id}:${state.tick}`;
    if (
      total < ctx.grassCap
      && grass.energy >= grassConfig.reproductionEnergyThreshold
      && seededRandomForRun(blade) < dailyReproChance * reproMult
    ) {
      const angle = seededRandomForRun(`${blade}:angle`) * Math.PI * 2;
      const dist = 8 + seededRandomForRun(`${blade}:dist`) * grassConfig.wanderRadius;
      const nx = Math.min(width, Math.max(0, grass.x + Math.cos(angle) * dist));
      const ny = Math.min(height, Math.max(0, grass.y + Math.sin(angle) * dist));
      const patch = createEntity(
        EntityType.Grass,
        nx,
        ny,
        state.nextEntityId++,
        grassConfig.spawnEnergy,
      );
      pushNewEntity(state, ctx, patch);
      allAlive?.push(patch);
    }

    syncEntityGrids(ctx, grass);
  }
}

