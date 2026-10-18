/**
 * Shape refusal at the load boundary — the *contents* of `entities` and `buildings`.
 *
 * `saveLoad.outcomeReasons.test.ts` covers the world's scalar containers (`resources`, `tick`, …).
 * This case covers what lives inside them, which nothing refused: the restore builds each element by
 * default-and-spread and casts it (`saveLoad.ts`, the `entities:` mapper), so a payload that parsed
 * and matched the version gate could put `x: "nope"` or `type: "Dragon"` into a live world. There was
 * no refusal to observe and no test that fed one in — the differential below is the guard.
 *
 * The fixture is a **real** payload from `buildSaveData` with one field corrupted, so a green case
 * proves the new scan refuses the corruption without refusing the world it came from.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameEngine';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, loadGameFromParsedOutcome, describeSaveLoadOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import { nearestWalkableWorldPoint } from '../src/game/pathfinding';
import { EntityType, type Entity, type WorldState } from '../src/game/gameTypes';

/** A real, loadable payload with a couple of settlers and a building to corrupt. */
function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  // `initGame` seeds wildlife but no settlers; one human + one building is enough to exercise both
  // element scans without inventing a shape the game never produces.
  const human = world.entities.find((e) => e.alive);
  if (!human) throw new Error('fixture has no live entity to corrupt');
  human.type = EntityType.Human;
  world.buildings.push({
    id: world.nextBuildingId++,
    type: 'farm' as WorldState['buildings'][number]['type'],
    x: 100,
    y: 100,
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
  } as WorldState['buildings'][number]);
  // A worldgen animal converted into a settler may stand on impassable ground; loading correctly
  // relocates it and clears its velocity. Use a walkable position to test payload precedence.
  if (world.worldMap) {
    const stand = nearestWalkableWorldPoint(world.worldMap, world.buildings, human.x, human.y);
    if (stand) { human.x = stand.x; human.y = stand.y; }
  }
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

function elements(payload: Record<string, unknown>, key: 'entities' | 'buildings'): Record<string, unknown>[] {
  const list = payload[key];
  if (!Array.isArray(list)) throw new Error(`fixture payload has no ${key} array`);
  return list as Record<string, unknown>[];
}

afterEach(() => {
  resetSimRng();
});

describe('a save whose element shape is unusable is refused by name', () => {
  it('loads the uncorrupted payload, so the refusals below are about the corruption', () => {
    const outcome = loadGameFromParsedOutcome(realPayload());
    expect(outcome.ok, 'the fixture itself must be loadable').toBe(true);
  });

  it('refuses a non-finite position instead of absorbing it', () => {
    const payload = realPayload();
    const target = elements(payload, 'entities')[0];
    target.x = 'nope';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('entities[0].x');
    expect(describeSaveLoadOutcome(outcome)).toContain('entities[0].x');
  });

  it('refuses an out-of-bounds position, the other thing the invariant check reports', () => {
    const payload = realPayload();
    const target = elements(payload, 'entities')[0];
    target.y = (payload.height as number) + 10;

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('entities[0].y');
  });

  it('refuses an entity type this build has no rule for', () => {
    const payload = realPayload();
    elements(payload, 'entities')[0].type = 'dragon';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('entities[0].type');
  });

  it('refuses a job this build has no rule for', () => {
    const payload = realPayload();
    elements(payload, 'entities')[0].job = 'wizard';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('entities[0].job');
  });

  it('refuses a mistyped age, which no numeric comparison would ever pass again', () => {
    const payload = realPayload();
    elements(payload, 'entities')[0].age = '30';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('entities[0].age');
  });

  it('refuses a corrupted building the same way, naming its own list', () => {
    const payload = realPayload();
    elements(payload, 'buildings')[0].type = 'skyscraper';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('buildings[0].type');
  });

  it('refuses an element that is not an object at all', () => {
    const payload = realPayload();
    // A later element, so the fixture keeps a valid one for the earlier checks to pass through.
    elements(payload, 'entities')[1] = null as unknown as Record<string, unknown>;

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('entities[1]');
  });

  it('still tolerates the optional keys the restore defaults', () => {
    // The differential that keeps the scan honest: a missing optional key is a default, not a
    // corruption, and every element in a real payload must survive the new rules untouched.
    const payload = realPayload();
    for (const entity of elements(payload, 'entities')) {
      delete entity.job;
      delete entity.age;
    }
    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok, 'optional keys must remain optional').toBe(true);
  });
});

describe('a save whose container array is unusable is refused by name', () => {
  it('refuses a container that is not an array, naming the container', () => {
    // The restore's `?? []` does not fire for a value that is merely not an array, so the first
    // `.map`/`.filter`/`.some` over it threw a `TypeError` out of the catch-all and its raw text
    // became the player's explanation.
    const payload = realPayload();
    payload.tradeRoutes = 'traders';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('tradeRoutes');
    expect(outcome.detail, 'the raw engine text must not reach the player').not.toContain('is not a function');
    expect(describeSaveLoadOutcome(outcome)).toContain('tradeRoutes');
  });

  it('refuses a null element, naming its position in the list', () => {
    const payload = realPayload();
    const challenges = payload.challenges as Record<string, unknown>[];
    // A later element, so the refusal names its position rather than the first element.
    challenges[3] = null as unknown as Record<string, unknown>;

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('challenges[3]');
    expect(outcome.detail, 'the element rule ran instead of the container rule').not.toContain('challenges is');
  });

  it('refuses a nested id array that is not an array, naming the path to it', () => {
    const payload = realPayload();
    elements(payload, 'buildings')[0].occupants = 'nobody';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('buildings[0].occupants');
  });
});

describe('a persisted array holding a value its readers would break on is refused by name', () => {
  it('refuses a food history that is not an array', () => {
    // `pushCompletedDayToHistory` pushes into `state.foodHistory ?? []`, so a string here threw
    // "history.push is not a function" out of a daily tick.
    const payload = realPayload();
    payload.foodHistory = 'last month';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('foodHistory');
  });

  it('refuses a food-day sample the dashboard dereferences', () => {
    const payload = realPayload();
    payload.foodHistory = [{ day: 3 }];

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('foodHistory[0].produced');
  });

  it('refuses a dismissal list that is not an array', () => {
    // A string spreads into one-character ids, so every dismissal silently stopped matching.
    const payload = realPayload();
    payload.dismissedNotificationIds = 'n1';

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('dismissedNotificationIds');
  });

  it('still loads the food history this build writes, so the refusals above bite', () => {
    const payload = realPayload();
    payload.foodHistory = [{ day: 3, produced: { food: 12 }, consumed: { food: 4 } }];

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok, 'a real food-day sample must survive the new rule').toBe(true);
  });
});

describe('the element defaults repair what a payload omits, and nothing more', () => {
  /** The four fields `createEntity` scopes by species, so a save never carries them on scenery. */
  const SCOPED = ['pregnancyProgress', 'combatRollSeed', 'generation', 'animFrame'] as const;
  const CARRIER_TYPES = new Set<string>(['human', 'rabbit', 'deer', 'wolf', 'fox', 'werewolf', 'wildkin']);

  /** A real payload with the four scoped fields stripped, the way a fresh world's save omits them. */
  function payloadWithoutScopedFields(): Record<string, unknown> {
    const payload = realPayload();
    for (const e of elements(payload, 'entities')) {
      for (const key of SCOPED) delete e[key];
    }
    return payload;
  }

  /** The mapper's elements are unvalidated records, so the helpers stay structural. */
  const typeOf = (e: object): string => String((e as { type?: unknown }).type);

  function scenery(entities: readonly object[]): object[] {
    return entities.filter((e) => !CARRIER_TYPES.has(typeOf(e)));
  }

  const read = (e: object, key: (typeof SCOPED)[number]): unknown =>
    (e as Record<string, unknown>)[key];

  it('does not re-materialise a scoped field on an entity that never carried it', () => {
    // The defect this pins: the load literal defaulted all four for every element, so one reload put
    // them back on every blade of grass and tree and the next save paid for them again.
    const loaded = loadGameFromParsed(payloadWithoutScopedFields());
    expect(loaded, 'the stripped fixture must still load').not.toBeNull();
    if (!loaded) return;

    const sceneryEntities = scenery(loaded.world.entities);
    expect(sceneryEntities.length, 'the fixture must contain grass or trees').toBeGreaterThan(0);
    for (const key of SCOPED) {
      const carrying = sceneryEntities.filter((e) => read(e, key) !== undefined);
      expect(carrying.length, `${key} was re-materialised on ${carrying[0] ? typeOf(carrying[0]) : 'scenery'}`).toBe(0);
    }

    // The species that read them are still repaired: a settler keeps a generation and an animation
    // clock, which is the legacy/damaged-save repair this literal exists for.
    const humans = loaded.world.entities.filter((e) => e.type === EntityType.Human);
    expect(humans.length, 'the fixture must contain a settler').toBeGreaterThan(0);
    for (const human of humans) {
      expect(human.generation, 'a settler generation is repaired').toBe(0);
      expect(human.animFrame, 'a settler animation clock is repaired').toBe(0);
    }
  });

  it('keeps them absent through a tick and a re-save', () => {
    const loaded = loadGameFromParsed(payloadWithoutScopedFields());
    if (!loaded) throw new Error('the stripped fixture must still load');
    for (let i = 0; i < 40; i++) gameTick(loaded.world);

    const resaved = buildSaveData(loaded.world, createInitialView(loaded.world.width, loaded.world.height));
    const resavedEntities = elements(resaved, 'entities');
    expect(scenery(resavedEntities).length, 'the fixture must still contain grass or trees').toBeGreaterThan(0);
    for (const e of scenery(resavedEntities)) {
      for (const key of SCOPED) {
        expect(read(e, key), `${typeOf(e)} carried ${key} into the re-saved payload`).toBeUndefined();
      }
    }
  });

  it('still repairs every required field a payload omits', () => {
    const payload = realPayload();
    for (const e of elements(payload, 'entities')) {
      for (const key of ['vx', 'vy', 'flash', 'alive', 'birthYear', 'birthMonth', 'birthDay']) delete e[key];
    }

    const loaded = loadGameFromParsed(payload);
    expect(loaded, 'a payload that drops required fields must still load').not.toBeNull();
    if (!loaded) return;
    for (const e of loaded.world.entities) {
      expect(Number.isFinite(e.vx), `${e.type} vx`).toBe(true);
      expect(Number.isFinite(e.vy), `${e.type} vy`).toBe(true);
      expect(e.flash, `${e.type} flash`).toBe(0);
      expect(e.alive, `${e.type} alive`).toBe(true);
      expect(Number.isFinite(e.birthYear), `${e.type} birthYear`).toBe(true);
      expect(Number.isFinite(e.birthMonth), `${e.type} birthMonth`).toBe(true);
      expect(Number.isFinite(e.birthDay), `${e.type} birthDay`).toBe(true);
    }
  });

  it('lets a value the payload does carry win over the default', () => {
    const payload = realPayload();
    const target = elements(payload, 'entities')[0]!;
    target.vx = 12.5;
    target.flash = 7;
    target.generation = 3;

    const loaded = loadGameFromParsed(payload);
    if (!loaded) throw new Error('the fixture must load');
    const same = loaded.world.entities.find((e) => e.id === target.id);
    expect(same?.vx, 'a carried vx must not be replaced by the default').toBe(12.5);
    expect(same?.flash).toBe(7);
    expect(same?.generation, 'a carried generation must survive').toBe(3);
  });
});
