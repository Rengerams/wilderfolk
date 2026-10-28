/**
 * Defensive DNA is the player's alone, and its label states what the code does.
 *
 * Regression for two halves of one finding: a bare trait check let a rival or visitor carrying
 * Chivalrous raise the player's `militiaStrength`, which the raid resolves into an outcome; and the
 * breakdown line claimed a per-protector percentage while the arithmetic added one flat share. The
 * flat army-wide share is retired — each mustered soldier now carries its own bounded factor, gated
 * by the same muster predicate as the adult count.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, JobType } from '../src/game/gameTypes';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { SettlerTrait } from '../src/game/settlerTraits';

const FIXTURE_SEED = 20_260_917;
/** Enough adults that an 8 % bonus rounds to a visible integer. */
const SETTLER_COUNT = 25;

/**
 * One adult settler. `traits` is written directly rather than through `inheritedTraits` so the
 * rolled traits cannot make the fixture non-deterministic.
 */
function adult(id: number, traits: SettlerTrait[], faction?: Entity['faction']): Entity {
  const entity = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `S${id}` });
  entity.alive = true;
  entity.isJuvenile = false;
  entity.job = JobType.Soldier;
  entity.traits = traits;
  if (faction) entity.faction = faction;
  return entity;
}

function settlers(): Entity[] {
  return Array.from({ length: SETTLER_COUNT }, (_, i) => adult(i + 1, []));
}

function strength(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities, { includeStructures: false }).militiaStrength;
}

describe('the chivalrous bonus counts only the player\'s own adults', () => {
  it('ignores a rival or visitor carrying the trait, and still pays for your own', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const own = settlers();
    const base = strength(state, own);

    // The trait must work at all, or the assertions below would pass for the wrong reason.
    const chivalrousSettler = adult(90, ['chivalrous']);
    expect(strength(state, [...own, chivalrousSettler])).toBeGreaterThan(base);

    expect(strength(state, [...own, adult(91, ['chivalrous'], 'rival')])).toBe(base);
    expect(strength(state, [...own, adult(92, ['chivalrous'], 'visitor')])).toBe(base);
    expect(strength(state, [...own, adult(93, ['chivalrous'], 'trade_caravan')])).toBe(base);
  });

  it('does not let a child act as a protector', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const own = settlers();
    const base = strength(state, own);
    const child = adult(94, ['chivalrous']);
    child.isJuvenile = true;
    expect(strength(state, [...own, child])).toBe(base);
  });

  it('states the per-soldier DNA term it actually applies', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const lines = computeMilitiaBreakdown(state, [...settlers(), adult(99, ['chivalrous'])], {
      includeStructures: false,
    }).lines;
    const line = lines.find((l) => l.includes('defender traits'));
    expect(line).toBeDefined();
    expect(line).toMatch(/per-soldier DNA/);
    expect(line).not.toMatch(/8%/);
  });
});
