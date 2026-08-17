import type { WorldState, Entity } from '../gameTypes';
import { EntityType } from '../gameTypes';
import type { TickContext } from './simulationTypes';
import { recordWildlifeBirth, recordGrassBirth, recordGrassDeath } from '../simQueries';
import { syncSpatialGridEntity } from '../spatialGrid';
import { killHuman, isKillableSettlerEntity } from '../dayCycle';

/** Medium map reference area for grass population cap scaling. */
const GRASS_CAP_REFERENCE_AREA = 1200 * 900;
const GRASS_CAP_BASE = 500;

/**
 * Entity bookkeeping — births, deaths, spatial-grid synchronization and
 * population indexes. Owns the same-tick entity lists in TickContext and keeps
 * byType / entityById / population snapshots consistent when entities change.
 */
export function pushNewEntity(state: WorldState, ctx: TickContext, entity: Entity): void {
  if (
    entity.type !== EntityType.Human
    && entity.type !== EntityType.Tree
    && entity.type !== EntityType.Grass
  ) {
    entity.birthYear = state.year;
  }
  ctx.newEntities.push(entity);
  ctx.entityById.set(entity.id, entity);
  if (ctx.wildlifePopulation) {
    recordWildlifeBirth(
      ctx.wildlifePopulation,
      entity.type,
      ctx.wildlifeSpawnParent?.get(entity.id),
      entity.id,
    );
  }
  if (entity.type === EntityType.Grass && ctx.grassPopulation) {
    recordGrassBirth(ctx.grassPopulation, entity.id);
  }
  syncSpatialGridEntity(entity, ctx.grassGrid, ctx.mobileGrid);
}

/** Wildlife tick death — cursed settlers in werewolf form use human widow/building cleanup. */
export function markGrassDead(ctx: TickContext, grass: Entity): void {
  if (grass.type !== EntityType.Grass || !grass.alive) return;
  grass.alive = false;
  ctx.entityById.delete(grass.id);
  if (ctx.grassPopulation) recordGrassDeath(ctx.grassPopulation);
}

export function isValidHuntPrey(
  prey: Entity,
  preyType: EntityType,
  hunterId: number,
): boolean {
  if (!prey.alive || prey.id === hunterId) return false;
  // Tamed animals are colony stock — wildlife and free hunters leave them alone
  if (prey.tamedBy != null) return false;
  if (preyType === EntityType.Human) {
    if (prey.moonHowlerCursed) return false;
    if (prey.faction === 'visitor' || prey.faction === 'rival') return false;
  }
  return true;
}

export function markWildlifeDead(
  ctx: TickContext,
  entity: Entity,
  wildlifeDeathsThisTick?: Set<number>,
  tick?: number,
): void {
  if (!entity.alive) return;
  if (isKillableSettlerEntity(entity)) {
    killHuman(entity, ctx.updatedBuildings, ctx.entityById, tick);
  } else {
    entity.alive = false;
    ctx.entityById.delete(entity.id);
    wildlifeDeathsThisTick?.add(entity.id);
  }
  // Drop from byType immediately so same-tick hunters / AI fallbacks skip corpse.
  const bucket = ctx.byType[entity.type];
  if (bucket) {
    const idx = bucket.indexOf(entity);
    if (idx >= 0) bucket.splice(idx, 1);
  }
}

export function syncEntityGrids(ctx: TickContext, entity: Entity): void {
  syncSpatialGridEntity(entity, ctx.grassGrid, ctx.mobileGrid);
}

/** Living player humans — includes same-tick newborns from newEntities and entityById. */
export function allLivingHumans(
  state: WorldState,
  newEntities: Entity[],
  entityById?: ReadonlyMap<number, Entity>,
): Entity[] {
  const byId = new Map<number, Entity>();
  if (entityById) {
    for (const e of entityById.values()) {
      if (e.type === EntityType.Human && e.alive) byId.set(e.id, e);
    }
  }
  for (const e of state.entities) {
    if (e.type === EntityType.Human && e.alive) byId.set(e.id, e);
  }
  for (const e of newEntities) {
    if (e.type === EntityType.Human && e.alive) byId.set(e.id, e);
  }
  return [...byId.values()];
}

export function buildHuntTargetByPreyIndex(byType: Record<EntityType, Entity[]>): Map<number, Set<number>> {
  const index = new Map<number, Set<number>>();
  const hunterTypes = [
    EntityType.Wolf,
    EntityType.Fox,
    EntityType.Werewolf,
    EntityType.Human,
  ] as const;
  for (const type of hunterTypes) {
    for (const hunter of byType[type]) {
      if (!hunter.alive || hunter.huntTargetId == null) continue;
      const preyId = hunter.huntTargetId;
      let hunters = index.get(preyId);
      if (!hunters) {
        hunters = new Set();
        index.set(preyId, hunters);
      }
      hunters.add(hunter.id);
    }
  }
  return index;
}

export function clearHuntersTargetingPrey(
  preyId: number,
  entityById: ReadonlyMap<number, Entity>,
  huntTargetByPreyId?: Map<number, Set<number>>,
): void {
  const index = huntTargetByPreyId;
  const hunters = index?.get(preyId);
  if (hunters && index) {
    for (const hunterId of hunters) {
      const hunter = entityById.get(hunterId);
      if (hunter) hunter.huntTargetId = undefined;
    }
    index.delete(preyId);
    return;
  }
  for (const hunter of entityById.values()) {
    if (hunter.huntTargetId === preyId) hunter.huntTargetId = undefined;
  }
}

export function getGrassPopulationCap(mapWidth: number, mapHeight: number): number {
  const area = mapWidth * mapHeight;
  return Math.max(200, Math.round(GRASS_CAP_BASE * (area / GRASS_CAP_REFERENCE_AREA)));
}
