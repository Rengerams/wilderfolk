/**
 * Defensive aptitude is the player's alone, and its label states what the code does.
 *
 * Regression for two halves of one finding: a bare trait check let a rival or visitor raise the
 * player's `militiaStrength`, which the raid resolves into an outcome; and the breakdown line
 * claimed a per-protector percentage while the arithmetic added one flat share. The flat
 * army-wide share is retired — each mustered soldier now carries its own bounded aptitude factor,
 * gated by the same muster predicate as the adult count.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, JobType } from '../src/game/gameTypes';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { genomeFrom } from './helpers/genome';

const FIXTURE_SEED = 20_260_917;
/** Enough adults that a per-soldier bonus rounds to a visible integer. */
const SETTLER_COUNT = 25;
/** High composure and risk-taking are the two strongest defence weights. */
const DEFENSIVE_GENOME = genomeFrom({ composure: 95, riskTaking: 90 });

/**
 * One adult settler. The genome is written directly rather than rolled so the fixture cannot be
 * non-deterministic.
 */
function adult(id: number, overrides: Partial<Entity> = {}): Entity {
  const entity = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `S${id}` });
  entity.alive = true;
  entity.isJuvenile = false;
  entity.job = JobType.Soldier;
  entity.genomeV2 = DEFENSIVE_GENOME;
  Object.assign(entity, overrides);
  return entity;
}

function settlers(): Entity[] {
  return Array.from({ length: SETTLER_COUNT }, (_, i) => adult(i + 1, { genomeV2: genomeFrom() }));
}

function strength(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities, { includeStructures: false }).militiaStrength;
}

describe('the defensive aptitude counts only the player\'s own adults', () => {
  it('ignores a rival or visitor carrying the gene, and still pays for your own', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const own = settlers();
    const base = strength(state, own);

    // The aptitude must work at all, or the assertions below would pass for the wrong reason.
    const defender = adult(90);
    expect(strength(state, [...own, defender])).toBeGreaterThan(base);

    expect(strength(state, [...own, adult(91, { faction: 'rival' })])).toBe(base);
    expect(strength(state, [...own, adult(92, { faction: 'visitor' })])).toBe(base);
    expect(strength(state, [...own, adult(93, { faction: 'trade_caravan' })])).toBe(base);
  });

  it('does not let a child act as a protector', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const own = settlers();
    const base = strength(state, own);
    const child = adult(94, { isJuvenile: true });
    expect(strength(state, [...own, child])).toBe(base);
  });

  it('states the per-soldier aptitude term it actually applies', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const lines = computeMilitiaBreakdown(state, [...settlers(), adult(99)], {
      includeStructures: false,
    }).lines;
    const line = lines.find((l) => l.includes('defender aptitudes'));
    expect(line).toBeDefined();
    expect(line).toMatch(/per-soldier/);
    expect(line).not.toMatch(/8%/);
  });
});
