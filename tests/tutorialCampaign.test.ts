/**
 * Tutorial campaign regression tests — the first-spring guide steps advance
 * exactly when their world-state conditions are met.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import { TUTORIAL_CAMPAIGN, currentCampaignStep } from '../src/game/tutorialCampaign';
import type { WorldState } from '../src/game/gameTypes';

function makeWorld(): WorldState {
  const w = initGame({ villageName: 'Tut', size: 'medium' });
  return w;
}

function addBuilding(w: WorldState, type: BuildingType, completed = true): WorldState {
  const cfg = BUILDING_CONFIGS[type];
  w.buildings.push({
    id: w.nextBuildingId++,
    type,
    x: 100,
    y: 100,
    width: cfg.width,
    height: cfg.height,
    occupants: [],
    level: 1,
    constructionProgress: completed ? 100 : 0,
    completed,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  });
  return w;
}

const stepId = (world: WorldState) => currentCampaignStep(world)?.id ?? null;

describe('tutorial campaign', () => {
  it('starts at build_house on a fresh settlement', () => {
    expect(stepId(makeWorld())).toBe('build_house');
  });


  it('an unfinished house does not satisfy the build-a-house step', () => {
    const w = addBuilding(makeWorld(), BuildingType.House, false);
    expect(stepId(w)).toBe('build_house');
  });

  it('a completed house advances to build_farm', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    expect(stepId(w)).toBe('build_farm');
  });

  it('a farm after a house advances to assign_workers', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    expect(stepId(w)).toBe('assign_workers');
  });

  it('staffing any building advances to wood_or_meat', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    const farm = w.buildings.find((b) => b.type === BuildingType.Farm)!;
    farm.occupants = [1, 2];
    expect(stepId(w)).toBe('wood_or_meat');
  });

  it('a hunting spot or lumber mill advances to store_gold', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    w.buildings.find((b) => b.type === BuildingType.Farm)!.occupants = [1];
    addBuilding(w, BuildingType.HuntingSpot);
    expect(stepId(w)).toBe('store_gold');
  });

  it('a store advances to winter_watch', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    w.buildings.find((b) => b.type === BuildingType.Farm)!.occupants = [1];
    addBuilding(w, BuildingType.HuntingSpot);
    addBuilding(w, BuildingType.Store);
    expect(stepId(w)).toBe('winter_watch');
  });

  it('winter onset (dayInYear >= 270) advances to year_two', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    w.buildings.find((b) => b.type === BuildingType.Farm)!.occupants = [1];
    addBuilding(w, BuildingType.HuntingSpot);
    addBuilding(w, BuildingType.Store);
    w.dayInYear = 269;
    expect(stepId(w)).toBe('winter_watch');
    w.dayInYear = 270;
    expect(stepId(w)).toBe('year_two');
  });

  it('reaching year 1 completes the campaign (null step)', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    w.buildings.find((b) => b.type === BuildingType.Farm)!.occupants = [1];
    addBuilding(w, BuildingType.HuntingSpot);
    addBuilding(w, BuildingType.Store);
    w.dayInYear = 300;
    w.year = 1;
    expect(currentCampaignStep(w)).toBeNull();
  });

  it('does not regress at the start of a later year', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    w.buildings.find((b) => b.type === BuildingType.Farm)!.occupants = [1];
    addBuilding(w, BuildingType.HuntingSpot);
    addBuilding(w, BuildingType.Store);
    w.year = 3;
    w.dayInYear = 0;
    expect(currentCampaignStep(w)).toBeNull();
  });

  it('steps are a coherent ordered list with unique ids', () => {
    const ids = TUTORIAL_CAMPAIGN.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('M33 — the first-spring guide finishes instead of regressing every year', () => {
  function guidedWorld(): WorldState {
    const state = initGame({ size: 'medium', seed: 20240913 });
    state.buildings = [];
    for (const type of [BuildingType.House, BuildingType.Farm, BuildingType.HuntingSpot, BuildingType.Store]) {
      addBuilding(state, type);
    }
    state.buildings[1].occupants = [1];
    return state;
  }

  it('stays finished at the start of year 2', () => {
    const state = guidedWorld();
    state.year = 2;
    state.dayInYear = 0;

    expect(currentCampaignStep(state)).toBeNull();
  });

  it('stays finished on later years too', () => {
    const state = guidedWorld();
    state.year = 4;
    state.dayInYear = 10;

    expect(currentCampaignStep(state)).toBeNull();
  });

  it('still completes the winter step during the first winter', () => {
    const state = guidedWorld();
    state.year = 0;
    state.dayInYear = 269;
    expect(currentCampaignStep(state)?.id).toBe('winter_watch');
    state.dayInYear = 270;
    expect(currentCampaignStep(state)?.id).toBe('year_two');
  });
});
