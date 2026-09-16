import { TerrainType, type TerrainTile, type WorldMap, type MapPreset, MapSize, MAP_SIZE_DIMENSIONS, TERRAIN_TILE_SIZE } from './gameTypes';
import { getSimRng } from './simRng';
import { isUnbuildableTerrainType } from './placementUtils';


// ─── Seeded PRNG ─────────────────────────────────────────────────────────────
function seededRandom(seed: number) {
  let s = seed === 0 ? 1 : Math.abs(Math.floor(seed)) % 2147483647;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── Noise ───────────────────────────────────────────────────────────────────
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

function moistureNoise(x: number, y: number, seed: number): number {
  return noise(x, y, seed + 1000);
}

function tempNoise(x: number, y: number, seed: number): number {
  return noise(x, y, seed + 2000);
}

// ─── Presets ─────────────────────────────────────────────────────────────────
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
  verdant:     { elevationBias: -0.02, elevationScale: 0.95, moistureBias:  0.06, moistureScale: 1.05, temperatureBias:  0.02, waterLevel: 0.18, forestThreshold: 0.48 },
  mountainous: { elevationBias:  0.12, elevationScale: 1.18, moistureBias: -0.05, moistureScale: 0.85, temperatureBias: -0.12, waterLevel: 0.20, forestThreshold: 0.48 },
  coastal:     { elevationBias: -0.08, elevationScale: 0.88, moistureBias:  0.12, moistureScale: 1.00, temperatureBias:  0.08, waterLevel: 0.27, forestThreshold: 0.50 },
  arid:        { elevationBias:  0.02, elevationScale: 1.05, moistureBias: -0.25, moistureScale: 0.75, temperatureBias:  0.22, waterLevel: 0.12, forestThreshold: 0.64 },
  harsh:       { elevationBias:  0.10, elevationScale: 1.12, moistureBias: -0.22, moistureScale: 0.70, temperatureBias: -0.22, waterLevel: 0.16, forestThreshold: 0.55 },
  riverlands:  { elevationBias: -0.08, elevationScale: 0.85, moistureBias:  0.14, moistureScale: 1.05, temperatureBias:  0.05, waterLevel: 0.22, forestThreshold: 0.45 },
};

// ─── Terrain assignment ──────────────────────────────────────────────────────
function getTerrainType(
  elevation: number,
  moisture: number,
  temperature: number,
  nearRiver: boolean,
  nearMountain: boolean,
  preset: MapPreset,
): TerrainType {
  const pm = PRESET_MODIFIERS[preset];
  const waterLevel = pm.waterLevel;

  // River overrides everything else
  if (nearRiver) {
    if (elevation < waterLevel * 0.75) return TerrainType.River;
    if (elevation < waterLevel + 0.05) return TerrainType.RiverBank;
  }

  // Water & beach
  if (elevation < waterLevel * 0.6) return TerrainType.DeepWater;
  if (elevation < waterLevel) return TerrainType.ShallowWater;
  if (elevation < waterLevel + 0.08) return TerrainType.Beach;

  const mountainThreshold = preset === 'mountainous' ? 0.94 : 0.85;
  if (elevation > mountainThreshold) {
    if (temperature < 0.3) return TerrainType.Snow;
    return TerrainType.Mountains;
  }

  // Rocky foothills near existing mountains
  if (nearMountain && elevation > 0.7) return TerrainType.Rocky;

  if (elevation > 0.6) return TerrainType.Hills;

  // Forest biome
  if (moisture > pm.forestThreshold) return TerrainType.Forest;

  return TerrainType.Grassland;
}

// ─── Buildability ────────────────────────────────────────────────────────────
export function isFootprintBuildable(
  tiles: TerrainTile[][],
  tileW: number,
  tileH: number,
  footprintW: number,
  footprintH: number,
  worldX: number,
  worldY: number,
): boolean {
  if (!tiles?.length || tileW <= 0 || tileH <= 0) return false;

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
      if (!tile || isUnbuildableTerrainType(tile.type)) return false;
    }
  }
  return true;
}

function forEachTileInRadius(
  tiles: TerrainTile[][],
  tileW: number,
  tileH: number,
  worldX: number,
  worldY: number,
  radiusTiles: number,
  cb: (tile: TerrainTile, tx: number, ty: number, dist: number) => void,
): void {
  const cx = Math.floor(worldX / 10);
  const cy = Math.floor(worldY / 10);
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const dist = Math.hypot(tx - cx, ty - cy);
      if (dist > radiusTiles) continue;
      const tile = tiles[ty]?.[tx];
      if (!tile) continue;
      cb(tile, tx, ty, dist);
    }
  }
}

export function ensureCampClearing(
  tiles: TerrainTile[][],
  tileW: number,
  tileH: number,
  worldX: number,
  worldY: number,
  radiusTiles: number,
  preset: MapPreset,
): void {
  if (!tiles?.length || tileW <= 0 || tileH <= 0) return;

  forEachTileInRadius(tiles, tileW, tileH, worldX, worldY, radiusTiles, (tile, _tx, _ty, dist) => {
    if (tile.type === TerrainType.River || tile.type === TerrainType.RiverBank) return;

    const inner = dist < radiusTiles * 0.55;
    tile.type = inner
      ? TerrainType.Grassland
      : preset === 'coastal'
        ? TerrainType.Beach
        : TerrainType.Grassland;
    tile.elevation = inner ? 48 : 42;
    tile.moisture = inner ? 45 : preset === 'coastal' ? 70 : 50;
  });
}

function clearStartAreaForest(
  tiles: TerrainTile[][],
  tileW: number,
  tileH: number,
  worldX: number,
  worldY: number,
  radiusTiles: number,
): void {
  forEachTileInRadius(tiles, tileW, tileH, worldX, worldY, radiusTiles, (tile) => {
    if (tile.type === TerrainType.Forest || tile.type === TerrainType.DarkForest) {
      tile.type = TerrainType.Grassland;
    }
  });
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
  const margin = 40;

  for (let ring = 1; ring <= 40; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const x = preferredX + dx * step;
        const y = preferredY + dy * step;
        if (x < margin || y < margin || x > mapPixelW - margin || y > mapPixelH - margin) continue;
        if (isFootprintBuildable(tiles, tileW, tileH, footprintW, footprintH, x, y)) {
          return { x, y };
        }
      }
    }
  }

  const scanStep = 20;
  for (let y = margin; y <= mapPixelH - margin; y += scanStep) {
    for (let x = margin; x <= mapPixelW - margin; x += scanStep) {
      if (isFootprintBuildable(tiles, tileW, tileH, footprintW, footprintH, x, y)) {
        return { x, y };
      }
    }
  }

  for (let y = margin; y <= mapPixelH - margin; y += 10) {
    for (let x = margin; x <= mapPixelW - margin; x += 10) {
      if (isFootprintBuildable(tiles, tileW, tileH, footprintW, footprintH, x, y)) {
        return { x, y };
      }
    }
  }

  console.warn('[terrainGen] findCampSite: no buildable site found, returning preferred');
  return { x: preferredX, y: preferredY };
}

// ─── World generation ────────────────────────────────────────────────────────
export interface GenerateWorldMapOptions {
  size?: MapSize;
  preset?: MapPreset;
  seed?: number;
  width?: number;
  height?: number;
}

export function clusterMountainRegions(
  tiles: TerrainTile[][],
  tileW: number,
  tileH: number,
  preset: MapPreset,
): void {
  const types = tiles.map((row) => row.map((t) => t.type));
  const edgeMountainNeighbours = (tx: number, ty: number): number => {
    let count = 0;
    if (types[ty]?.[tx - 1] === TerrainType.Mountains) count++;
    if (types[ty]?.[tx + 1] === TerrainType.Mountains) count++;
    if (types[ty - 1]?.[tx] === TerrainType.Mountains) count++;
    if (types[ty + 1]?.[tx] === TerrainType.Mountains) count++;
    return count;
  };

  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      if (types[ty]?.[tx] !== TerrainType.Mountains) continue;
      if (edgeMountainNeighbours(tx, ty) < 1) {
        const tile = tiles[ty][tx];
        tile.type = tile.elevation > 70 ? TerrainType.Rocky : TerrainType.Hills;
      }
    }
  }

  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      types[ty][tx] = tiles[ty][tx].type;
    }
  }

  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const tile = tiles[ty][tx];
      if (!tile || tile.type === TerrainType.Mountains) continue;
      const fillThreshold = preset === 'mountainous' ? 88 : 78;
      if (tile.elevation > fillThreshold && edgeMountainNeighbours(tx, ty) >= 1) {
        tile.type = TerrainType.Mountains;
      }
    }
  }
}

/** Preferred: `generateWorldMap(MapSize.Medium, MapPreset.Verdant, seed)`. */
export function generateWorldMap(size: MapSize, preset?: MapPreset, seed?: number): WorldMap;
/** Legacy pixel dimensions — prefer MapSize overload. */
export function generateWorldMap(width: number, height: number, seed?: number, size?: MapSize, preset?: MapPreset): WorldMap;
export function generateWorldMap(
  widthOrSize: number | MapSize = 1200,
  heightOrPreset: number | MapPreset = 900,
  seedOrUndefined?: number,
  sizeArg?: MapSize,
  presetArg: MapPreset = 'verdant',
): WorldMap {
  let width: number;
  let height: number;
  let size: MapSize;
  let preset: MapPreset;
  let seed: number;

  if (typeof widthOrSize === 'string') {
    const dims = MAP_SIZE_DIMENSIONS[widthOrSize];
    width = dims.width;
    height = dims.height;
    size = widthOrSize;
    preset = typeof heightOrPreset === 'string' ? heightOrPreset : presetArg;
    seed = seedOrUndefined ?? Math.floor(getSimRng('terrainGen')() * 100000);
  } else {
    width = widthOrSize;
    height = typeof heightOrPreset === 'number' ? heightOrPreset : 900;
    preset = typeof heightOrPreset === 'string' ? heightOrPreset : presetArg;
    seed = seedOrUndefined ?? Math.floor(getSimRng('terrainGen')() * 100000);

    if (sizeArg) {
      size = sizeArg;
    } else {
      const matched = (Object.keys(MAP_SIZE_DIMENSIONS) as MapSize[]).find(
        (s) => MAP_SIZE_DIMENSIONS[s].width === width && MAP_SIZE_DIMENSIONS[s].height === height,
      );
      size = matched ?? MapSize.Medium;
    }
  }

  const rng = seededRandom(seed);
  const tileW = Math.ceil(width / TERRAIN_TILE_SIZE);
  const tileH = Math.ceil(height / TERRAIN_TILE_SIZE);

  const tiles: TerrainTile[][] = [];
  const pm = PRESET_MODIFIERS[preset];

  // ── First pass: elevation & moisture ──
  for (let ty = 0; ty < tileH; ty++) {
    tiles[ty] = [];
    for (let tx = 0; tx < tileW; tx++) {
      const worldX = tx * TERRAIN_TILE_SIZE;
      const worldY = ty * TERRAIN_TILE_SIZE;

      const elevation = Math.min(1, Math.max(0, (noise(worldX, worldY, seed) + pm.elevationBias) * pm.elevationScale));
      const moisture = Math.min(1, Math.max(0, (moistureNoise(worldX, worldY, seed) + pm.moistureBias) * pm.moistureScale));

      tiles[ty][tx] = {
        type: TerrainType.Grassland,
        elevation: elevation * 100,
        moisture: moisture * 100,
        variation: noise(worldX * 0.25, worldY * 0.25, seed + 5000),
      };
    }
  }

  const smoothElev: number[][] = [];
  for (let ty = 0; ty < tileH; ty++) {
    smoothElev[ty] = [];
    for (let tx = 0; tx < tileW; tx++) {
      let sum = 0;
      let n = 0;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const t = tiles[ty + dy]?.[tx + dx];
          if (t) {
            sum += t.elevation;
            n++;
          }
        }
      }
      smoothElev[ty][tx] = n > 0 ? sum / n : 0;
    }
  }

  const peakThreshold = Math.max(
    48,
    Math.min(1, (1 + pm.elevationBias) * pm.elevationScale) * 0.7 * 100,
  );
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
      if (isPeak && e > peakThreshold) {
        peaks.push({ x: tx, y: ty, elev: e });
      }
    }
  }

  peaks.sort((a, b) => b.elev - a.elev);
  const topPeaks = peaks.slice(0, Math.min(5 + Math.floor(rng() * 4), peaks.length));

  // ── Generate rivers from peaks ──
  const rivers: { x: number; y: number }[][] = [];
  const riverSet = new Set<string>();
  const acceptedRiverSet = new Set<string>();
  const riverBankSet = new Set<string>();

  for (const peak of topPeaks) {
    const river: { x: number; y: number }[] = [];
    let cx = peak.x;
    let cy = peak.y;
    const visited = new Set<string>();

    for (let step = 0; step < 90; step++) {
      const key = `${cx},${cy}`;
      if (visited.has(key)) break;
      visited.add(key);
      river.push({ x: cx * 10, y: cy * 10 });
      riverSet.add(key);

      if (tiles[cy][cx].elevation < 20) break;

      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];

      let lowestElev = smoothElev[cy][cx];
      let lowestX = cx;
      let lowestY = cy;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < tileW && ny >= 0 && ny < tileH) {
          if (!visited.has(`${nx},${ny}`) && smoothElev[ny][nx] < lowestElev) {
            lowestElev = smoothElev[ny][nx];
            lowestX = nx;
            lowestY = ny;
          }
        }
      }
      if (lowestX !== cx || lowestY !== cy) {
        cx = lowestX;
        cy = lowestY;
        continue;
      }

      let fallback = -1;
      let fx = cx;
      let fy = cy;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < tileW && ny >= 0 && ny < tileH) {
          if (visited.has(`${nx},${ny}`)) continue;
          if (fallback < 0 || smoothElev[ny][nx] < fallback) {
            fallback = smoothElev[ny][nx];
            fx = nx;
            fy = ny;
          }
        }
      }
      if (fx === cx && fy === cy) break;
      cx = fx;
      cy = fy;
    }

    if (river.length > 10) {
      rivers.push(river);
      const channelCells = new Set<string>();
      for (let i = 1; i < river.length; i++) {
        const previous = river[i - 1];
        const current = river[i];
        const px = Math.floor(previous.x / TERRAIN_TILE_SIZE);
        const py = Math.floor(previous.y / TERRAIN_TILE_SIZE);
        const cx = Math.floor(current.x / TERRAIN_TILE_SIZE);
        const cy = Math.floor(current.y / TERRAIN_TILE_SIZE);
        channelCells.add(`${cx},${cy}`);

        if (Math.abs(cx - px) === 1 && Math.abs(cy - py) === 1) {
          channelCells.add(`${px},${cy}`);
          channelCells.add(`${cx},${py}`);
        }
      }

      for (const key of channelCells) {
        const [cx, cy] = key.split(',').map(Number);
        acceptedRiverSet.add(key);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
          const nt = tiles[cy + dy]?.[cx + dx];
          if (!nt) continue;
          const threshold = dx === 0 || dy === 0 ? pm.waterLevel + 0.14 : pm.waterLevel + 0.08;
          if (nt.elevation / 100 < threshold) {
            acceptedRiverSet.add(`${cx + dx},${cy + dy}`);
          }
        }
      }
    }
  }

  const primaryRadius = preset === 'riverlands' || preset === 'coastal' ? 2 : 1;
  const side = rng() < 0.5 ? 0.28 : 0.72;
  const margin = primaryRadius + 3;
  const baseX = Math.max(margin, Math.min(tileW - margin - 1, Math.round(tileW * side)));
  const phase = rng() * Math.PI * 2;
  let primaryX = baseX;
  for (let ty = 0; ty < tileH; ty++) {
    const meander = Math.round(
      Math.sin(ty * 0.18 + phase) * 3
      + (noise(baseX * 10, ty * 10, seed + 7100) - 0.5) * 4,
    );
    const targetX = Math.max(margin, Math.min(tileW - margin - 1, baseX + meander));
    if (targetX > primaryX) primaryX++;
    else if (targetX < primaryX) primaryX--;

    riverSet.add(`${primaryX},${ty}`);
    for (let dy = -primaryRadius; dy <= primaryRadius; dy++) {
      for (let dx = -primaryRadius; dx <= primaryRadius; dx++) {
        if (dx * dx + dy * dy > primaryRadius * primaryRadius + 0.25) continue;
        const rx = primaryX + dx;
        const ry = ty + dy;
        if (rx < 0 || ry < 0 || rx >= tileW || ry >= tileH) continue;
        acceptedRiverSet.add(`${rx},${ry}`);
      }
    }
  }

  for (const key of acceptedRiverSet) {
    const [cx, cy] = key.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const bx = cx + dx;
        const by = cy + dy;
        const bankKey = `${bx},${by}`;
        if (bx < 0 || by < 0 || bx >= tileW || by >= tileH || acceptedRiverSet.has(bankKey)) continue;
        riverBankSet.add(bankKey);
      }
    }
  }

  // ── Second pass: assign terrain types ──
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const tile = tiles[ty][tx];
      const elevNorm = tile.elevation / 100;
      const moistNorm = tile.moisture / 100;
      const tempNorm = Math.min(1, Math.max(0, tempNoise(tx * 10, ty * 10, seed) + pm.temperatureBias));

      let nearRiver = false;
      for (let dy = -2; dy <= 2 && !nearRiver; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (riverSet.has(`${tx + dx},${ty + dy}`)) {
            nearRiver = true;
            break;
          }
        }
      }

      let nearMountain = false;
      for (let dy = -3; dy <= 3 && !nearMountain; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nt = tiles[ty + dy]?.[tx + dx];
          if (nt && nt.elevation > 85) {
            nearMountain = true;
            break;
          }
        }
      }

      const terrainType = getTerrainType(elevNorm, moistNorm, tempNorm, nearRiver, nearMountain, preset);
      const key = `${tx},${ty}`;
      const naturalWater = terrainType === TerrainType.DeepWater || terrainType === TerrainType.ShallowWater;
      tile.type = acceptedRiverSet.has(key)
        ? TerrainType.River
        : riverBankSet.has(key) && !naturalWater
          ? TerrainType.RiverBank
          : terrainType;
    }
  }

  const campX = width / 2;
  const campY = height / 2;
  const houseFootprint = { w: 46, h: 40 };

  if (
    preset === 'coastal' ||
    !isFootprintBuildable(tiles, tileW, tileH, houseFootprint.w, houseFootprint.h, campX, campY)
  ) {
    ensureCampClearing(tiles, tileW, tileH, campX, campY, preset === 'coastal' ? 18 : 12, preset);
  }

  const startForestRadius = Math.max(14, Math.round(Math.min(tileW, tileH) * 0.22));
  clearStartAreaForest(tiles, tileW, tileH, campX, campY, startForestRadius);

  return { tiles, width: tileW, height: tileH, seed, rivers, preset, size };
}
