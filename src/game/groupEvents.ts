import type { WorldState, Entity, Building, GameEvent } from './gameTypes';
import { EntityType } from './gameTypes';
import { createEntity } from './entityFactory';
import { isPassableWildlifePosition } from './worldGen';
import { isLegalCampSite } from './worldEventSites';
import { randomPointWhere, addReputation } from './simHelpers';
import { indexLivingEntity } from './entityIndex';
import { pushNewEntity } from './simulation/simulationEntities';
import type { TickContext } from './simulation/simulationTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { addCappedResource } from './resourceUtils';
import { recordFoodProduced } from './economyLedger';
import { addFloatingText } from './simEffects';
import { playerHumanCount } from './playerHuman';
import { getSimRng } from './simRng';

type WorldEventId =
  | 'wolf_migration'
  | 'bountiful_harvest'
  | 'traveling_merchant'
  | 'nature_boom'
  | 'surveyors_crown'
  | 'deer_migration'
  | 'generous_neighbors';

const WORLD_EVENTS: { id: WorldEventId; weight: number; minHumans?: number }[] = [
  { id: 'wolf_migration', weight: 10 },
  { id: 'bountiful_harvest', weight: 10 },
  { id: 'traveling_merchant', weight: 8 },
  { id: 'nature_boom', weight: 8 },
  { id: 'surveyors_crown', weight: 5, minHumans: 5 },
  { id: 'deer_migration', weight: 8 },
  { id: 'generous_neighbors', weight: 6, minHumans: 4 },
];

export function rollYearlyWorldEvent(
  state: WorldState,
  allAlive: Entity[],
  _buildings: Building[],
  width: number,
  height: number,
  nextEntityId: () => number,
  /**
   * The tick's context. A spawn must go through `ctx.newEntities`: a bare `allAlive.push` here lands
   * on an array about to be discarded. Optional only for the perf/probe harnesses.
   */
  ctx?: TickContext,
): { event: GameEvent | null; bountifulHarvest: boolean } {
  /**
   * Register one spawned entity through the canonical owner when a context is available. The
   * no-context fallback is the pre-existing behaviour and is never taken in play.
   */
  const register = (entity: Entity | null): void => {
    if (!entity) return;
    if (ctx) pushNewEntity(state, ctx, entity);
    else {
      allAlive.push(entity);
      indexLivingEntity(state, entity);
    }
  };

  const humans = playerHumanCount(allAlive);
  const pool = WORLD_EVENTS.filter((e) => !e.minHumans || humans >= e.minHumans);
  const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
  if (totalWeight <= 0) {
    return { event: null, bountifulHarvest: false };
  }
  let roll = getSimRng('groupEvents')() * totalWeight;
  let picked = pool[0];
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) { picked = entry; break; }
  }

  let bountifulHarvest = false;

  switch (picked.id) {
    case 'wolf_migration': {
      for (let i = 0; i < 3; i++) {
        register(spawnWildlife(state, EntityType.Wolf, nextEntityId()));
      }
      return {
        event: { id: `wolf_migration_${state.tick}`, title: 'Wolf Pack Migration', description: 'A pack of wolves has migrated into the valley!', emoji: '🐺', effect: '+3 Wolves', type: 'negative' },
        bountifulHarvest,
      };
    }
    case 'bountiful_harvest':
      bountifulHarvest = true;
      return {
        event: { id: `bountiful_harvest_${state.tick}`, title: 'Bountiful Harvest', description: 'Optimal weather causes a massive agricultural boom!', emoji: '🌾', effect: 'Farm production doubled', type: 'positive' },
        bountifulHarvest,
      };
    case 'traveling_merchant':
      addCappedResource(state, 'gold', 50);
      addFloatingText(state, width / 2, height / 2, '+50 Gold', '#eab308');
      return {
        event: { id: `traveling_merchant_${state.tick}`, title: 'Traveling Merchant', description: 'A wealthy merchant caravan passed through!', emoji: '🛒', effect: '+50 Gold', type: 'positive' },
        bountifulHarvest,
      };
    case 'nature_boom':
      for (let i = 0; i < 15; i++) {
        register(spawnWildlife(state, EntityType.Tree, nextEntityId()));
      }
      for (let i = 0; i < 30; i++) {
        register(spawnWildlife(state, EntityType.Grass, nextEntityId()));
      }
      return {
        event: { id: `nature_boom_${state.tick}`, title: 'Ecological Super-Bloom', description: 'Natural energy revitalizes the valley flora!', emoji: '🌿', effect: '+15 Trees, +30 Grass', type: 'positive' },
        bountifulHarvest,
      };
    case 'surveyors_crown':
      addReputation(state, 5);
      return {
        event: { id: `surveyors_crown_${state.tick}`, title: 'Royal Surveyors', description: 'Crown surveyors mapped your village and filed a favorable report.', emoji: '📜', effect: '+5 Reputation', type: 'positive' },
        bountifulHarvest,
      };
    case 'deer_migration':
      for (let i = 0; i < 4; i++) {
        register(spawnWildlife(state, EntityType.Deer, nextEntityId()));
      }
      return {
        event: { id: `deer_migration_${state.tick}`, title: 'Deer Migration', description: 'A herd of deer wandered into the valley!', emoji: '🦌', effect: '+4 Deer', type: 'positive' },
        bountifulHarvest,
      };
    case 'generous_neighbors':
      recordFoodProduced(state, 'foraging', addCappedResource(state, 'food', 40));
      return {
        event: { id: `generous_neighbors_${state.tick}`, title: 'Forest Bounty', description: 'Foragers returned with an unusually rich harvest.', emoji: '🍄', effect: '+40 Food', type: 'positive' },
        bountifulHarvest,
      };
    default:
      return { event: null, bountifulHarvest };
  }
}

/** Ground a yearly tree or grass patch occupies, validated like any other 32-px prop. */
const YEARLY_PROP_FOOTPRINT_PX = 32;

/** Wildlife keeps this far inside the map edge, so a herd never spawns half off-screen. */
const YEARLY_WILDLIFE_MARGIN_PX = 16;

/**
 * Off-cycle spawns draw from the one random-point owner and pick the domain rule for the type;
 * a fully blocked map spawns nothing.
 */
function spawnWildlife(state: WorldState, type: EntityType, id: number): Entity | null {
  const random = getSimRng('groupEvents');
  const point = type === EntityType.Tree || type === EntityType.Grass
    ? randomPointWhere(state, random, (x, y) => isLegalCampSite(state, x, y, YEARLY_PROP_FOOTPRINT_PX))
    : randomPointWhere(state, random, (x, y) => isPassableWildlifePosition(state, x, y, YEARLY_WILDLIFE_MARGIN_PX));
  if (!point) return null;
  return createEntity(type, point.x, point.y, id, SPECIES_CONFIG[type].spawnEnergy);
}

