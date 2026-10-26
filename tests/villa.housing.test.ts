import { describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS, BuildingType, createInitialResearchNodes, LEVEL_BENEFIT_BUILDING_TYPES } from '../src/game/gameTypes';
import { BUILDING_CATEGORIES } from '../src/game/buildCatalog';
import { getResidenceCapacity, getResidenceUpgradeSlotGain, isResidenceBuildingType } from '../src/game/residencyOccupancy';
import { getBuildingUpgradeEligibility } from '../src/game/buildingMaintenanceActions';
import { isBuildingTechUnlocked } from '../src/game/placementUtils';
import { initGame } from '../src/game/worldGen';
import { finishedBuilding } from '../src/test/factories';

describe('Villa housing and upgrade regression', () => {
  it('appears in Housing and uses the villa sprite and Better Housing prerequisite', () => {
    const config = BUILDING_CONFIGS[BuildingType.Villa];
    expect(config.sprite).toBe('/sprites/villa.png');
    expect(config.maxOccupants).toBe(14);
    expect(config.unlockRequirement).toBe('architecture_3');
    expect(BUILDING_CATEGORIES.find((category) => category.id === 'housing')?.types).toContain(BuildingType.Villa);
    expect(isResidenceBuildingType(BuildingType.Villa)).toBe(true);
  });

  it('keeps a separate Better Housing technology after Fine Construction', () => {
    const nodes = createInitialResearchNodes();
    const betterHousing = nodes.find((node) => node.id === 'architecture_3');
    expect(betterHousing?.name).toBe('Better Housing');
    expect(betterHousing?.prerequisites).toContain('architecture_1');
    expect(isBuildingTechUnlocked('architecture_3', [], nodes)).toBe(false);
    expect(isBuildingTechUnlocked('architecture_3', ['architecture_3'], nodes)).toBe(false);
    const researched = nodes.map((node) => node.id === 'architecture_3' ? { ...node, researched: true } : node);
    expect(isBuildingTechUnlocked('architecture_3', ['architecture_3'], researched)).toBe(true);
  });

  it('adds two beds per upgrade, through level 3 only', () => {
    expect(LEVEL_BENEFIT_BUILDING_TYPES.has(BuildingType.Villa)).toBe(true);
    expect(getResidenceUpgradeSlotGain(BuildingType.Villa)).toBe(2);
    for (const [level, expected] of [[1, 14], [2, 16], [3, 18]] as const) {
      const villa = finishedBuilding(501, BuildingType.Villa, { level });
      expect(getResidenceCapacity(villa)).toBe(expected);
    }
    const state = initGame();
    state.buildings = [finishedBuilding(501, BuildingType.Villa, { level: 3 })];
    expect(getBuildingUpgradeEligibility(state, 501)).toMatchObject({ ok: false, blockReason: 'Already level 3' });
  });

  it('does not change the housing capacity of existing House and Mansion types', () => {
    expect(getResidenceCapacity(finishedBuilding(1, BuildingType.House, { level: 1 }))).toBe(BUILDING_CONFIGS[BuildingType.House].maxOccupants);
    expect(getResidenceCapacity(finishedBuilding(1, BuildingType.House, { level: 3 }))).toBe(BUILDING_CONFIGS[BuildingType.House].maxOccupants + 4);
    expect(getResidenceCapacity(finishedBuilding(2, BuildingType.Mansion, { level: 2 }))).toBe(BUILDING_CONFIGS[BuildingType.Mansion].maxOccupants + 2);
  });

  it('keeps the fixed beds of a manor holding a level no upgrade can grant it any more', () => {
    const legacyManor = finishedBuilding(7, BuildingType.LeaderHouse, { level: 3 });

    expect(getResidenceCapacity(legacyManor)).toBe(20);
  });
});
