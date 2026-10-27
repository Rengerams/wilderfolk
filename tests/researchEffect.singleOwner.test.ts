/**
 * A1 (HIGH) — two research-effect resolvers encoded opposite additive semantics
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md` §A1; tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * `combat.researchedEffect(..., 'add')` takes `Math.max`, and the comment there records why: additive
 * combat effects are TIERS, and summing them made `counter_attack` 0.45 + 0.55 = 1.0 — every predator
 * contact a guaranteed kill. `simHelpers.getMultiplier` kept summing that same branch, so the
 * 2026-09-13 fix only moved the bug out of reach of one call path: any consumer that reads a tiered
 * target through `getMultiplier` re-arms it. Measured on the current tree before the fix,
 * `getMultiplier(state, 'predator_block')` was `1 + 0.35 + 0.60 + 0.72 = 2.67` while the combat owner
 * reported the tier `0.72`, and `getMultiplier(state, 'counter_attack')` was `1 + 0.45 + 0.55 = 2.0`
 * while combat reported `0.55`.
 *
 * Both paths now read the single owner `simHelpers.resolveResearchEffect`. These tests pin the
 * observable consequence for each resolver, so the two can never disagree again: a tiered key can
 * never accumulate past its largest single contribution.
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

    // `getMultiplier`'s convention is the multiplier product (1 — no `multiplier` is declared for
    // this target) plus the additive contribution, so the ceiling here is 1 + 0.72. Pre-fix the sum
    // made this 2.67, i.e. the tier ceiling was not a ceiling on this path at all.
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

    // The pre-fix duplication: this loop existed in both simHelpers.ts and combat.ts.
    const walkers = ['src/game/simHelpers.ts', 'src/game/combat.ts'].filter((path) => walk.test(read(path)));
    expect(walkers, 'the research-effect walk is duplicated again').toEqual(['src/game/simHelpers.ts']);

    const combat = read('src/game/combat.ts');
    expect(combat, 'combat.ts re-declared its own resolver').not.toMatch(/function researchedEffect\s*\(/);
    expect(combat, 'combat.ts no longer reads the owner').toMatch(/resolveResearchEffect/);
  });
});
