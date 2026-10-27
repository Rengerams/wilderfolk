/**
 * A pregnant settler can be given work.
 *
 * Audit L4 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`, tracked in
 * `LIVE-FINDINGS-STATUS.md`) reported the *drift*: `buildingStaffingActions` refused a pregnant settler
 * by hand while the daily auto-staffing pass assigned her anyway. Owner ruling, 2026-09-17: pregnancy
 * is not a bar to work at all — *"pregnancy can work"* — so the manual side is the one that changes.
 * There is a **single** automatic owner, `workforce.assignMissingWorkers` (12 trigger sites, plus the
 * "Auto-staff all" command which wraps it), and it applies two filters — both of which always allowed
 * pregnancy, so the manual file was the only outlier:
 *
 * | filter | file | pregnancy |
 * |---|---|---|
 * | idle pool / roster — the file's self-described "one shared definition" | `buildingStaffingActions.ts:58` | refused → now allowed |
 * | builder picker | `buildingStaffingActions.ts:92` | refused → now allowed |
 * | assign-button gate for an unfinished site | `buildingStaffingActions.ts:327` | refused → now allowed |
 * | auto: completed job buildings | `workforce.ts:353` | already allowed |
 * | auto: construction crews, same owner via `staffConstructionCrews` → `assignBuilderInPlace` | `workforce.ts:396` | already allowed |
 *
 * Every case below is driven through a public action, so it fails if any one of the three sites keeps
 * its bar rather than passing because a sibling was fixed.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import {
  assignBuilderToBuilding,
  canAssignWorkerToBuilding,
  listAssignableWorkersForBuilding,
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
  it('appears in the roster of assignable workers', () => {
    const state = world();

    expect(listAssignableWorkersForBuilding(state, MILL_ID).map((e) => e.id)).toContain(HER_ID);
  });

  it('enables the assign button for a completed job building', () => {
    const state = world();

    expect(canAssignWorkerToBuilding(state, MILL_ID)).toBe(true);
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
