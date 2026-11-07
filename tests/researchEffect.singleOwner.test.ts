/**
 * Research effects resolve through one owner: tiered targets take their strongest contribution,
 * while genuinely additive targets still sum. Both resolvers must agree.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialResearchNodes, BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { getMultiplier } from '../src/game/simHelpers';
import { getCounterAttackChance, getPredatorBlockChance } from '../src/game/combat';
import { BUILDING_CONFIGS } from '../src/game/buildings';

/** A world with only the fields the research/combat readers touch (mirrors combatTierEffects.test.ts). */
function makeState(researched: string[], forgeCompleted: Record<string, boolean> = {}): WorldState {
  const researchNodes = createInitialResearchNodes().map((node) =>
    researched.includes(node.id) ? { ...node, unlocked: true, researched: true } : node,
  );
  const cfg = BUILDING_CONFIGS[BuildingType.Blacksmith];
  return {
    unlockedTechs: [...researched],
    researchNodes,
    buildings: [
      {
        id: 1,
        type: BuildingType.Blacksmith,
        x: 0,
        y: 0,
        width: cfg.width,
        height: cfg.height,
        occupants: [],
        level: 1,
        constructionProgress: 100,
        completed: true,
        health: 100,
        maxHealth: 100,
        spriteScale: 1,
        buildAnimTimer: 0,
        faction: 'player',
      },
    ],
    villageForge: { activeOrder: null, progress: 0, completed: forgeCompleted },
  } as unknown as WorldState;
}

describe('research effects combine through one owner', () => {
  it('predator block never accumulates past its strongest researched tier', () => {
    // Tiers: Wooden Shields 0.35 (defense_3), Iron Shields 0.60 (defense_5), Scale Mail 0.72 (defense_9).
    const state = makeState(['defense_1', 'defense_3', 'defense_5', 'defense_9']);

    // The combat resolver already took max; this pins the tier it reports.
    expect(getPredatorBlockChance(state)).toBeCloseTo(0.72);

    // `getMultiplier` returns the multiplier product (1 here, no `multiplier` declared) plus the
    // additive contribution, so the tier ceiling is 1 + 0.72.
    expect(getMultiplier(state, 'predator_block')).toBeCloseTo(1 + 0.72);
  });

  it('counter-attack never accumulates past its strongest researched tier', () => {
    // Tiers: Iron Spears 0.45 (defense_4), Iron Swords 0.55 (defense_8) — 1.0 summed.
    const state = makeState(['defense_1', 'defense_2', 'defense_4', 'defense_6', 'defense_8'], {
      iron_spears: true,
      iron_swords: true,
    });

    expect(getCounterAttackChance(state)).toBe(0.55);
    expect(getMultiplier(state, 'counter_attack')).toBeCloseTo(1 + 0.55);
  });

  it('leaves genuinely additive (non-tiered) effects summing', () => {
    // `plague_immunity` (+1, medicine_2) is a one-node flag, not a tier — the owner's explicit
    // tier list must not silently turn every `add` into a max.
    const state = makeState(['medicine_1', 'medicine_2']);
    expect(getMultiplier(state, 'plague_immunity')).toBeCloseTo(1 + 1);
  });

  it('keeps exactly one implementation of the research-effect walk', () => {
    const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
    const walk = /for \(let j = 0; j < node\.effects\.length/;

    // The walk is owned by `simHelpers.ts`; `combat.ts` must not keep a copy.
    const walkers = ['src/game/simHelpers.ts', 'src/game/combat.ts'].filter((path) => walk.test(read(path)));
    expect(walkers, 'the research-effect walk is duplicated again').toEqual(['src/game/simHelpers.ts']);

    const combat = read('src/game/combat.ts');
    expect(combat, 'combat.ts re-declared its own resolver').not.toMatch(/function researchedEffect\s*\(/);
    expect(combat, 'combat.ts no longer reads the owner').toMatch(/resolveResearchEffect/);
  });
});
