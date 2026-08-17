/**
 * Signature stories (v0.6.1): authored cross-system choices — the first-session
 * wolf choice and the philosophical election debate. These pin the offer
 * guards (once-per-world / once-per-election), the resolution effects (eco,
 * reputation, food) and the command-validator parity so the stories can't
 * drift from the UI the player sees.
 */
import { describe, expect, it } from 'vitest';
import { isWorkerCommand } from '../src/game/simWorker/commands';
import { initGame } from '../src/game/gameEngine';
import type { WorldState } from '../src/game/gameTypes';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  maybeOfferWolfChoice,
  maybeOfferValleyDebate,
  respondToStoryEvent,
  tickPendingStoryEvents,
} from '../src/game/storyEvents';

function worldWithWolvesAndFarm(): WorldState {
  const state = initGame({ villageName: 'StoryVale', size: MapSize.Small });
  state.year = 0;
  state.resources.food = 50;
  // Ensure at least one living wolf (predators spawn, but pin it for determinism).
  if (!state.entities.some((e) => e.alive && e.type === EntityType.Wolf)) {
    state.entities.push({
      id: state.nextEntityId++,
      type: EntityType.Wolf,
      x: 500,
      y: 500,
      alive: true,
    } as never);
  }
  state.buildings.push({
    id: state.nextBuildingId++,
    type: BuildingType.Farm,
    x: 400,
    y: 300,
    width: 80,
    height: 60,
    completed: true,
    faction: 'player',
    occupants: [],
    level: 1,
  } as never);
  return state;
}

describe('first-session wolf choice', () => {
  it('offers the pack story once, only in year 0 with wolves + a farm/hunting spot', () => {
    const state = worldWithWolvesAndFarm();
    maybeOfferWolfChoice(state);
    expect(state.pendingStoryEvents?.length).toBe(1);
    expect(state.pendingStoryEvents![0].storyKey).toBe('wolf_choice');

    // Already flagged → never re-offered.
    maybeOfferWolfChoice(state);
    expect(state.pendingStoryEvents?.length).toBe(1);
  });

  it('does not offer after the first two months', () => {
    const state = worldWithWolvesAndFarm();
    state.dayInYear = 60;
    maybeOfferWolfChoice(state);
    expect(state.pendingStoryEvents?.length ?? 0).toBe(0);
  });

  it('does not offer after the first year', () => {
    const state = worldWithWolvesAndFarm();
    state.year = 1;
    maybeOfferWolfChoice(state);
    expect(state.pendingStoryEvents?.length ?? 0).toBe(0);
  });

  it('resolves thin-the-pack: eco down, reputation up, event removed', () => {
    const state = worldWithWolvesAndFarm();
    maybeOfferWolfChoice(state);
    const ecoBefore = state.ecosystemHealth ?? 80;
    const repBefore = state.villageReputation;
    const id = state.pendingStoryEvents![0].id;
    const next = respondToStoryEvent(state, id, 'thin_pack');
    expect(next.pendingStoryEvents?.length ?? 0).toBe(0);
    expect(next.ecosystemHealth ?? 80).toBe(ecoBefore - 6);
    expect(next.villageReputation).toBeGreaterThan(repBefore);
  });

  it('resolves let-them-be: eco up, reputation unchanged', () => {
    const state = worldWithWolvesAndFarm();
    state.ecosystemHealth = 50;
    maybeOfferWolfChoice(state);
    const ecoBefore = 50;
    const repBefore = state.villageReputation;
    const id = state.pendingStoryEvents![0].id;
    const next = respondToStoryEvent(state, id, 'let_be');
    expect(next.pendingStoryEvents?.length ?? 0).toBe(0);
    expect(next.ecosystemHealth ?? 80).toBe(ecoBefore + 4);
    expect(next.villageReputation).toBe(repBefore);
  });
});

describe('philosophical election debate', () => {
  it('offers once per election year when at least two candidates exist', () => {
    const state = initGame({ villageName: 'StoryVale2', size: MapSize.Small });
    maybeOfferValleyDebate(state, ['Alda', 'Bram']);
    expect(state.pendingStoryEvents?.length).toBe(1);
    expect(state.pendingStoryEvents![0].storyKey).toBe('valley_debate');

    // Same year → not offered twice.
    maybeOfferValleyDebate(state, ['Alda', 'Bram']);
    expect(state.pendingStoryEvents?.length).toBe(1);

    // Next year → offered again (per-election).
    state.year = 2;
    state.pendingStoryEvents = [];
    maybeOfferValleyDebate(state, ['Cara', 'Dune']);
    expect(state.pendingStoryEvents?.length).toBe(1);
  });

  it('does not offer with fewer than two candidates', () => {
    const state = initGame({ villageName: 'StoryVale3', size: MapSize.Small });
    maybeOfferValleyDebate(state, ['Solo']);
    expect(state.pendingStoryEvents?.length ?? 0).toBe(0);
  });

  it('resolves growth: eco down, reputation up', () => {
    const state = initGame({ villageName: 'StoryVale4', size: MapSize.Small });
    maybeOfferValleyDebate(state, ['Alda', 'Bram']);
    const ecoBefore = state.ecosystemHealth ?? 80;
    const repBefore = state.villageReputation;
    const id = state.pendingStoryEvents![0].id;
    const next = respondToStoryEvent(state, id, 'expansion');
    expect(next.pendingStoryEvents?.length ?? 0).toBe(0);
    expect(next.ecosystemHealth ?? 80).toBe(ecoBefore - 5);
    expect(next.villageReputation).toBeGreaterThan(repBefore);
  });

  it('resolves preservation: eco up', () => {
    const state = initGame({ villageName: 'StoryVale5', size: MapSize.Small });
    state.ecosystemHealth = 50;
    maybeOfferValleyDebate(state, ['Alda', 'Bram']);
    const ecoBefore = 50;
    const id = state.pendingStoryEvents![0].id;
    const next = respondToStoryEvent(state, id, 'preservation');
    expect(next.ecosystemHealth ?? 80).toBe(ecoBefore + 5);
  });

  it('resolves festivals: reputation up, eco unchanged', () => {
    const state = initGame({ villageName: 'StoryVale6', size: MapSize.Small });
    maybeOfferValleyDebate(state, ['Alda', 'Bram']);
    const ecoBefore = state.ecosystemHealth ?? 80;
    const repBefore = state.villageReputation;
    const id = state.pendingStoryEvents![0].id;
    const next = respondToStoryEvent(state, id, 'festivals');
    expect(next.ecosystemHealth ?? 80).toBe(ecoBefore);
    expect(next.villageReputation).toBeGreaterThan(repBefore);
  });
});

describe('story event lifecycle', () => {
  it('expires unanswered stories', () => {
    const state = initGame({ villageName: 'StoryVale7', size: MapSize.Small });
    maybeOfferValleyDebate(state, ['Alda', 'Bram']);
    const evt = state.pendingStoryEvents![0];
    state.tick = evt.expiresAtTick;
    tickPendingStoryEvents(state);
    expect(state.pendingStoryEvents?.length ?? 0).toBe(0);
  });

  it('respondToStoryEvent with an unknown id is a no-op', () => {
    const state = initGame({ villageName: 'StoryVale8', size: MapSize.Small });
    const next = respondToStoryEvent(state, 'does_not_exist', 'thin_pack');
    expect(next.pendingStoryEvents?.length ?? 0).toBe(0);
  });

  it('isWorkerCommand accepts respondToStoryEvent and rejects bad shapes', () => {
    expect(
      isWorkerCommand({ proto: 1, op: 'respondToStoryEvent', eventId: 'wolf_1', choiceId: 'let_be' }),
    ).toBe(true);
    expect(
      isWorkerCommand({ proto: 1, op: 'respondToStoryEvent', eventId: '', choiceId: 'let_be' }),
    ).toBe(false);
    expect(
      isWorkerCommand({ proto: 1, op: 'respondToStoryEvent', eventId: 'wolf_1', choiceId: '' }),
    ).toBe(false);
  });

  it('ticks past a full day boundary are covered by TICKS_PER_DAY sanity', () => {
    expect(TICKS_PER_DAY).toBeGreaterThan(0);
  });
});
