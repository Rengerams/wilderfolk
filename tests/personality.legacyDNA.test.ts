/**
 * PR B — a legacy save without DNA loads with canonical baseline traits, and nothing else moves.
 *
 * The fixture is a **real** payload from `buildSaveData` with the `traits` field deleted from every
 * human record — the pre-DNA layout — so the missing-field case is what loads, not a newly rolled
 * colony (`personality-career-codebot-tasks-0.6.5.2.md` §1.1). Pinned here:
 * - a settler with no DNA gains a stable canonical set, derived per entity id from the colony seed;
 * - valid saved DNA (one trait, two traits, three) is never rerolled, reordered or padded;
 * - malformed entries normalize deterministically instead of entering the simulation;
 * - the backfill consumes no draw from the live `settlerTraits` stream;
 * - the load is idempotent across save → load → save → load;
 * - a Moon Howler transform/revert leaves the settler's DNA alone.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Entity, SettlerTrait, WorldState } from '../src/game/gameTypes';
import { TRAIT_POOL, rollLegacySettlerTraits, validSettlerTraits } from '../src/game/settlerTraits';
import { resetSimRng, snapshotSimRng, type SimRngSnapshot } from '../src/game/simRng';
import { transformToWerewolfForm } from '../src/game/moonHowler';
import { revertToHumanForm } from '../src/game/moonHowlerForm';
import { human } from '../src/test/factories';

const FIXTURE_SEED = 20_261_030;

/** A real save payload from the current build, with every settler's DNA removed. */
function legacyPayload(mutate?: (humans: Record<string, unknown>[]) => void): Record<string, unknown> {
  const world = initGame({ villageName: 'Legacy', size: 'medium', seed: FIXTURE_SEED });
  const raw = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
  const parsed = parseSaveJson(raw);
  expect(parsed.valid, 'fixture premise: the current build writes a loadable save').toBe(true);
  if (!parsed.valid || !parsed.parsed) throw new Error('fixture save invalid');
  const entities = parsed.parsed.entities as Record<string, unknown>[];
  for (const entity of entities) {
    if (entity.type === EntityType.Human) delete entity.traits;
  }
  const humans = entities.filter((entity) => entity.type === EntityType.Human);
  expect(humans.length, 'fixture premise: the colony carries settlers').toBeGreaterThan(0);
  mutate?.(humans);
  return parsed.parsed;
}

/** The DNA the first settler holds after a legacy payload with `saved` written into their slot. */
function firstHumanTraitsAfterLoad(saved: unknown): SettlerTrait[] | undefined {
  let id: number | undefined;
  const payload = legacyPayload((humans) => {
    id = humans[0].id as number;
    humans[0].traits = saved;
  });
  return livingHumans(load(payload)).find((entity) => entity.id === id)?.traits;
}

function load(payload: Record<string, unknown>): WorldState {
  const loaded = loadGameFromParsedOutcome(payload);
  if (!loaded.ok) throw new Error(`legacy payload refused: ${loaded.reason} ${loaded.detail ?? ''}`);
  return loaded.world;
}

function livingHumans(world: WorldState): Entity[] {
  return world.entities.filter((entity) => entity.type === EntityType.Human && entity.alive);
}

function streamState(snapshot: SimRngSnapshot, owner: string): number | undefined {
  return snapshot.owners.find(([name]) => name === owner)?.[1];
}

describe('a legacy settler without DNA gains canonical traits', () => {
  it('gives every surviving human a stable, valid set', () => {
    resetSimRng();
    const world = load(legacyPayload());
    const humans = livingHumans(world);
    expect(humans.length, 'fixture premise: the colony has living settlers').toBeGreaterThan(0);

    for (const entity of humans) {
      const traits = entity.traits;
      expect(Array.isArray(traits), `${entity.id} loaded without DNA`).toBe(true);
      expect(traits!.length).toBeGreaterThan(0);
      expect(traits!.length).toBeLessThanOrEqual(3);
      expect(new Set(traits).size, 'a duplicate slot is not DNA').toBe(traits!.length);
      for (const trait of traits!) expect(TRAIT_POOL).toContain(trait);
    }

    // The same payload fills the same DNA for the same citizen, whoever else is in the file.
    const again = load(legacyPayload());
    for (const entity of humans) {
      const second = again.entities.find((e) => e.id === entity.id)!;
      expect(second.traits).toEqual(entity.traits);
    }
  });

  it('derives the fill per citizen id without drawing from the live settler stream', () => {
    resetSimRng();
    const payload = legacyPayload();
    const savedTraitsState = streamState(snapshotSimRng(), 'settlerTraits');
    expect(savedTraitsState, 'fixture premise: the writing colony drew its own DNA stream')
      .toBeTypeOf('number');

    const world = load(payload);
    expect(livingHumans(world).every((entity) => (entity.traits?.length ?? 0) > 0)).toBe(true);
    expect(streamState(snapshotSimRng(), 'settlerTraits'), 'the backfill advanced the live stream')
      .toBe(savedTraitsState);
  });

  it('never extends, reorders or overwrites DNA a save already carries', () => {
    // A shorter set is this settler's DNA: the missing slots are deliberately not filled.
    expect(firstHumanTraitsAfterLoad(['hardy'])).toEqual(['hardy']);
    expect(firstHumanTraitsAfterLoad(['brave', 'gregarious'])).toEqual(['brave', 'gregarious']);
    expect(firstHumanTraitsAfterLoad(['fierce', 'stoic', 'lucky'])).toEqual(['fierce', 'stoic', 'lucky']);
  });

  it('refuses mutually exclusive DNA at load instead of entering the simulation', () => {
    expect(firstHumanTraitsAfterLoad(['brave', 'timid'])).toEqual(['brave']);
    expect(firstHumanTraitsAfterLoad(['gregarious', 'timid', 'hardy'])).toEqual(['gregarious', 'hardy']);
  });

  it('normalizes malformed DNA deterministically', () => {
    // A recognized trait survives; the unknown id and the duplicate are dropped, and the empty slots
    // are not filled in.
    expect(firstHumanTraitsAfterLoad(['hardy', 'not_a_trait', 'hardy', 42])).toEqual(['hardy']);

    for (const malformed of ['brave', [], null, ['__proto__', 'toString']]) {
      const traits = firstHumanTraitsAfterLoad(malformed) as SettlerTrait[];
      expect(traits.length, `a settler saved as ${JSON.stringify(malformed)} lost their DNA`).toBe(3);
      expect(traits.every((trait) => TRAIT_POOL.includes(trait))).toBe(true);
    }
  });

  it('gives a settler saved in moon form its DNA too', () => {
    resetSimRng();
    let id: number | undefined;
    const payload = legacyPayload((humans) => {
      id = humans[0].id as number;
      humans[0].type = EntityType.Werewolf;
    });
    const settler = load(payload).entities.find((entity) => entity.id === id);
    expect(settler?.traits?.length ?? 0, 'a moon-form settler was skipped by the fill').toBeGreaterThan(0);
  });

  it('is idempotent across save, load, save, load', () => {
    resetSimRng();
    const first = load(legacyPayload());
    const resaved = JSON.stringify(buildSaveData(first, createInitialView(first.width, first.height)));
    const parsedResave = parseSaveJson(resaved);
    expect(parsedResave.valid).toBe(true);
    if (!parsedResave.valid || !parsedResave.parsed) throw new Error('re-save invalid');
    const second = load(parsedResave.parsed);

    for (const entity of livingHumans(first)) {
      expect(second.entities.find((e) => e.id === entity.id)!.traits).toEqual(entity.traits);
    }
  });

  it('keeps the DNA through a Moon Howler transform and revert', () => {
    const settler = human(41, { traits: ['hardy', 'brave'], job: undefined, needs: undefined });
    transformToWerewolfForm(settler, []);
    expect(settler.type).toBe(EntityType.Werewolf);

    revertToHumanForm(settler);

    expect(settler.type).toBe(EntityType.Human);
    expect(settler.traits).toEqual(['hardy', 'brave']);
  });
});

describe('the legacy fill uses the canonical allocation rule', () => {
  it('derives a valid three-trait set per citizen id, never a new roll of its own', () => {
    resetSimRng();
    const before = snapshotSimRng();
    const sets = Array.from({ length: 8 }, (_, i) => rollLegacySettlerTraits(4242, i + 1, 'male'));

    for (const traits of sets) {
      expect(traits.length).toBe(3);
      expect(new Set(traits).size).toBe(3);
      // A canonical set is exactly what the saved-DNA validator accepts as-is.
      expect(validSettlerTraits(traits)).toEqual(traits);
    }
    expect(sets[0]).toEqual(rollLegacySettlerTraits(4242, 1, 'male'));
    expect(new Set(sets.map((traits) => traits.join(','))).size).toBeGreaterThan(1);
    expect(snapshotSimRng(), 'deriving the fill must not touch any stream').toEqual(before);
  });

  it('keeps the recognized traits of a saved array and nothing else', () => {
    expect(validSettlerTraits(['hardy', 'hardy', 'nonsense'])).toEqual(['hardy']);
    expect(validSettlerTraits(['brave', 'gregarious'])).toEqual(['brave', 'gregarious']);
    expect(validSettlerTraits(['fierce', 'stoic', 'lucky', 'hardy'])).toEqual(['fierce', 'stoic', 'lucky']);
    // Mutually exclusive pairs cannot coexist, so a malformed array keeps only its first of the two.
    expect(validSettlerTraits(['brave', 'timid'])).toEqual(['brave']);
    expect(validSettlerTraits(['gregarious', 'timid'])).toEqual(['gregarious']);
    expect(validSettlerTraits(undefined)).toEqual([]);
    expect(validSettlerTraits('hardy')).toEqual([]);
  });
});
