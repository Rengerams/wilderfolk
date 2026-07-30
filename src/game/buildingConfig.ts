import { BUILDING_CONFIGS } from './gameEngine';
import type { BuildingType } from './gameEngine';
import type { BuildingConfig } from './gameTypes';

export const FALLBACK_BUILDING_CONFIG: BuildingConfig = {
  width: 32,
  height: 32,
  cost: { wood: 0, stone: 0, gold: 0 },
  buildTime: 1,
  maxOccupants: 0,
  emoji: '❓',
  label: 'Unknown',
  description: '',
  sprite: '',
  backgroundColor: '#44403c',
  padShape: 'rect',
};

export function getBuildingConfig(type: BuildingType): BuildingConfig {
  return BUILDING_CONFIGS[type] ?? FALLBACK_BUILDING_CONFIG;
}
