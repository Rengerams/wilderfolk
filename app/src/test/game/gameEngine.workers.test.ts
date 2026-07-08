import { describe, expect, it } from 'vitest';
import { assignMissingWorkers } from '@/game/gameEngine';
import { BuildingType, BUILDING_CONFIGS } from '@/game/gameTypes';
import { freshState, makeAdultSettler, makeIncompleteSite } from '@/test/fixtures/gameFixtures';

describe('assignMissingWorkers', () => {
  it('does not staff a job building while the settler is on a construction crew', () => {
    const state = freshState();
    state.entities = [];
    const settler = makeAdultSettler(1);
    state.entities.push(settler);

    const site = makeIncompleteSite(state, 1, BuildingType.House);
    site.occupants.push(settler.id);

    const farmCfg = BUILDING_CONFIGS[BuildingType.Farm];
    state.buildings.push({
      id: 2,
      type: BuildingType.Farm,
      x: 400,
      y: 200,
      width: farmCfg.width,
      height: farmCfg.height,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: undefined,
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    assignMissingWorkers(state.entities, state.buildings);

    expect(settler.homeBuildingId).toBeUndefined();
    expect(site.occupants).toContain(settler.id);
  });

  it('staffs a completed job building when the settler is idle', () => {
    const state = freshState();
    state.entities = [makeAdultSettler(2)];
    const farmCfg = BUILDING_CONFIGS[BuildingType.Farm];
    state.buildings.push({
      id: 3,
      type: BuildingType.Farm,
      x: 400,
      y: 200,
      width: farmCfg.width,
      height: farmCfg.height,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: undefined,
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    assignMissingWorkers(state.entities, state.buildings);

    expect(state.entities[0].homeBuildingId).toBe(3);
  });
});