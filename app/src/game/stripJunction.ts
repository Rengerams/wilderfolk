import { BuildingType } from './gameTypes';
import type { Building } from './gameTypes';
import {
  getBuildingFootprintForType,
  normalizeBuildingRotation,
  normalizeCornerRotation,
  snapBuildingCenter,
  type BuildingRotation,
  type CornerRotation,
} from './buildingRotation';

export type JunctionKind = 'end' | 'straight' | 'elbow' | 'tee' | 'cross';

export interface JunctionConnections {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}

export interface StripJunctionInfo {
  kind: JunctionKind;
  connections: JunctionConnections;
  cornerRotation: CornerRotation;
}

const WALL_TYPES = new Set<BuildingType>([
  BuildingType.Wall,
  BuildingType.WallGate,
  BuildingType.WallCorner,
]);

const ROAD_TYPES = new Set<BuildingType>([BuildingType.Road]);

export const JUNCTION_PROXIMITY = 44;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function countConnections(c: JunctionConnections): number {
  return Number(c.north) + Number(c.south) + Number(c.east) + Number(c.west);
}

export function classifyJunction(connections: JunctionConnections): JunctionKind {
  const n = countConnections(connections);
  if (n >= 4) return 'cross';
  if (n === 3) return 'tee';
  if (n === 2) {
    if ((connections.north && connections.south) || (connections.east && connections.west)) {
      return 'straight';
    }
    return 'elbow';
  }
  return 'end';
}

/** Corner / tee facing from open compass arms. */
export function cornerRotationFromConnections(c: JunctionConnections): CornerRotation {
  if (c.east && c.north && !c.west && !c.south) return 0;
  if (c.east && c.south && !c.west && !c.north) return 90;
  if (c.west && c.north && !c.east && !c.south) return 180;
  if (c.west && c.south && !c.east && !c.north) return 270;

  // T-junctions — rotation points arms toward the three connected sides
  if (c.north && c.east && c.west && !c.south) return 0;
  if (c.south && c.east && c.west && !c.north) return 90;
  if (c.north && c.south && c.east && !c.west) return 90;
  if (c.north && c.south && c.west && !c.east) return 180;

  // Cross — default NE corner frame
  if (c.north && c.south && c.east && c.west) return 0;

  if (c.east && c.north) return 0;
  if (c.east && c.south) return 90;
  if (c.west && c.north) return 180;
  if (c.west && c.south) return 270;
  return 0;
}

export function straightRotationFromConnections(c: JunctionConnections): BuildingRotation {
  if (c.east || c.west) return 0;
  if (c.north || c.south) return 90;
  return 0;
}

type StripCenter = { x: number; y: number };

function buildingStripRotation(b: Building): BuildingRotation {
  if (b.type === BuildingType.WallCorner) {
    const c = normalizeCornerRotation(b.rotation);
    return c === 90 || c === 270 ? 90 : 0;
  }
  return normalizeBuildingRotation(b.rotation);
}

export function cornerArms(rotation: CornerRotation): JunctionConnections {
  const r = normalizeCornerRotation(rotation);
  return {
    north: r === 0 || r === 180,
    south: r === 90 || r === 270,
    east: r === 0 || r === 90,
    west: r === 180 || r === 270,
  };
}

export type StripCenterExtra = {
  x: number;
  y: number;
  type: BuildingType;
  rotation: BuildingRotation | CornerRotation;
};

export function collectStripCenters(
  buildings: Building[],
  family: 'wall' | 'road',
  extra: StripCenterExtra[] = [],
): { hList: StripCenter[]; vList: StripCenter[]; along: number } {
  const types = family === 'wall' ? WALL_TYPES : ROAD_TYPES;
  const sampleType = family === 'wall' ? BuildingType.Wall : BuildingType.Road;
  const along = Math.max(...[0, 90].map((rot) => {
    const fp = getBuildingFootprintForType(sampleType, rot as BuildingRotation);
    return Math.max(fp.width, fp.height);
  }));

  const hList: StripCenter[] = [];
  const vList: StripCenter[] = [];

  const pushBuilding = (type: BuildingType, x: number, y: number, rot: BuildingRotation) => {
    const snapped = snapBuildingCenter(type, x, y, rot);
    if (rot === 0) hList.push(snapped);
    else vList.push(snapped);
  };

  for (const b of buildings) {
    if (!b.completed || b.faction === 'rival' || !types.has(b.type)) continue;
    if (b.type === BuildingType.WallCorner) {
      const arms = cornerArms(normalizeCornerRotation(b.rotation));
      const snapped = snapBuildingCenter(BuildingType.WallCorner, b.x, b.y, 0);
      if (arms.east || arms.west) hList.push(snapped);
      if (arms.north || arms.south) vList.push(snapped);
      continue;
    }
    const t = b.type === BuildingType.WallGate ? BuildingType.WallGate : b.type;
    pushBuilding(t, b.x, b.y, buildingStripRotation(b));
  }

  for (const e of extra) {
    if (e.type === BuildingType.WallCorner) {
      const arms = cornerArms(normalizeCornerRotation(e.rotation as CornerRotation));
      const snapped = snapBuildingCenter(BuildingType.WallCorner, e.x, e.y, 0);
      if (arms.east || arms.west) hList.push(snapped);
      if (arms.north || arms.south) vList.push(snapped);
      continue;
    }
    pushBuilding(e.type, e.x, e.y, e.rotation as BuildingRotation);
  }

  return { hList, vList, along };
}

export function connectionsAt(
  x: number,
  y: number,
  hList: StripCenter[],
  vList: StripCenter[],
  along: number,
): JunctionConnections {
  const tol = JUNCTION_PROXIMITY * 0.75;
  const rowMatch = (p: StripCenter) => Math.abs(p.y - y) <= tol;
  const colMatch = (p: StripCenter) => Math.abs(p.x - x) <= tol;

  const west = hList.some((p) => rowMatch(p) && p.x < x - along * 0.35);
  const east = hList.some((p) => rowMatch(p) && p.x > x + along * 0.35);
  const north = vList.some((p) => colMatch(p) && p.y < y - along * 0.35);
  const south = vList.some((p) => colMatch(p) && p.y > y + along * 0.35);

  const hAt = hList.some((p) => rowMatch(p) && Math.abs(p.x - x) <= tol);
  const vAt = vList.some((p) => colMatch(p) && Math.abs(p.y - y) <= tol);

  // Perpendicular strips can snap to the same center (H/V grids differ).
  // Without this, a lone crossing reads as zero connections and skips corners.
  if (hAt && vAt) {
    const conn: JunctionConnections = {
      north: north || (!south && !north),
      south,
      east: east || (!west && !east),
      west,
    };
    if (countConnections(conn) < 2) {
      return { north: true, east: true, south: false, west: false };
    }
    return conn;
  }

  return { north, south, east, west };
}

/** Merge H/V snap grids to one junction anchor (grids use different axes). */
export function resolveJunctionCenter(
  x: number,
  y: number,
  hList: StripCenter[],
  vList: StripCenter[],
  maxDist = JUNCTION_PROXIMITY,
): { x: number; y: number } {
  const tol = maxDist;
  let hNear: StripCenter | undefined;
  let vNear: StripCenter | undefined;
  let bestH = tol * tol;
  let bestV = tol * tol;
  for (const p of hList) {
    const d = dist(p, { x, y });
    if (d <= tol && d * d < bestH) {
      bestH = d * d;
      hNear = p;
    }
  }
  for (const p of vList) {
    const d = dist(p, { x, y });
    if (d <= tol && d * d < bestV) {
      bestV = d * d;
      vNear = p;
    }
  }
  if (hNear && vNear) {
    return {
      x: Math.round((hNear.x + vNear.x) / 2),
      y: Math.round((hNear.y + vNear.y) / 2),
    };
  }
  return { x, y };
}

export function analyzeStripJunction(
  x: number,
  y: number,
  hList: StripCenter[],
  vList: StripCenter[],
  along: number,
): StripJunctionInfo {
  const connections = connectionsAt(x, y, hList, vList, along);
  const kind = classifyJunction(connections);
  return {
    kind,
    connections,
    cornerRotation: cornerRotationFromConnections(connections),
  };
}

export function detectBuildingJunction(
  buildings: Building[],
  building: Building,
  family: 'wall' | 'road',
): StripJunctionInfo {
  const { hList, vList, along } = collectStripCenters(buildings, family);
  return analyzeStripJunction(building.x, building.y, hList, vList, along);
}

export function findStripBuildingNear(
  buildings: Building[],
  x: number,
  y: number,
  types: Set<BuildingType>,
  tolerance = 10,
): Building | undefined {
  let nearest: Building | undefined;
  let bestDist = tolerance + 1;
  for (const b of buildings) {
    if (!b.completed || b.faction === 'rival' || !types.has(b.type)) continue;
    const d = dist(b, { x, y });
    if (d <= tolerance && d < bestDist) {
      bestDist = d;
      nearest = b;
    }
  }
  return nearest;
}