/**
 * The chivalrous militia bonus is the player's alone, and its label states what the code does.
 *
 * Regression for two halves of one finding: the filter was a bare
 * `traits.includes('chivalrous')`, so a **rival or visitor** carrying the trait raised the
 * player's `militiaStrength` (which `resolveDefenseRatio` converts into a raid outcome); and the
 * breakdown line claimed `(N × 8 %)` while the arithmetic added a single flat 8 %
 * (`BUG_REPORTS/2026-09-17-enemy-chivalrous-trait-inflates-player-militia.md`).
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import type { Entity, SettlerTrait, WorldState } from '../src/game/gameTypes';

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

  it('states the flat bonus it actually applies', () => {
    const state = initGame({ villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
    const lines = computeMilitiaBreakdown(state, [...settlers(), adult(99, ['chivalrous'])], {
      includeStructures: false,
    }).lines;
    const line = lines.find((l) => l.includes('chivalrous'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/×\s*8%/);
    expect(line).toMatch(/flat \+8%/);
  });
});
