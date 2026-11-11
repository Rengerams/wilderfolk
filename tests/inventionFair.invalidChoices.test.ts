/** A story command cannot turn an unknown answer into rejection or a free salvage refund. */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { getInventionFairChoiceEligibility, resolveInventionFair } from '../src/game/inventionFair';
import { getStoryChoiceEligibility } from '../src/game/storyEvents';
import type { StoryEvent, WorldState } from '../src/game/gameTypes';
import { MapSize } from '../src/game/gameTypes';

function scenario(stage: 1 | 2): WorldState {
  const state = initGame({ size: MapSize.Medium, seed: 20261111 });
  state.storyFlags = { invention_fair_status: stage };
  state.resources.wood = 40;
  return state;
}

function card(id: string): StoryEvent {
  return {
    id,
    storyKey: 'invention_fair',
    emoji: '⚙️',
    title: 'Audit card',
    description: 'Test',
    choices: [],
    createdAtTick: 1,
    expiresAtTick: 1000,
  };
}

describe('Invention Fair command and card eligibility', () => {
  it('cannot treat an invented stage-1 answer as reject or close the story', () => {
    const state = scenario(1);
    const wood = state.resources.wood;
    const reputation = state.villageReputation;

    expect(resolveInventionFair(state, 'refund_all_materials')).toBe(false);
    expect(state.storyFlags?.invention_fair_resolved).toBeUndefined();
    expect(state.storyFlags?.invention_fair_status).toBe(1);
    expect(state.resources.wood).toBe(wood);
    expect(state.villageReputation).toBe(reputation);
    expect(getInventionFairChoiceEligibility(state, 'refund_all_materials').ok).toBe(false);
  });

  it('cannot turn a stage-1 choice into a stage-2 salvage refund', () => {
    const state = scenario(2);
    const wood = state.resources.wood;

    expect(resolveInventionFair(state, 'reject')).toBe(false);
    expect(resolveInventionFair(state, 'fund_gate')).toBe(false);
    expect(resolveInventionFair(state, 'refund_all_materials')).toBe(false);
    expect(state.resources.wood).toBe(wood);
    expect(state.storyFlags?.invention_fair_resolved).toBeUndefined();
  });

  it('offers only choices belonging to the current event stage', () => {
    const state = scenario(1);
    const notice = card('invention_stage1_1');
    const demo = card('invention_stage2_2');

    expect(getStoryChoiceEligibility(state, notice, 'fund_gate').ok).toBe(true);
    expect(getStoryChoiceEligibility(state, notice, 'dismantle').ok).toBe(false);
    expect(getStoryChoiceEligibility(state, demo, 'keep').ok).toBe(false);
    expect(getStoryChoiceEligibility(state, notice, 'unknown').ok).toBe(false);

    state.storyFlags = { invention_fair_status: 2 };
    expect(getStoryChoiceEligibility(state, notice, 'fund_gate').ok).toBe(false);
    expect(getStoryChoiceEligibility(state, demo, 'keep').ok).toBe(true);
    expect(getStoryChoiceEligibility(state, demo, 'reject').ok).toBe(false);
  });

  it('preserves existing valid funding and capped dismantle flows', () => {
    const state = scenario(1);
    expect(resolveInventionFair(state, 'fund_gate')).toBe(true);
    expect(state.resources.wood).toBe(30);

    state.resources.wood = state.storageMax.wood;
    expect(resolveInventionFair(state, 'dismantle')).toBe(true);
    expect(state.resources.wood).toBe(state.storageMax.wood);
    expect(state.storyFlags?.invention_fair_resolved).toBeGreaterThan(0);
  });
});
