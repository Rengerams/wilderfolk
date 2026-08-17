/**
 * Systems layer — every 4 ticks.
 *
 * Weather, disasters, research, trade caravans, wildlife AI, wolf recruitment.
 * Eco metrics are daily (tickLayerDaily); grass is daily; trees are static.
 */
import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { isProductionTick, EVENT_INTERVAL } from './dayCycle';
import type { TickContext } from './simulation/simulationTypes';
import { tickWildlife } from './lifeSimulation';
import { updateWeather, updateDisasters } from './worldEvents';
import { updateResearch } from './research';
import { tickTradeCaravans } from './tradeCaravans';
import { createEntity } from './entityFactory';
import { indexEntity } from './entityIndex';
import { addFloatingText } from './simEffects';
import { WILDLIFE_LAYER_INTERVAL } from './simFocus';

/** Systems layer interval (ticks). Keep in sync with WILDLIFE_LAYER_INTERVAL. */
export const LAYER_SYSTEMS_INTERVAL = WILDLIFE_LAYER_INTERVAL;

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
}
