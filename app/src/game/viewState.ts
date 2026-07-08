import type { Building, BuildingType, Camera, Entity, WorldState } from './gameTypes';
import { BuildingType as BuildingTypeEnum } from './gameTypes';
import type { StripBuildPreview } from './stripBuild';
import { pickWorldFieldsForSave } from './saveSchema';

export interface ViewState {
  camera: Camera;
  screenShake: number;
  selectedEntityId: number | null;
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
}

export function createInitialView(width: number, height: number, zoom = 1.45): ViewState {
  const cx = width / 2;
  const cy = height / 2;
  return {
    camera: { x: cx, y: cy, zoom, targetX: cx, targetY: cy, targetZoom: zoom },
    screenShake: 0,
    selectedEntityId: null,
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
  };
}

const CAMERA_EPS = 1e-3;

export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 3;
export const CAMERA_ZOOM_DEFAULT = 1.45;
export const CAMERA_ZOOM_STEP_IN = 1.1;
export const CAMERA_ZOOM_STEP_OUT = 0.9;

const BUILDING_TYPE_VALUES = new Set<string>(Object.values(BuildingTypeEnum));
const CAMP_KEY_PATTERN = /^(rival|visitor):/;

const entityIndexCache = new WeakMap<readonly Entity[], Map<number, Entity>>();
const buildingIndexCache = new WeakMap<readonly Building[], Map<number, Building>>();

export function clampCameraZoom(zoom: number): number {
  return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getEntityIndex(entities: readonly Entity[]): Map<number, Entity> {
  let index = entityIndexCache.get(entities);
  if (!index) {
    index = new Map();
    for (const entity of entities) index.set(entity.id, entity);
    entityIndexCache.set(entities, index);
  }
  return index;
}

function getBuildingIndex(buildings: readonly Building[]): Map<number, Building> {
  let index = buildingIndexCache.get(buildings);
  if (!index) {
    index = new Map();
    for (const building of buildings) index.set(building.id, building);
    buildingIndexCache.set(buildings, index);
  }
  return index;
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

function parseOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseCampKey(value: unknown): string | null {
  const key = parseOptionalString(value);
  return key && CAMP_KEY_PATTERN.test(key) ? key : null;
}

export function parseBuildRotation(value: unknown): 0 | 90 {
  const n = parseFiniteNumber(value);
  if (n === 90) return 90;
  return 0;
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

function parseCameraRecord(value: unknown): Partial<Camera> | undefined {
  if (value == null || typeof value !== 'object') return undefined;
  return value as Partial<Camera>;
}

/** Clamp corrupted save camera values; resolves target coords + zoom (x/y synced on normalize). */
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
  return { x: targetX, y: targetY, zoom: targetZoom, targetX, targetY, targetZoom };
}

/** Persist/restored pan uses target coords so mid-lerp views do not snap back to map center. */
export function normalizeCameraForSave(cam: Camera): Camera {
  return {
    ...cam,
    x: cam.targetX,
    y: cam.targetY,
    zoom: cam.targetZoom,
  };
}

function normalizeCameraFromSave(raw: Partial<Camera> | undefined, fallback: Camera): Camera {
  return normalizeCameraForSave(sanitizeCamera(raw, fallback));
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
    parseEntityId(data.selectedEntityId)
    ?? parseIdFromLegacyRecord(data.selectedEntity);
  let selectedBuildingId =
    parseEntityId(data.selectedBuildingId)
    ?? parseIdFromLegacyRecord(data.selectedBuilding);
  let hoveredBuildingId =
    parseEntityId(data.hoveredBuildingId)
    ?? parseIdFromLegacyRecord(data.hoveredBuilding);

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

/** Restore view from a saved game payload (backward compatible with v2.0/2.1 saves). */
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
    camera: normalizeCameraFromSave(parseCameraRecord(data.camera), base.camera),
    screenShake: screenShake != null && screenShake >= 0 ? screenShake : base.screenShake,
    selectedEntityId: selection.selectedEntityId,
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
  };
}

export function resolveEntity(world: WorldState, id: number | null): Entity | null {
  if (id == null) return null;
  const entity = getEntityIndex(world.entities).get(id);
  if (!entity?.alive) return null;
  return entity;
}

export function resolveBuilding(world: WorldState, id: number | null): Building | null {
  if (id == null) return null;
  const building = getBuildingIndex(world.buildings).get(id);
  if (!building) return null;
  return building;
}

/** Drop dead entity/building ids before persisting or restoring view selection. */
export function sanitizeViewSelection(world: WorldState, view: ViewState): ViewState {
  let selectedEntityId = view.selectedEntityId;
  let selectedBuildingId = view.selectedBuildingId;
  if (selectedEntityId != null && !resolveEntity(world, selectedEntityId)) {
    selectedEntityId = null;
  }
  if (selectedBuildingId != null && !resolveBuilding(world, selectedBuildingId)) {
    selectedBuildingId = null;
  }
  if (selectedEntityId === view.selectedEntityId && selectedBuildingId === view.selectedBuildingId) {
    return view;
  }
  return { ...view, selectedEntityId, selectedBuildingId };
}

/** Legacy transient world fields kept at the save root for backward compatibility. */
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
      ? parsed.deathParticles as WorldState['deathParticles']
      : [],
    floatingTexts: Array.isArray(parsed.floatingTexts)
      ? parsed.floatingTexts as WorldState['floatingTexts']
      : [],
    notifications: Array.isArray(parsed.notifications)
      ? parsed.notifications as WorldState['notifications']
      : [],
    disasters: Array.isArray(parsed.disasters)
      ? parsed.disasters as WorldState['disasters']
      : [],
  };
}

/** Merge world + view into a serializable save payload (allow-listed world keys + view overlay). */
export function mergeForSave(world: WorldState, view: ViewState): Record<string, unknown> {
  const selection = sanitizeViewSelection(world, view);

  return {
    ...pickWorldFieldsForSave(world),
    ...pickTransientWorldFieldsForSave(world),
    camera: normalizeCameraForSave(selection.camera),
    selectedEntityId: selection.selectedEntityId,
    selectedBuildingId: selection.selectedBuildingId,
    buildMode: selection.buildMode,
    buildRotation: selection.buildRotation,
    showGrid: selection.showGrid,
    showPaths: selection.showPaths,
    showTechTree: selection.showTechTree,
    highlightedCampKey: selection.highlightedCampKey,
    selectedCampKey: selection.selectedCampKey,
    screenShake: selection.screenShake,
  };
}

const CAMERA_LERP = 0.12;

function cameraAtRest(cam: Camera): boolean {
  return (
    Math.abs(cam.x - cam.targetX) < CAMERA_EPS &&
    Math.abs(cam.y - cam.targetY) < CAMERA_EPS &&
    Math.abs(cam.zoom - cam.targetZoom) < CAMERA_EPS
  );
}

export function updateView(view: ViewState, dtMs: number): ViewState {
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

  const nextCamera: Camera = cameraUnchanged
    ? cam
    : { ...cam, x: nextX, y: nextY, zoom: nextZoom };
  return shakeUnchanged
    ? { ...view, camera: nextCamera }
    : { ...view, camera: nextCamera, screenShake: nextShake };
}

export function clampCameraTarget(cam: Camera, worldW: number, worldH: number): Camera {
  const marginX = worldW * 0.02;
  const marginY = worldH * 0.02;
  return {
    ...cam,
    targetX: Math.max(-marginX, Math.min(worldW + marginX, cam.targetX)),
    targetY: Math.max(-marginY, Math.min(worldH + marginY, cam.targetY)),
  };
}

export function moveCameraView(view: ViewState, world: WorldState, dx: number, dy: number): ViewState {
  const cam = { ...view.camera };
  cam.targetX += dx / cam.zoom;
  cam.targetY += dy / cam.zoom;
  return { ...view, camera: clampCameraTarget(cam, world.width, world.height) };
}

/** Zoom toward a screen-space anchor (canvas px). Keeps the world point under the cursor fixed. */
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
  if (Math.abs(newZoom - oldZoom) < CAMERA_EPS) return view;

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

/** Pan camera to a world position (e.g. center on settlers with H). */
export function focusCameraOn(view: ViewState, x: number, y: number, zoom?: number): ViewState {
  const cam = { ...view.camera, targetX: x, targetY: y };
  if (zoom !== undefined) cam.targetZoom = clampCameraZoom(zoom);
  return { ...view, camera: cam };
}

/** Gentle pan toward a map click target — keeps context, unlike full focusCameraOn. */
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