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
  const w = initGame({ villageName: 'Tut', size: 'small' });
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
    faction: 'player',
  });
  return w;
}

const stepId = (world: WorldState) => currentCampaignStep(world)?.id ?? null;

describe('tutorial campaign', () => {
  it('starts at build_house on a fresh settlement', () => {
    expect(stepId(makeWorld())).toBe('build_house');
  });

  it('a rival house does not satisfy the build-a-house step', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    w.buildings[w.buildings.length - 1].faction = 'rival';
    expect(stepId(w)).toBe('build_house');
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

  it('winter (dayInYear >= 250) advances to year_two', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    w.buildings.find((b) => b.type === BuildingType.Farm)!.occupants = [1];
    addBuilding(w, BuildingType.HuntingSpot);
    addBuilding(w, BuildingType.Store);
    w.dayInYear = 260;
    expect(stepId(w)).toBe('year_two');
  });

  it('reaching year 2 completes the campaign (null step)', () => {
    const w = addBuilding(makeWorld(), BuildingType.House);
    addBuilding(w, BuildingType.Farm);
    w.buildings.find((b) => b.type === BuildingType.Farm)!.occupants = [1];
    addBuilding(w, BuildingType.HuntingSpot);
    addBuilding(w, BuildingType.Store);
    w.dayInYear = 260;
    w.year = 2;
    expect(currentCampaignStep(w)).toBeNull();
  });

  it('steps are a coherent ordered list with unique ids', () => {
    const ids = TUTORIAL_CAMPAIGN.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
