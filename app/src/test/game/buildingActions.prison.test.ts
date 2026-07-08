import { describe, expect, it } from 'vitest';
import { demolishBuilding, removeWorkerFromBuilding } from '@/game/buildingActions';
import { initGame } from '@/game/gameEngine';
import { BuildingType, EntityType, JobType } from '@/game/gameTypes';
import { createBuilding, createEntity } from '@/game/worldGen';

describe('demolishBuilding', () => {
  it('clears prisoner status when the prison is demolished', () => {
    const state = initGame();
    const prison = createBuilding(BuildingType.Prison, 200, 200, 90, 0);
    prison.completed = true;
    prison.occupants = [42];
    state.buildings.push(prison);

    const prisoner = createEntity(EntityType.Human, prison.x, prison.y, 42, 200);
    prisoner.prisonBuildingId = prison.id;
    prisoner.prisonerUntilTick = state.tick + 500;
    state.entities.push(prisoner);

    const after = demolishBuilding(state, prison.id);
    const updated = after.entities.find((e) => e.id === 42);
    expect(updated?.prisonBuildingId).toBeUndefined();
    expect(updated?.prisonerUntilTick).toBeUndefined();
    expect(after.buildings.some((b) => b.id === prison.id)).toBe(false);
  });
});

describe('removeWorkerFromBuilding', () => {
  it('clears workplace fields when removing from an incomplete building', () => {
    const state = initGame();
    const site = createBuilding(BuildingType.Farm, 200, 200, 50, 0);
    site.completed = false;
    site.constructionProgress = 40;
    site.occupants = [7];
    state.buildings.push(site);

    const builder = createEntity(EntityType.Human, site.x, site.y, 7, 200);
    builder.homeBuildingId = site.id;
    builder.job = JobType.Farmer;
    builder.occupation = 'farmer';
    state.entities.push(builder);

    const after = removeWorkerFromBuilding(state, site.id, 7);
    const human = after.entities.find((e) => e.id === 7);
    expect(human?.homeBuildingId).toBeUndefined();
    expect(human?.job).not.toBe(JobType.Farmer);
    expect(human?.occupation).not.toBe('farmer');
  });
});