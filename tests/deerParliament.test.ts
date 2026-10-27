import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize, EntityType } from '../src/game/gameTypes';
import { DAYS_PER_YEAR, getColonyDay } from '../src/game/dayCycle';
import {
  deerParliamentEligibleDay,
  maybeOfferDeerParliament,
  resolveDeerParliament,
  tickDeerParliament,
} from '../src/game/deerParliament';
import { respondToStoryEvent } from '../src/game/storyEvents';

function setColonyDay(state: ReturnType<typeof initGame>, day: number): void {
  state.year = Math.floor(day / DAYS_PER_YEAR);
  state.dayInYear = day % DAYS_PER_YEAR;
}

function addDeer(state: ReturnType<typeof initGame>, count: number): void {
  for (let i = 0; i < count; i++) {
    state.entities.push({
      id: state.nextEntityId++,
      type: EntityType.Deer,
      x: 200,
      y: 200,
      alive: true,
    } as never);
  }
}

describe('S1 Deer Parliament', () => {
  it('offers at the eligible day with deer + ecology pressure', () => {
    const state = initGame({ size: MapSize.Medium, seed: 4242 });
    const day = deerParliamentEligibleDay(state.worldMap?.seed);
    setColonyDay(state, day);
    addDeer(state, 6);
    state.ecosystemHealth = 60;
    maybeOfferDeerParliament(state);
    expect(state.pendingStoryEvents ?? []).toHaveLength(1);
    expect(state.storyFlags?.deer_parliament_offered).toBeGreaterThan(0);
  });

  it('does not offer before the eligible day', () => {
    const state = initGame({ size: MapSize.Medium, seed: 4242 });
    setColonyDay(state, 10);
    addDeer(state, 6);
    state.ecosystemHealth = 60;
    maybeOfferDeerParliament(state);
    expect(state.pendingStoryEvents ?? []).toHaveLength(0);
  });

  it('resolves preserve and sets the campaign flag', () => {
    const state = initGame({ size: MapSize.Medium, seed: 4242 });
    const day = deerParliamentEligibleDay(state.worldMap?.seed);
    setColonyDay(state, day);
    addDeer(state, 6);
    state.ecosystemHealth = 60;
    state.resources.wood = 100;
    maybeOfferDeerParliament(state);
    const evt = state.pendingStoryEvents![0];
    const next = respondToStoryEvent(state, evt.id, 'preserve');
    expect(next.storyFlags?.deer_parliament_resolved).toBeGreaterThan(0);
    expect(next.ecosystemHealth).toBeGreaterThan(60);
    expect(next.resources.wood).toBeLessThan(100);
  });

  it('keeps the card when preserve is unaffordable', () => {
    const state = initGame({ size: MapSize.Medium, seed: 4242 });
    const day = deerParliamentEligibleDay(state.worldMap?.seed);
    setColonyDay(state, day);
    addDeer(state, 6);
    state.ecosystemHealth = 60;
    state.resources.wood = 0;
    maybeOfferDeerParliament(state);
    const evt = state.pendingStoryEvents![0];
    const next = respondToStoryEvent(state, evt.id, 'preserve');
    expect(next.pendingStoryEvents ?? []).toHaveLength(1);
    expect(next.storyFlags?.deer_parliament_resolved ?? 0).toBe(0);
    expect(next.resources.wood).toBe(0);
  });

  it('runs the follow-up after the delay', () => {
    const state = initGame({ size: MapSize.Medium, seed: 4242 });
    const day = deerParliamentEligibleDay(state.worldMap?.seed);
    setColonyDay(state, day);
    addDeer(state, 6);
    state.ecosystemHealth = 60;
    maybeOfferDeerParliament(state);
    const evt = state.pendingStoryEvents![0];
    const next = respondToStoryEvent(state, evt.id, 'ignore');
    const followUpDay = (next.storyFlags?.deer_parliament_followup_day ?? 0);
    setColonyDay(next, followUpDay);
    tickDeerParliament(next);
    expect(next.storyFlags?.deer_parliament_followup_done).toBeGreaterThan(0);
  });
});
