import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  BuildingType,
  HUNTING_SPOT_PREY_OPTIONS,
  MapSize,
  WORKSHOP_RECIPES,
  type Building,
} from '../src/game/gameTypes';
import {
  setBuildingStaffingMode,
  setHuntingSpotPrey,
  setMineMode,
  setWorkshopRecipe,
} from '../src/game/buildingActions';
import {
  setBuildingStaffingMode as extractedSetBuildingStaffingMode,
  setHuntingSpotPrey as extractedSetHuntingSpotPrey,
  setMineMode as extractedSetMineMode,
  setWorkshopRecipe as extractedSetWorkshopRecipe,
} from '../src/game/buildingConfigurationActions';

function building(id: number, type: BuildingType, faction: 'player' | 'rival' = 'player'): Building {
  return {
    id,
    type,
    x: 200,
    y: 200,
    width: 80,
    height: 60,
    completed: true,
    faction,
    occupants: [],
    level: 1,
    health: 100,
    maxHealth: 100,
  } as Building;
}

describe('building configuration action compatibility', () => {
  it('keeps direct configuration APIs forwarded from the legacy building-actions entry point', () => {
    expect(setWorkshopRecipe).toBe(extractedSetWorkshopRecipe);
    expect(setBuildingStaffingMode).toBe(extractedSetBuildingStaffingMode);
    expect(setMineMode).toBe(extractedSetMineMode);
    expect(setHuntingSpotPrey).toBe(extractedSetHuntingSpotPrey);
  });

  it('persists valid player-owned workshop, staffing, mine, and hunting configuration', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const workshop = building(100, BuildingType.Workshop);
    const farm = building(101, BuildingType.Farm);
    const mine = building(102, BuildingType.Mine);
    const huntingSpot = building(103, BuildingType.HuntingSpot);
    state.buildings = [workshop, farm, mine, huntingSpot];

    const recipe = WORKSHOP_RECIPES[0]!.id;
    const prey = HUNTING_SPOT_PREY_OPTIONS[0]!.id;
    const configured = setHuntingSpotPrey(
      setMineMode(
        setBuildingStaffingMode(setWorkshopRecipe(state, workshop.id, recipe), farm.id, 'manual'),
        mine.id,
        'iron',
      ),
      huntingSpot.id,
      prey,
    );

    expect(configured.buildings.find((candidate) => candidate.id === workshop.id)?.workshopRecipeId).toBe(recipe);
    expect(configured.buildings.find((candidate) => candidate.id === farm.id)?.staffingMode).toBe('manual');
    expect(configured.buildings.find((candidate) => candidate.id === mine.id)?.mineMode).toBe('iron');
    expect(configured.buildings.find((candidate) => candidate.id === huntingSpot.id)?.huntingSpotPrey).toBe(prey);
  });

  it('rejects invalid mode values and rival mine configuration without mutating authoritative state', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const playerMine = building(100, BuildingType.Mine);
    const rivalMine = building(101, BuildingType.Mine, 'rival');
    state.buildings = [playerMine, rivalMine];

    expect(setMineMode(state, playerMine.id, 'gold' as never)).toBe(state);
    expect(setMineMode(state, rivalMine.id, 'iron')).toBe(state);
    expect(state.buildings.map((candidate) => candidate.mineMode)).toEqual([undefined, undefined]);
  });
});
