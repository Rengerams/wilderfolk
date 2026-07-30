/**
 * Systems layer — every 4 ticks.
 *
 * Weather, disasters, research, trade caravans, wildlife AI, ecosystem metrics,
 * wolf recruitment. Grass is daily; trees are static (no tick).
 */
import type { WorldState } from './gameTypes';
import { BuildingType, EntityType } from './gameTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { isProductionTick, EVENT_INTERVAL } from './dayCycle';
import type { TickContext } from './lifeSimulation';
import { tickWildlife } from './lifeSimulation';
import { updateWeather, updateDisasters } from './worldEvents';
import { updateResearch } from './research';
import { tickTradeCaravans } from './tradeCaravans';
import { createEntity } from './entityFactory';
import { indexEntity } from './entityIndex';
import { addFloatingText } from './simEffects';
import { WILDLIFE_LAYER_INTERVAL } from './simFocus';
import { hasTech } from './simHelpers';
import { computePopulationCounts } from './entityCounts';
import type { Building } from './gameTypes';
import type { PopulationCounts } from './entityCounts';

/** Systems layer interval (ticks). Keep in sync with WILDLIFE_LAYER_INTERVAL. */
export const LAYER_SYSTEMS_INTERVAL = WILDLIFE_LAYER_INTERVAL;

const INDUSTRIAL_BUILDING_TYPES: BuildingType[] = [
  BuildingType.Blacksmith,
  BuildingType.Mill,
  BuildingType.Workshop,
  BuildingType.Mine,
  BuildingType.Quarry,
  BuildingType.LumberMill,
];

const IDEAL_WILDLIFE = 80;

/** Pollution / eco health / biodiversity — systems cadence only. */
function tickEcosystemMetrics(
  state: WorldState,
  counts: PopulationCounts,
  buildings: Building[],
): void {
  let industrialCount = 0;
  let playerCompletedBuildings = 0;
  for (const b of buildings) {
    if (!b.completed) continue;
    if (b.faction !== 'rival') playerCompletedBuildings++;
    if (INDUSTRIAL_BUILDING_TYPES.includes(b.type)) industrialCount++;
  }
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1;
  state.pollutionLevel = Math.min(
    100,
    Math.floor(industrialCount * 4 * pollutionMult + counts.humans / 3),
  );

  const totalWildlife = counts.rabbits + counts.deer + counts.wolves + counts.foxes;
  const wildlifeRatio = Math.min(1, totalWildlife / IDEAL_WILDLIFE);
  const buildingImpact = playerCompletedBuildings * 2;
  const pollutionPenalty = Math.floor(state.pollutionLevel / 2);
  state.ecosystemHealth = Math.max(
    0,
    Math.min(100, 100 - buildingImpact - pollutionPenalty + (wildlifeRatio * 30 - 20)),
  );

  const species = [counts.rabbits, counts.deer, counts.wolves, counts.foxes].filter((c) => c > 0);
  const total = species.reduce((a, b) => a + b, 0);
  if (total > 0) {
    state.biodiversityIndex = species.reduce((sum, count) => {
      const p = count / total;
      return sum - p * Math.log(p);
    }, 0);
  } else {
    state.biodiversityIndex = 0;
  }
}

/** Occasional predator migration to keep wolf pressure present. */
function tickWolfRecruitment(state: WorldState, ctx: TickContext): void {
  const { width, height, byType, newEntities, entityById } = ctx;
  if (
    !isProductionTick(state.tick, EVENT_INTERVAL.wolfRecruit)
    || (byType[EntityType.Wolf]?.filter((e) => e.alive).length ?? 0) >= 2
    || Math.random() >= 0.1
  ) {
    return;
  }

  const edge = Math.floor(Math.random() * 4);
  let sx = 0;
  let sy = 0;
  if (edge === 0) {
    sx = Math.random() * width;
    sy = 0;
  } else if (edge === 1) {
    sx = Math.random() * width;
    sy = height;
  } else if (edge === 2) {
    sx = 0;
    sy = Math.random() * height;
  } else {
    sx = width;
    sy = Math.random() * height;
  }

  const wolf = createEntity(
    EntityType.Wolf,
    sx,
    sy,
    state.nextEntityId++,
    SPECIES_CONFIG[EntityType.Wolf].spawnEnergy,
  );
  newEntities.push(wolf);
  indexEntity(entityById, wolf);
  addFloatingText(state, sx, sy, 'A lone wolf enters', '#6b7280');
}

export function tickLayerSystems(state: WorldState, ctx: TickContext): void {
  updateWeather(state);
  updateDisasters(state);
  updateResearch(state);
  tickTradeCaravans(state);
  tickWildlife(state, ctx);
  tickWolfRecruitment(state, ctx);

  // Eco indexes — systems cadence (not every game tick)
  const alive = state.entities.filter((e) => e.alive);
  for (const e of ctx.newEntities) {
    if (e.alive) alive.push(e);
  }
  const counts = computePopulationCounts(alive);
  tickEcosystemMetrics(state, counts, ctx.updatedBuildings);
}
