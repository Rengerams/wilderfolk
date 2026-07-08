import type { Building, BuildingType, Camera, Entity, WorldState } from './gameTypes';
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

export function clampCameraZoom(zoom: number): number {
  return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Clamp corrupted save camera values; fall back to map center when coordinates are invalid. */
export function sanitizeCamera(raw: Partial<Camera> | undefined, fallback: Camera): Camera {
  if (!raw) return fallback;
  const zoom = isFiniteNumber(raw.zoom) ? clampCameraZoom(raw.zoom) : fallback.zoom;
  const targetZoom = isFiniteNumber(raw.targetZoom)
    ? clampCameraZoom(raw.targetZoom)
    : zoom;
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
  const x = isFiniteNumber(raw.x) ? raw.x : targetX;
  const y = isFiniteNumber(raw.y) ? raw.y : targetY;
  return { x, y, zoom, targetX, targetY, targetZoom };
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

/** Restore view from a saved game payload (backward compatible with v2.0/2.1 saves). */
export function createViewFromSave(
  data: Record<string, unknown>,
  world: WorldState
): ViewState {
  const w = (data.width as number) ?? world.width;
  const h = (data.height as number) ?? world.height;
  const base = createInitialView(w, h);
  const camera = data.camera as Partial<Camera> | undefined;
  const selectedEntity = data.selectedEntity as Entity | null | undefined;
  const selectedBuilding = data.selectedBuilding as Building | null | undefined;
  const hoveredBuilding = data.hoveredBuilding as Building | null | undefined;
  const selectedEntityId = data.selectedEntityId as number | null | undefined;
  const selectedBuildingId = data.selectedBuildingId as number | null | undefined;

  let resolvedEntityId = selectedEntityId ?? selectedEntity?.id ?? null;
  let resolvedBuildingId = selectedBuildingId ?? selectedBuilding?.id ?? null;
  if (resolvedEntityId != null && !resolveEntity(world, resolvedEntityId)) {
    resolvedEntityId = null;
  }
  if (resolvedBuildingId != null && !resolveBuilding(world, resolvedBuildingId)) {
    resolvedBuildingId = null;
  }

  return {
    ...base,
    camera: normalizeCameraFromSave(camera, base.camera),
    selectedEntityId: resolvedEntityId,
    selectedBuildingId: resolvedBuildingId,
    hoveredBuildingId: hoveredBuilding?.id ?? null,
    buildMode: (data.buildMode as BuildingType | null) ?? null,
    buildGhost: (data.buildGhost as ViewState['buildGhost']) ?? null,
    buildStripPreview: null,
    buildRotation: (data.buildRotation as 0 | 90) === 90 ? 90 : 0,
    showGrid: (data.showGrid as boolean) ?? true,
    showPaths: (data.showPaths as boolean) ?? false,
    showTechTree: false,
    highlightedCampKey: null,
    selectedCampKey: null,
  };
}

export function resolveEntity(world: WorldState, id: number | null): Entity | null {
  if (id == null) return null;
  const entity = world.entities.find((e) => e.id === id);
  if (!entity?.alive) return null;
  return entity;
}

export function resolveBuilding(world: WorldState, id: number | null): Building | null {
  if (id == null) return null;
  const building = world.buildings.find((b) => b.id === id);
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

/** Merge world + view into a serializable save payload (allow-listed world keys + view overlay). */
export function mergeForSave(world: WorldState, view: ViewState): Record<string, unknown> {
  const selection = sanitizeViewSelection(world, view);

  return {
    ...pickWorldFieldsForSave(world),
    camera: normalizeCameraForSave(selection.camera),
    selectedEntityId: selection.selectedEntityId,
    selectedBuildingId: selection.selectedBuildingId,
    buildMode: selection.buildMode,
    buildRotation: selection.buildRotation,
    showGrid: selection.showGrid,
    showPaths: selection.showPaths,
    showTechTree: selection.showTechTree,
    screenShake: 0,
    deathParticles: [],
    floatingTexts: [],
    notifications: [],
    disasters: [],
    activeEvent: null,
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

export function clampCameraTarget(cam: Camera, worldW: number, worldH: number): void {
  const marginX = worldW * 0.02;
  const marginY = worldH * 0.02;
  cam.targetX = Math.max(-marginX, Math.min(worldW + marginX, cam.targetX));
  cam.targetY = Math.max(-marginY, Math.min(worldH + marginY, cam.targetY));
}

export function moveCameraView(view: ViewState, world: WorldState, dx: number, dy: number): ViewState {
  const cam = { ...view.camera };
  cam.targetX += dx / cam.zoom;
  cam.targetY += dy / cam.zoom;
  clampCameraTarget(cam, world.width, world.height);
  return { ...view, camera: cam };
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
  clampCameraTarget(cam, world.width, world.height);
  return { ...view, camera: cam };
}

export function syncScreenShakeFromWorld(view: ViewState, world: WorldState): ViewState {
  if (world.screenShakeImpulse <= view.screenShake) return view;
  return { ...view, screenShake: world.screenShakeImpulse };
}

export function clearScreenShakeImpulse(world: WorldState): void {
  world.screenShakeImpulse = 0;
}