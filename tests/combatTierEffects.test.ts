/**
 * Tiered combat research replaces lower tiers instead of summing them: the strongest
 * researched tier sets counter-attack and predator-block chance.
 */
import { describe, expect, it } from 'vitest';
import { createInitialResearchNodes, BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { getCounterAttackChance, getPredatorBlockChance, rollCounterAttack } from '../src/game/combat';
import { BUILDING_CONFIGS } from '../src/game/buildings';

/** A world with only the fields the combat tech readers touch. */
function makeState(researched: string[], forgeCompleted: Record<string, boolean>): WorldState {
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

describe('tiered combat research does not stack', () => {
  it('counter-attack uses the strongest researched tier instead of the sum', () => {
    const bothTiers = makeState(['defense_4', 'defense_8'], { iron_spears: true, iron_swords: true });
    expect(getCounterAttackChance(bothTiers)).toBe(0.55);

    const onlySpears = makeState(['defense_4'], { iron_spears: true });
    expect(getCounterAttackChance(onlySpears)).toBe(0.45);
  });

  it('a counter-attack is still a roll, never a guaranteed predator kill', () => {
    const state = makeState(['defense_4', 'defense_8'], { iron_spears: true, iron_swords: true });
    // With chance 1.0 the old code returned true for every input.
    let refused = 0;
    for (let id = 1; id <= 60; id++) {
      if (!rollCounterAttack(state, id, id + 500, 72, 0)) refused++;
    }
    expect(refused).toBeGreaterThan(0);
  });

  it('predator block uses the strongest tier instead of the capped sum', () => {
    const state = makeState(['defense_3', 'defense_5', 'defense_9'], {});
    // 0.35 + 0.6 + 0.72 would have been 1.67 (capped to 0.85); the scale-mail tier is 0.72.
    expect(getPredatorBlockChance(state)).toBeCloseTo(0.72);
  });
});