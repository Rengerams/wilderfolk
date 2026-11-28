/**
 * A challenge reward grants every resource it declares: `challenges.ts` promises iron in its reward
 * bundles, so the grant must credit it alongside wood, stone, food and gold.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { getChallengeProgress, INITIAL_CHALLENGES } from '../src/game/challenges';
import { tickDailyChallenges } from '../src/game/dailyChallenges';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { BuildingType } from '../src/game/buildings';
import type { Building, Resources, WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;

function world(): WorldState {
  const state = initGame({ villageName: 'Rewards', size: 'medium', seed: FIXTURE_SEED });
  state.challenges = INITIAL_CHALLENGES.map((c) => ({ ...c, completed: false }));
  // Reward grants clamp to `storageMax`; raise the caps so a capped grant cannot be mistaken for a
  // missing one. This test is about the grant list, not about storage.
  state.storageMax = { wood: 10_000, stone: 10_000, food: 10_000, gold: 10_000, iron: 10_000 };
  return state;
}

/** `tickDailyChallenges` reads only `ctx.updatedBuildings`, so the fixture supplies just that. */
function ctxOf(state: WorldState): TickContext {
  return { updatedBuildings: state.buildings } as unknown as TickContext;
}

function grant(state: WorldState): void {
  tickDailyChallenges(state, ctxOf(state), { humans: 10 });
}

describe('challenge reward grants', () => {
  it('credits every field of the reward bundle', () => {
    const state = world();
    const reward: Resources = { wood: 10, stone: 20, food: 30, gold: 40, iron: 50 };
    // `id` is not one of `isChallengeComplete`'s switch cases, so it falls to the generic target branch
    // and `targetPopulation: 0` completes it.
    state.challenges = [{
      id: 'probe', title: 'Probe', description: '', completed: false, targetPopulation: 0, reward,
    }];
    const before = { ...state.resources };

    grant(state);

    expect(state.challenges[0].completed).toBe(true);
    for (const [type, amount] of Object.entries(reward)) {
      expect(state.resources[type as keyof Resources] - before[type as keyof Resources], type)
        .toBe(amount);
    }
  });

  it('grants the iron that the reward text promises', () => {
    const state = world();
    // `century` completes on `state.year >= 100` and promises "+500 all resources + 500 iron!".
    state.year = 100;
    const before = { ...state.resources };

    grant(state);

    const century = state.challenges.find((c) => c.id === 'century');
    expect(century?.completed).toBe(true);
    expect(state.resources.iron - before.iron).toBe(century?.reward?.iron);
    expect(state.resources.iron - before.iron).toBe(500);
  });

  it('never promises iron that the reward object does not carry', () => {
    // The promise is the text the panel renders, so a text promising `iron` must carry iron in
    // its reward bundle.
    const promising = INITIAL_CHALLENGES.filter((c) => c.rewardText?.includes('iron'));
    expect(promising.length).toBeGreaterThan(0);
    for (const challenge of promising) {
      expect(challenge.reward?.iron ?? 0, challenge.id).toBeGreaterThan(0);
    }
  });
});

function completedPlayerHouse(id: number): Building {
  return {
    id, type: BuildingType.House, x: 100, y: 100, width: 20, height: 20, completed: true, occupants: [], rotation: 0,
  } as unknown as Building;
}

describe('R8 — every goal card reports progress from the challenge\'s own targets', () => {
  it('gives each unfinished initial challenge a non-empty current / target row', () => {
    const state = world();
    for (const challenge of INITIAL_CHALLENGES) {
      const row = getChallengeProgress({ ...challenge, completed: false }, state);
      expect(row, `${challenge.id} has no progress row`).not.toBeNull();
      expect(row?.target, challenge.id).toBeGreaterThan(0);
      expect(row?.unit.length, challenge.id).toBeGreaterThan(0);
    }
  });

  it('counts Growing Village in completed player buildings and Century Mark in years', () => {
    const state = world();
    const growing = INITIAL_CHALLENGES.find((c) => c.id === 'growing_village');
    const century = INITIAL_CHALLENGES.find((c) => c.id === 'century');
    expect(growing, 'fixture premise: the challenge exists').toBeTruthy();
    expect(century, 'fixture premise: the challenge exists').toBeTruthy();

    const before = getChallengeProgress({ ...growing!, completed: false }, state);
    expect(before).toMatchObject({ target: 5, unit: 'buildings' });
    state.buildings.push(completedPlayerHouse(9001));
    expect(getChallengeProgress({ ...growing!, completed: false }, state)?.current)
      .toBe((before?.current ?? 0) + 1);

    state.year = 42;
    expect(getChallengeProgress({ ...century!, completed: false }, state)).toMatchObject({
      current: 42, target: 100, unit: 'years',
    });
  });
});
