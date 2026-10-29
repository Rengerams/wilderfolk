import type { Building, BuildingType, Camera, Entity, WorldState } from './gameTypes';
import { BuildingType as BuildingTypeEnum } from './gameTypes';
import type { StripBuildPreview } from './stripBuild';
import { pickWorldFieldsForSave } from './saveSchema';
import type { PlaceBuildingFailureReason } from './buildingPlacementLabels';

/**
 * The placement ghost: the snapped point plus the placement owner's verdict on it.
 *
 * A discriminated union rather than two independent fields, because `valid` and `reason` are one
 * fact — a ghost whose reason is `null` is placeable and one with a reason is not. Build it through
 * {@link createBuildGhost} so the two can never disagree.
 */
export type BuildGhost =
  | { x: number; y: number; valid: true; reason: null }
  | { x: number; y: number; valid: false; reason: PlaceBuildingFailureReason };

export function createBuildGhost(
  x: number,
  y: number,
  reason: PlaceBuildingFailureReason | null,
): BuildGhost {
  return reason === null ? { x, y, valid: true, reason: null } : { x, y, valid: false, reason };
}

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
  buildGhost: BuildGhost | null;
  /** Drag preview for wall / road / gate chains. */
  buildStripPreview: StripBuildPreview | null;
  /** Placement rotation for rotatable build types (Road, Wall, Wall Gate). */
  buildRotation: 0 | 90;
  showGrid: boolean;
  showPaths: boolean;
  showTechTree: boolean;
  showLogistics: boolean;
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

export const CAMERA_ZOOM_MIN = 0.2;
export const CAMERA_ZOOM_MAX = 6;
export const CAMERA_ZOOM_DEFAULT = 1.45;
export const CAMERA_ZOOM_STEP_IN = 1.1;
export const CAMERA_ZOOM_STEP_OUT = 0.9;
export const CAMERA_ZOOM_PRESETS: readonly number[] = [0.25, 0.5, 0.75, 1.0, 1.25, 1.45, 1.75, 2.0, 2.5, 3.0];

const CAMERA_EPS = 1e-3;
const CAMERA_LERP = 0.12;
const CAMP_KEY_PATTERN = /^(rival|visitor):/;

/** Safe lazy set to prevent circular import crashes at startup. */
let buildingTypeValuesSet: Set<string> | null = null;
function getBuildingTypeValues(): Set<string> {
  if (!buildingTypeValuesSet) {
    buildingTypeValuesSet = new Set<string>(
      BuildingTypeEnum && typeof BuildingTypeEnum === 'object' ? Object.values(BuildingTypeEnum) : [],
    );
  }
  return buildingTypeValuesSet;
}

/** A new session's opening view: the standard camera, placed on the camp the map cleared. */
export function createInitialViewForWorld(world: WorldState): ViewState {
  const view = createInitialView(world.width, world.height);
  const camp = world.worldMap?.campSite;
  if (!camp) return view;
  // Move the camera itself, not just its target: the first frame shows the camp, not the map centre.
  const aimed = focusCameraOn(view, camp.x, camp.y);
  return { ...aimed, camera: { ...aimed.camera, x: camp.x, y: camp.y } };
}

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
    // Natural valley first; the placement grid remains available as a user toggle.
    showGrid: false,
    showPaths: false,
    showTechTree: false,
    showLogistics: false,
    highlightedCampKey: null,
    selectedCampKey: null,
    favoriteEntityId: null,
  };
}

export function clampCameraZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return CAMERA_ZOOM_DEFAULT;
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
  return typeof value === 'string' && getBuildingTypeValues().has(value);
}

// ============ ENTITY & BUILDING RESOLUTION ============

export function resolveEntity(world: WorldState, id: number | null): Entity | null {
  if (id == null || !world) return null;

  if (world.entityById) {
    const ent = world.entityById.get(id);
    return ent && ent.alive ? ent : null;
  }

  const entities = world.entities ?? [];
  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (ent.id === id) {
      return ent.alive ? ent : null;
    }
  }

  return null;
}

export function resolveBuilding(world: WorldState, id: number | null): Building | null {
  if (id == null || !world) return null;

  const buildings = world.buildings ?? [];
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
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

  const validEntityIds = Array.isArray(data.selectedEntityIds)
    ? data.selectedEntityIds
        .map(parseEntityId)
        .filter((id): id is number => id != null && resolveEntity(world, id) != null)
    : [];

  if (selection.selectedEntityId != null && !validEntityIds.includes(selection.selectedEntityId)) {
    validEntityIds.push(selection.selectedEntityId);
  }

  return {
    ...base,
    camera: normalizeCameraForSave(sanitizeCamera(data.camera as Partial<Camera>, base.camera)),
    screenShake: screenShake != null && screenShake >= 0 ? screenShake : base.screenShake,
    selectedEntityId: selection.selectedEntityId,
    selectedEntityIds: validEntityIds.length > 0 ? validEntityIds : selection.selectedEntityId != null ? [selection.selectedEntityId] : [],
    selectedBuildingId: selection.selectedBuildingId,
    hoveredBuildingId: selection.hoveredBuildingId,
    buildMode: isBuildingType(data.buildMode) ? data.buildMode : null,
    buildGhost: null,
    buildStripPreview: null,
    buildRotation: parseBuildRotation(data.buildRotation),
    showGrid: parseBoolean(data.showGrid, false),
    showPaths: parseBoolean(data.showPaths, false),
    showTechTree: parseBoolean(data.showTechTree, false),
    showLogistics: parseBoolean(data.showLogistics, false),
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
  let selectedEntityIds = (view.selectedEntityIds ?? []).filter((id) => resolveEntity(world, id) != null);
  let selectedBuildingId = view.selectedBuildingId;
  let hoveredBuildingId = view.hoveredBuildingId;
  let favoriteEntityId = view.favoriteEntityId;

  if (selectedEntityId != null && !resolveEntity(world, selectedEntityId)) {
    selectedEntityId = null;
  }

  if (selectedEntityId == null && selectedEntityIds.length > 0) {
    selectedEntityId = selectedEntityIds[selectedEntityIds.length - 1];
  } else if (selectedEntityId != null && !selectedEntityIds.includes(selectedEntityId)) {
    selectedEntityIds.push(selectedEntityId);
  }

  if (selectedBuildingId != null && !resolveBuilding(world, selectedBuildingId)) {
    selectedBuildingId = null;
  }
  if (hoveredBuildingId != null && !resolveBuilding(world, hoveredBuildingId)) {
    hoveredBuildingId = null;
  }
  if (favoriteEntityId != null && !resolveEntity(world, favoriteEntityId)) {
    favoriteEntityId = null;
  }

  if (
    selectedEntityId === view.selectedEntityId &&
    selectedBuildingId === view.selectedBuildingId &&
    hoveredBuildingId === view.hoveredBuildingId &&
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
    hoveredBuildingId,
    favoriteEntityId,
  };
}

export function pickTransientWorldFieldsForSave(world: WorldState): Record<string, unknown> {
  return {
    deathParticles: world.deathParticles ?? [],
    floatingTexts: world.floatingTexts ?? [],
    disasters: world.disasters ?? [],
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
    notifications: [],
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
    hoveredBuildingId: selection.hoveredBuildingId,
    buildMode: selection.buildMode,
    buildRotation: selection.buildRotation,
    showGrid: selection.showGrid,
    showPaths: selection.showPaths,
    showTechTree: selection.showTechTree,
    showLogistics: selection.showLogistics,
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

  const safeDt = Math.min(dtMs, 200);
  const cam = view.camera;
  let nextX = cam.x;
  let nextY = cam.y;
  let nextZoom = cam.zoom;

  if (!cameraAtRest(cam)) {
    const t = 1 - Math.pow(1 - CAMERA_LERP, safeDt / 16.67);
    nextX = cam.x + (cam.targetX - cam.x) * t;
    nextY = cam.y + (cam.targetY - cam.y) * t;
    nextZoom = cam.zoom + (cam.targetZoom - cam.zoom) * t;

    if (Math.abs(nextX - cam.targetX) < CAMERA_EPS) nextX = cam.targetX;
    if (Math.abs(nextY - cam.targetY) < CAMERA_EPS) nextY = cam.targetY;
    if (Math.abs(nextZoom - cam.targetZoom) < CAMERA_EPS) nextZoom = cam.targetZoom;
  }

  const nextShake = view.screenShake > 0.05 ? view.screenShake * Math.pow(0.9, safeDt / 16.67) : 0;
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

export function zoomCameraViewAt(
  view: ViewState,
  factor: number,
  screenX: number,
  screenY: number,
  canvasW: number,
  canvasH: number,
  world?: Pick<WorldState, 'width' | 'height'>,
): ViewState {
  const cam = { ...view.camera };
  const oldZoom = cam.targetZoom;
  // Zooming out stops where the map still covers the viewport, so no empty backdrop shows.
  const newZoom = Math.max(
    clampCameraZoom(oldZoom * factor),
    world ? worldCoverZoom(world, canvasW, canvasH) : CAMERA_ZOOM_MIN,
  );

  if (Math.abs(newZoom - oldZoom) < CAMERA_EPS) {
    return view;
  }

  const worldX = (screenX - canvasW / 2) / oldZoom + cam.targetX;
  const worldY = (screenY - canvasH / 2) / oldZoom + cam.targetY;

  cam.targetZoom = newZoom;
  cam.targetX = worldX - (screenX - canvasW / 2) / newZoom;
  cam.targetY = worldY - (screenY - canvasH / 2) / newZoom;

  const clampedCam = world ? clampCameraTarget(cam, world.width, world.height, canvasW, canvasH) : cam;
  return { ...view, camera: clampedCam };
}

/** Closest zoom at which the map still covers the viewport entirely — below it the empty backdrop shows. */
export function worldCoverZoom(
  world: Pick<WorldState, 'width' | 'height'>,
  canvasW: number,
  canvasH: number,
): number {
  if (world.width <= 0 || world.height <= 0 || canvasW <= 0 || canvasH <= 0) return CAMERA_ZOOM_MIN;
  return clampCameraZoom(Math.max(canvasW / world.width, canvasH / world.height));
}

/** Pins only an axis the map no longer covers, so panning stays free but no empty rim shows. */
export function clampCameraTarget(
  cam: Camera,
  worldW: number,
  worldH: number,
  viewportW?: number,
  viewportH?: number,
): Camera {
  if (!viewportW || !viewportH || worldW <= 0 || worldH <= 0) return cam;
  const zoom = cam.targetZoom > 0 ? cam.targetZoom : CAMERA_ZOOM_DEFAULT;
  const halfW = viewportW / zoom / 2;
  const halfH = viewportH / zoom / 2;
  const targetX = halfW * 2 >= worldW ? worldW / 2 : Math.min(Math.max(cam.targetX, halfW), worldW - halfW);
  const targetY = halfH * 2 >= worldH ? worldH / 2 : Math.min(Math.max(cam.targetY, halfH), worldH - halfH);
  if (targetX === cam.targetX && targetY === cam.targetY) return cam;
  return { ...cam, targetX, targetY };
}

/** Raises the zoom to the cover zoom, then pins the target — for a camera restored or resized below it. */
export function clampCameraToCoverage(
  cam: Camera,
  world: Pick<WorldState, 'width' | 'height'>,
  viewportW: number,
  viewportH: number,
): Camera {
  const cover = worldCoverZoom(world, viewportW, viewportH);
  const zoom = cam.targetZoom >= cover ? cam.targetZoom : cover;
  const covered = zoom === cam.targetZoom
    ? cam
    : { ...cam, x: cam.targetX, y: cam.targetY, zoom, targetZoom: zoom };
  return clampCameraTarget(covered, world.width, world.height, viewportW, viewportH);
}

export function zoomCameraView(
  view: ViewState,
  factor: number,
  canvasW = 800,
  canvasH = 600,
  world?: Pick<WorldState, 'width' | 'height'>,
): ViewState {
  return zoomCameraViewAt(view, factor, canvasW / 2, canvasH / 2, canvasW, canvasH, world);
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
  viewportW?: number,
  viewportH?: number,
): ViewState {
  const cam = { ...view.camera };
  cam.targetX += (x - cam.targetX) * strength;
  cam.targetY += (y - cam.targetY) * strength;
  if (cam.targetZoom < 1.15) {
    cam.targetZoom = Math.min(1.15, cam.targetZoom + 0.04);
  }
  return { ...view, camera: clampCameraTarget(cam, world.width, world.height, viewportW, viewportH) };
}

export function followFavoriteEntity(view: ViewState, world: WorldState): ViewState {
  if (view.favoriteEntityId == null) return view;
  const entity = resolveEntity(world, view.favoriteEntityId);
  if (!entity) {
    return { ...view, favoriteEntityId: null };
  }
  if (Math.abs(view.camera.targetX - entity.x) < CAMERA_EPS && Math.abs(view.camera.targetY - entity.y) < CAMERA_EPS) {
    return view;
  }
  return {
    ...view,
    camera: {
      ...view.camera,
      targetX: entity.x,
      targetY: entity.y,
    },
  };
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
  return [worldToScreenX(x, cam, cw), worldToScreenY(y, cam, ch)];
}

export function worldToScreenX(x: number, cam: Camera, cw: number): number {
  const zoom = cam.zoom > 0 ? cam.zoom : CAMERA_ZOOM_DEFAULT;
  return (x - cam.x) * zoom + cw / 2;
}

export function worldToScreenY(y: number, cam: Camera, ch: number): number {
  const zoom = cam.zoom > 0 ? cam.zoom : CAMERA_ZOOM_DEFAULT;
  return (y - cam.y) * zoom + ch / 2;
}

export function screenToWorld(
  sx: number,
  sy: number,
  cam: Camera,
  cw: number,
  ch: number,
): [number, number] {
  const zoom = cam.zoom > 0 ? cam.zoom : CAMERA_ZOOM_DEFAULT;
  return [(sx - cw / 2) / zoom + cam.x, (sy - ch / 2) / zoom + cam.y];
}