import type { Entity, EntityByType, WorldState } from './gameTypes';
import { EntityType, emptyEntityByType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { ensureEntityByIdMap } from './entityIndex';

/**
 * Sparse entity store for React UI, avoiding a scan of `world.entities` each render. Rebuilt from the
 * authoritative snapshot on the worker path, mirrored each session update on the main thread.
 */
export class EntityCatalog {
  private byId = new Map<number, Entity>();
  private aliveIds: Set<number> | null = new Set<number>();
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

    for (const [id, entity] of this.byId) {
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
    if (this.aliveIds) {
      for (const id of deadOrMissingIds) this.aliveIds.delete(id);
    }

    this.aliveCache = alive;
    this.byTypeCache = byType;
    return { alive, byType };
  }

  rebuild(entities: Iterable<Entity>): void {
    this.byId = new Map<number, Entity>();
    this.aliveIds = new Set<number>();
    this.invalidateAliveIndex();

    for (const entity of entities) {
      this.byId.set(entity.id, entity);
      if (entity.alive) {
        this.aliveIds.add(entity.id);
      }
    }
  }

  /** Borrow the validated authoritative lookup instead of rebuilding an identical catalogue per tick. */
  adoptWorldIndex(world: WorldState): void {
    this.byId = ensureEntityByIdMap(world);
    this.aliveIds = null;
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
