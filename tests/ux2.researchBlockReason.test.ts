/**
 * F-UX-9 — a disabled Research choice printed no reason: the owner answered "can I start this?" with
 * a bare boolean, so the panel could only grey the button out.
 *
 * The owner now answers with `getResearchBlockReason`, and `canStartResearch` stays the same gate as
 * a boolean for the callers that only need yes/no (the auto-play bot). The final case pins the two
 * against each other, so the panel can never print a reason for a node the command would accept.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialResearchNodes, type WorldState } from '../src/game/gameTypes';
import { canStartResearch, getResearchBlockReason } from '../src/game/research';

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    researchNodes: createInitialResearchNodes(),
    unlockedTechs: [],
    activeResearch: null,
    resources: { wood: 10_000, stone: 10_000, food: 0, gold: 10_000, iron: 0 },
    ...overrides,
  } as unknown as WorldState;
}

function node(state: WorldState, id: string) {
  const found = state.researchNodes.find((entry) => entry.id === id);
  if (!found) throw new Error(`${id} missing from the shipped research tree`);
  return found;
}

function read(relativePath: string): string {
  return readFileSync(resolve(process.env.UX2_SOURCE_ROOT ?? process.cwd(), relativePath), 'utf8');
}

describe('the research owner names its refusal', () => {
  it('accepts an affordable unlocked node with no reason to give', () => {
    expect(getResearchBlockReason(world(), 'agriculture_1')).toBeNull();
    expect(canStartResearch(world(), 'agriculture_1')).toBe(true);
  });

  it('names the missing prerequisite instead of only refusing', () => {
    const state = world();
    // agriculture_2 is a tier-2 node locked behind agriculture_1 in the shipped tree.
    expect(node(state, 'agriculture_2').prerequisites).toEqual(['agriculture_1']);
    expect(getResearchBlockReason(state, 'agriculture_2')).toBe('Needs Advanced Farming first');
  });

  it('names the resources that are short, without inventing a need for the ones in stock', () => {
    const state = world();
    const target = node(state, 'agriculture_1');
    target.unlocked = true;
    state.resources = { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 };
    expect(getResearchBlockReason(state, 'agriculture_1')).toBe(
      `Need ${target.cost.wood} more wood, ${target.cost.stone} more stone, ${target.cost.gold} more gold`,
    );
  });

  it('names the subject already under study, and does not restate it as a fresh refusal', () => {
    const studying = world({ activeResearch: 'forestry_1' });
    expect(getResearchBlockReason(studying, 'agriculture_1')).toBe('Carpentry is already being researched');
    expect(getResearchBlockReason(studying, 'forestry_1')).toBe('In progress — wait for it to finish');
  });

  it('reports a lock with no reason to be a boolean, and never disagrees with it', () => {
    const states = [
      world(),
      world({ unlockedTechs: ['agriculture_1'] }),
      world({ activeResearch: 'mining_2' }),
      world({ resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 } }),
      world({ resources: { wood: 55, stone: 0, food: 0, gold: 5, iron: 0 } }),
    ];
    for (const state of states) {
      for (const entry of state.researchNodes) {
        const reason = getResearchBlockReason(state, entry.id);
        expect(
          canStartResearch(state, entry.id),
          `${entry.id}: the boolean and the reason disagree`,
        ).toBe(reason === null);
      }
    }
  });

  it('the Progress panel renders the owner reason as visible text', () => {
    const panel = read('src/components/tabPanels/ProgressTabPanel.tsx');
    expect(panel).toContain('const canResearch = canStartResearch(state, node.id);');
    expect(panel).toContain('getResearchBlockReason(state, node.id)');
    expect(panel, 'the refusal is computed and thrown away again').toContain('{blockReason}');
  });
});
