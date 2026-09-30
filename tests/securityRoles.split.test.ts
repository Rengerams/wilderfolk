import { describe, expect, it } from 'vitest';
import {
  BuildingType,
  BUILDING_JOB_TYPES,
  EntityType,
  JobType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { assignWorkerTransition, syncJobBuildingOccupants } from '../src/game/workforce';
import { getBarracksGuardCount, getBarracksGuardBonus } from '../src/game/defenseStructures';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
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
    job: JobType.Settler,
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, occupants: number[] = []): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants,
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  } as Building;
}

describe('split security roles', () => {
  it('maps Barracks to Soldier and Prison to PrisonGuard', () => {
    expect(BUILDING_JOB_TYPES[BuildingType.Barracks]).toBe(JobType.Soldier);
    expect(BUILDING_JOB_TYPES[BuildingType.Prison]).toBe(JobType.PrisonGuard);
  });

  it('assigns distinct jobs through the authoritative workforce transition', () => {
    const soldier = human(1);
    const prisonGuard = human(2);
    const barracks = building(10, BuildingType.Barracks);
    const prison = building(11, BuildingType.Prison);

    expect(assignWorkerTransition(soldier, barracks)).toBe(true);
    expect(assignWorkerTransition(prisonGuard, prison)).toBe(true);
    expect(soldier.job).toBe(JobType.Soldier);
    expect(prisonGuard.job).toBe(JobType.PrisonGuard);
    expect(soldier.homeBuildingId).toBe(barracks.id);
    expect(prisonGuard.homeBuildingId).toBe(prison.id);
  });

  it('counts Soldiers for Barracks defense but excludes PrisonGuards', () => {
    const soldier = human(1, { job: JobType.Soldier, homeBuildingId: 10 });
    const prisonGuard = human(2, { job: JobType.PrisonGuard, homeBuildingId: 11 });
    const barracks = building(10, BuildingType.Barracks, [1]);
    const prison = building(11, BuildingType.Prison, [2]);
    const state = { entities: [soldier, prisonGuard], buildings: [barracks, prison] } as WorldState;

    expect(getBarracksGuardCount(state, state.buildings)).toBe(1);
    expect(getBarracksGuardBonus(state, state.buildings)).toBe(14);
  });

  it('keeps PrisonGuard and prisoner entries synchronized without treating the prisoner as staff', () => {
    const prisonGuard = human(1, { job: JobType.PrisonGuard, homeBuildingId: 10 });
    const prisoner = human(2, {
      job: JobType.Settler,
      prisonBuildingId: 10,
      prisonerUntilTick: 100,
      prisonSentenceCrime: 'scandal',
    });
    const prison = building(10, BuildingType.Prison, []);
    syncJobBuildingOccupants([prisonGuard, prisoner], [prison]);

    expect(prison.occupants).toEqual([1, 2]);
    expect(prisonGuard.job).toBe(JobType.PrisonGuard);
    expect(prisoner.job).toBe(JobType.Settler);
    expect(getBarracksGuardCount(
      { entities: [prisonGuard, prisoner], buildings: [prison] } as WorldState,
      [prison],
    )).toBe(0);
  });
});
