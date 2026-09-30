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
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome, describeSaveLoadOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
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
