/**
 * The invariant gate must be able to fail. This deliberately corrupts a real world and asserts the
 * collectors report the corruption and the dev/test assertion throws, so a green run cannot mean
 * "the collector is blind".
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { collectSimulationInvariantErrors, assertSimulationInvariants } from '../src/game/simulation/simulationInvariants';
import { assertSimInvariants } from '../src/game/simulation/simInvariants';

function world(): WorldState {
  return initGame({ skipTerrain: true, width: 800, height: 600, seed: 77 });
}

describe('simulation invariants can fail', () => {
  it('reports a broken occupant pointer instead of passing silently', () => {
    const state = world();
    const owner = state.entities.find((entity) => entity.type === EntityType.Human && entity.alive)!;
    owner.workerBuildingId = 999_999;

    const errors = collectSimulationInvariantErrors(state);
    expect(errors.some((error) => error.includes('workerBuildingId'))).toBe(true);
    expect(() => assertSimulationInvariants(state)).toThrow(/Simulation invariants violated/);
  });

  it('reports an orphaned spouse and a non-finite energy as sanity failures', () => {
    const state = world();
    const humans = state.entities.filter((entity) => entity.type === EntityType.Human && entity.alive);
    humans[0].partnerId = 888_888;
    humans[1].energy = Number.NaN;

    const sanity = assertSimInvariants(state);
    expect(sanity.some((error) => error.includes('partnerId 888888 missing'))).toBe(true);
    expect(sanity.some((error) => error.includes('non-finite energy'))).toBe(true);
  });
});
