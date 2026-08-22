import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  createGuidedCampaignState,
  getGuidedCampaignProgress,
  recordGuidedCampaignChoice,
  startGuidedCampaign,
  tickGuidedCampaign,
} from '../src/game/guidedCampaign';

function freshWorld() {
  const world = initGame();
  world.guidedCampaign = createGuidedCampaignState();
  return world;
}

describe('Guided Campaign director', () => {
  it('starts separately from sandbox story state', () => {
    const world = freshWorld();
    startGuidedCampaign(world);

    expect(world.guidedCampaign?.active).toBe(true);
    expect(world.guidedCampaign?.unlockedChapterIds).toEqual(['deer_parliament']);
    expect(world.pendingStoryEvents ?? []).toEqual([]);
  });

  it('unlocks the next chapter and records memory tags from an existing story flag', () => {
    const world = freshWorld();
    startGuidedCampaign(world);
    world.storyFlags = { guided_deer_parliament_resolved: world.tick };
    world.tick += 72;

    tickGuidedCampaign(world);

    expect(world.guidedCampaign?.completedChapterIds).toEqual(['deer_parliament']);
    expect(world.guidedCampaign?.unlockedChapterIds).toContain('traveling_theatre');
    expect(world.guidedCampaign?.memoryTags).toContain('stewardship');
    expect(getGuidedCampaignProgress(world).current?.id).toBe('traveling_theatre');
  });

  it('accepts choices only for unlocked chapters and completes after all chapter flags resolve', () => {
    const world = freshWorld();
    startGuidedCampaign(world);
    recordGuidedCampaignChoice(world, 'deer_parliament', 'protect-clearing');
    recordGuidedCampaignChoice(world, 'traveling_theatre', 'invalid-before-unlock');
    expect(world.guidedCampaign?.choices).toHaveLength(1);

    world.storyFlags = {
      guided_deer_parliament_resolved: 1,
      guided_traveling_theatre_resolved: 1,
      guided_wedding_diplomacy_resolved: 1,
      guided_apprentice_invention_resolved: 1,
      guided_rumour_ledger_resolved: 1,
    };
    tickGuidedCampaign(world);

    expect(world.guidedCampaign?.completed).toBe(true);
    expect(world.guidedCampaign?.completedChapterIds).toHaveLength(5);
    expect(getGuidedCampaignProgress(world).current).toBeNull();
  });
});
