import type { Building, BuildingType, Camera, Entity, WorldState } from './gameTypes';
import { BuildingType as BuildingTypeEnum } from './gameTypes';
import type { StripBuildPreview } from './stripBuild';
import { pickWorldFieldsForSave } from './saveSchema';

export interface ViewState {
  camera: Camera;
  screenShake: number;
  /** Primary selected entity (last of selectedEntityIds) — inspector target. */
  selectedEntityId: number | null;
  /** Multi-selection (shift-click). Includes primary; drives multi-assign & rings. */
  selectedEntityIds: number[];
  selectedBuildingId: number | null;
  hoveredBuildingId: number | null;
  buildMode: BuildingType | null;
  buildGhost: { x: number; y: number; valid: boolean } | null;
  /** Drag preview for wall / road / gate chains. */
  buildStripPreview: StripBuildPreview | null;
  /** Placement rotation for rotatable build types (Road, Wall, Wall Gate). */
  buildRotation: 0 | 90;
  showGrid: boolean;
  showPaths: boolean;
  showTechTree: boolean;
  /** Camp marker highlight — `rival:<id>` or `visitor:<id>`. */
  highlightedCampKey: string | null;
  /** Selected visitor/rival camp for diplomacy inspector. */
  selectedCampKey: string | null;
  /**
   * Favorite citizen — camera continuously follows while set (and entity stays alive).
   * Null = not following.
   */
  favoriteEntityId: number | null;
}

export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 8.0;
export const CAMERA_ZOOM_DEFAULT = 1.45;
export const CAMERA_ZOOM_STEP_IN = 1.1;
export const CAMERA_ZOOM_STEP_OUT = 0.9;
export const CAMERA_ZOOM_PRESETS: readonly number[] = [0.5, 0.75, 1.0, 1.25, 1.45, 1.75, 2.0, 2.5, 3.0];

const CAMERA_EPS = 1e-3;
const CAMERA_LERP = 0.12;
const BUILDING_TYPE_VALUES = new Set<string>(Object.values(BuildingTypeEnum));
const CAMP_KEY_PATTERN = /^(rival|visitor):/;

export function createInitialView(width: number, height: number, zoom = CAMERA_ZOOM_DEFAULT): ViewState {
  const cx = width / 2;
  const cy = height / 2;
  const clampedZoom = clampCameraZoom(zoom);

  return {
    camera: {
      x: cx,
      y: cy,
      zoom: clampedZoom,
      targetX: cx,
      targetY: cy,
      targetZoom: clampedZoom,
    },
    screenShake: 0,
    selectedEntityId: null,
    selectedEntityIds: [],
    selectedBuildingId: null,
    hoveredBuildingId: null,
    buildMode: null,
    buildGhost: null,
    buildStripPreview: null,
    buildRotation: 0,
    showGrid: true,
    showPaths: false,
    showTechTree: false,
    highlightedCampKey: null,
    selectedCampKey: null,
    favoriteEntityId: null,
  };
}

export function clampCameraZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return CAMERA_ZOOM_DEFAULT;
  return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseFiniteNumber(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseEntityId(value: unknown): number | null {
  const id = parseFiniteNumber(value);
  return id == null || !Number.isInteger(id) ? null : id;
}

function parseIdFromLegacyRecord(value: unknown): number | null {
  if (value == null || typeof value !== 'object') return null;
  return parseEntityId((value as { id?: unknown }).id);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseCampKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return CAMP_KEY_PATTERN.test(value) ? value : null;
}

export function parseBuildRotation(value: unknown): 0 | 90 {
  const n = parseFiniteNumber(value);
  return n === 90 ? 90 : 0;
}

function isBuildingType(value: unknown): value is BuildingType {
  return typeof value === 'string' && BUILDING_TYPE_VALUES.has(value);
}

function parseBuildGhost(value: unknown): ViewState['buildGhost'] {
  if (value == null || typeof value !== 'object') return null;
  const ghost = value as { x?: unknown; y?: unknown; valid?: unknown };
  const x = parseFiniteNumber(ghost.x);
  const y = parseFiniteNumber(ghost.y);
  if (x == null || y == null || typeof ghost.valid !== 'boolean') return null;
  return { x, y, valid: ghost.valid };
}

// ============ ENTITY & BUILDING RESOLUTION ============

export function resolveEntity(world: WorldState, id: number | null): Entity | null {
  if (id == null) return null;

  // 1. O(1) authoritative map lookup if available
  if (world.entityById) {
    const ent = world.entityById.get(id);
    return ent && ent.alive ? ent : null;
  }

  // 2. Direct linear scan fallback
  for (let i = 0; i < world.entities.length; i++) {
    const ent = world.entities[i];
    if (ent.id === id) {
      return ent.alive ? ent : null;
    }
  }

  return null;
}

export function resolveBuilding(world: WorldState, id: number | null): Building | null {
  if (id == null) return null;

  // 1. O(1) building lookup map if available
  if (new Map(world.buildings.map(b => [b.id, b]))) {
    const b = new Map(world.buildings.map(b => [b.id, b])).get(id);
    if (b) return b;
  }

  // 2. Linear scan fallback
  for (let i = 0; i < world.buildings.length; i++) {
    const b = world.buildings[i];
    if (b.id === id) {
      return b;
    }
  }

  return null;
}

// ============ CAMERA SANITIZATION & PERSISTENCE ============

export function sanitizeCamera(raw: Partial<Camera> | undefined, fallback: Camera): Camera {
  if (!raw) return fallback;

  const zoom = isFiniteNumber(raw.zoom) ? clampCameraZoom(raw.zoom) : fallback.zoom;
  const targetZoom = isFiniteNumber(raw.targetZoom) ? clampCameraZoom(raw.targetZoom) : zoom;
  const targetX = isFiniteNumber(raw.targetX)
    ? raw.targetX
    : isFiniteNumber(raw.x)
      ? raw.x
      : fallback.targetX;
  const targetY = isFiniteNumber(raw.targetY)
    ? raw.targetY
    : isFiniteNumber(raw.y)
      ? raw.y
      : fallback.targetY;

  return {
    x: targetX,
    y: targetY,
    zoom: targetZoom,
    targetX,
    targetY,
    targetZoom,
  };
}

export function normalizeCameraForSave(cam: Camera): Camera {
  return {
    ...cam,
    x: cam.targetX,
    y: cam.targetY,
    zoom: cam.targetZoom,
  };
}

function resolveSelectionIds(
  world: WorldState,
  data: Record<string, unknown>,
): {
  selectedEntityId: number | null;
  selectedBuildingId: number | null;
  hoveredBuildingId: number | null;
} {
  let selectedEntityId =
    parseEntityId(data.selectedEntityId) ?? parseIdFromLegacyRecord(data.selectedEntity);
  let selectedBuildingId =
    parseEntityId(data.selectedBuildingId) ?? parseIdFromLegacyRecord(data.selectedBuilding);
  let hoveredBuildingId =
    parseEntityId(data.hoveredBuildingId) ?? parseIdFromLegacyRecord(data.hoveredBuilding);

  if (selectedEntityId != null && !resolveEntity(world, selectedEntityId)) {
    selectedEntityId = null;
  }
  if (selectedBuildingId != null && !resolveBuilding(world, selectedBuildingId)) {
    selectedBuildingId = null;
  }
  if (hoveredBuildingId != null && !resolveBuilding(world, hoveredBuildingId)) {
    hoveredBuildingId = null;
  }

  return { selectedEntityId, selectedBuildingId, hoveredBuildingId };
}

export function createViewFromSave(
  data: Record<string, unknown>,
  world: WorldState,
): ViewState {
  const w = parseFiniteNumber(data.width) ?? world.width;
  const h = parseFiniteNumber(data.height) ?? world.height;
  const base = createInitialView(w, h);
  const selection = resolveSelectionIds(world, data);
  const screenShake = parseFiniteNumber(data.screenShake);

  return {
    ...base,
    camera: normalizeCameraForSave(sanitizeCamera(data.camera as Partial<Camera>, base.camera)),
    screenShake: screenShake != null && screenShake >= 0 ? screenShake : base.screenShake,
    selectedEntityId: selection.selectedEntityId,
    selectedEntityIds: Array.isArray(data.selectedEntityIds)
      ? data.selectedEntityIds
          .map(parseEntityId)
          .filter((id): id is number => id != null && resolveEntity(world, id) != null)
      : selection.selectedEntityId != null
        ? [selection.selectedEntityId]
        : [],
    selectedBuildingId: selection.selectedBuildingId,
    hoveredBuildingId: selection.hoveredBuildingId,
    buildMode: isBuildingType(data.buildMode) ? data.buildMode : null,
    buildGhost: parseBuildGhost(data.buildGhost),
    buildStripPreview: null,
    buildRotation: parseBuildRotation(data.buildRotation),
    showGrid: parseBoolean(data.showGrid, true),
    showPaths: parseBoolean(data.showPaths, false),
    showTechTree: parseBoolean(data.showTechTree, false),
    highlightedCampKey: parseCampKey(data.highlightedCampKey),
    selectedCampKey: parseCampKey(data.selectedCampKey),
    favoriteEntityId: (() => {
      const id = parseEntityId(data.favoriteEntityId);
      return id != null && resolveEntity(world, id) ? id : null;
    })(),
  };
}

export function sanitizeViewSelection(world: WorldState, view: ViewState): ViewState {
  let selectedEntityId = view.selectedEntityId;
  let selectedEntityIds = view.selectedEntityIds ?? (selectedEntityId != null ? [selectedEntityId] : []);
  let selectedBuildingId = view.selectedBuildingId;
  let favoriteEntityId = view.favoriteEntityId;

  if (selectedEntityId != null && !resolveEntity(world, selectedEntityId)) {
    selectedEntityId = null;
  }
  selectedEntityIds = selectedEntityIds.filter((id) => resolveEntity(world, id) != null);
  if (selectedBuildingId != null && !resolveBuilding(world, selectedBuildingId)) {
    selectedBuildingId = null;
  }
  if (favoriteEntityId != null && !resolveEntity(world, favoriteEntityId)) {
    favoriteEntityId = null;
  }

  if (
    selectedEntityId === view.selectedEntityId &&
    selectedBuildingId === view.selectedBuildingId &&
    favoriteEntityId === view.favoriteEntityId &&
    selectedEntityIds.length === (view.selectedEntityIds?.length ?? 0)
  ) {
    return view;
  }

  return {
    ...view,
    selectedEntityId,
    selectedEntityIds,
    selectedBuildingId,
    favoriteEntityId,
  };
}

export function pickTransientWorldFieldsForSave(world: WorldState): Record<string, unknown> {
  return {
    deathParticles: world.deathParticles,
    floatingTexts: world.floatingTexts,
    notifications: world.notifications,
    disasters: world.disasters,
  };
}

export function restoreTransientWorldFieldsFromSave(
  parsed: Record<string, unknown>,
): Pick<WorldState, 'deathParticles' | 'floatingTexts' | 'notifications' | 'disasters'> {
  return {
    deathParticles: Array.isArray(parsed.deathParticles)
      ? (parsed.deathParticles as WorldState['deathParticles'])
      : [],
    floatingTexts: Array.isArray(parsed.floatingTexts)
      ? (parsed.floatingTexts as WorldState['floatingTexts'])
      : [],
    notifications: Array.isArray(parsed.notifications)
      ? (parsed.notifications as WorldState['notifications'])
      : [],
    disasters: Array.isArray(parsed.disasters)
      ? (parsed.disasters as WorldState['disasters'])
      : [],
  };
}

export function mergeForSave(world: WorldState, view: ViewState): Record<string, unknown> {
  const selection = sanitizeViewSelection(world, view);

  return {
    ...pickWorldFieldsForSave(world),
    ...pickTransientWorldFieldsForSave(world),
    camera: normalizeCameraForSave(selection.camera),
    selectedEntityId: selection.selectedEntityId,
    selectedEntityIds: selection.selectedEntityIds,
    selectedBuildingId: selection.selectedBuildingId,
    buildMode: selection.buildMode,
    buildRotation: selection.buildRotation,
    showGrid: selection.showGrid,
    showPaths: selection.showPaths,
    showTechTree: selection.showTechTree,
    highlightedCampKey: selection.highlightedCampKey,
    selectedCampKey: selection.selectedCampKey,
    favoriteEntityId: selection.favoriteEntityId,
    screenShake: selection.screenShake,
  };
}

// ============ KINEMATIC CAMERA INTERPOLATION ============

function cameraAtRest(cam: Camera): boolean {
  return (
    Math.abs(cam.x - cam.targetX) < CAMERA_EPS &&
    Math.abs(cam.y - cam.targetY) < CAMERA_EPS &&
    Math.abs(cam.zoom - cam.targetZoom) < CAMERA_EPS
  );
}

export function updateView(view: ViewState, dtMs: number): ViewState {
  if (dtMs <= 0 || !Number.isFinite(dtMs)) return view;

  const cam = view.camera;
  let nextX = cam.x;
  let nextY = cam.y;
  let nextZoom = cam.zoom;

  if (!cameraAtRest(cam)) {
    const t = 1 - Math.pow(1 - CAMERA_LERP, dtMs / 16.67);
    nextX = cam.x + (cam.targetX - cam.x) * t;
    nextY = cam.y + (cam.targetY - cam.y) * t;
    nextZoom = cam.zoom + (cam.targetZoom - cam.zoom) * t;

    if (Math.abs(nextX - cam.targetX) < CAMERA_EPS) nextX = cam.targetX;
    if (Math.abs(nextY - cam.targetY) < CAMERA_EPS) nextY = cam.targetY;
    if (Math.abs(nextZoom - cam.targetZoom) < CAMERA_EPS) nextZoom = cam.targetZoom;
  }

  const nextShake = view.screenShake > 0.05 ? view.screenShake * Math.pow(0.9, dtMs / 16.67) : 0;
  const cameraUnchanged =
    Math.abs(nextX - cam.x) < CAMERA_EPS &&
    Math.abs(nextY - cam.y) < CAMERA_EPS &&
    Math.abs(nextZoom - cam.zoom) < CAMERA_EPS;
  const shakeUnchanged = Math.abs(nextShake - view.screenShake) < CAMERA_EPS;

  if (cameraUnchanged && shakeUnchanged) {
    return view;
  }

  return {
    ...view,
    camera: cameraUnchanged ? cam : { ...cam, x: nextX, y: nextY, zoom: nextZoom },
    screenShake: shakeUnchanged ? view.screenShake : nextShake,
  };
}

export function clampCameraTarget(
  cam: Camera,
  worldW: number,
  worldH: number,
  viewportW = worldW,
  viewportH = worldH,
): Camera {
  const effectiveZoom = clampCameraZoom(cam.targetZoom ?? cam.zoom);
  const halfViewW = viewportW / 2 / effectiveZoom;
  const halfViewH = viewportH / 2 / effectiveZoom;

  const minX = halfViewW * 2 >= worldW ? worldW / 2 : halfViewW;
  const maxX = halfViewW * 2 >= worldW ? worldW / 2 : worldW - halfViewW;
  const minY = halfViewH * 2 >= worldH ? worldH / 2 : halfViewH;
  const maxY = halfViewH * 2 >= worldH ? worldH / 2 : worldH - halfViewH;

  const marginX = worldW * 0.02;
  const marginY = worldH * 0.02;

  return {
    ...cam,
    targetX: Math.max(minX - marginX, Math.min(maxX + marginX, cam.targetX)),
    targetY: Math.max(minY - marginY, Math.min(maxY + marginY, cam.targetY)),
  };
}

export function moveCameraView(view: ViewState, world: WorldState, dx: number, dy: number): ViewState {
  const cam = { ...view.camera };
  const effectiveZoom = cam.targetZoom ?? cam.zoom;
  cam.targetX += dx / effectiveZoom;
  cam.targetY += dy / effectiveZoom;
  return { ...view, camera: clampCameraTarget(cam, world.width, world.height) };
}

export function zoomCameraViewAt(
  view: ViewState,
  factor: number,
  screenX: number,
  screenY: number,
  canvasW: number,
  canvasH: number,
): ViewState {
  const cam = { ...view.camera };
  const oldZoom = cam.targetZoom;
  const newZoom = clampCameraZoom(oldZoom * factor);

  if (Math.abs(newZoom - oldZoom) < CAMERA_EPS) {
    return view;
  }

  // Anchor transformation: preserve world point under mouse cursor
  const worldX = (screenX - canvasW / 2) / oldZoom + cam.targetX;
  const worldY = (screenY - canvasH / 2) / oldZoom + cam.targetY;

  cam.targetZoom = newZoom;
  cam.targetX = worldX - (screenX - canvasW / 2) / newZoom;
  cam.targetY = worldY - (screenY - canvasH / 2) / newZoom;

  return { ...view, camera: cam };
}

export function zoomCameraView(
  view: ViewState,
  factor: number,
  canvasW = 800,
  canvasH = 600,
): ViewState {
  return zoomCameraViewAt(view, factor, canvasW / 2, canvasH / 2, canvasW, canvasH);
}

export function focusCameraOn(view: ViewState, x: number, y: number, zoom?: number): ViewState {
  const cam = { ...view.camera, targetX: x, targetY: y };
  if (zoom !== undefined) {
    cam.targetZoom = clampCameraZoom(zoom);
  }
  return { ...view, camera: cam };
}

export function nudgeCameraToward(
  view: ViewState,
  world: WorldState,
  x: number,
  y: number,
  strength = 0.28,
): ViewState {
  const cam = { ...view.camera };
  cam.targetX += (x - cam.targetX) * strength;
  cam.targetY += (y - cam.targetY) * strength;
  if (cam.targetZoom < 1.15) {
    cam.targetZoom = Math.min(1.15, cam.targetZoom + 0.04);
  }
  return { ...view, camera: clampCameraTarget(cam, world.width, world.height) };
}

export function syncScreenShakeFromWorld(view: ViewState, world: WorldState): ViewState {
  if (world.screenShakeImpulse <= view.screenShake) return view;
  return { ...view, screenShake: world.screenShakeImpulse };
}

export function clearScreenShakeImpulse(world: WorldState): void {
  world.screenShakeImpulse = 0;
}

// ============ COORDINATE CONVERSION UTILITIES ============

export function worldToScreen(
  x: number,
  y: number,
  cam: Camera,
  cw: number,
  ch: number,
): [number, number] {
  return [(x - cam.x) * cam.zoom + cw / 2, (y - cam.y) * cam.zoom + ch / 2];
}

export function screenToWorld(
  sx: number,
  sy: number,
  cam: Camera,
  cw: number,
  ch: number,
): [number, number] {
  return [(sx - cw / 2) / cam.zoom + cam.x, (sy - ch / 2) / cam.zoom + cam.y];
}