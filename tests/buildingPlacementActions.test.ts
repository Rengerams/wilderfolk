import { describe, expect, it } from 'vitest';
import {
  buildStripPreview,
  canPlaceBuilding,
  getPlaceBuildingFailureReason,
  placeStripChain,
  startBuilding,
} from '../src/game/buildingActions';
import {
  buildStripPreview as extractedBuildStripPreview,
  canPlaceBuilding as extractedCanPlaceBuilding,
  getPlaceBuildingFailureReason as extractedGetPlaceBuildingFailureReason,
  placeStripChain as extractedPlaceStripChain,
  startBuilding as extractedStartBuilding,
} from '../src/game/buildingPlacementActions';

describe('building placement action compatibility exports', () => {
  it('keeps all public placement commands connected to the extracted implementation', () => {
    expect(canPlaceBuilding).toBe(extractedCanPlaceBuilding);
    expect(getPlaceBuildingFailureReason).toBe(extractedGetPlaceBuildingFailureReason);
    expect(startBuilding).toBe(extractedStartBuilding);
    expect(buildStripPreview).toBe(extractedBuildStripPreview);
    expect(placeStripChain).toBe(extractedPlaceStripChain);
  });
});
