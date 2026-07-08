import { afterEach, describe, expect, it, vi } from 'vitest';
import { initGame } from '@/game/gameEngine';
import {
  computeHumanAgeYears,
  getColonyDay,
  TICKS_PER_DAY,
} from '@/game/dayCycle';
import {
  isPlayerHuman,
  negotiateRefugees,
  playerHumanCount,
  tryFirstWeekVisitor,
} from '@/game/groupEvents';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';
import { freshState, makeCompletedHouse, refugeeGroup } from '@/test/fixtures/gameFixtures';

describe('isPlayerHuman / playerHumanCount', () => {
  it('counts only alive non-faction humans', () => {
    const player = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    const visitor = createEntity(EntityType.Human, 0, 0, 2, 250, false);
    visitor.faction = 'visitor';
    expect(isPlayerHuman(player)).toBe(true);
    expect(isPlayerHuman(visitor)).toBe(false);
    expect(playerHumanCount([player, visitor])).toBe(1);
  });
});

describe('negotiateRefugees — welcome', () => {
  it('sets birth calendar on admitted refugees', () => {
    const state = freshState();
    state.resources.food = 200;
    state.year = 2;
    state.dayInYear = 50;
    const group = refugeeGroup();
    state.visitorGroups = [group];

    const idsBefore = new Set(state.entities.filter(isPlayerHuman).map((e) => e.id));
    const popBefore = idsBefore.size;
    const next = negotiateRefugees(state, group.id, 'welcome');
    const newcomers = next.entities.filter((e) => isPlayerHuman(e) && !idsBefore.has(e.id));

    expect(playerHumanCount(next.entities)).toBeGreaterThan(popBefore);
    expect(newcomers.length).toBeGreaterThan(0);
    for (const ent of newcomers) {
      expect(ent.birthYear).toBeDefined();
      expect(ent.birthDay).toBeDefined();
      const age = computeHumanAgeYears(ent, getColonyDay(next));
      expect(age).toBeGreaterThanOrEqual(16);
      expect(age).toBeLessThanOrEqual(35);
    }
    expect(next.visitorGroups[0].refugeeResolved).toBe(true);
  });

  it('does not charge food when nobody can join', () => {
    const state = freshState();
    state.resources.food = 200;
    state.maxHumanPopulation = playerHumanCount(state.entities);
    const group = refugeeGroup('ref_cap');
    state.visitorGroups = [group];

    const foodBefore = state.resources.food;
    const next = negotiateRefugees(state, group.id, 'welcome');
    expect(next.resources.food).toBe(foodBefore);
  });
});

describe('negotiateRefugees — screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not deduct food when screening fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = freshState();
    state.resources.food = 200;
    const group = refugeeGroup('ref_screen_fail');
    state.visitorGroups = [group];

    const next = negotiateRefugees(state, group.id, 'screen');
    expect(next.resources.food).toBe(200);
    expect(next.visitorGroups[0].refugeeResolved).toBe(true);
  });

  it('deducts 20 food only when someone is admitted', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const state = freshState();
    state.resources.food = 200;
    const group = refugeeGroup('ref_screen_ok');
    state.visitorGroups = [group];

    const next = negotiateRefugees(state, group.id, 'screen');
    expect(next.resources.food).toBe(180);
  });
});

describe('negotiateRefugees — turn_away', () => {
  it('resolves without adding settlers', () => {
    const state = freshState();
    const group = refugeeGroup('ref_away');
    state.visitorGroups = [group];
    const pop = playerHumanCount(state.entities);
    const next = negotiateRefugees(state, group.id, 'turn_away');
    expect(playerHumanCount(next.entities)).toBe(pop);
    expect(next.visitorGroups[0].refugeeResolved).toBe(true);
  });
});

describe('tryFirstWeekVisitor', () => {
  it('spawns pilgrims or performers while traders are already present', () => {
    const state = initGame();
    state.firstWeekVisitorSpawned = false;
    state.tick = 4 * TICKS_PER_DAY;
    state.visitorGroups = [
      {
        id: 'founding_traders',
        name: 'Founding Traders',
        kind: 'traders',
        campX: 50,
        campY: 50,
        daysLeft: 10,
        entityIds: [],
        tradesCompleted: 0,
        giftsGiven: 0,
        refugeeResolved: false,
        leaderTalked: false,
      },
    ];
    state.buildings = [];
    makeCompletedHouse(state, 1, 200);

    const before = state.visitorGroups.length;
    tryFirstWeekVisitor(state, state.entities, state.buildings);

    expect(state.firstWeekVisitorSpawned).toBe(true);
    expect(state.visitorGroups.length).toBe(before + 1);
  });

  it('does not spawn twice', () => {
    const state = initGame();
    state.firstWeekVisitorSpawned = true;
    state.tick = 4 * TICKS_PER_DAY;
    const before = state.visitorGroups.length;
    tryFirstWeekVisitor(state, state.entities, state.buildings);
    expect(state.visitorGroups.length).toBe(before);
  });
});