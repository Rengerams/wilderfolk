import { describe, expect, it } from 'vitest';
import { mergeCombatResearchNodes } from '@/game/combat';
import { createInitialResearchNodes } from '@/game/gameTypes';

describe('mergeCombatResearchNodes', () => {
  it('creates defense_1 when missing from older saves', () => {
    const nodes = createInitialResearchNodes().filter((n) => n.id !== 'defense_1');
    expect(nodes.some((n) => n.id === 'defense_1')).toBe(false);
    mergeCombatResearchNodes(nodes);
    const defense1 = nodes.find((n) => n.id === 'defense_1');
    expect(defense1).toBeDefined();
    expect(defense1?.unlocked).toBe(true);
  });
});