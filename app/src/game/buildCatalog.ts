import { BuildingType } from './gameTypes';

export interface BuildingCategoryDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  hint?: string;
  types: BuildingType[];
}

/** Canonical build catalog — one section per building category. */
export const BUILDING_CATEGORIES: BuildingCategoryDef[] = [
  {
    id: 'housing',
    label: 'Housing',
    icon: '🏠',
    color: 'bg-amber-500',
    types: [BuildingType.House, BuildingType.Mansion],
  },
  {
    id: 'food',
    label: 'Food',
    icon: '🌾',
    color: 'bg-green-500',
    types: [BuildingType.Farm, BuildingType.Greenhouse, BuildingType.Barn, BuildingType.Silo, BuildingType.Mill],
  },
  {
    id: 'resources',
    label: 'Resources',
    icon: '🪵',
    color: 'bg-stone-500',
    types: [BuildingType.LumberMill, BuildingType.Quarry, BuildingType.Mine],
  },
  {
    id: 'industry',
    label: 'Industry',
    icon: '🔨',
    color: 'bg-orange-500',
    types: [BuildingType.Blacksmith, BuildingType.Workshop, BuildingType.Store, BuildingType.Market],
  },
  {
    id: 'community',
    label: 'Community',
    icon: '🏛️',
    color: 'bg-amber-600',
    types: [
      BuildingType.TownHall,
      BuildingType.Church,
      BuildingType.School,
      BuildingType.Hospital,
      BuildingType.Prison,
      BuildingType.Well,
      BuildingType.TamingPost,
    ],
  },
  {
    id: 'defense',
    label: 'Defense',
    icon: '🛡️',
    color: 'bg-slate-500',
    hint: 'Walls boost barricade · R rotates walls & gates · Barracks adds militia',
    types: [
      BuildingType.Wall,
      BuildingType.WallCorner,
      BuildingType.WallGate,
      BuildingType.Watchtower,
      BuildingType.Barracks,
    ],
  },
  {
    id: 'infra',
    label: 'Infra',
    icon: '🛤️',
    color: 'bg-gray-500',
    hint: '1.5× walk speed · +15% adjacency · press R to rotate',
    types: [BuildingType.Road],
  },
];

export function categoryForBuildingType(type: BuildingType): string {
  return BUILDING_CATEGORIES.find((c) => c.types.includes(type))?.id ?? BUILDING_CATEGORIES[0].id;
}

const PRODUCTION_CATEGORY_IDS = new Set(['food', 'resources', 'industry']);

/** Food, resource, and industry buildings get terrain/adjacency placement bonuses. */
export function isProductionBuildingType(type: BuildingType): boolean {
  return PRODUCTION_CATEGORY_IDS.has(categoryForBuildingType(type));
}

/** Canvas pad border dash per build-catalog category id. */
export function categoryBorderDashForType(type: BuildingType): number[] {
  switch (categoryForBuildingType(type)) {
    case 'housing':
      return [];
    case 'food':
      return [4, 3];
    case 'resources':
      return [2, 2];
    case 'industry':
      return [6, 2, 2, 2];
    case 'community':
      return [3, 3];
    case 'infra':
      return [1, 2];
    case 'defense':
      return [5, 3];
    default:
      return [];
  }
}

export function formatBuildingCost(wood: number, stone: number, gold: number): string {
  const parts: string[] = [];
  if (wood > 0) parts.push(`${wood}w`);
  if (stone > 0) parts.push(`${stone}s`);
  if (gold > 0) parts.push(`${gold}g`);
  return parts.join(' · ') || 'Free';
}