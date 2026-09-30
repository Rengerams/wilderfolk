/**
 * F15 — "Militia 132 · 🏹 Unarmed adults" on the same card
 * (`docs/private/audits/2026-09-16/ui-logic.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * `FrontierPanel` restated the armament tiers by hand and knew only two of them
 * (`hasIronSpears ? 'Iron spears' : hasStoneSpears ? 'Stone spears' : 'Unarmed adults'`), while the
 * owner — `militiaBalance.getMilitiaArmamentLabel` — also covers iron swords and the three shield
 * tiers, and those multipliers are exactly what `computeMilitiaBreakdown` adds up for the strength
 * printed two rows above. A village with iron swords, or with shields but no spear tech (reachable:
 * `iron_shields` has no forge prerequisite), therefore read "Unarmed adults" next to a real strength.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialResearchNodes, BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { getMilitiaArmamentLabel } from '../src/game/militiaBalance';

/** A world with only the fields the combat tech readers touch (same shape as `combatTierEffects`). */
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

describe('militia armament label', () => {
  it('names the sword tier instead of falling through to "unarmed"', () => {
    const swords = makeState(['defense_4', 'defense_8'], { iron_spears: true, iron_swords: true });
    expect(getMilitiaArmamentLabel(swords)).toBe('Iron swords');
  });

  it('names a shield-only village, which has no spear tier at all', () => {
    const shields = makeState(['defense_5'], { iron_shields: true });
    expect(getMilitiaArmamentLabel(shields)).toBe('Iron shields');
    expect(getMilitiaArmamentLabel(makeState([], {}))).toBeNull();
  });

  it('the readiness panel asks the owner rather than restating the tiers', () => {
    const panel = readFileSync(resolve(process.cwd(), 'src/components/FrontierPanel.tsx'), 'utf8');
    expect(panel).toContain('getMilitiaArmamentLabel(state)');
    expect(panel, 'the panel still restates the spear tiers by hand').not.toMatch(/hasIronSpears\(/);
    expect(panel, 'the panel still restates the shield tiers by hand').not.toMatch(/hasStoneSpears\(/);
  });
});
