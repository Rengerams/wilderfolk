/**
 * A legacy save without a genome loads with the deterministic fourteen-dimension backfill, and
 * nothing else moves.
 *
 * The fixture is a real payload from `buildSaveData` with `genomeV2` deleted from every human record
 * — the pre-genome layout. Pinned here:
 * - a settler with no genome gains a stable genome derived per entity id from the colony seed;
 * - a valid saved genome is never rerolled, reordered or padded;
 * - malformed genomes normalize deterministically;
 * - the backfill consumes no draw from the live `settlerGenetics` stream;
 * - the load is idempotent across save → load → save → load;
 * - the retired categorical `traits` field is dropped, and a Moon Howler transform leaves the genome.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import {
  APTITUDE_COUNT,
  genomeFromSeed,
  normalizeGenome,
  type GenomeV2,
} from '../src/game/settlerTraits';
import { resetSimRng, snapshotSimRng, type SimRngSnapshot } from '../src/game/simRng';
import { transformToWerewolfForm } from '../src/game/moonHowler';
import { revertToHumanForm } from '../src/game/moonHowlerForm';
import { human } from '../src/test/factories';
import { genomeFrom } from './helpers/genome';

const FIXTURE_SEED = 20_261_030;

/** A real save payload from the current build, with every settler's genome removed. */
function legacyPayload(mutate?: (humans: Record<string, unknown>[]) => void): Record<string, unknown> {
  const world = initGame({ skipTerrain: true, villageName: 'Legacy', size: 'medium', seed: FIXTURE_SEED });
  const raw = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
  const parsed = parseSaveJson(raw);
  expect(parsed.valid, 'fixture premise: the current build writes a loadable save').toBe(true);
  if (!parsed.valid || !parsed.parsed) throw new Error('fixture save invalid');
  const entities = parsed.parsed.entities as Record<string, unknown>[];
  for (const entity of entities) {
    if (entity.type === EntityType.Human) delete entity.genomeV2;
  }
  const humans = entities.filter((entity) => entity.type === EntityType.Human);
  expect(humans.length, 'fixture premise: the colony carries settlers').toBeGreaterThan(0);
  mutate?.(humans);
  return parsed.parsed;
}

/** The genome the first settler holds after a legacy payload with `saved` written into their slot. */
function firstHumanGenomeAfterLoad(saved: unknown): GenomeV2 | undefined {
  let id: number | undefined;
  const payload = legacyPayload((humans) => {
    id = humans[0].id as number;
    humans[0].genomeV2 = saved;
  });
  return livingHumans(load(payload)).find((entity) => entity.id === id)?.genomeV2;
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

describe('a legacy settler without a genome gains a deterministic one', () => {
  it('gives every surviving human one valid fourteen-dimension genome', () => {
    resetSimRng();
    const world = load(legacyPayload());
    const humans = livingHumans(world);
    expect(humans.length, 'fixture premise: the colony has living settlers').toBeGreaterThan(0);

    for (const entity of humans) {
      const genome = entity.genomeV2;
      expect(genome, `${entity.id} loaded without a genome`).toBeDefined();
      expect(normalizeGenome(genome), `${entity.id} genome is invalid`).toBeDefined();
      expect(genome!.aptitudeAlleles).toHaveLength(APTITUDE_COUNT);
    }

    // The same payload fills the same genome for the same citizen, whoever else is in the file.
    const again = load(legacyPayload());
    for (const entity of humans) {
      expect(again.entities.find((e) => e.id === entity.id)!.genomeV2).toEqual(entity.genomeV2);
    }
  });

  it('derives the fill per citizen id without drawing from the live genetics stream', () => {
    resetSimRng();
    const payload = legacyPayload();
    const savedGeneticsState = streamState(snapshotSimRng(), 'settlerGenetics');
    expect(savedGeneticsState, 'fixture premise: the writing colony drew its own genetics stream')
      .toBeTypeOf('number');

    const world = load(payload);
    expect(livingHumans(world).every((entity) => entity.genomeV2 !== undefined)).toBe(true);
    expect(streamState(snapshotSimRng(), 'settlerGenetics'), 'the backfill advanced the live stream')
      .toBe(savedGeneticsState);
  });

  it('never rerolls, reorders or pads a genome the save already carries', () => {
    const saved = genomeFrom({ sociability: 81, reasoning: 22 });
    expect(firstHumanGenomeAfterLoad(saved)).toEqual(saved);
  });

  it('replaces a malformed genome with the deterministic per-citizen fill', () => {
    const valid = genomeFrom();
    const malformed = [
      { version: 1, aptitudeAlleles: valid.aptitudeAlleles },
      { version: 2, aptitudeAlleles: valid.aptitudeAlleles.slice(1) },
      { version: 2, aptitudeAlleles: valid.aptitudeAlleles.map(() => [0]) },
      'not-a-genome',
      [],
      null,
    ];
    for (const saved of malformed) {
      const genome = firstHumanGenomeAfterLoad(saved);
      expect(genome, `a settler saved as ${JSON.stringify(saved).slice(0, 40)} lost their genome`).toBeDefined();
      expect(normalizeGenome(genome)).toBeDefined();
    }
    // Deterministic: two loads of the same malformed payload agree.
    const first = firstHumanGenomeAfterLoad(null);
    const second = firstHumanGenomeAfterLoad(null);
    expect(second).toEqual(first);
  });

  it('drops the retired categorical traits field instead of keeping a second genetics source', () => {
    let id: number | undefined;
    const payload = legacyPayload((humans) => {
      id = humans[0].id as number;
      humans[0].traits = ['lucky', 'brave'];
    });
    const settler = load(payload).entities.find((entity) => entity.id === id)!;
    expect((settler as unknown as Record<string, unknown>).traits).toBeUndefined();
    expect(settler.genomeV2).toBeDefined();
  });

  it('gives a settler saved in moon form its genome too', () => {
    resetSimRng();
    let id: number | undefined;
    const payload = legacyPayload((humans) => {
      id = humans[0].id as number;
      humans[0].type = EntityType.Werewolf;
    });
    const settler = load(payload).entities.find((entity) => entity.id === id);
    expect(settler?.genomeV2, 'a moon-form settler was skipped by the fill').toBeDefined();
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
      expect(second.entities.find((e) => e.id === entity.id)!.genomeV2).toEqual(entity.genomeV2);
    }
  });

  it('keeps the genome through a Moon Howler transform and revert', () => {
    const genomeV2 = genomeFrom({ composure: 88, riskTaking: 21 });
    const settler = human(41, { genomeV2, job: undefined, needs: undefined });
    transformToWerewolfForm(settler, []);
    expect(settler.type).toBe(EntityType.Werewolf);
    expect(settler.genomeV2).toEqual(genomeV2);

    revertToHumanForm(settler);

    expect(settler.type).toBe(EntityType.Human);
    expect(settler.genomeV2).toEqual(genomeV2);
  });
});

describe('the deterministic fill rule', () => {
  it('derives a valid genome per citizen id and never touches a stream', () => {
    resetSimRng();
    const before = snapshotSimRng();
    const genomes = Array.from({ length: 8 }, (_, i) => genomeFromSeed(4242, i + 1));

    for (const genome of genomes) {
      expect(genome.aptitudeAlleles).toHaveLength(APTITUDE_COUNT);
      expect(normalizeGenome(genome)).toEqual(genome);
    }
    expect(genomes[0]).toEqual(genomeFromSeed(4242, 1));
    expect(new Set(genomes.map((genome) => JSON.stringify(genome))).size).toBeGreaterThan(1);
    expect(snapshotSimRng(), 'deriving the fill must not touch any stream').toEqual(before);
  });
});
