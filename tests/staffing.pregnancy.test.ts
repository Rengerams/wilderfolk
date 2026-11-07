/**
 * Pregnancy is not a bar to work: every manual staffing path (`canAssignWorkerToBuilding` and the
 * builder picker) allows it, as the single automatic owner `assignMissingWorkers` always did.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import {
  assignBuilderToBuilding,
  canAssignWorkerToBuilding,
} from '../src/game/buildingStaffingActions';

const FIXTURE_SEED = 20_260_917;
const HER_ID = 1;
const MILL_ID = 10;
const SITE_ID = 11;

function building(id: number, type: BuildingType, completed: boolean): Building {
  return {
    id, type, x: 80, y: 80, width: 40, height: 40, occupants: [], level: 1, constructionProgress: 0,
    completed, health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
}

/** One idle, pregnant, adult player settler — the only candidate in the world. */
function world(): WorldState {
  const state = initGame({ villageName: 'Staffing', size: 'medium', seed: FIXTURE_SEED });
  const her: Entity = createEntity(EntityType.Human, 300, 300, HER_ID, 80, false, { name: 'Mara' });
  her.alive = true;
  her.isJuvenile = false;
  her.pregnant = true;
  state.entities = [her];
  state.buildings = [
    building(MILL_ID, BuildingType.Farm, true),
    building(SITE_ID, BuildingType.Farm, false),
  ];
  return state;
}

describe('a pregnant settler is assignable to work (L4)', () => {
  it('does not offer individual job selection for a pregnant adult', () => {
    const state = world();
    expect(canAssignWorkerToBuilding(state, MILL_ID)).toBe(false);
  });

  it('enables the assign button for an unfinished site', () => {
    const state = world();

    expect(canAssignWorkerToBuilding(state, SITE_ID)).toBe(true);
  });

  it('can actually be put on a construction crew', () => {
    const state = world();

    const after = assignBuilderToBuilding(state, SITE_ID, HER_ID);

    expect(after.buildings.find((b) => b.id === SITE_ID)?.occupants).toContain(HER_ID);
  });
});
