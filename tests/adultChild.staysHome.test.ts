/**
 * A grown child is never moved out of the family home (§9).
 *
 * At 18 a settler may leave; nobody leaves for them. A free house is not an instruction, so the
 * grown child keeps the family home, the derived diagnostics agree, and re-running the housing pass
 * over unchanged, valid state moves nobody.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { assignMissingResidences } from '../src/game/residencyReconciliation';
import { auditHousingSharingIssues } from '../src/game/residencySelection';

const PARENT_ID = 1;
const GROWN_CHILD_ID = 2;
const STRANGER_ID = 3;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 200,
    maxEnergy: 200,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: id % 2 === 1 ? 'female' : 'male',
    name: `H${id}`,
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function house(id: number, x: number): Building {
  const building = createBuilding(BuildingType.House, x, 200, id);
  building.completed = true;
  return building;
}

/** A widowed parent and their 19-year-old child, both living in house #1. */
function familyAtHome(): { humans: Entity[]; familyHome: Building; emptyHome: Building } {
  const familyHome = house(1, 0);
  const emptyHome = house(2, 400);
  const parent = human(PARENT_ID, { age: 45, residenceBuildingId: familyHome.id, childrenIds: [GROWN_CHILD_ID] });
  const child = human(GROWN_CHILD_ID, { age: 19, motherId: PARENT_ID, residenceBuildingId: familyHome.id });
  familyHome.occupants = [parent.id, child.id];
  return { humans: [parent, child], familyHome, emptyHome };
}

describe('a grown child keeps the family home', () => {
  it('stays with the parent while a house stands empty', () => {
    const { humans, familyHome, emptyHome } = familyAtHome();

    assignMissingResidences(humans, [familyHome, emptyHome]);

    expect(humans.map((member) => member.residenceBuildingId)).toEqual([familyHome.id, familyHome.id]);
    expect(emptyHome.occupants).toEqual([]);
  });

  it('reports no housing problem for the family and moves nobody on a second pass', () => {
    const { humans, familyHome, emptyHome } = familyAtHome();

    assignMissingResidences(humans, [familyHome, emptyHome]);
    expect(auditHousingSharingIssues(humans, [familyHome, emptyHome])).toEqual([]);
    const afterFirstPass = humans.map((member) => member.residenceBuildingId);

    assignMissingResidences(humans, [familyHome, emptyHome]);

    expect(humans.map((member) => member.residenceBuildingId)).toEqual(afterFirstPass);
  });

  it('still moves an unrelated settler out of the family home into the empty one', () => {
    const { humans, familyHome, emptyHome } = familyAtHome();
    const stranger = human(STRANGER_ID, { age: 30, residenceBuildingId: familyHome.id });
    familyHome.occupants = [...familyHome.occupants, stranger.id];

    assignMissingResidences([...humans, stranger], [familyHome, emptyHome]);

    expect(stranger.residenceBuildingId).toBe(emptyHome.id);
    expect(humans.map((member) => member.residenceBuildingId)).toEqual([familyHome.id, familyHome.id]);
  });
});
