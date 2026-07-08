import { TerrainType, type TerrainTile, type WorldMap, type MapPreset, type MapSize, MAP_SIZE_DIMENSIONS } from './gameTypes';

// Simple seeded random number generator
function seededRandom(seed: number) {
  let s = seed;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Simple noise function - multiple octaves of sine waves
function noise(x: number, y: number, seed: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < 4; i++) {
    const nx = x * frequency * 0.01;
    const ny = y * frequency * 0.01;
    value += amplitude * (
      Math.sin(nx * 12.9898 + ny * 78.233 + seed * 43758.5453) *
      Math.cos(nx * 43.2321 + ny * 17.6532 + seed * 123.4567) * 0.5 + 0.5
    );
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}

// Moisture noise - different seed for independent variation
function moistureNoise(x: number, y: number, seed: number): number {
  return noise(x, y, seed + 1000);
}

// Temperature noise
function tempNoise(x: number, y: number, seed: number): number {
  return noise(x, y, seed + 2000);
}

interface PresetModifiers {
  elevationBias: number;
  elevationScale: number;
  moistureBias: number;
  moistureScale: number;
  temperatureBias: number;
  waterLevel: number;
  forestThreshold: number;
}

const PRESET_MODIFIERS: Record<MapPreset, PresetModifiers> = {
  verdant: { elevationBias: -0.02, elevationScale: 0.95, moistureBias: 0.18, moistureScale: 1.25, temperatureBias: 0.02, waterLevel: 0.18, forestThreshold: 0.35, },
  mountainous: { elevationBias: 0.22, elevationScale: 1.35, moistureBias: -0.05, moistureScale: 0.85, temperatureBias: -0.12, waterLevel: 0.20, forestThreshold: 0.48, },
  coastal: { elevationBias: -0.12, elevationScale: 0.85, moistureBias: 0.22, moistureScale: 1.2, temperatureBias: 0.08, waterLevel: 0.32, forestThreshold: 0.42, },
  arid: { elevationBias: 0.02, elevationScale: 1.05, moistureBias: -0.38, moistureScale: 0.55, temperatureBias: 0.22, waterLevel: 0.12, forestThreshold: 0.70, },
  harsh: { elevationBias: 0.18, elevationScale: 1.25, moistureBias: -0.22, moistureScale: 0.70, temperatureBias: -0.22, waterLevel: 0.16, forestThreshold: 0.55, },
};

function getTerrainType(elevation: number, moisture: number, temperature: number, nearRiver: boolean, nearMountain: boolean, preset: MapPreset): TerrainType {
  const pm = PRESET_MODIFIERS[preset];
  const waterLevel = pm.waterLevel;

  if (nearRiver) {
    if (elevation < waterLevel * 0.75) return TerrainType.River;
    if (elevation < waterLevel + 0.05) return TerrainType.RiverBank;
  }

  if (elevation < waterLevel * 0.6) return TerrainType.DeepWater;
  if (elevation < waterLevel) return TerrainType.ShallowWater;
  if (elevation < waterLevel + 0.08) return TerrainType.Beach;

  if (nearMountain && elevation > 0.7) return TerrainType.Rocky;

  if (elevation > 0.85) {
    if (temperature < 0.3) return TerrainType.Snow;
    return TerrainType.Mountains;
  }
  if (elevation > 0.6) return TerrainType.Hills;

  if (moisture > pm.forestThreshold + 0.15) return TerrainType.DarkForest;
  if (moisture > pm.forestThreshold) return TerrainType.Forest;
  if (temperature > 0.7 && moisture < 0.25) return TerrainType.Grassland; // inland savanna / dry grassland

  return TerrainType.Grassland;
}

const UNBUILDABLE_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

/** True when every 10px tile under the footprint is buildable. */
export function isFootprintBuildable(
  tiles: TerrainTile[][],
  tileW: number,
  tileH: number,
  footprintW: number,
  footprintH: number,
  worldX: number,
  worldY: number,
): boolean {
  const left = worldX - footprintW / 2;
  const right = worldX + footprintW / 2;
  const top = worldY - footprintH / 2;
  const bottom = worldY + footprintH / 2;
  const startTx = Math.floor(left / 10);
  const endTx = Math.floor(right / 10);
  const startTy = Math.floor(top / 10);
  const endTy = Math.floor(bottom / 10);

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      if (tx < 0 || ty < 0 || tx >= tileW || ty >= tileH) return false;
      const tile = tiles[ty]?.[tx];
      if (!tile || UNBUILDABLE_TERRAIN.has(tile.type)) return false;
    }
  }
  return true;
}

/** Carve dry buildable land for the founding camp (coastal maps need this). */
export function ensureCampClearing(
  tiles: TerrainTile[][],
  tileW: number,
  tileH: number,
  worldX: number,
  worldY: number,
  radiusTiles: number,
  preset: MapPreset,
): void {
  const cx = Math.floor(worldX / 10);
  const cy = Math.floor(worldY / 10);
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const dist = Math.hypot(tx - cx, ty - cy);
      if (dist > radiusTiles) continue;
      const tile = tiles[ty][tx];
      const inner = dist < radiusTiles * 0.55;
      tile.type = inner
        ? TerrainType.Grassland
        : preset === 'coastal'
          ? TerrainType.Beach
          : TerrainType.Grassland;
      tile.elevation = inner ? 48 : 42;
      tile.moisture = inner ? 45 : preset === 'coastal' ? 70 : 50;
    }
  }
}

export function findCampSite(
  tiles: TerrainTile[][],
  tileW: number,
  tileH: number,
  mapPixelW: number,
  mapPixelH: number,
  footprintW: number,
  footprintH: number,
  preferredX: number,
  preferredY: number,
): { x: number; y: number } {
  if (isFootprintBuildable(tiles, tileW, tileH, footprintW, footprintH, preferredX, preferredY)) {
    return { x: preferredX, y: preferredY };
  }
  const step = 10;
  for (let ring = 1; ring <= 40; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const x = preferredX + dx * step;
        const y = preferredY + dy * step;
        if (x < 40 || y < 40 || x > mapPixelW - 40 || y > mapPixelH - 40) continue;
        if (isFootprintBuildable(tiles, tileW, tileH, footprintW, footprintH, x, y)) {
          return { x, y };
        }
      }
    }
  }
  return { x: preferredX, y: preferredY };
}

export function generateWorldMap(
  widthOrSize: number | MapSize = 1200,
  heightOrPreset?: number | MapPreset,
  seedOrUndefined?: number,
  size?: MapSize,
  preset: MapPreset = 'verdant'
): WorldMap {
  let width: number;
  let height: number;
  const seed = seedOrUndefined ?? Math.floor(Math.random() * 100000);

  if (typeof widthOrSize === 'string') {
    const dims = MAP_SIZE_DIMENSIONS[widthOrSize];
    width = dims.width;
    height = dims.height;
    size = widthOrSize;
    if (typeof heightOrPreset === 'string') {
      preset = heightOrPreset;
    }
  } else {
    width = widthOrSize;
    height = typeof heightOrPreset === 'number' ? heightOrPreset : 900;
    if (typeof heightOrPreset === 'string') {
      preset = heightOrPreset;
    }
    if (!size) {
      const matched = (Object.keys(MAP_SIZE_DIMENSIONS) as MapSize[]).find(
        s => MAP_SIZE_DIMENSIONS[s].width === width && MAP_SIZE_DIMENSIONS[s].height === height
      );
      size = matched ?? 'medium';
    }
  }

  const rng = seededRandom(seed);
  const tileW = Math.ceil(width / 10); // 10px tiles
  const tileH = Math.ceil(height / 10);

  const tiles: TerrainTile[][] = [];
  const pm = PRESET_MODIFIERS[preset];

  // First pass - elevation and moisture
  for (let ty = 0; ty < tileH; ty++) {
    tiles[ty] = [];
    for (let tx = 0; tx < tileW; tx++) {
      const worldX = tx * 10;
      const worldY = ty * 10;

      const elevation = Math.min(1, Math.max(0, (noise(worldX, worldY, seed) + pm.elevationBias) * pm.elevationScale));
      const moisture = Math.min(1, Math.max(0, (moistureNoise(worldX, worldY, seed) + pm.moistureBias) * pm.moistureScale));

      tiles[ty][tx] = {
        type: TerrainType.Grassland, // placeholder
        elevation: elevation * 100,
        moisture: moisture * 100,
        variation: rng(),
      };
    }
  }
  
  // Find mountain peaks for river sources
  const peaks: { x: number; y: number; elev: number }[] = [];
  for (let ty = 2; ty < tileH - 2; ty++) {
    for (let tx = 2; tx < tileW - 2; tx++) {
      const e = tiles[ty][tx].elevation;
      let isPeak = true;
      for (let dy = -1; dy <= 1 && isPeak; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (tiles[ty + dy]?.[tx + dx]?.elevation >= e) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak && e > 70) {
        peaks.push({ x: tx, y: ty, elev: e });
      }
    }
  }
  
  // Sort by elevation, take top peaks
  peaks.sort((a, b) => b.elev - a.elev);
  const topPeaks = peaks.slice(0, Math.min(5 + Math.floor(rng() * 4), peaks.length));
  
  // Generate rivers from peaks
  const rivers: { x: number; y: number }[][] = [];
  const riverSet = new Set<string>();
  
  for (const peak of topPeaks) {
    const river: { x: number; y: number }[] = [];
    let cx = peak.x;
    let cy = peak.y;
    const visited = new Set<string>();
    
    for (let step = 0; step < 200; step++) {
      const key = `${cx},${cy}`;
      if (visited.has(key)) break;
      visited.add(key);
      river.push({ x: cx * 10, y: cy * 10 });
      riverSet.add(key);
      
      // Find lowest neighbor
      let lowestElev = tiles[cy][cx].elevation;
      let lowestX = cx;
      let lowestY = cy;
      
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < tileW && ny >= 0 && ny < tileH) {
          if (tiles[ny][nx].elevation < lowestElev) {
            lowestElev = tiles[ny][nx].elevation;
            lowestX = nx;
            lowestY = ny;
          }
        }
      }
      
      if (lowestX === cx && lowestY === cy) break;
      cx = lowestX;
      cy = lowestY;
      
      // Stop at water
      if (tiles[cy][cx].elevation < 20) break;
    }
    
    if (river.length > 10) {
      rivers.push(river);
    }
  }
  
  // Second pass - assign terrain types
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const tile = tiles[ty][tx];
      const elevNorm = tile.elevation / 100;
      const moistNorm = tile.moisture / 100;
      const tempNorm = Math.min(1, Math.max(0, tempNoise(tx * 10, ty * 10, seed) + pm.temperatureBias));

      // Check if near river
      let nearRiver = false;
      let nearMountain = false;
      for (let dy = -2; dy <= 2 && !nearRiver; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (riverSet.has(`${tx + dx},${ty + dy}`)) {
            nearRiver = true;
          }
        }
      }

      // Check if near mountain
      for (let dy = -3; dy <= 3 && !nearMountain; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nt = tiles[ty + dy]?.[tx + dx];
          if (nt && nt.elevation > 85) nearMountain = true;
        }
      }

      tile.type = getTerrainType(elevNorm, moistNorm, tempNorm, nearRiver, nearMountain, preset);
    }
  }

  const mapPixelW = MAP_SIZE_DIMENSIONS[size].width;
  const mapPixelH = MAP_SIZE_DIMENSIONS[size].height;
  const campX = mapPixelW / 2;
  const campY = mapPixelH / 2;
  const houseFootprint = { w: 46, h: 40 };
  if (
    preset === 'coastal'
    || !isFootprintBuildable(tiles, tileW, tileH, houseFootprint.w, houseFootprint.h, campX, campY)
  ) {
    ensureCampClearing(tiles, tileW, tileH, campX, campY, preset === 'coastal' ? 18 : 12, preset);
  }

  return { tiles, width: tileW, height: tileH, seed, rivers, preset, size };
}
