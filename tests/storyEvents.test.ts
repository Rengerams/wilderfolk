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
  maybeOfferWelcome,
  maybeOfferWolfChoice,
  maybeOfferRangerVisit,
  maybeOfferGriefBeat,
  maybeOfferHowlerRumor,
  maybeOfferWinterPrep,
  maybeOfferValleyDebate,
  respondToStoryEvent,
  tickPendingStoryEvents,
  tickWinterFreezeCheck,
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
  // A completed home — the wolf choice waits for the player to settle in.
  state.buildings.push({
    id: state.nextBuildingId++,
    type: BuildingType.House,
    x: 500,
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

  it('guarantees the moment by day 60 even if the player has not built yet', () => {
    const state = worldWithWolvesAndFarm();
    state.buildings = []; // no house, no farm
    state.dayInYear = 10;
    maybeOfferWolfChoice(state);
    expect(state.pendingStoryEvents?.length ?? 0).toBe(0); // waits for progress
    state.dayInYear = 60;
    maybeOfferWolfChoice(state);
    expect(state.pendingStoryEvents?.length).toBe(1); // guaranteed now
  });

  it('does not offer after the first year', () => {
    const state = worldWithWolvesAndFarm();
    state.year = 1;
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

describe('first-session arc', () => {
  it('welcome beat: offered once on day 0, listen-to-elders raises eco', () => {
    const state = initGame({ villageName: 'ArcVale1', size: MapSize.Small });
    state.dayInYear = 0;
    state.ecosystemHealth = 50;
    maybeOfferWelcome(state);
    expect(state.pendingStoryEvents?.length).toBe(1);
    const id = state.pendingStoryEvents![0].id;
    const next = respondToStoryEvent(state, id, 'listen_elders');
    expect(next.ecosystemHealth).toBe(52);
    maybeOfferWelcome(next);
    expect(next.pendingStoryEvents?.length ?? 0).toBe(0);
  });

  it('welcome beat: set-to-work grants wood', () => {
    const state = initGame({ villageName: 'ArcVale2', size: MapSize.Small });
    state.dayInYear = 0;
    const woodBefore = state.resources.wood;
    maybeOfferWelcome(state);
    const next = respondToStoryEvent(state, state.pendingStoryEvents![0].id, 'set_to_work');
    expect(next.resources.wood).toBe(woodBefore + 5);
  });

  it('ranger: waits for the wolf choice to resolve, then visits once', () => {
    const state = initGame({ villageName: 'ArcVale3', size: MapSize.Small });
    state.year = 0;
    state.dayInYear = 60; // the two-month guarantee — no build progress needed
    maybeOfferWolfChoice(state);
    const wolfId = state.pendingStoryEvents![0].id;
    const resolved = respondToStoryEvent(state, wolfId, 'let_be');
    // Too soon (same tick) — no ranger yet.
    maybeOfferRangerVisit(resolved);
    expect(resolved.pendingStoryEvents?.length ?? 0).toBe(0);
    // Three days later — the ranger comes.
    resolved.tick = resolved.storyFlags!.wolf_resolvedTick! + TICKS_PER_DAY * 3;
    maybeOfferRangerVisit(resolved);
    expect(resolved.pendingStoryEvents?.length).toBe(1);
    expect(resolved.pendingStoryEvents![0].storyKey).toBe('ranger_visit');
  });

  it('ranger: acknowledges the spare-the-pack choice with reputation', () => {
    const state = initGame({ villageName: 'ArcVale4', size: MapSize.Small });
    state.year = 0;
    state.dayInYear = 60; // the two-month guarantee — no build progress needed
    maybeOfferWolfChoice(state);
    const resolved = respondToStoryEvent(state, state.pendingStoryEvents![0].id, 'let_be');
    resolved.tick = resolved.storyFlags!.wolf_resolvedTick! + TICKS_PER_DAY * 3;
    maybeOfferRangerVisit(resolved);
    const repBefore = resolved.villageReputation;
    const next = respondToStoryEvent(resolved, resolved.pendingStoryEvents![0].id, 'acknowledge');
    expect(next.villageReputation).toBeGreaterThan(repBefore);
  });

  it('winter prep: offered on day 210; freeze check rewards a met pact', () => {
    const state = initGame({ villageName: 'ArcVale5', size: MapSize.Small });
    state.year = 0;
    state.dayInYear = 210;
    maybeOfferWinterPrep(state);
    expect(state.pendingStoryEvents?.length).toBe(1);
    const accepted = respondToStoryEvent(state, state.pendingStoryEvents![0].id, 'accept');
    expect(accepted.storyFlags?.winter_accepted).toBeGreaterThan(0);
    accepted.dayInYear = 260;
    accepted.resources.wood = 150;
    accepted.resources.food = 200;
    const repBefore = accepted.villageReputation;
    tickWinterFreezeCheck(accepted);
    expect(accepted.villageReputation).toBeGreaterThan(repBefore);
  });

  it('winter prep: a failed pact costs reputation at the freeze', () => {
    const state = initGame({ villageName: 'ArcVale6', size: MapSize.Small });
    state.year = 0;
    state.dayInYear = 210;
    maybeOfferWinterPrep(state);
    const accepted = respondToStoryEvent(state, state.pendingStoryEvents![0].id, 'accept');
    accepted.dayInYear = 260;
    accepted.resources.wood = 10;
    accepted.resources.food = 5;
    const repBefore = accepted.villageReputation;
    tickWinterFreezeCheck(accepted);
    expect(accepted.villageReputation).toBeLessThan(repBefore);
  });

  it('winter prep: declining the pact means no freeze penalty', () => {
    const state = initGame({ villageName: 'ArcVale7', size: MapSize.Small });
    state.year = 0;
    state.dayInYear = 210;
    maybeOfferWinterPrep(state);
    const declined = respondToStoryEvent(state, state.pendingStoryEvents![0].id, 'decline');
    declined.dayInYear = 260;
    declined.resources.wood = 5;
    declined.resources.food = 5;
    const repBefore = declined.villageReputation;
    tickWinterFreezeCheck(declined);
    expect(declined.villageReputation).toBe(repBefore);
  });
});

describe('systems introduced through consequences', () => {
  it('grief beat: offered once when a grieving settler with family exists', () => {
    const state = initGame({ villageName: 'Emergence1', size: MapSize.Small });
    state.year = 0;
    const human = state.entities.find((e) => e.type === EntityType.Human && !e.faction && !e.isJuvenile);
    expect(human).toBeTruthy();
    human!.griefUntilTick = state.tick + 10;
    human!.childrenIds = [9999];
    maybeOfferGriefBeat(state);
    expect(state.pendingStoryEvents?.length).toBe(1);
    expect(state.pendingStoryEvents![0].storyKey).toBe('grief_beat');
    maybeOfferGriefBeat(state);
    expect(state.pendingStoryEvents?.length).toBe(1);
  });

  it('grief beat: not offered without a grieving settler', () => {
    const state = initGame({ villageName: 'Emergence2', size: MapSize.Small });
    state.year = 0;
    maybeOfferGriefBeat(state);
    expect(state.pendingStoryEvents?.length ?? 0).toBe(0);
  });

  it('grief beat: comfort raises reputation and eases the mourner', () => {
    const state = initGame({ villageName: 'Emergence3', size: MapSize.Small });
    state.year = 0;
    const human = state.entities.find((e) => e.type === EntityType.Human && !e.faction && !e.isJuvenile)!;
    human.griefUntilTick = state.tick + 10;
    human.childrenIds = [9999];
    maybeOfferGriefBeat(state);
    const repBefore = state.villageReputation;
    const energyBefore = human.energy;
    const next = respondToStoryEvent(state, state.pendingStoryEvents![0].id, 'comfort');
    expect(next.villageReputation).toBeGreaterThan(repBefore);
    const mourner = next.entities.find((e) => e.id === human.id)!;
    expect(mourner.energy).toBeGreaterThan(energyBefore);
  });

  it('howler rumor: only after the ranger visit, late in the first year', () => {
    const state = initGame({ villageName: 'Emergence4', size: MapSize.Small });
    state.year = 0;
    state.storyFlags = { ranger_visit: 10 };
    state.dayInYear = 100;
    maybeOfferHowlerRumor(state);
    expect(state.pendingStoryEvents?.length ?? 0).toBe(0); // too early
    state.dayInYear = 200;
    maybeOfferHowlerRumor(state);
    expect(state.pendingStoryEvents?.length).toBe(1);
    expect(state.pendingStoryEvents![0].storyKey).toBe('howler_rumor');
  });

  it('howler rumor: not offered before the ranger visited', () => {
    const state = initGame({ villageName: 'Emergence5', size: MapSize.Small });
    state.year = 0;
    state.dayInYear = 200;
    maybeOfferHowlerRumor(state);
    expect(state.pendingStoryEvents?.length ?? 0).toBe(0);
  });

  it('howler rumor: heeding the warning raises reputation', () => {
    const state = initGame({ villageName: 'Emergence6', size: MapSize.Small });
    state.year = 0;
    state.storyFlags = { ranger_visit: 10 };
    state.dayInYear = 200;
    maybeOfferHowlerRumor(state);
    const repBefore = state.villageReputation;
    const next = respondToStoryEvent(state, state.pendingStoryEvents![0].id, 'heed');
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
