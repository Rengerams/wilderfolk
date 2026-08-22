import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { migrateLegacySecurityRoles } from '../src/game/saveLoad';

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
  } as Entity;
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
  } as Building;
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
