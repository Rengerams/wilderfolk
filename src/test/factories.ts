/**
 * Shared test fixture factories.
 *
 * Why this file exists (`docs/private/audits/2026-09-16/duplication-deadcode.md` G4, evidence in
 * `_test-helper-duplication.md` §2): before it, 11 test files each carried a byte-identical
 * `human()` factory, 12 carried a `building()` factory that had already split into two
 * `constructionProgress` variants, and `byType()`/`stubHuman()` were copied 5 and 3 times. Every
 * copy ended in `as Entity` / `as Building`, so the type checker could not see that the fixtures
 * omit required fields — a new required `Entity` field would read as `undefined` in 30+ files with
 * no compiler error.
 *
 * Location: `src/test/` (not `tests/`) on purpose. `vitest.config.ts:16` collects only
 * `tests/**\/*.test.ts`, so this plain module is never executed as a suite, and
 * `tsconfig.vitest.json:18` includes `src/test/**\/*.ts` so these literals **are** type-checked —
 * which is what makes `as Entity` removable. `tsconfig.app.json:44` excludes `src/test/**` from the
 * production build.
 *
 * The literals are typed as complete `Entity`/`Building` values rather than cast. They are
 * deliberately *not* built through `createEntity`/`createBuilding`: those consume the sim RNG and
 * populate name/gender/traits/sprite fields, which would change what the existing tests exercise.
 * The two required fields the old copies silently omitted (`maxAge`, `reproductionCooldown`) are
 * set once here from their owners.
 */
import type { Building, BuildingType, Entity } from '../game/gameTypes';
import { EntityType, JobType } from '../game/gameTypes';
import { SPECIES_CONFIG } from '../game/speciesConfig';

/**
 * The fields every hand-built settler fixture in the suite shares.
 *
 * `maxAge` mirrors what `createEntity` assigns a human (`SPECIES_CONFIG[EntityType.Human].maxAge`);
 * the pre-extraction copies left it (and `reproductionCooldown`) absent behind an `as Entity` cast.
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

/**
 * A completed test building.
 *
 * `constructionProgress: 1` is the value eight files used. The four files that used `100` call
 * {@link finishedBuilding} instead, so the divergence is recorded once here rather than hidden
 * across twelve copies.
 */
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
 * The same completed test building at `constructionProgress: 100` — the second of the two values
 * the twelve hand-copied `building()` factories had already split into. Passing
 * `constructionProgress` in `overrides` still wins.
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
