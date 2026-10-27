import type { Entity, EntityByType, WorldState } from './gameTypes';
import { EntityType, emptyEntityByType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';

/**
 * Sparse entity store for React UI. Avoids scanning `world.entities` each render.
 * Worker path rebuilds it from the authoritative snapshot; main-thread path mirrors alive entities
 * each session update.
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
    const deadOrMissingIds: number[] = [];

    for (const id of this.aliveIds) {
      const entity = this.byId.get(id);
      if (!entity || !entity.alive) {
        deadOrMissingIds.push(id);
        continue;
      }
      alive.push(entity);

      // Guard against unrecognized or custom entity types
      if (byType[entity.type]) {
        byType[entity.type].push(entity);
      } else {
        byType[entity.type] = [entity];
      }
    }

    // Clean up stale IDs so aliveIds stays in exact sync
    for (const id of deadOrMissingIds) {
      this.aliveIds.delete(id);
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
      if (entity.alive) {
        this.aliveIds.add(entity.id);
      }
    }
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

  /** Returns a shallow copy so callers cannot corrupt internal cache arrays. */
  getAlive(): Entity[] {
    return [...this.ensureAliveIndex().alive];
  }

  /** Returns a shallow copy so callers cannot corrupt internal type arrays. */
  getAliveByType(type: EntityType): Entity[] {
    const list = this.ensureAliveIndex().byType[type];
    return list ? [...list] : [];
  }

  /** Returns a copy of the by-type table with isolated arrays. */
  getEntityByType(): EntityByType {
    const { byType } = this.ensureAliveIndex();
    const copy = emptyEntityByType();
    for (const key of Object.keys(byType) as EntityType[]) {
      copy[key] = [...(byType[key] ?? [])];
    }
    return copy;
  }

  getPlayerHumans(): Entity[] {
    return this.getAlive().filter(isPlayerHuman);
  }

  getAliveHumans(): Entity[] {
    return this.getAliveByType(EntityType.Human);
  }

  countAlive(): number {
    return this.ensureAliveIndex().alive.length;
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
