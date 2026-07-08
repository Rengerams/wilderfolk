import { BuildingType } from './gameTypes';
import type { Building, WorldState } from './gameTypes';
import {
  getBuildingFootprintForType,
  snapBuildingCenter,
  type BuildingRotation,
  type CornerRotation,
  normalizeCornerRotation,
  normalizeBuildingRotation,
} from './buildingRotation';
import { computeStripSegmentCenters, isStripBuildType } from './stripBuild';
import {
  analyzeStripJunction,
  collectStripCenters,
  JUNCTION_PROXIMITY,
  resolveJunctionCenter,
  straightRotationFromConnections,
  type StripJunctionInfo,
} from './stripJunction';

export const STRIP_SNAP_RADIUS = 38;

const WALL_STRIP_TYPES = new Set<BuildingType>([
  BuildingType.Wall,
  BuildingType.WallGate,
  BuildingType.WallCorner,
]);

const ROAD_STRIP_TYPES = new Set<BuildingType>([BuildingType.Road]);

export function isWallStripType(type: BuildingType): boolean {
  return WALL_STRIP_TYPES.has(type);
}

export function isRoadStripType(type: BuildingType): boolean {
  return ROAD_STRIP_TYPES.has(type);
}

export function stripFamilyFor(type: BuildingType): 'wall' | 'road' | null {
  if (isWallStripType(type) || type === BuildingType.Wall) return 'wall';
  if (isRoadStripType(type)) return 'road';
  if (isStripBuildType(type)) return isWallStripType(type) ? 'wall' : 'road';
  return null;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Endpoints of a straight strip segment (center-based chain). */
export function getStripSegmentEndpoints(
  type: BuildingType,
  cx: number,
  cy: number,
  rotation: BuildingRotation,
): [{ x: number; y: number }, { x: number; y: number }] {
  const { width, height } = getBuildingFootprintForType(type, rotation);
  const along = Math.max(width, height) / 2;
  if (normalizeBuildingRotation(rotation) === 0) {
    return [{ x: cx - along, y: cy }, { x: cx + along, y: cy }];
  }
  return [{ x: cx, y: cy - along }, { x: cx, y: cy + along }];
}

function buildingStripRotation(b: Building): BuildingRotation {
  if (b.type === BuildingType.WallCorner) {
    const c = normalizeCornerRotation(b.rotation);
    return c === 90 || c === 270 ? 90 : 0;
  }
  return normalizeBuildingRotation(b.rotation);
}

function collectSnapPoints(buildings: Building[], family: 'wall' | 'road'): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const types = family === 'wall' ? WALL_STRIP_TYPES : ROAD_STRIP_TYPES;
  for (const b of buildings) {
    if (!b.completed || b.faction === 'rival' || !types.has(b.type)) continue;
    if (b.type === BuildingType.WallCorner) {
      points.push({ x: b.x, y: b.y });
      continue;
    }
    const rot = buildingStripRotation(b);
    const sampleType = b.type === BuildingType.WallGate ? BuildingType.WallGate : b.type;
    const [a, c] = getStripSegmentEndpoints(sampleType, b.x, b.y, rot);
    points.push(a, c, { x: b.x, y: b.y });
  }
  return points;
}

function nearestSnapPoint(
  points: { x: number; y: number }[],
  x: number,
  y: number,
  maxDist: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = maxDist * maxDist;
  for (const p of points) {
    const dx = p.x - x;
    const dy = p.y - y;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestDist) {
      bestDist = dSq;
      best = p;
    }
  }
  return best;
}

/** Snap drag endpoints to nearby strip chain endpoints. */
export function snapStripDragEndpoints(
  buildings: Building[],
  type: BuildingType,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): { startX: number; startY: number; endX: number; endY: number } {
  const family = stripFamilyFor(type);
  if (!family) return { startX, startY, endX, endY };
  const snaps = collectSnapPoints(buildings, family);
  if (snaps.length === 0) return { startX, startY, endX, endY };

  const startSnap = nearestSnapPoint(snaps, startX, startY, STRIP_SNAP_RADIUS);
  const endSnap = nearestSnapPoint(snaps, endX, endY, STRIP_SNAP_RADIUS);
  return {
    startX: startSnap?.x ?? startX,
    startY: startSnap?.y ?? startY,
    endX: endSnap?.x ?? endX,
    endY: endSnap?.y ?? endY,
  };
}

export interface StripPlacementPiece {
  type: BuildingType;
  x: number;
  y: number;
  rotation: BuildingRotation | CornerRotation;
  /** Junction topology for renderer (tee/cross caps, T/+ wall arms). */
  junctionInfo?: StripJunctionInfo;
  /** Existing player building removed (corner swap or straight-through rebuild). */
  replacesBuildingId?: number;
}

function needsReplacement(
  existing: Building | undefined,
  placeType: BuildingType,
  rotation: BuildingRotation | CornerRotation,
): boolean {
  if (!existing) return false;
  if (placeType === BuildingType.WallCorner) {
    if (existing.type !== BuildingType.WallCorner) return true;
    return normalizeCornerRotation(existing.rotation) !== normalizeCornerRotation(rotation);
  }
  return existing.type === BuildingType.WallCorner;
}

export function resolveWallStripPlan(
  state: WorldState,
  stripType: BuildingType,
  centers: { x: number; y: number }[],
  stripRotation: BuildingRotation,
): StripPlacementPiece[] {
  const extra = centers.map((c) => ({
    x: c.x,
    y: c.y,
    rotation: stripRotation,
    type: stripType,
  }));
  const { hList, vList, along } = collectStripCenters(state.buildings, 'wall', extra);

  const pieces: StripPlacementPiece[] = [];
  const emitted = new Set<string>();

  for (const c of centers) {
    const snapped = snapBuildingCenter(stripType, c.x, c.y, stripRotation);
    const key = cellKey(snapped.x, snapped.y);
    if (emitted.has(key)) continue;

    const junctionPt = resolveJunctionCenter(snapped.x, snapped.y, hList, vList);
    const info = analyzeStripJunction(junctionPt.x, junctionPt.y, hList, vList, along);
    const existing = findStripBuildingAt(state, junctionPt.x, junctionPt.y, JUNCTION_PROXIMITY * 0.75);

    if (info.kind === 'elbow' || info.kind === 'tee' || info.kind === 'cross') {
      if (
        existing?.type === BuildingType.WallCorner
        && normalizeCornerRotation(existing.rotation) === info.cornerRotation
        && info.kind === 'elbow'
      ) {
        emitted.add(key);
        continue;
      }
      const cornerSnap = snapBuildingCenter(BuildingType.WallCorner, junctionPt.x, junctionPt.y, 0);
      const cornerKey = cellKey(cornerSnap.x, cornerSnap.y);
      if (emitted.has(cornerKey)) continue;
      pieces.push({
        type: BuildingType.WallCorner,
        x: cornerSnap.x,
        y: cornerSnap.y,
        rotation: info.cornerRotation,
        junctionInfo: info,
        replacesBuildingId: needsReplacement(existing, BuildingType.WallCorner, info.cornerRotation)
          ? existing?.id
          : undefined,
      });
      emitted.add(cornerKey);
      emitted.add(key);
      continue;
    }

    if (info.kind === 'straight') {
      const rot = straightRotationFromConnections(info.connections);
      if (existing?.type === BuildingType.WallCorner) {
        pieces.push({
          type: stripType,
          x: snapped.x,
          y: snapped.y,
          rotation: rot,
          replacesBuildingId: existing.id,
        });
        emitted.add(key);
        continue;
      }
    }

    if (existing && (existing.type === stripType || existing.type === BuildingType.Wall)) {
      emitted.add(key);
      continue;
    }

    pieces.push({
      type: stripType,
      x: snapped.x,
      y: snapped.y,
      rotation: stripRotation,
    });
    emitted.add(key);
  }

  return pieces;
}

export function resolveRoadStripPlan(
  state: WorldState,
  centers: { x: number; y: number }[],
  stripRotation: BuildingRotation,
): StripPlacementPiece[] {
  const extra = centers.map((c) => ({
    x: c.x,
    y: c.y,
    rotation: stripRotation,
    type: BuildingType.Road,
  }));
  const { hList, vList, along } = collectStripCenters(state.buildings, 'road', extra);

  return centers.map((c) => {
    const snapped = snapBuildingCenter(BuildingType.Road, c.x, c.y, stripRotation);
    const junctionPt = resolveJunctionCenter(snapped.x, snapped.y, hList, vList);
    const info = analyzeStripJunction(junctionPt.x, junctionPt.y, hList, vList, along);
    const junctionInfo = info.kind === 'end' || info.kind === 'straight' ? undefined : info;
    return {
      type: BuildingType.Road,
      x: snapped.x,
      y: snapped.y,
      rotation: stripRotation,
      junctionInfo,
    };
  });
}

export function resolveStripPlan(
  state: WorldState,
  type: BuildingType,
  centers: { x: number; y: number }[],
  stripRotation: BuildingRotation,
): StripPlacementPiece[] {
  if (type === BuildingType.Road) return resolveRoadStripPlan(state, centers, stripRotation);
  if (type === BuildingType.Wall || type === BuildingType.WallGate) {
    return resolveWallStripPlan(state, type, centers, stripRotation);
  }
  return centers.map((c) => ({
    type,
    x: c.x,
    y: c.y,
    rotation: stripRotation,
  }));
}

export function findStripBuildingAt(
  state: WorldState,
  x: number,
  y: number,
  tolerance = 6,
): Building | undefined {
  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    if (!WALL_STRIP_TYPES.has(b.type) && !ROAD_STRIP_TYPES.has(b.type)) continue;
    if (Math.hypot(b.x - x, b.y - y) <= tolerance) return b;
  }
  return undefined;
}

export interface EnclosedArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ENCLOSURE_CELL = 24;

/** Flood-fill from map border; highlight regions fully surrounded by walls. */
export function findEnclosedWallAreas(
  state: WorldState,
  extraCenters: { x: number; y: number }[] = [],
): EnclosedArea[] {
  const cols = Math.ceil(state.width / ENCLOSURE_CELL);
  const rows = Math.ceil(state.height / ENCLOSURE_CELL);
  const blocked = new Uint8Array(cols * rows);

  const markBlocked = (wx: number, wy: number, radius: number) => {
    const cx = Math.floor(wx / ENCLOSURE_CELL);
    const cy = Math.floor(wy / ENCLOSURE_CELL);
    const r = Math.ceil(radius / ENCLOSURE_CELL);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const col = cx + dx;
        const row = cy + dy;
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        blocked[row * cols + col] = 1;
      }
    }
  };

  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    if (!WALL_STRIP_TYPES.has(b.type)) continue;
    markBlocked(b.x, b.y, Math.max(b.width, b.height) * 0.45);
  }
  for (const c of extraCenters) {
    markBlocked(c.x, c.y, 28);
  }

  const exterior = new Uint8Array(cols * rows);
  const queue: number[] = [];
  const push = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    const idx = row * cols + col;
    if (blocked[idx] || exterior[idx]) return;
    exterior[idx] = 1;
    queue.push(idx);
  };

  for (let col = 0; col < cols; col++) {
    push(col, 0);
    push(col, rows - 1);
  }
  for (let row = 0; row < rows; row++) {
    push(0, row);
    push(cols - 1, row);
  }

  while (queue.length > 0) {
    const idx = queue.pop()!;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    push(col - 1, row);
    push(col + 1, row);
    push(col, row - 1);
    push(col, row + 1);
  }

  const seen = new Uint8Array(cols * rows);
  const areas: EnclosedArea[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (blocked[idx] || exterior[idx] || seen[idx]) continue;

      let minC = col;
      let maxC = col;
      let minR = row;
      let maxR = row;
      let size = 0;
      const local: number[] = [idx];
      seen[idx] = 1;

      while (local.length > 0) {
        const cur = local.pop()!;
        size++;
        const c = cur % cols;
        const r = Math.floor(cur / cols);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);

        const neighbors = [c - 1 + r * cols, c + 1 + r * cols, c + (r - 1) * cols, c + (r + 1) * cols];
        for (const n of neighbors) {
          const nc = n % cols;
          const nr = Math.floor(n / cols);
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          if (blocked[n] || exterior[n] || seen[n]) continue;
          seen[n] = 1;
          local.push(n);
        }
      }

      if (size < 4) continue;
      areas.push({
        x: minC * ENCLOSURE_CELL,
        y: minR * ENCLOSURE_CELL,
        w: (maxC - minC + 1) * ENCLOSURE_CELL,
        h: (maxR - minR + 1) * ENCLOSURE_CELL,
      });
    }
  }

  return areas;
}

export function buildStripPlanFromDrag(
  state: WorldState,
  type: BuildingType,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  rotation: BuildingRotation,
): {
  plan: StripPlacementPiece[];
  enclosedAreas: EnclosedArea[];
} {
  const snapped = snapStripDragEndpoints(state.buildings, type, startX, startY, endX, endY);
  const centers = computeStripSegmentCenters(
    type,
    snapped.startX,
    snapped.startY,
    snapped.endX,
    snapped.endY,
    rotation,
  );
  const plan = resolveStripPlan(state, type, centers, rotation);
  const enclosedAreas = isWallStripType(type)
    ? findEnclosedWallAreas(state, plan.filter((p) => p.type !== BuildingType.WallCorner).map((p) => ({ x: p.x, y: p.y })))
    : [];
  return { plan, enclosedAreas };
}