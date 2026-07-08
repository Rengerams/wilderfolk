import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import {
  finalizeHumanDeath,
  removeHumanFromBuildingOccupants,
  syncResidenceOccupants,
} from '@/game/dayCycle';
import { BuildingType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';
import { makeCompletedHouse } from '@/test/housingFixtures';

describe('werewolf-form settler building occupants', () => {
  it('removeHumanFromBuildingOccupants clears cursed werewolves from workplaces', () => {
    const state = initGame();
    const werewolf = createEntity(EntityType.Werewolf, 100, 100, 1, 250);
    werewolf.moonHowlerCursed = true;
    const barracks = {
      id: 5,
      type: BuildingType.Barracks,
      x: 100,
      y: 100,
      width: 40,
      height: 40,
      occupants: [werewolf.id],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    };
    state.buildings.push(barracks);

    removeHumanFromBuildingOccupants(werewolf, state.buildings);

    expect(barracks.occupants).toEqual([]);
  });

  it('syncResidenceOccupants includes cursed werewolf-form settlers', () => {
    const state = initGame();
    state.entities = [];
    state.buildings = [];
    makeCompletedHouse(state, 0, 100);

    const werewolf = createEntity(EntityType.Werewolf, 100, 100, 1, 250);
    werewolf.moonHowlerCursed = true;
    werewolf.residenceBuildingId = 0;
    state.entities.push(werewolf);

    syncResidenceOccupants(state.entities, state.buildings);

    expect(state.buildings[0].occupants).toEqual([werewolf.id]);
  });

  it('finalizeHumanDeath clears werewolf-form settlers from residences', () => {
    const state = initGame();
    state.entities = [];
    state.buildings = [];
    makeCompletedHouse(state, 0, 100);

    const werewolf = createEntity(EntityType.Werewolf, 100, 100, 1, 250);
    werewolf.moonHowlerCursed = true;
    werewolf.residenceBuildingId = 0;
    state.buildings[0].occupants.push(werewolf.id);
    state.entities.push(werewolf);

    finalizeHumanDeath(werewolf, state.buildings);

    expect(state.buildings[0].occupants).toEqual([]);
    expect(werewolf.residenceBuildingId).toBeUndefined();
  });
});