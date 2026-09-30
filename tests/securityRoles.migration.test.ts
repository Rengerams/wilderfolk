import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { migrateLegacySecurityRoles } from '../src/game/saveLoad';
import { repairJuvenileAssignmentsOnLoad } from '../src/game/dayCycle';

function legacyHuman(id: number, homeBuildingId?: number): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    reproductionCooldown: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Guard,
    homeBuildingId,
  };
}

function building(id: number, type: BuildingType): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

describe('legacy security-role migration', () => {
  it('maps legacy Guards by workplace and leaves ambiguous workers unchanged', () => {
    const barracksSoldier = legacyHuman(1, 10);
    const prisonGuard = legacyHuman(2, 11);
    const unassigned = legacyHuman(3);
    const world = {
      entities: [barracksSoldier, prisonGuard, unassigned],
      buildings: [
        building(10, BuildingType.Barracks),
        building(11, BuildingType.Prison),
      ],
    } as WorldState;

    migrateLegacySecurityRoles(world);

    expect(barracksSoldier.job).toBe(JobType.Soldier);
    expect(prisonGuard.job).toBe(JobType.PrisonGuard);
    expect(unassigned.job).toBe(JobType.Guard);
  });
});

/**
 * `isJuvenile` is derived once at spawn and graduation only ever clears it, so a save carrying a child
 * flagged as an adult keeps him in an adult's posting — armed, posted, and barred from school, which
 * keys off the same flag (`education.ts` refuses any pupil who is not a juvenile).
 */
describe('juvenile assignment load repair', () => {
  const barracks = (occupants: number[]): Building => ({ ...building(10, BuildingType.Barracks), occupants });

  it('demotes a child holding a soldier posting and frees the barracks slot', () => {
    const child = { ...legacyHuman(1, 10), age: 11, isJuvenile: false, job: JobType.Soldier, occupation: 'soldier' };
    const barracks10 = barracks([1]);
    const world = { entities: [child], buildings: [barracks10], villageLeaderId: null } as WorldState;

    repairJuvenileAssignmentsOnLoad(world);

    expect(child.isJuvenile).toBe(true);
    expect(child.job).toBe(JobType.Settler);
    expect(child.occupation).toBe('settler');
    expect(child.homeBuildingId).toBeUndefined();
    expect(barracks10.occupants).not.toContain(1);
  });

  it('leaves anyone at or past the threshold to the graduation transition', () => {
    const adult = { ...legacyHuman(2, 10), age: 30, isJuvenile: false, job: JobType.Soldier };
    // A 12-year-old flagged juvenile is graduation's business: clearing the flag here would skip the
    // `size`/`speed`/`educated` work that transition owns, and `tryGraduateHumanChild` would then
    // never fire for them again.
    const graduate = { ...legacyHuman(3, 10), age: 12, isJuvenile: true, job: JobType.Soldier };
    const world = { entities: [adult, graduate], buildings: [barracks([2, 3])], villageLeaderId: null } as WorldState;

    repairJuvenileAssignmentsOnLoad(world);

    expect(adult.job).toBe(JobType.Soldier);
    expect(adult.homeBuildingId).toBe(10);
    expect(graduate.isJuvenile).toBe(true);
    expect(graduate.job).toBe(JobType.Soldier);
    expect(graduate.homeBuildingId).toBe(10);
  });

  it('leaves the sitting leader alone even if the flag disagrees', () => {
    const leader = { ...legacyHuman(4, 10), age: 11, isJuvenile: false, job: JobType.Soldier };
    const world = { entities: [leader], buildings: [barracks([4])], villageLeaderId: 4 } as WorldState;

    repairJuvenileAssignmentsOnLoad(world);

    expect(leader.job).toBe(JobType.Soldier);
    expect(leader.homeBuildingId).toBe(10);
  });
});
