/**
 * Shared test fixture factories. The literals are complete `Entity`/`Building` values, typed rather
 * than cast, so a new required field fails to compile here instead of reading as `undefined`.
 */
import type { Building, BuildingType, Entity } from '../game/gameTypes';
import { EntityType, JobType } from '../game/gameTypes';
import { SPECIES_CONFIG } from '../game/speciesConfig';

/**
 * The fields every hand-built settler fixture in the suite shares. `maxAge` mirrors what `createEntity`
 * assigns a human; `reproductionCooldown` completes the pair a cast would silently omit.
 */
function settlerBase(id: number): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: SPECIES_CONFIG[EntityType.Human].maxAge,
    reproductionCooldown: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
  };
}

/** A living adult settler with a default `Settler` job — the suite's most-copied fixture. */
export function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return { ...settlerBase(id), job: JobType.Settler, ...overrides };
}

/**
 * A second, older spelling of {@link human}: same body, but standing at the origin, named, female,
 * and with **no** `job` — matching the three byte-identical `stubHuman()` copies it replaces.
 */
export function stubHuman(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    ...settlerBase(id),
    x: 0,
    y: 0,
    name: 'Asha',
    surname: 'Reed',
    gender: 'female',
    ...overrides,
  };
}

/** A completed test building at `constructionProgress: 1`; the `100` variant is {@link finishedBuilding}. */
export function building(
  id: number,
  type: BuildingType,
  overrides: Partial<Building> = {},
): Building {
  const base: Building = {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
  return { ...base, ...overrides };
}

/**
 * The same completed test building at `constructionProgress: 100`. Passing it in `overrides` still wins.
 */
export function finishedBuilding(
  id: number,
  type: BuildingType,
  overrides: Partial<Building> = {},
): Building {
  return building(id, type, { constructionProgress: 100, ...overrides });
}

/** Buckets entities by type — every entity, alive or not, exactly as the five copies did. */
export function byType(entities: Entity[]): Record<EntityType, Entity[]> {
  const buckets = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) buckets[type] = [];
  for (const entity of entities) buckets[entity.type].push(entity);
  return buckets;
}
