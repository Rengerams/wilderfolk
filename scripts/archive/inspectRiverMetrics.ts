import { generateWorldMap } from '../src/game/terrainGen';
import { MapPreset, MapSize, TerrainType, type WorldMap } from '../src/game/gameTypes';

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function riverCells(map: WorldMap): Set<string> {
  const cells = new Set<string>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y]?.[x]?.type === TerrainType.River) cells.add(key(x, y));
    }
  }
  return cells;
}

function componentSizes(cells: Set<string>): number[] {
  const unseen = new Set(cells);
  const sizes: number[] = [];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  while (unseen.size > 0) {
    const start = unseen.values().next().value as string;
    unseen.delete(start);
    const queue = [start];
    let count = 0;
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      count++;
      const [x, y] = current.split(',').map(Number);
      for (const [dx, dy] of directions) {
        const next = key(x + dx, y + dy);
        if (unseen.delete(next)) queue.push(next);
      }
    }
    sizes.push(count);
  }
  return sizes.sort((a, b) => b - a);
}

function samplePathCoverage(map: WorldMap): { total: number; water: number } {
  let total = 0;
  let water = 0;
  for (const river of map.rivers) {
    for (const point of river.slice(1)) {
      total++;
      const x = Math.floor(point.x / 10);
      const y = Math.floor(point.y / 10);
      if (map.tiles[y]?.[x]?.type === TerrainType.River) water++;
    }
  }
  return { total, water };
}

for (const preset of Object.values(MapPreset)) {
  const map = generateWorldMap(MapSize.Medium, preset, 1234);
  const cells = riverCells(map);
  const components = componentSizes(cells);
  const coverage = samplePathCoverage(map);
  console.log(JSON.stringify({
    preset,
    tracedRivers: map.rivers.map((r) => r.length),
    riverTiles: cells.size,
    components,
    pathWaterCoverage: coverage.total === 0 ? 0 : Number((coverage.water / coverage.total).toFixed(3)),
  }));
}
