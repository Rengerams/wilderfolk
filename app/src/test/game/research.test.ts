import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { startResearch, syncResearchUnlocks, updateResearch } from '@/game/research';
describe('startResearch', () => {
  it('starts research when optional cost fields are omitted', () => {
    const state = initGame();
    const node = state.researchNodes.find((n) => n.id === 'agriculture_1');
    expect(node).toBeDefined();
    node!.cost = { wood: 10, stone: 5, food: 0, gold: 0 };
    state.resources.wood = 100;
    state.resources.stone = 100;
    state.resources.gold = 0;

    const next = startResearch(state, 'agriculture_1');
    expect(next.activeResearch).toBe('agriculture_1');
    expect(next.resources.wood).toBe(90);
    expect(next.resources.stone).toBe(95);
  });

  it('mutates state in place when the return value is ignored', () => {
    const state = initGame();
    const node = state.researchNodes.find((n) => n.id === 'agriculture_1')!;
    node.cost = { wood: 10, stone: 5, food: 0, gold: 0 };
    state.resources.wood = 100;
    state.resources.stone = 100;

    startResearch(state, 'agriculture_1');

    expect(state.activeResearch).toBe('agriculture_1');
    expect(state.resources.wood).toBe(90);
  });
});

describe('syncResearchUnlocks', () => {
  it('repairs researched nodes with unlocked=false and dedupes unlockedTechs', () => {
    const state = initGame();
    const node = state.researchNodes.find((n) => n.id === 'agriculture_1')!;
    node.researched = true;
    node.unlocked = false;
    state.unlockedTechs = ['agriculture_1', 'agriculture_1'];

    syncResearchUnlocks(state);

    expect(node.unlocked).toBe(true);
    expect(state.unlockedTechs.filter((id) => id === 'agriculture_1')).toHaveLength(1);
  });
});

describe('updateResearch', () => {
  it('does not duplicate unlocked tech ids on completion', () => {
    const state = initGame();
    const node = state.researchNodes.find((n) => n.id === 'agriculture_1')!;
    state.activeResearch = node.id;
    state.researchProgress = 99;
    state.unlockedTechs = [node.id];

    updateResearch(state);

    expect(node.researched).toBe(true);
    expect(state.unlockedTechs.filter((id) => id === node.id)).toHaveLength(1);
    expect(state.activeResearch).toBeNull();
  });
});