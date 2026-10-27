/**
 * Terrain biome definitions for the Teraforge generator, ported from
 * `src/lib/terrain.ts` (including the L3 decor tables).
 *
 * `isWater` and `buildable` are the single source of truth for the L0 path grid
 * and the L1 build grid. `density` + `decor` drive the L3 decor layer. Trees
 * (oak/pine/palm/fruit_tree/dead_tree) are listed here for parity with Teraforge
 * but are **not** baked as decor — Wilderfolk spawns trees as chop-able entities.
 */

export type BiomeId =
  | 'deep_water'
  | 'water'
  | 'river'
  | 'sand'
  | 'desert'
  | 'dirt'
  | 'grass'
  | 'meadow'
  | 'forest'
  | 'dense_forest'
  | 'taiga'
  | 'swamp'
  | 'tundra'
  | 'rock'
  | 'snow';

export const BIOME_IDS: BiomeId[] = [
  'deep_water', 'water', 'river', 'sand', 'desert', 'dirt',
  'grass', 'meadow', 'forest', 'dense_forest', 'taiga',
  'swamp', 'tundra', 'rock', 'snow',
];

export const B: Record<BiomeId, number> = {} as Record<BiomeId, number>;
BIOME_IDS.forEach((id, i) => { (B as Record<string, number>)[id] = i; });

export type SpriteType =
  | 'oak' | 'pine' | 'bush' | 'flower'
  | 'rock_small' | 'rock_big' | 'stump' | 'reed'
  | 'cactus' | 'palm' | 'dead_tree' | 'mushroom'
  | 'log' | 'tallgrass' | 'fern' | 'berries'
  | 'lilypad' | 'driftwood' | 'bones' | 'cattail'
  | 'fruit_tree' | 'scrub' | 'dirt_patch';

/** Decor types that are trees and are left to Wilderfolk's entity system. */
export const TREE_SPRITE_TYPES = new Set<SpriteType>(['oak', 'pine', 'palm', 'dead_tree', 'fruit_tree']);

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** Texture tile key (grass/dirt/sand/rock/snow/water) for the per-pixel renderer. */
  tile: string;
  /** Fallback fill colour when no tile texture is available. */
  color: string;
  color2: string;
  priority: number;
  isWater: boolean;
  buildable: boolean;
  /** Elevation tint darkness (0=none, 1=full). */
  elevTint: number;
  /** Expected decorations per 64×64 cell (L3 decor density). */
  density: number;
  /** [spriteType, weight][] — the L3 decor table. */
  decor: [SpriteType, number][];
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  deep_water: {
    id: 'deep_water', name: 'Deep Water', tile: 'water', color: '#12466e', color2: '#0e3a5c',
    priority: 0, isWater: true, buildable: false, elevTint: 0, density: 0.06,
    decor: [['lilypad', 1]],
  },
  water: {
    id: 'water', name: 'Water', tile: 'water', color: '#2a7fb4', color2: '#3d95c6',
    priority: 1, isWater: true, buildable: false, elevTint: 0, density: 0.15,
    decor: [['lilypad', 4], ['cattail', 2]],
  },
  river: {
    id: 'river', name: 'River', tile: 'water', color: '#3391c6', color2: '#48a5d6',
    priority: 2, isWater: true, buildable: false, elevTint: 0, density: 0.08,
    decor: [['lilypad', 2]],
  },
  sand: {
    id: 'sand', name: 'Beach', tile: 'sand', color: '#e4d6a7', color2: '#d6c48c',
    priority: 5, isWater: false, buildable: true, elevTint: 0.15, density: 0.5,
    decor: [['rock_small', 4], ['tallgrass', 3], ['driftwood', 2], ['palm', 1], ['flower', 1]],
  },
  desert: {
    id: 'desert', name: 'Desert', tile: 'sand', color: '#dfc487', color2: '#cdb072',
    priority: 5, isWater: false, buildable: true, elevTint: 0.2, density: 0.4,
    decor: [['cactus', 4], ['rock_small', 5], ['rock_big', 2], ['bones', 1], ['tallgrass', 1]],
  },
  dirt: {
    id: 'dirt', name: 'Dirt', tile: 'dirt', color: '#a98c62', color2: '#997c54',
    priority: 4, isWater: false, buildable: true, elevTint: 0.25, density: 0.8,
    decor: [['rock_small', 4], ['stump', 2], ['flower', 2], ['bush', 2], ['tallgrass', 3], ['log', 1], ['scrub', 2], ['dirt_patch', 2]],
  },
  grass: {
    id: 'grass', name: 'Grassland', tile: 'grass', color: '#7fae4f', color2: '#6a9e40',
    priority: 7, isWater: false, buildable: true, elevTint: 0.2, density: 2.8,
    decor: [['flower', 8], ['tallgrass', 7], ['bush', 5], ['oak', 3], ['fruit_tree', 2], ['rock_small', 2], ['berries', 2], ['fern', 2], ['dirt_patch', 1]],
  },
  meadow: {
    id: 'meadow', name: 'Meadow', tile: 'grass', color: '#8dbb56', color2: '#9dc964',
    priority: 7, isWater: false, buildable: true, elevTint: 0.15, density: 3.2,
    decor: [['flower', 12], ['tallgrass', 8], ['bush', 5], ['fruit_tree', 3], ['oak', 2], ['mushroom', 3], ['fern', 3], ['berries', 3], ['dirt_patch', 1]],
  },
  forest: {
    id: 'forest', name: 'Forest', tile: 'grass', color: '#4d8b3e', color2: '#437d36',
    priority: 8, isWater: false, buildable: true, elevTint: 0.3, density: 9.0,
    decor: [['oak', 8], ['pine', 6], ['fruit_tree', 2], ['bush', 5], ['fern', 5], ['flower', 2], ['stump', 2], ['mushroom', 2], ['log', 1], ['berries', 1], ['dirt_patch', 1]],
  },
  dense_forest: {
    id: 'dense_forest', name: 'Dense Forest', tile: 'grass', color: '#3a7032', color2: '#2f6228',
    priority: 8, isWater: false, buildable: true, elevTint: 0.35, density: 13.0,
    decor: [['oak', 6], ['pine', 12], ['bush', 4], ['fern', 6], ['stump', 2], ['mushroom', 2], ['log', 2], ['dirt_patch', 1]],
  },
  taiga: {
    id: 'taiga', name: 'Taiga', tile: 'grass', color: '#3f7a5e', color2: '#376c53',
    priority: 8, isWater: false, buildable: true, elevTint: 0.3, density: 10.0,
    decor: [['pine', 14], ['bush', 3], ['rock_small', 3], ['dead_tree', 3], ['scrub', 3], ['fern', 3], ['mushroom', 2], ['log', 1]],
  },
  swamp: {
    id: 'swamp', name: 'Swamp', tile: 'dirt', color: '#5b7a4a', color2: '#516d42',
    priority: 6, isWater: false, buildable: false, elevTint: 0.25, density: 3.0,
    decor: [['reed', 10], ['cattail', 6], ['dead_tree', 3], ['bush', 3], ['mushroom', 4], ['fern', 4], ['lilypad', 2], ['log', 1]],
  },
  tundra: {
    id: 'tundra', name: 'Tundra', tile: 'snow', color: '#a8b6a2', color2: '#9caa96',
    priority: 7, isWater: false, buildable: true, elevTint: 0.15, density: 1.2,
    decor: [['rock_small', 5], ['rock_big', 2], ['scrub', 4], ['dead_tree', 3], ['bush', 2], ['pine', 1], ['bones', 1], ['tallgrass', 2]],
  },
  rock: {
    id: 'rock', name: 'Mountain', tile: 'rock', color: '#8d8b86', color2: '#7d7b76',
    priority: 9, isWater: false, buildable: false, elevTint: 0.4, density: 1.8,
    decor: [['rock_big', 6], ['rock_small', 8], ['scrub', 4], ['dead_tree', 2], ['bones', 2], ['pine', 1]],
  },
  snow: {
    id: 'snow', name: 'Snow', tile: 'snow', color: '#e9eff3', color2: '#dbe4ea',
    priority: 10, isWater: false, buildable: false, elevTint: 0.1, density: 0.6,
    decor: [['rock_big', 4], ['rock_small', 6], ['scrub', 2], ['pine', 1]],
  },
};

export const BIOME_BY_IDX: BiomeDef[] = BIOME_IDS.map(id => BIOMES[id]);
