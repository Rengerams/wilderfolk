/**
 * Shared test fixture factories. The literals are complete `Entity`/`Building` values, typed rather
 * than cast, so a new required field fails to compile here instead of reading as `undefined`.
 */
import type { Building, BuildingType, Entity, WorldState } from '../game/gameTypes';
import { EntityType, JobType } from '../game/gameTypes';
import { SPECIES_CONFIG } from '../game/speciesConfig';
import { createEntity } from '../game/entityFactory';
import { initialHumanNeeds } from '../game/simulation/humanPhysiology';

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
    // Player humans carry native needs only; the legacy wire slots stay zero.
    energy: 0,
    maxEnergy: 0,
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
  const base = { ...settlerBase(id), job: JobType.Settler, ...overrides };
  // A hand-built settler is a fully rested adult: native needs, never a legacy energy conversion.
  return { ...base, needs: base.needs ?? initialHumanNeeds(100) };
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

/** A generated resident with the social fixture's age and energy, inserted into its real world. */
export function addGeneratedSocialHuman(
  w: WorldState,
  opts: {
    id: number;
    name?: string;
    surname?: string;
    generation?: number;
    isJuvenile?: boolean;
    workerBuildingId?: number;
    job?: JobType;
    x?: number;
    y?: number;
  },
): Entity {
  const e = createEntity(
    EntityType.Human,
    opts.x ?? 300,
    opts.y ?? 300,
    opts.id,
    80,
    opts.isJuvenile ?? false,
    {
      name: opts.name ?? `H${opts.id}`,
      surname: opts.surname,
      generation: opts.generation,
      ageYears: opts.isJuvenile ? 8 : 18,
    },
  );
  // Construct the fixture with its initial assignment; no runtime workplace transition.
  const resident: Entity = {
    ...e,
    ...(opts.workerBuildingId != null ? { workerBuildingId: opts.workerBuildingId } : {}),
    ...(opts.job ? { job: opts.job } : {}),
    alive: true,
  };
  w.entities.push(resident);
  return resident;
}
