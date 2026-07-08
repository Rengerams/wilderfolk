import type { Entity, EntityByType, WorldState } from './gameTypes';
import { EntityType, emptyEntityByType } from './gameTypes';
import { isPlayerHuman } from './groupEvents';
import type { SimTickDelta } from './simBuffers/simDelta';

/**
 * Phase C — sparse entity store for React UI. Avoids scanning `world.entities` each render.
 * Worker path syncs from tick delta; main-thread path mirrors alive entities each session update.
 */
export class EntityCatalog {
  private byId = new Map<number, Entity>();
  private aliveIds = new Set<number>();
  private aliveCache: Entity[] | null = null;
  private byTypeCache: EntityByType | null = null;

  private invalidateAliveIndex(): void {
    this.aliveCache = null;
    this.byTypeCache = null;
  }

  private ensureAliveIndex(): { alive: Entity[]; byType: EntityByType } {
    if (this.aliveCache && this.byTypeCache) {
      return { alive: this.aliveCache, byType: this.byTypeCache };
    }

    const alive: Entity[] = [];
    const byType = emptyEntityByType();
    for (const id of this.aliveIds) {
      const entity = this.byId.get(id);
      if (!entity?.alive) continue;
      alive.push(entity);
      byType[entity.type].push(entity);
    }

    this.aliveCache = alive;
    this.byTypeCache = byType;
    return { alive, byType };
  }

  rebuild(entities: Iterable<Entity>): void {
    this.byId.clear();
    this.aliveIds.clear();
    this.invalidateAliveIndex();
    for (const entity of entities) {
      this.byId.set(entity.id, entity);
      if (entity.alive) this.aliveIds.add(entity.id);
    }
  }

  applyTickDelta(delta: Pick<SimTickDelta, 'diedIds' | 'newEntities' | 'catalogEntities'>): void {
    // Process catalogEntities first (full state sync), then new spawns, then deaths last.
    // This guarantees that death always wins if an ID appears in multiple delta arrays.
    if (delta.catalogEntities) {
      for (const entity of delta.catalogEntities) {
        this.byId.set(entity.id, entity);
        if (entity.alive) this.aliveIds.add(entity.id);
        else this.aliveIds.delete(entity.id);
      }
    }
    for (const entity of delta.newEntities) {
      this.byId.set(entity.id, entity);
      if (entity.alive) this.aliveIds.add(entity.id);
    }
    for (const id of delta.diedIds) {
      const entity = this.byId.get(id);
      if (entity) entity.alive = false;
      this.aliveIds.delete(id);
    }
    this.invalidateAliveIndex();
  }

  get(id: number | null | undefined): Entity | undefined {
    if (id == null) return undefined;
    const entity = this.byId.get(id);
    return entity?.alive ? entity : undefined;
  }

  getAny(id: number | null | undefined): Entity | undefined {
    if (id == null) return undefined;
    return this.byId.get(id);
  }

  /** Returns a shallow copy so callers cannot corrupt the internal cache. */
  getAlive(): Entity[] {
    return [...this.ensureAliveIndex().alive];
  }

  getAliveByType(type: EntityType): Entity[] {
    return this.ensureAliveIndex().byType[type];
  }

  getEntityByType(): EntityByType {
    return this.ensureAliveIndex().byType;
  }

  getPlayerHumans(): Entity[] {
    return this.getAlive().filter(isPlayerHuman);
  }

  getAliveHumans(): Entity[] {
    return this.getAliveByType(EntityType.Human);
  }

  countAlive(): number {
    return this.aliveIds.size;
  }
}

/** Prefer catalog, then sim tick buckets, then a full-world scan. */
export function resolveAliveByType(
  world: WorldState,
  type: EntityType,
  catalog?: EntityCatalog,
): Entity[] {
  if (catalog) return catalog.getAliveByType(type);
  return world.entityByType?.[type]
    ?? world.entities.filter((entity) => entity.alive && entity.type === type);
}

export function resolveAliveHumans(world: WorldState, catalog?: EntityCatalog): Entity[] {
  return resolveAliveByType(world, EntityType.Human, catalog);
}