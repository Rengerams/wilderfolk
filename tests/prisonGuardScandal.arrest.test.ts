/**
 * A serving prison guard is not jailed for a scandal. The prison's crew is what keeps it guarded —
 * three shifts need three guards — so jailing a guard leaves hours open and the prisoners leak.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { createBuilding, initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { isPlayerHuman } from '../src/game/playerHuman';
import { exposeAffair } from '../src/game/simulation/humanRelationships';
import { setSimSeed } from '../src/game/simRng';

const FIXTURE_SEED = 20261008;

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  const human = createEntity(EntityType.Human, 400, 400, id, 200);
  human.alive = true;
  human.faction = undefined;
  human.isJuvenile = false;
  human.age = 30;
  human.job = JobType.Settler;
  human.relationshipStatus = 'married';
  human.partnerId = undefined;
  human.workerBuildingId = undefined;
  human.residenceBuildingId = undefined;
  human.prisonBuildingId = undefined;
  return Object.assign(human, overrides);
}

/** A completed Prison with one posted guard, plus the paramour the scandal is caught with. */
function scandalWorld(): { state: WorldState; guard: Entity; paramour: Entity; prison: Building } {
  const state = initGame({ seed: FIXTURE_SEED });
  const prison = createBuilding(BuildingType.Prison, 400, 400, 900);
  prison.completed = true;
  const guard = settler(7001, { job: JobType.PrisonGuard, workerBuildingId: prison.id, partnerId: 7002 });
  const guardSpouse = settler(7002, { partnerId: guard.id });
  const paramour = settler(8001, { partnerId: 8002 });
  const paramourSpouse = settler(8002, { partnerId: paramour.id });
  prison.occupants = [guard.id];
  state.buildings = [prison];
  state.entities = [guard, guardSpouse, paramour, paramourSpouse];
  return { state, guard, paramour, prison };
}

describe('a caught scandal does not jail the prison’s own crew', () => {
  it('keeps a serving guard at the post while the ordinary offender is jailed', () => {
    let jailedOrdinaryOffender = false;

    // The arrest roll is seeded, so the control case is searched across seeds rather than stubbed.
    for (let seed = 1; seed <= 25 && !jailedOrdinaryOffender; seed++) {
      const { state, guard, paramour, prison } = scandalWorld();
      setSimSeed(seed);

      exposeAffair(
        state,
        guard,
        paramour,
        'caught',
        new Map(state.entities.map((entity) => [entity.id, entity])),
        state.buildings,
        state.entities.filter(isPlayerHuman),
      );

      expect(guard.prisonBuildingId, `seed ${seed} jailed the guard`).toBeUndefined();
      expect(guard.job).toBe(JobType.PrisonGuard);
      expect(guard.workerBuildingId).toBe(prison.id);
      if (paramour.prisonBuildingId === prison.id) jailedOrdinaryOffender = true;
    }

    expect(jailedOrdinaryOffender).toBe(true);
  });
});
