import { applyLeaderHousePhase } from './leaderHouse';
import { moveResident } from './residencyReconciliation';
import type { WorldState, Entity, TerrainTile } from './gameTypes';
import { EntityType, BuildingType, JobType, TerrainType, WeatherType, DEFAULT_WORKSHOP_RECIPE_ID, MAP_SIZE_DIMENSIONS, MapSize, PATH_CELL, createInitialResearchNodes } from './gameTypes';
import { isWalkableTerrainType, setTileOverride, tileAt, Walkability } from './terrain/terrainGrid';
import { INITIAL_CHALLENGES } from './challenges';
import { normalizeLifetimeStats } from './stats';
import {
  mergeForSave,
  createViewFromSave,
  restoreTransientWorldFieldsFromSave,
  type ViewState,
} from './viewState';
import { ENTITY_PERSISTED_FIELDS, WORLD_STATE_SAVE_KEYS } from './saveSchema';
import { generateWorldMap } from './terrainGen';
import { legacyTerrainSeed } from './terrain/terragen';
import {
  getCalendarDay, getHourOfDay, getAbsoluteCalendarDay, migrateHumanAges, rebuildChildrenIds,
  TICKS_PER_DAY, LEGACY_TICKS_PER_DAY, DAYS_PER_YEAR,
  assignMissingResidences,
  repairJuvenileAssignmentsOnLoad,
} from './dayCycle';
import { displayYear } from './dayCycleClock';
import { mergeCombatResearchNodes } from './combat';
import { loadAutoSavePreference } from './preferences';
import { logEvent, repairEventLogOnLoad, syncEventLogIdFromState } from './eventLog';
import { pickHumanVariant } from './humanSprites';
import { migrateLegacyMoonHowler, syncMoonHowlerForms } from './moonHowler';
import { reconcileFamilyReferencesAfterRemoval } from './humanLifecycleCleanup';
import { isPlayerHuman } from './playerHuman';
import { GAME_VERSION } from './version';
import { ensureEntitySkills } from './skills';
import { TICKED_SPECIES } from './entityFactory';
import { normalizeWorkSchedule } from './workSchedule';
import { normalizeWorkforcePolicy } from './workforcePolicy';
import { normalizeVenueSchedule } from './venueSchedule';
import { normalizeFestivalState, repairStaleFestivalOnLoad } from './dailyWorldEvents';

import { seedTutorialSeenForExistingState } from './contextualTutorial';
import { adoptSimSeedFromWorld, restoreSimRng, snapshotSimRng, worldSimRngSnapshot } from './simRng';
import { syncResearchUnlocks } from './research';
import { assignMissingWorkers, removeWorkerTransition } from './workforce';
import { syncBigNewsIdFromState } from './simEffects';
import { rebuildEntityByIdMap } from './entityIndex';
import {
  getCampDistancePixels,
  getCampDistanceTiles,
  getIncomingRaidExpireTicks,
} from './frontierCombat';
import { computeWildlifeCounts } from './entityCounts';
import { BASE_IRON_STORAGE, computeStorageMax, ensureFullTradeRoutes } from './economy';
import { enrichTradeRoute, scheduleTradeRouteDeparture } from './tradeCaravans';
import { clearAllFactionWanderStates } from './factionWander';
import { rebuildBeautyGridFromWorld } from './beautyGrid';
import { validateVillageLeaderOnLoad } from './villageLeadership';
import { syncGenealogyRegistry } from './genealogyRegistry';
import { ensureValleyEcologyOnLoad } from './ecologyStage';
import { migrateVillageForgeOnLoad } from './forge';
import { nearestWalkableWorldPoint } from './pathfinding';
import { retireLegacyCampStructures } from './rivalEvents';

const SAVE_KEY = 'ecosim_save';

/**
 * The most a save payload may weigh before it leaves the browser slot for a file.
 *
 * One slot shares a typical ~5 MiB localStorage quota and browsers store UTF-16, two bytes per code
 * unit, so this ceiling (4.0 MB stored) keeps a write clear of a refused or truncated one.
 */
export const BROWSER_SLOT_BUDGET_BYTES = 4_000_000;

/** localStorage stores UTF-16, so a serialized code unit costs two bytes of the quota. */
const STORED_BYTES_PER_CODE_UNIT = 2;

/** The map sizes whose colony will not fit the one browser slot — Large and Huge. */
const FILE_ONLY_MAP_SIZES: readonly MapSize[] = [MapSize.Large, MapSize.Huge];

/** Why a colony's save goes to a file instead of the browser slot. */
export type FileSaveReason = 'map-too-large' | 'payload-too-large';

/** Where a colony's payload has to be written. */
export type SaveRoute =
  | { target: 'slot' }
  | { target: 'file'; reason: FileSaveReason };

/** Move humans restored onto water, decor or a completed wall onto the nearest valid ground cell. */
function repairLoadedHumanGround(world: WorldState): number {
  if (!world.worldMap) return 0;
  let repaired = 0;
  for (const entity of world.entities) {
    if (!entity.alive || entity.type !== EntityType.Human) continue;
    const point = nearestWalkableWorldPoint(world.worldMap, world.buildings, entity.x, entity.y);
    if (!point || (point.x === entity.x && point.y === entity.y)) continue;
    entity.x = point.x;
    entity.y = point.y;
    entity.vx = 0;
    entity.vy = 0;
    repaired++;
  }
  return repaired;
}

/** The serialized `_version` text `buildSaveData` writes, in `JSON.stringify`'s own encoding. */
/** Last release with a save layout supported by the current load migrations. */
const COMPATIBLE_SAVE_VERSIONS = new Set([GAME_VERSION, '0.6.5.0']);

/** Restore entity fields that must survive save/load (see ENTITY_PERSISTED_FIELDS). */
function migrateEntityPersistedFields(entity: Entity, saved: Partial<Entity>): void {
  for (const key of ENTITY_PERSISTED_FIELDS) {
    const value = saved[key];
    if (value !== undefined) {
      (entity as unknown as Record<string, unknown>)[key] = value;
    }
  }
  for (const assignment of [entity, entity.moonHowlerSaved]) {
    if (!assignment) continue;
    const legacy = assignment as typeof assignment & { homeBuildingId?: unknown };
    if (!Object.hasOwn(assignment, 'workerBuildingId')
      && typeof legacy.homeBuildingId === 'number'
      && Number.isSafeInteger(legacy.homeBuildingId) && legacy.homeBuildingId >= 0) {
      assignment.workerBuildingId = legacy.homeBuildingId;
    }
    delete legacy.homeBuildingId;
  }
  ensureEntitySkills(entity);
}

/**
 * `slotWarning` is present when the file downloaded but the **browser slot** could not be written
 * (storage full, or storage blocked). The caller must not mark the slot as present in that case:
 * the toast used to say success either way, so Load was offered against a stale or empty slot and
 * could silently restore an older colony with no date shown anywhere.
 *
 * `fileReason` means the slot was never attempted: the payload left for a file instead
 * (`decideSaveRoute`), so a caller must not advertise the slot as written either.
 */
export type SaveResult =
  | { success: true; slotWarning?: string; fileReason?: FileSaveReason }
  | { success: false; error: string; fileReason?: FileSaveReason };

/** Why a save payload was refused — `not-a-save` is valid JSON that is not a save at all. */
export type SaveReadFailure = 'empty' | 'unreadable' | 'malformed' | 'not-a-save' | 'version-mismatch';

export type SaveReadResult =
  | { valid: false; reason: SaveReadFailure; detail?: string }
  | { valid: true; parsed: Record<string, unknown> };

/** Why a full load attempt failed: the read refusal, or a payload that parsed but would not restore. */
export type SaveLoadFailure = { reason: SaveReadFailure | 'unrestorable'; detail?: string };

/** A load attempt's outcome — the session, or the reason the player has to be told. */
export type SaveLoadOutcome =
  | { ok: true; world: WorldState; view: ViewState }
  | ({ ok: false } & SaveLoadFailure);

function pickWorldStateFromSave(parsed: Record<string, unknown>): Partial<WorldState> {
  const out: Partial<WorldState> = {};
  for (const key of WORLD_STATE_SAVE_KEYS) {
    if (key in parsed) (out as Record<string, unknown>)[key] = parsed[key];
  }
  return out;
}

/** A JSON value that can carry save fields: not null, not an array. */
function isSaveObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Names what the payload actually was, for a refusal detail a player can repeat back. */
function describeJsonShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/**
 * Parse save JSON from localStorage or a downloaded .json file.
 *
 * A refusal always says *why*. Before this, every cause — an empty slot, a truncated
 * file, a save from another build — collapsed into the same `{ valid: false }`, so the
 * player got a guessed message ("file may be corrupted" / "from a different build")
 * while the real cause sat in the console.
 *
 * The parsed value is checked for the save *shape* before `_version` is read. `JSON.parse`
 * happily returns `null`, `[]` or `'x'`, and reading `_version` off those threw a `TypeError`
 * out of an event handler: the file-load path (`App.handleLoadFromFile` via `FileReader.onload`)
 * has no try/catch of its own, so a `null` payload produced no toast, no menu close and no
 * visible cause. Every non-object payload is now a refusal, not an exception.
 */
export function parseSaveJson(raw: string | null | undefined): SaveReadResult {
  if (!raw || !raw.trim()) return { valid: false, reason: 'empty' };
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error('Save parse failed:', e);
    return { valid: false, reason: 'malformed', detail: e instanceof Error ? e.message : String(e) };
  }
  if (!isSaveObject(payload)) {
    const detail = `payload is ${describeJsonShape(payload)}, not a save object`;
    console.error('Save parse failed: payload is not a save object');
    return { valid: false, reason: 'not-a-save', detail };
  }
  const parsed = payload;
  const version = parsed._version;
  // A valid JSON object without a usable `_version` is not a save of any build, so it gets its own
  // reason instead of being reported as another build's.
  if (typeof version !== 'string' && typeof version !== 'number') {
    const detail = version === undefined ? 'no _version field' : `_version is ${describeJsonShape(version)}`;
    return { valid: false, reason: 'not-a-save', detail };
  }
  if (typeof version !== 'string' || !COMPATIBLE_SAVE_VERSIONS.has(version)) {
    return {
      valid: false,
      reason: 'version-mismatch',
      detail: `save ${String(version)} vs build ${GAME_VERSION}`,
    };
  }
  return { valid: true, parsed };
}

/** Player-facing explanation for a refused save — one message per real cause. */
export function describeSaveReadFailure(
  failure: { reason: SaveReadFailure; detail?: string },
): string {
  switch (failure.reason) {
    case 'empty':
      return 'No save data found — the file is empty, or the browser save slot is clear.';
    case 'unreadable':
      return 'Could not read the browser save slot (storage unavailable or blocked).';
    case 'malformed':
      return `That save file is not valid JSON${failure.detail ? ` (${failure.detail})` : ''} — it is damaged or truncated.`;
    case 'not-a-save':
      return `That is not a Wilderfolk save${failure.detail ? ` (${failure.detail})` : ''} — load a save this build exported.`;
    case 'version-mismatch':
      return `This save version is not supported${failure.detail ? ` (${failure.detail})` : ''}. Saves from v0.6.5.0 and v${GAME_VERSION} can be loaded; keep the original save file.`;
  }
}

/**
 * Player-facing message for a refused *load*: a read refusal (via `describeSaveReadFailure`) or a
 * payload that parsed but could not be restored.
 *
 * The `unrestorable` detail (the field that was missing or mistyped) is carried into the message:
 * "could not be restored" alone told the player nothing and left the one fact worth reporting in the
 * console.
 */
export function describeSaveLoadOutcome(failure: SaveLoadFailure): string {
  if (failure.reason === 'unrestorable') {
    return `The save parsed but could not be restored${failure.detail ? ` (${failure.detail})` : ''} — the failing step is in the browser console (F12).`;
  }
  return describeSaveReadFailure({ reason: failure.reason, detail: failure.detail });
}

/**
 * What a save version means, stated **before** the player hits a refusal (roadmap T4).
 *
 * The refusal path already names both versions (`describeSaveReadFailure`); this is the same rule
 * said up front. It is also the one place that wording lives, so the menu cannot drift from the
 * message a refused load shows.
 */
export function describeSaveCompatibility(): string {
  return `This build is v${GAME_VERSION}. Saves from v0.6.5.0 and v${GAME_VERSION} are supported. Keep backups of original save files when upgrading.`;
}

export function readSavePayload(): SaveReadResult {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { valid: false, reason: 'empty' };
    return parseSaveJson(raw);
  } catch (e) {
    console.error('Save read failed:', e);
    return { valid: false, reason: 'unreadable', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Build the JSON object written to browser storage or a .json file. */
export function buildSaveData(world: WorldState, view: ViewState): Record<string, unknown> {
  syncGenealogyRegistry(world);
  const persistable = stripRuntimeWorldFields(world);
  return {
    ...mergeForSave(persistable, view),
    simRng: worldSimRngSnapshot(world),
    worldMap: compactWorldMapForSave(persistable.worldMap),
    _savedAt: Date.now(),
    _version: GAME_VERSION,
    _ticksPerDay: TICKS_PER_DAY,
  };
}

/**
 * The filename a downloaded colony save carries. It takes the **stored** year and prints the one the
 * player reads, so the file agrees with the clock in the header instead of trailing it by one.
 */
export function buildSaveFilename(villageName: string, year: number, dayInYear: number): string {
  const safe = (villageName || 'village')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'village';
  return `wilderfolk-${safe}-Y${displayYear(year)}-D${dayInYear}.json`;
}

/**
 * Where this colony's save has to go. A Large or Huge map, and any payload past
 * `BROWSER_SLOT_BUDGET_BYTES`, leaves the browser slot for an external file.
 */
export function decideSaveRoute(world: WorldState, json: string): SaveRoute {
  const size = world.worldMap?.size;
  if (size !== undefined && FILE_ONLY_MAP_SIZES.includes(size)) {
    return { target: 'file', reason: 'map-too-large' };
  }
  if (json.length * STORED_BYTES_PER_CODE_UNIT > BROWSER_SLOT_BUDGET_BYTES) {
    return { target: 'file', reason: 'payload-too-large' };
  }
  return { target: 'slot' };
}

/** Why the slot cannot hold this colony, in the player's words. */
function fileSaveCause(reason: FileSaveReason): string {
  return reason === 'map-too-large'
    ? 'This valley is too large for the in-game save slot'
    : 'This colony is too big for the in-game save slot';
}

/** Told after a save went to a file instead of the slot: why, and how to load it back. */
export function describeFileSaveReason(reason: FileSaveReason): string {
  return `${fileSaveCause(reason)} — saved as a file. Load it with Load from file.`;
}

/** Told when a save no user gesture asked for stands down instead of downloading. */
export function describeCadenceFileSave(reason: FileSaveReason): string {
  return `${fileSaveCause(reason)} — auto-save is off here. Save by hand with Save to file.`;
}

/** Download colony save as a file; the browser slot is written only when the payload fits it. */
export function downloadSaveFile(world: WorldState, view: ViewState): SaveResult {
  const saveData = buildSaveData(world, view);
  return downloadSaveJson(world, JSON.stringify(saveData));
}

function downloadSaveJson(world: WorldState, json: string): SaveResult {
  try {
    const route = decideSaveRoute(world, json);
    let slotWarning: string | undefined;
    if (route.target === 'slot') {
      try {
        localStorage.setItem(SAVE_KEY, json);
      } catch {
        // The download still works, so this is a warning rather than a failure — but it must be
        // reported, because the caller otherwise enables Load against a slot it did not write.
        slotWarning = 'Saved to a file — the browser save slot is full, so Load will not see this.';
      }
    }
    if (typeof document !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = buildSaveFilename(world.villageName, world.year, world.dayInYear);
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    if (route.target === 'file') {
      return slotWarning
        ? { success: true, fileReason: route.reason, slotWarning }
        : { success: true, fileReason: route.reason };
    }
    return slotWarning ? { success: true, slotWarning } : { success: true };
  } catch (e) {
    console.error('Save download failed:', e);
    return { success: false, error: 'Could not download save file' };
  }
}

function compactWorldMapForSave(worldMap: WorldState['worldMap']) {
  if (!worldMap) return null;
  return {
    seed: worldMap.seed,
    preset: worldMap.preset,
    size: worldMap.size,
    width: worldMap.width,
    height: worldMap.height,
    /**
     * The sparse per-tile overrides, as `[key, tile]` pairs.
     *
     * They are the **only** record of terrain the player changed — building placement clears forest
     * under a footprint — and the compact save regenerates the ground from its seed, so without them
     * every building's cleared ground came back as forest after a load: canopy repainted over houses,
     * and `tileAt` reported Forest under a building for the rest of the game. The key is the owner's
     * own encoding (`y * width + x`), which the regenerated map shares, so no tile arithmetic is
     * needed here. A `Map` is not JSON, hence the pairs.
     */
    _overrides: worldMap.overrides ? [...worldMap.overrides.entries()] : undefined,
    /** The resolved noise seed, so the valley regenerates exactly — see `terrainSeedFor`. */
    _terrainSeed: worldMap.terrainSeed,
    _compact: true as const,
  };
}

/**
 * The largest pixel span one axis of a map the game offers has. `MAP_SIZE_DIMENSIONS` is the source of
 * truth, so a preset the owner raises raises this.
 *
 * The world's own dimensions are the ones `generateWorldMap` allocates typed arrays from, so a pair no
 * preset could be (the largest width against the largest height) must be refused by name. A single
 * maximum shared by both axes let exactly that pair through.
 */
function maxSavedMapPixelsForAxis(axis: 'width' | 'height'): number {
  let maxPixels = 0;
  for (const dimension of Object.values(MAP_SIZE_DIMENSIONS)) {
    maxPixels = Math.max(maxPixels, dimension[axis]);
  }
  return maxPixels;
}

/**
 * The largest tile grid the shipped presets can produce. `restoreWorldMapFromSave` multiplies a save's
 * tile dimensions by `PATH_CELL` when the payload carries no pixel size of its own, and hands the result
 * to `generateWorldMap`, which allocates typed
 * arrays for the whole surface — so an unbounded dimension pair lets a crafted file choose the
 * allocation (a 4000 × 3000 pair loads; a negative one surfaces a raw `RangeError`).
 */
function maxSavedMapTiles(): number {
  return Math.ceil(
    Math.max(maxSavedMapPixelsForAxis('width'), maxSavedMapPixelsForAxis('height')) / PATH_CELL,
  );
}

function isUsableMapTileCount(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    && value <= maxSavedMapTiles()
  );
}

/**
 * Re-apply the saved per-tile overrides onto a freshly regenerated map.
 *
 * Delegates the key decoding and cache invalidation to `setTileOverride`, which owns both — a local
 * `map.overrides.set()` would leave the map's derived-tile projection cache holding the pre-load
 * ground for exactly the tiles being restored.
 */
function applySavedTerrainOverrides(
  map: WorldState['worldMap'],
  overrides: unknown,
): WorldState['worldMap'] {
  if (!map || !Array.isArray(overrides) || overrides.length === 0) return map;
  for (const entry of overrides) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [key, tile] = entry as [unknown, unknown];
    if (typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0) continue;
    if (!tile || typeof tile !== 'object') continue;
    const candidate = tile as Partial<TerrainTile>;
    if (!TERRAIN_TYPE_VALUES.has(candidate.type)) continue;
    if (!isFiniteNumber(candidate.elevation)) continue;
    if (!isFiniteNumber(candidate.moisture)) continue;
    if (!isFiniteNumber(candidate.variation)) continue;
    setTileOverride(map, key % map.width, Math.floor(key / map.width), {
      type: candidate.type as TerrainTile['type'],
      elevation: candidate.elevation,
      moisture: candidate.moisture,
      variation: candidate.variation,
    });
  }
  return map;
}

function restoreWorldMapFromSave(parsed: {
  worldMap?: (WorldState['worldMap'] & { _compact?: boolean; _overrides?: unknown; _terrainSeed?: unknown }) | null;
  width?: unknown;
  height?: unknown;
  buildings?: unknown;
}): WorldState['worldMap'] {
  if (!parsed.worldMap) return null;
  // Only a compact save (`_compact: true`) is a seed/preset reference to regenerate below; every
  // other save carries its own map data and is restored as it was written. The old test also
  // required a `tiles` array, which the four-layer map model no longer stores, so it was never
  // true and a full save was silently regenerated instead of restored.
  if (!parsed.worldMap._compact) {
    return parsed.worldMap;
  }
  const wm = parsed.worldMap;
  const overrides = wm._overrides;
  const storedTerrainSeed = isFiniteNumber(wm._terrainSeed) ? wm._terrainSeed : undefined;
  /** Regenerate the valley, with the save's recorded seed when it has one. */
  const regenerateTerrain = (terrainSeed?: number): WorldState['worldMap'] => {
    if (isUsableMapTileCount(wm.width) && isUsableMapTileCount(wm.height)) {
      // Tiles are `ceil(px / PATH_CELL)`, so multiplying back is lossy — 4096 px stores as 410 tiles and
      // regenerates 4100, one path column past the original. The payload's own pixels win when present.
      const pixelWidth = isFiniteNumber(parsed.width) ? parsed.width : wm.width * PATH_CELL;
      const pixelHeight = isFiniteNumber(parsed.height) ? parsed.height : wm.height * PATH_CELL;
      return applySavedTerrainOverrides(
        generateWorldMap(
          pixelWidth,
          pixelHeight,
          wm.seed,
          wm.size ?? 'medium',
          wm.preset ?? 'continental',
          terrainSeed,
        ),
        overrides,
      );
    }
    return applySavedTerrainOverrides(
      generateWorldMap(wm.size ?? 'medium', wm.preset ?? 'continental', wm.seed),
      overrides,
    );
  };

  const map = regenerateTerrain(storedTerrainSeed);
  // A pre-offset save carries no terrain seed, and only its own placements can tell whether the
  // current rule regenerated the valley it was played in. A completed fishing dock is the witness:
  // its footprint rule needs water, and the legacy rule is the one that put it there.
  if (storedTerrainSeed !== undefined || !completedFishingSpotNeedsWater(map, parsed.buildings)) {
    return map;
  }
  return regenerateTerrain(legacyTerrainSeed(wm.seed));
}

/**
 * Whether a completed Fishing Spot — whose placement rule requires water inside its footprint — stands
 * on a map with none under it, which says the regenerated valley is not the one it was built on.
 */
function completedFishingSpotNeedsWater(map: WorldState['worldMap'], savedBuildings: unknown): boolean {
  if (!map) return false;
  return completedFishingSpots(savedBuildings).some((spot) => !fishingSpotFootprintHasWater(map, spot));
}

/** The footprint geometry a water test needs, read off a raw save element. */
interface SavedFootprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The completed Fishing Spots of a raw save's building list, with usable geometry only. */
function completedFishingSpots(savedBuildings: unknown): SavedFootprint[] {
  if (!Array.isArray(savedBuildings)) return [];
  const spots: SavedFootprint[] = [];
  for (const element of savedBuildings) {
    if (!isSaveObject(element)) continue;
    if (element.type !== BuildingType.FishingSpot || element.completed !== true) continue;
    if (!isFiniteNumber(element.x) || !isFiniteNumber(element.y)) continue;
    spots.push({
      x: element.x,
      y: element.y,
      width: isFiniteNumber(element.width) && element.width > 0 ? element.width : PATH_CELL,
      height: isFiniteNumber(element.height) && element.height > 0 ? element.height : PATH_CELL,
    });
  }
  return spots;
}

/** Whether any water cell lies inside a footprint, sampled at half a tile and one tile wide. */
function fishingSpotFootprintHasWater(
  map: NonNullable<WorldState['worldMap']>,
  footprint: SavedFootprint,
): boolean {
  const halfW = footprint.width / 2;
  const halfH = footprint.height / 2;
  const margin = PATH_CELL;
  const step = PATH_CELL / 2;
  for (let y = footprint.y - halfH - margin; y <= footprint.y + halfH + margin; y += step) {
    for (let x = footprint.x - halfW - margin; x <= footprint.x + halfW + margin; x += step) {
      if (terrainHasWaterAt(map, x, y)) return true;
    }
  }
  return false;
}

/** Whether the regenerated ground under a world point is water; off the map counts as dry land. */
function terrainHasWaterAt(map: NonNullable<WorldState['worldMap']>, worldX: number, worldY: number): boolean {
  const tx = Math.floor(worldX / PATH_CELL);
  const ty = Math.floor(worldY / PATH_CELL);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  if (map.pathGrid) return map.pathGrid[ty * map.width + tx] === Walkability.Water;
  const tile = tileAt(map, tx, ty);
  return !!tile && !isWalkableTerrainType(tile.type);
}

/** Strip per-tick runtime indexes before persistence (not in WORLD_STATE_SAVE_KEYS). */
function stripRuntimeWorldFields(world: WorldState): WorldState {
  const {
    entityByType: _entityByType,
    grassGrid: _grassGrid,
    mobileGrid: _mobileGrid,
    humanSocialGrid: _humanSocialGrid,
    treeGrid: _treeGrid,
    scentGrid: _scentGrid,
    roadAvoidance: _roadAvoidance,
    roadAvoidanceStamp: _roadAvoidanceStamp,
    adjacency: _adjacency,
    entityById: _entityById,
    beautyGrid: _beautyGrid,
    ...serializable
  } = world;
  return serializable;
}

/** Scale absolute tick values when day length changed between save and load. */
function scaleTickValue(value: unknown, scale: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value * scale);
}

/** Split the old shared Guard job using the worker's authoritative workplace. */
export function migrateLegacySecurityRoles(world: WorldState): void {
  const buildingsById = new Map((world.buildings ?? []).map((building) => [building.id, building]));
  for (const entity of world.entities ?? []) {
    if (entity.type !== EntityType.Human || entity.job !== JobType.Guard) continue;
    const workplace = entity.workerBuildingId == null ? undefined : buildingsById.get(entity.workerBuildingId);
    if (workplace?.type === BuildingType.Barracks) {
      entity.job = JobType.Soldier;
      continue;
    }
    if (workplace?.type === BuildingType.Prison) {
      entity.job = JobType.PrisonGuard;
    }
  }
}

/**
 * Old saves used 24 ticks/day (1 tick = 1 hour). Current builds use TICKS_PER_DAY.
 * Scale world.tick and deadline fields so calendar day + remaining durations stay correct.
 */
function migrateTickTimeline(
  world: WorldState,
  savedTicksPerDay: number,
): void {
  if (!Number.isFinite(savedTicksPerDay) || savedTicksPerDay <= 0) return;
  if (savedTicksPerDay === TICKS_PER_DAY) return;
  const scale = TICKS_PER_DAY / savedTicksPerDay;

  world.tick = Math.round((world.tick ?? 0) * scale);

  const scaleField = (obj: Record<string, unknown>, key: string) => {
    const next = scaleTickValue(obj[key], scale);
    if (next !== undefined) obj[key] = next;
  };

  scaleField(world as unknown as Record<string, unknown>, 'townHallFestivalCooldownUntilTick');
  scaleField(world as unknown as Record<string, unknown>, 'renffrChatterUntilTick');

  for (const e of world.entities ?? []) {
    const rec = e as unknown as Record<string, unknown>;
    scaleField(rec, 'prisonerUntilTick');
    scaleField(rec, 'scandalCooldownUntilTick');
    scaleField(rec, 'griefUntilTick');
    scaleField(rec, 'hotelStayUntilTick');
    scaleField(rec, 'reproductionCooldown');
    scaleField(rec, 'pregnancyProgress');
    scaleField(rec, 'pregnancyDueProgress');

    const saved = rec.moonHowlerSaved;
    if (saved && typeof saved === 'object') {
      scaleField(saved as Record<string, unknown>, 'pregnancyProgress');
      scaleField(saved as Record<string, unknown>, 'pregnancyDueProgress');
    }
  }

  for (const route of world.tradeRoutes ?? []) {
    const rec = route as unknown as Record<string, unknown>;
    scaleField(rec, 'nextDepartureTick');
    scaleField(rec, 'caravanWaitTicks');
  }

  if (world.electionCeremony) {
    const rec = world.electionCeremony as unknown as Record<string, unknown>;
    scaleField(rec, 'phaseTicksLeft');
    scaleField(rec, 'startedAtTick');
    scaleField(rec, 'endsAtTick');
  }

  for (const evt of world.pendingRaidEvents ?? []) {
    const rec = evt as unknown as Record<string, unknown>;
    scaleField(rec, 'createdAtTick');
    scaleField(rec, 'expiresAtTick');
  }
  for (const evt of world.pendingOutgoingRaidEvents ?? []) {
    const rec = evt as unknown as Record<string, unknown>;
    scaleField(rec, 'createdAtTick');
    scaleField(rec, 'expiresAtTick');
  }
  for (const evt of world.pendingDiplomacyEvents ?? []) {
    const rec = evt as unknown as Record<string, unknown>;
    scaleField(rec, 'createdAtTick');
    scaleField(rec, 'expiresAtTick');
    scaleField(rec, 'startedAtTick');
  }
  if (world.festival) {
    const rec = world.festival as unknown as Record<string, unknown>;
    scaleField(rec, 'startedAtTick');
    scaleField(rec, 'endsAtTick');
  }
  for (const evt of world.pendingStoryEvents ?? []) {
    const rec = evt as unknown as Record<string, unknown>;
    scaleField(rec, 'createdAtTick');
    scaleField(rec, 'expiresAtTick');
  }
}

/**
 * A manual save always exports a JSON file. The browser slot is written too when the payload fits it,
 * so Load stays in step, and a slot that cannot be written is reported, never silently dropped.
 */
export function saveGame(world: WorldState, view: ViewState): SaveResult {
  let json: string;
  try {
    json = JSON.stringify(buildSaveData(world, view));
  } catch (e) {
    console.error('Save build failed:', e);
    return { success: false, error: 'Save failed — check browser storage permissions' };
  }
  return downloadSaveJson(world, json);
}

/** Save to the browser slot only — the path a save with no user gesture may take. */
export function saveGameToSlot(world: WorldState, view: ViewState): SaveResult {
  let json: string;
  try {
    json = JSON.stringify(buildSaveData(world, view));
  } catch (e) {
    console.error('Save build failed:', e);
    return { success: false, error: 'Save failed — check browser storage permissions' };
  }
  const route = decideSaveRoute(world, json);
  if (route.target === 'file') {
    return { success: false, error: describeCadenceFileSave(route.reason), fileReason: route.reason };
  }
  return writeSaveSlot(json);
}

function writeSaveSlot(json: string): SaveResult {
  try {
    localStorage.setItem(SAVE_KEY, json);
    return { success: true };
  } catch (e) {
    const error =
      e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'Storage full — use Save to file, or clear browser data'
        : 'Save failed — check browser storage permissions';
    return { success: false, error };
  }
}

/** One-time legacy migration — Church manual staffing. */
export function clearAutoFilledChurches(world: WorldState): number {
  const churches = world.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Church && b.faction !== 'rival',
  );
  let cleared = 0;
  for (const church of churches) {
    for (const occupantId of [...church.occupants]) {
      const human = world.entities.find((e) => e.id === occupantId);
      if (human && human.alive && human.workerBuildingId === church.id) {
        removeWorkerTransition(human, world.buildings);
      } else {
        church.occupants = church.occupants.filter((id) => id !== occupantId);
      }
      cleared++;
    }
  }
  return cleared;
}

/** Every resource key the economy reads, so a save can be checked for a complete purse. */
const RESOURCE_KEYS = ['wood', 'stone', 'food', 'gold', 'iron'] as const;

/** Present *and* a finite number. An absent key is a failure, not a default: see below. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A year scalar that is legitimately `null`: no pending election, nothing to notify.
 *
 * A bare number rule would refuse every real save (`pendingElectionYear` is `number | null`). What it
 * must catch is `Infinity`: `getYearsUntilElection` returns `pendingElectionYear - year`, so an
 * infinite date reads as "merit election in Infinity years" and no election can ever run again.
 */
function isFiniteNumberOrNull(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

/**
 * A payload's `resources`/`storageMax` must carry **every** key as a finite number.
 *
 * Absence is deliberately *not* tolerated here, which is the opposite of the rule for the calendar
 * fields below. `undefined` in the purse is not a default — it is the failure mode: every
 * affordability rule is `state.resources.wood >= cost.wood`, and a comparison against `undefined` is
 * permanently `false`, so a colony loaded with a short purse can never build, repair, upgrade or
 * research again, and the next save writes the same broken state back. A truncated object is the
 * shape a hand-edited or partially written file actually produces, so it is refused by name.
 */
function hasCompleteResourceShape(value: unknown): boolean {
  if (!isSaveObject(value)) return false;
  return RESOURCE_KEYS.every((key) => isFiniteNumber((value as Record<string, unknown>)[key]));
}

/**
 * Fields the restore dereferences with no default, so a payload that matches this build's version
 * but omits or mistypes one throws a `TypeError` from deep inside the restore — the two the audit
 * caught are `resources` (read as `resources.iron`) and `lifetimeStats` (read as
 * `lifetimeStats.tradeCaravansCompleted`). The throw was swallowed by the restore's catch-all, so
 * the player saw a bare "could not be restored" while the failing field stayed in the console.
 * Checking the shape first turns that into a named cause.
 *
 * The numeric checks below are the same class one step quieter. A same-version payload with
 * `tick: "abc"` used to **load successfully** into a world whose calendar was `NaN`: `% TICKS_PER_DAY`
 * is then never 0, so the daily layer never runs again — no days, no seasons, no aging, no births —
 * and "Year NaN" reaches the clock. The purse is checked more strictly still (see
 * `hasCompleteResourceShape`). Both are refused by name, which is the outcome `findUnrestorableField`
 * already exists to produce.
 *
 * The calendar/geometry fields do tolerate absence: the loader defaults each of them, so only a
 * present-but-unusable value is a refusal there.
 *
 * Returns the first failing field name, or `null` when the payload is worth attempting.
 */
function findUnrestorableField(parsed: Record<string, unknown>): string | null {
  if (!hasCompleteResourceShape(parsed.resources)) return 'resources';
  if (parsed.storageMax !== undefined && !hasCompleteResourceShape(parsed.storageMax)) {
    return 'storageMax';
  }
  if (parsed.lifetimeStats !== undefined && !isSaveObject(parsed.lifetimeStats)) {
    return 'lifetimeStats';
  }
  if (parsed.activeVillageRequest !== undefined && !isUsableVillageRequest(parsed.activeVillageRequest)) {
    return 'activeVillageRequest';
  }
  // Present values must satisfy their own rule; absent ones are defaulted by the load path.
  for (const { field, isValid } of worldScalarRules()) {
    if (parsed[field] !== undefined && !isValid(parsed[field])) return field;
  }
  return findUnrestorableEntityField(parsed) ?? findUnrestorableContainerField(parsed);
}

/** One `(field, rule)` pair — the shape every entity and building element is checked against. */
interface ElementFieldRule {
  field: string;
  isValid: (value: unknown) => boolean;
}

const ENTITY_TYPE_VALUES: ReadonlySet<unknown> = new Set(Object.values(EntityType));
const JOB_TYPE_VALUES: ReadonlySet<unknown> = new Set(Object.values(JobType));
const BUILDING_TYPE_VALUES: ReadonlySet<unknown> = new Set(Object.values(BuildingType));
const TERRAIN_TYPE_VALUES: ReadonlySet<unknown> = new Set(Object.values(TerrainType));
const WEATHER_TYPE_VALUES: ReadonlySet<unknown> = new Set(Object.values(WeatherType));

/** Membership in one of the `as const` enums this file already imports for the restore path. */
function isMemberOf(values: ReadonlySet<unknown>): (value: unknown) => boolean {
  return (value) => values.has(value);
}

/** A finite number inside `[0, limit]` — the bound `assertSimInvariants` reports on a position. */
function isFiniteWithin(limit: number): (value: unknown) => boolean {
  return (value) => isFiniteNumber(value) && value >= 0 && value <= limit;
}

/** The highest id an allocator can advance past: one at `Number.MAX_SAFE_INTEGER` leaves no successor. */
const MAX_USABLE_ID = Number.MAX_SAFE_INTEGER - 1;

/**
 * An id the rest of the engine can key on, and one a later spawn can be numbered past.
 *
 * `isFiniteNumber` accepted `1.5` and `-4`, so a payload could restore entities the code looks up by
 * integer equality and never finds; an id at the top of the range would leave the next one unusable.
 */
function isUsableId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_USABLE_ID;
}

/** The highest id an allocator may hand out: the value it leaves behind (`id + 1`) stays usable. */
const MAX_EMITTED_ID = MAX_USABLE_ID - 2;

/** The highest allocator value: the id it hands out stays usable in the range, and so does the value it becomes. */
const MAX_ALLOCATOR_ID = MAX_EMITTED_ID;

/** The highest id a save may carry: the allocator floored from it (`id + 1`) stays within the allocator ceiling. */
const MAX_SAVED_ID = MAX_ALLOCATOR_ID - 1;

/** An id a payload may carry — above it, the allocator floored from the id would pass the allocator ceiling. */
const isPersistedId = (value: unknown): value is number => isUsableId(value) && value <= MAX_SAVED_ID;

/** An id the engine keys on by string equality — every camp, event and route id is a string. */
function isStringId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** An array of anything — every container list must be one, and the element rules judge the rest. */
function isAnyArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** An array of ids, for the nested lists an entity or building carries. */
function isIdArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((id: unknown) => isPersistedId(id));
}

/** One nested id array on an entity or building, checked only when the payload carries it. */
interface ElementIdRule {
  field: string;
  isValid: (value: unknown) => boolean;
}

/** Any id an element carries: numeric for entities and buildings, string for camps and events. */
function isEntityOrBuildingId(value: unknown): boolean {
  return isPersistedId(value) || isStringId(value);
}

/** The nested id arrays an element carries, checked on a present value only. */
function elementIdRules(): readonly ElementIdRule[] {
  return [
    { field: 'occupants', isValid: isIdArray },
    { field: 'childrenIds', isValid: isIdArray },
  ];
}

/** The element contract for the world's object arrays — each is keyed by its own id. */
const WORLD_ELEMENT_RULES: readonly ElementFieldRule[] = [
  { field: 'id', isValid: isEntityOrBuildingId },
];

/**
 * The container arrays a load must be able to walk, and what one element of each must be.
 *
 * A present-but-not-an-array value never reaches the restore's own `?? []`, so the first
 * `.map`/`.filter`/`.some` threw a `TypeError` out of the catch-all and the player read raw engine
 * text instead of a refusal. Every key is one `WorldState` array, so a renamed field stops compiling.
 */
type WorldArrayKeys = {
  [K in keyof WorldState]-?: Extract<WorldState[K], readonly unknown[] | null | undefined> extends never
    ? never
    : K;
}[keyof WorldState];

interface ContainerArrayRule {
  isValid: (value: unknown) => boolean;
  /** `null` for the world's string and number lists; `[]` for object lists no id keys on. */
  elementRules: readonly ElementFieldRule[] | null;
}

function containerArrayRule(
  isValid: (value: unknown) => boolean,
  elementRules: readonly ElementFieldRule[] | null,
): ContainerArrayRule {
  return { isValid, elementRules };
}

/** A Big News card carries a string id — `highestBigNewsSeq` parses its sequence out of it. */
const BIG_NEWS_ELEMENT_RULES: readonly ElementFieldRule[] = [{ field: 'id', isValid: isStringId }];

/** The dashboard and the council read both maps of a food-day sample, so one missing them throws. */
const FOOD_HISTORY_ELEMENT_RULES: readonly ElementFieldRule[] = [
  { field: 'produced', isValid: isSaveObject },
  { field: 'consumed', isValid: isSaveObject },
];

/**
 * A chronicle entry's id is **numeric**, unlike the string ids the other containers carry: the
 * allocator is `Math.max(…ids) + 1`, so one non-numeric string makes every later id `NaN`.
 */
const EVENT_LOG_ELEMENT_RULES: readonly ElementFieldRule[] = [{ field: 'id', isValid: isPersistedId }];

/** The `kind` values `tickVisitorGroups` switches on — it is the same `as const` list as the type. */
const VISITOR_KIND_VALUES: ReadonlySet<unknown> = new Set(['traders', 'pilgrims', 'scholars', 'hunters', 'nomads', 'refugees', 'performers']);

/**
 * A camped group's own fields: `spawnVisitorGroup` writes all of them, and a daily tick dereferences
 * `daysLeft` and `entityIds` with no default, so a missing one freezes the camp or faults the tick.
 */
const VISITOR_GROUP_ELEMENT_RULES: readonly ElementFieldRule[] = [
  { field: 'id', isValid: isStringId },
  { field: 'kind', isValid: isMemberOf(VISITOR_KIND_VALUES) },
  { field: 'daysLeft', isValid: isFiniteNumber },
  { field: 'entityIds', isValid: isIdArray },
];

/** An incoming raid's own fields: a missing strength makes `Math.max(undefined, 1)` `NaN`, so every
 *  Defend/Barricade resolves as `'defeat'`. `expiresAtTick` is not here — it has a legacy fallback. */
const PENDING_RAID_ELEMENT_RULES: readonly ElementFieldRule[] = [
  { field: 'id', isValid: isStringId },
  { field: 'attackerStrength', isValid: isFiniteNumber },
  { field: 'marchDistanceTiles', isValid: isFiniteNumber },
];

const ARRAY_CONTAINER_RULES: Partial<Record<WorldArrayKeys, ContainerArrayRule>> = {
  // Metric and aggregate samples: plain objects, and nothing keys on an element of either list.
  populationHistory: containerArrayRule(isAnyArray, []),
  yearlyStats: containerArrayRule(isAnyArray, []),
  foodHistory: containerArrayRule(isAnyArray, FOOD_HISTORY_ELEMENT_RULES),
  challenges: containerArrayRule(isAnyArray, WORLD_ELEMENT_RULES),
  researchNodes: containerArrayRule(isAnyArray, WORLD_ELEMENT_RULES),
  unlockedTechs: containerArrayRule(isAnyArray, null),
  tradeRoutes: containerArrayRule(isAnyArray, WORLD_ELEMENT_RULES),
  eventLog: containerArrayRule(isAnyArray, EVENT_LOG_ELEMENT_RULES),
  chronicleChapters: containerArrayRule(isAnyArray, null),
  visitorGroups: containerArrayRule(isAnyArray, VISITOR_GROUP_ELEMENT_RULES),
  villageRequestHistory: containerArrayRule(isAnyArray, WORLD_ELEMENT_RULES),
  rivalSettlements: containerArrayRule(isAnyArray, WORLD_ELEMENT_RULES),
  pendingDiplomacyEvents: containerArrayRule(isAnyArray, WORLD_ELEMENT_RULES),
  pendingRaidEvents: containerArrayRule(isAnyArray, PENDING_RAID_ELEMENT_RULES),
  pendingStoryEvents: containerArrayRule(isAnyArray, WORLD_ELEMENT_RULES),
  pendingOutgoingRaidEvents: containerArrayRule(isAnyArray, WORLD_ELEMENT_RULES),
  tutorialSeen: containerArrayRule(isAnyArray, null),
  eventsThisYear: containerArrayRule(isAnyArray, null),
  appliedSaveMigrations: containerArrayRule(isAnyArray, null),
  bigNews: containerArrayRule(isAnyArray, BIG_NEWS_ELEMENT_RULES),
  dismissedBigNewsIds: containerArrayRule(isAnyArray, null),
  dismissedActiveEventIds: containerArrayRule(isAnyArray, null),
  dismissedNotificationIds: containerArrayRule(isAnyArray, null),
};

/** A loaded Big News card, with the fields its readers dereference made safe. */
function normalizeBigNewsItem(item: WorldState['bigNews'][number]): WorldState['bigNews'][number] {
  const fields = item as Partial<WorldState['bigNews'][number]>;
  return {
    id: item.id,
    title: typeof fields.title === 'string' ? fields.title : '',
    message: typeof fields.message === 'string' ? fields.message : '',
    type: fields.type === 'positive' || fields.type === 'negative' ? fields.type : 'neutral',
    createdAt: isFiniteNumber(fields.createdAt) ? fields.createdAt : 0,
    dismissed: fields.dismissed === true,
  };
}

/**
 * The first unusable container array, named as `tradeRoutes` or `visitorGroups[2]`.
 *
 * Only a field the payload actually holds is judged: an absent one is the restore's own `?? []`.
 */
function findUnrestorableContainerField(parsed: Record<string, unknown>): string | null {
  for (const [key, rule] of Object.entries(ARRAY_CONTAINER_RULES)) {
    if (!(key in parsed)) continue;
    const list: unknown = parsed[key];
    if (!rule.isValid(list)) return key;
    if (!rule.elementRules) continue;
    const elements = list as unknown[];
    for (let i = 0; i < elements.length; i++) {
      const element: unknown = elements[i];
      if (!isSaveObject(element)) return `${key}[${i}]`;
      const record = element as Record<string, unknown>;
      for (const { field, isValid } of rule.elementRules) {
        if (!isValid(record[field])) return `${key}[${i}].${field}`;
      }
    }
  }
  return null;
}

/**
 * The last tick whose day boundary stays exact: the calendar helpers add up to one `TICKS_PER_DAY`
 * to a live tick, so beyond `MAX_SAFE_INTEGER - TICKS_PER_DAY` that addition stops being exact.
 */
const MAX_USABLE_TICK = Number.MAX_SAFE_INTEGER - TICKS_PER_DAY;

/** The last day index `getAbsoluteCalendarDay` can name, so the daily gate stays satisfiable. */
const MAX_USABLE_CALENDAR_DAY = Math.floor(MAX_USABLE_TICK / TICKS_PER_DAY);

/** A non-negative safe integer within `limit` — the whole-number form of `isFiniteWithin`. */
function isSafeIntegerWithin(limit: number): (value: unknown) => boolean {
  return (value) => isUsableId(value) && value <= limit;
}

/**
 * The per-element keys a malformed payload actually mistypes, and what "usable" means for each.
 *
 * `x`/`y` are additionally bounded to the map, because an entity outside it is the other thing
 * `assertSimInvariants` reports (`simInvariants.ts`) — and that check only runs on a dev build, once
 * per colony day, long after the bad payload has been written back by the next save.
 */
function entityFieldRules(width: number, height: number): readonly ElementFieldRule[] {
  return [
    { field: 'id', isValid: isPersistedId },
    { field: 'type', isValid: isMemberOf(ENTITY_TYPE_VALUES) },
    { field: 'x', isValid: isFiniteWithin(width) },
    { field: 'y', isValid: isFiniteWithin(height) },
    { field: 'age', isValid: isFiniteNumber },
    { field: 'job', isValid: isMemberOf(JOB_TYPE_VALUES) },
    ...elementIdRules(),
  ];
}

function buildingFieldRules(width: number, height: number): readonly ElementFieldRule[] {
  return [
    { field: 'id', isValid: isPersistedId },
    { field: 'type', isValid: isMemberOf(BUILDING_TYPE_VALUES) },
    { field: 'x', isValid: isFiniteWithin(width) },
    { field: 'y', isValid: isFiniteWithin(height) },
    ...elementIdRules(),
  ];
}

/**
 * The world's top-level scalars, each with the rule a *present* value must satisfy.
 *
 * `tick` is the clock every date is derived from, and `lastProcessedCalendarDay` is the gate that
 * lets the daily layer run at all (`isNewCalendarDayTick` is `day > lastProcessed`, so a `NaN` day
 * there starves the colony of days, seasons, ageing and births just as a `NaN` tick does).
 */
function worldScalarRules(): readonly ElementFieldRule[] {
  return [
    { field: 'tick', isValid: isSafeIntegerWithin(MAX_USABLE_TICK) },
    { field: 'lastProcessedCalendarDay', isValid: isSafeIntegerWithin(MAX_USABLE_CALENDAR_DAY) },
    // The two axes are bounded separately, from the largest map the game offers: a pair where one axis
    // exceeds its own maximum is refused by name instead of allocating a surface no map has.
    { field: 'width', isValid: isFiniteWithin(maxSavedMapPixelsForAxis('width')) },
    { field: 'height', isValid: isFiniteWithin(maxSavedMapPixelsForAxis('height')) },
    { field: 'nextEntityId', isValid: isSafeIntegerWithin(MAX_ALLOCATOR_ID) },
    { field: 'nextBuildingId', isValid: isSafeIntegerWithin(MAX_ALLOCATOR_ID) },
    // The persisted leadership years. `1e999` parses to `Infinity`, and an infinite election date is
    // never reached — so a corrupt slot would leave the colony permanently headless.
    { field: 'leaderSinceYear', isValid: isFiniteNumber },
    { field: 'lastElectionYear', isValid: isFiniteNumber },
    { field: 'pendingElectionYear', isValid: isFiniteNumberOrNull },
    // The same `null` is "nothing to notify", and an infinite one raises the notice every year.
    { field: 'electionBuildupNotifiedYear', isValid: isFiniteNumberOrNull },
    // Both reach the renderer and the roll counter: a NaN timer can never satisfy its modulo.
    { field: 'weather', isValid: isMemberOf(WEATHER_TYPE_VALUES) },
    { field: 'weatherTimer', isValid: isFiniteNumber },
  ];
}

/**
 * The first malformed **element** of `entities` or `buildings`, named as `entities[3].x`.
 *
 * The scalar checks above protect the world's containers; this protects their contents, which is
 * where a payload that parses can still be unusable. Nothing downstream refuses one: the restore
 * builds each element by default-and-spread and casts it (`:591-612`, `:676-680`), so a JSON-valid
 * `{ x: "nope", type: "Dragon" }` reached a live world, rendered nowhere, and was written back by the
 * next save — permanent. `computeWildlifeCounts` only warns on the unknown type, and the invariant
 * that would have caught the non-finite position is a dev-build pulse once per colony day.
 *
 * Every rule tolerates **absence** except `type`: it is the one key whose absence is not a shape this
 * build can use (`EntityType` drives every bucket, `BuildingType` every production rule), it was
 * mandatory in every save this build can write, and the exact-version gate (`:128-137`) means no
 * payload from a build that omitted it is accepted anyway. The list itself is checked here too, so
 * this scan is the one owner of `entities` and `buildings`: a present value that is not an array is
 * refused as `entities`, and only its elements are named `entities[3].x`.
 */
function findUnrestorableEntityField(parsed: Record<string, unknown>): string | null {
  const width = isFiniteNumber(parsed.width) ? parsed.width : 0;
  const height = isFiniteNumber(parsed.height) ? parsed.height : 0;

  const scans: ReadonlyArray<{
    key: 'entities' | 'buildings';
    rules: readonly ElementFieldRule[];
  }> = [
    { key: 'entities', rules: entityFieldRules(width, height) },
    { key: 'buildings', rules: buildingFieldRules(width, height) },
  ];

  for (const { key, rules } of scans) {
    // An absent list is the restore's own `?? []`; a mistyped one is refused by name.
    if (!(key in parsed)) continue;
    const list = parsed[key];
    if (!isAnyArray(list)) return key;
    /** Ids already used in this list. Two entities sharing one id make `entityById` silently drop
     *  whichever was inserted first, so that settler can never be selected, inspected or targeted —
     *  and the next save writes the collision back. */
    const seenIds = new Set<number>();
    for (let i = 0; i < list.length; i++) {
      const element: unknown = list[i];
      if (!isSaveObject(element)) return `${key}[${i}]`;
      const record = element as Record<string, unknown>;
      for (const { field, isValid } of rules) {
        const value = record[field];
        // Absent optional keys are the owner's defaults; `type` is mandatory (see above).
        if (value === undefined && field !== 'type') continue;
        if (!isValid(value)) return `${key}[${i}].${field}`;
      }
      const id = record.id;
      if (typeof id === 'number') {
        if (seenIds.has(id)) return `${key}[${i}].id (duplicate of an earlier entry)`;
        seenIds.add(id);
      }
    }
  }
  return null;
}

/**
 * The shape `groupEvents.spawnVisitorGroup` gives a provisions card's answers: an id, a label and a
 * detail, all strings. The card is not a container element, so it gets its own rule.
 */
function isVillageRequestChoice(value: unknown): boolean {
  if (!isSaveObject(value)) return false;
  const fields = value as Record<string, unknown>;
  return [fields.id, fields.label, fields.detail].every((field) => typeof field === 'string');
}

/**
 * The one save field whose reader is a render-time call: `getVillageRequestEligibility` runs
 * `request.choices.some(…)` while the shell paints the card, so a card without a usable `choices`
 * array white-screens the UI instead of refusing. Absence is the owner's own default — the load path
 * defaults a missing card to `undefined` — but a *present* one must be walkable. Only `choices` is
 * judged: the other keys are strings the readers dereference without a rule of their own.
 */
function isUsableVillageRequest(value: unknown): boolean {
  return isSaveObject(value) && Array.isArray(value.choices) && value.choices.every(isVillageRequestChoice);
}

/**
 * Clear every reference a loaded colony cannot resolve.
 *
 * The restore rebuilds `childrenIds` and re-assigns missing homes and jobs, but nothing swept the
 * relationship ids a save can carry to a settler who is no longer in it. A dangling `partnerId` is
 * not a crash — every lookup is guarded — it is worse: a settler whose status says `married` with no
 * spouse never widows, never divorces, and is excluded from courtship by the very id it cannot
 * resolve, so the corruption is durable and the next save writes it back.
 *
 * The relationship half is delegated to the owner that already knows every field
 * (`reconcileFamilyReferencesAfterRemoval`, which the death path uses), called once per unresolvable
 * id; the building half is a scrub, because a home or a residence that does not exist is a missing
 * assignment, not a broken marriage.
 */
function reconcileDanglingReferencesOnLoad(world: WorldState): void {
  const livingIds = new Set<number>();
  for (const entity of world.entities ?? []) {
    if (entity.alive) livingIds.add(entity.id);
  }
  const buildingIds = new Set<number>();
  for (const building of world.buildings ?? []) buildingIds.add(building.id);

  const aliveEntities = (world.entities ?? []).filter((entity) => entity.alive);
  const referencedIds = new Set<number>();
  for (const entity of aliveEntities) {
    for (const id of [
      entity.partnerId,
      entity.pregnantById,
      entity.courtshipPartnerId,
      entity.youthLovePartnerId,
      entity.affairPartnerId,
      entity.tamedBy,
    ]) {
      if (typeof id === 'number' && !livingIds.has(id)) referencedIds.add(id);
    }
  }
  if (referencedIds.size > 0) {
    const byId = new Map(aliveEntities.map((entity) => [entity.id, entity]));
    for (const missingId of referencedIds) {
      reconcileFamilyReferencesAfterRemoval(missingId, byId);
    }
  }

  for (const entity of world.entities ?? []) {
    if (entity.workerBuildingId != null && !buildingIds.has(entity.workerBuildingId)) {
      entity.workerBuildingId = undefined;
    }
    if (entity.residenceBuildingId != null && !buildingIds.has(entity.residenceBuildingId)) {
      moveResident(entity, undefined, 'load', { buildings: world.buildings });
    }
    if (entity.prisonBuildingId != null && !buildingIds.has(entity.prisonBuildingId)) {
      entity.prisonBuildingId = undefined;
    }
  }
  for (const building of world.buildings ?? []) {
    if (building.occupants.length > 0) {
      building.occupants = building.occupants.filter((id) => livingIds.has(id));
    }
  }
}

/**
 * Make every id allocator safe to consume: at least one past the highest id the restored world holds.
 *
 * A same-version payload can carry no allocator at all (every later spawn gets `NaN`), or a rewound
 * one (the next spawn collides with a live id, and `entityById` then drops one of the two). Both are
 * silent: the ids are used unguarded by births, immigrants, wildlife spawns and building placement.
 * The floor is `max(current, highest + 1)`, so a legitimately larger allocator is never lowered.
 */
function floorIdAllocators(world: WorldState): void {
  const floorFor = (current: unknown, highest: number): number => {
    const safe = typeof current === 'number' && Number.isSafeInteger(current) && current > 0 ? current : 0;
    return Math.max(safe, highest + 1);
  };
  let highestEntity = 0;
  for (const entity of world.entities ?? []) {
    if (isPersistedId(entity.id) && entity.id > highestEntity) highestEntity = entity.id;
  }
  // The genealogy registry keeps a settler after they leave `entities`, so their id retires with them.
  for (const person of Object.values(world.genealogyRegistry?.people ?? {})) {
    if (isPersistedId(person.id) && person.id > highestEntity) highestEntity = person.id;
  }
  let highestBuilding = 0;
  for (const building of world.buildings ?? []) {
    if (isPersistedId(building.id) && building.id > highestBuilding) highestBuilding = building.id;
  }
  // A rival row names camp structures that left the map, so those ids retire with the row's history.
  for (const rival of world.rivalSettlements ?? []) {
    for (const id of rival.buildingIds ?? []) {
      if (isPersistedId(id) && id > highestBuilding) highestBuilding = id;
    }
  }
  world.nextEntityId = floorFor(world.nextEntityId, highestEntity);
  world.nextBuildingId = floorFor(world.nextBuildingId, highestBuilding);
  world.nextFloatingTextId = floorFor(world.nextFloatingTextId, 0);
}

/**
 * Hydrate a world+view from an already-parsed save object (browser or file), reporting **why** a
 * payload that parsed could not be restored.
 *
 * `loadGameFromParsed` collapsed every restore failure into `null`; this keeps the cause so
 * `describeSaveLoadOutcome` can name the field and `loadGameOutcome` can pass it on.
 */
export function loadGameFromParsedOutcome(parsed: Record<string, unknown>): SaveLoadOutcome {
  const unrestorableField = findUnrestorableField(parsed);
  if (unrestorableField) {
    // One wording for two kinds of refusal: a container that is missing or not an object, and an
    // element field that is present but unusable (see `findUnrestorableEntityField`). The player gets
    // the same actionable message — which field — either way.
    const detail = `${unrestorableField} is missing or unusable`;
    console.error('Save load refused:', detail);
    return { ok: false, reason: 'unrestorable', detail };
  }
  // Absent identity counters are refused rather than inferred: no surviving id says which retired
  // ones the allocator must still avoid.
  for (const field of ['nextEntityId', 'nextBuildingId']) {
    if (parsed[field] === undefined) {
      return { ok: false, reason: 'unrestorable',
        detail: `${field} is missing: retired building identities or citizen identities cannot be recovered safely. Use an intact save with its original identity counters.` };
    }
  }
  // Work on a copy, so this reads as the pure function its signature promises.
  //
  // Two things write **through** to the caller's object otherwise: `pickWorldStateFromSave` copies
  // top-level keys by reference, so the returned world's `entities` / `tradeRoutes` /
  // `pendingRaidEvents` are the payload's own arrays; and `migrateTickTimeline` scales tick-valued
  // fields in place (forging `_ticksPerDay` shows it plainly: one load rewrites
  // `createdAtTick: 700 → 2100`, and a second load of the same payload scales it again to 7200,
  // retroactively moving the first session's raid deadline). Production callers each parse fresh
  // today, so this is a re-entrancy hazard rather than a live play bug — but "load" should not be a
  // mutation of its input regardless of who calls it. The clone also means a throw from it lands in
  // the refusal shape below instead of escaping.
  let source: Record<string, unknown>;
  /**
   * The live session's RNG snapshot, captured before anything can replace it.
   *
   * `adoptSimSeedFromWorld` clears the whole RNG stream registry and `restoreSimRng` re-creates the
   * streams, both part-way through the restore — so a restore that failed *after* them left the
   * running colony drawing from the refused save's seed for the rest of the session, and baking that
   * seed into every later save. The declared contract is "the session, or the reason", so a refusal
   * puts this back.
   */
  const rngBeforeLoad = snapshotSimRng();
  try {
    source = structuredClone(parsed);
  } catch (err) {
    const detail = `payload could not be copied: ${err instanceof Error ? err.message : String(err)}`;
    console.error('Save load refused:', detail);
    return { ok: false, reason: 'unrestorable', detail };
  }
  try {
    const worldData = pickWorldStateFromSave(source);

    let loadedTick = (worldData.tick ?? (source.tick as number | undefined) ?? 0) as number;
    /**
     * Accept the legacy 24- and 72-tick days alongside the current resolution.
     * `migrateTickTimeline` *scales the whole timeline* by this — `tick`,
     * every cooldown and every deadline — and it used to accept any positive number, so
     * `_ticksPerDay: 1e-6` loaded a colony into **year 66666**.
     */
    const savedTicksPerDay = source._ticksPerDay === LEGACY_TICKS_PER_DAY
      || source._ticksPerDay === 72
      ? source._ticksPerDay
      : TICKS_PER_DAY;
    const autoSave = typeof worldData.autoSave === 'boolean'
      ? worldData.autoSave
      : loadAutoSavePreference();
    // The payload's value is adopted onto the world; the browser preference stays the player's.

    const transient = restoreTransientWorldFieldsFromSave(source);
    const world = {
      ...worldData,
      buildings: worldData.buildings ?? [],
      scentGrid: undefined,
      autoSave,
      workSchedule: normalizeWorkSchedule(worldData.workSchedule),
      // Roadmap F3: a save written before the workforce policy existed loads with the
      // documented default (`workforcePolicy.DEFAULT_WORKFORCE_POLICY`). No save-version
      // bump — the same in-place-default contract `workSchedule` and `mineMode` use.
      workforcePolicy: normalizeWorkforcePolicy(worldData.workforcePolicy),
      // Same in-place-default contract for the venue windows: an unusable pair loads as that
      // venue's documented default instead of a silently substituted one the next save would keep.
      tavernSchedule: normalizeVenueSchedule(worldData.tavernSchedule, 'tavern'),
      hotelSchedule: normalizeVenueSchedule(worldData.hotelSchedule, 'hotel'),
      tick: loadedTick,
      lastProcessedCalendarDay: typeof worldData.lastProcessedCalendarDay === 'number'
        ? worldData.lastProcessedCalendarDay
        : undefined,
      dayInYear: 0,
      year: 0,
      // Loading is already an explicit player action; do not leave the restored colony frozen until
      // the player discovers the separate play control. The saved pause state is presentation state,
      // not simulation progress, and can be changed immediately after loading.
      paused: false,
      ...transient,
      bigNews: (worldData.bigNews ?? []).map(normalizeBigNewsItem),
      screenShakeImpulse: 0,
      festival: normalizeFestivalState(worldData.festival),
      townHallFestivalCooldownUntilTick: worldData.townHallFestivalCooldownUntilTick ?? 0,
      // A save written before `storageMax` existed carries none, and the fallback was a third copy of
      // the cap rule (`800 / 300 / 800 / 20000 / 300`) that could drift from `economy`'s own — so the
      // fallback now calls the owner with the buildings this load already resolved (`buildings` is
      // defaulted to `[]` a few lines above). Only the *rule* has one home; a save that does carry a
      // `storageMax` still keeps its own numbers, since the daily layer would recompute them anyway.
      storageMax: worldData.storageMax || computeStorageMax(worldData.buildings ?? []),
      foodSpoilageRate: worldData.foodSpoilageRate ?? 0.03,
      eventLog: worldData.eventLog || [],
      worldMap: restoreWorldMapFromSave(source),
      ecoHealthYearsAbove80: worldData.ecoHealthYearsAbove80 ?? 0,
      firstWeekVisitorSpawned: worldData.firstWeekVisitorSpawned ?? false,
      visitorGroups: (worldData.visitorGroups ?? []).map((g) => ({
        ...g,
        // `giftsGiven` is `++`'d by the daily tick and has no rule of its own, so an absent one used
        // to load as `NaN` and be re-saved as `null` — the sibling counter's default, applied here.
        giftsGiven: g.giftsGiven ?? 0,
        tradesCompleted: g.tradesCompleted ?? 0,
        refugeeResolved: g.refugeeResolved ?? g.kind !== 'refugees',
        leaderTalked: g.leaderTalked ?? false,
        spawnedAtCalendarDay: g.spawnedAtCalendarDay,
      })),
      rivalSettlements: (worldData.rivalSettlements ?? []).map((r) => ({
        ...r,
        raidCooldownDays: r.raidCooldownDays ?? 30,
        peaceTreatyDays: r.peaceTreatyDays ?? 0,
        giftsGiven: r.giftsGiven ?? 0,
      })),
      pendingDiplomacyEvents: worldData.pendingDiplomacyEvents ?? [],
      pendingRaidEvents: worldData.pendingRaidEvents ?? [],
      pendingOutgoingRaidEvents: worldData.pendingOutgoingRaidEvents ?? [],
      entities: (worldData.entities || []).map((e: Partial<Entity>) => {
        // Required fields (`vx`, `vy`, `alive`, `flash`, `birthYear`, `birthMonth`, `birthDay`) are
        // repaired for every element here; `...e` still wins over every default the payload carries.
        const entity = {
          childrenIds: [],
          spriteAngle: 0,
          vx: 0,
          vy: 0,
          alive: true,
          flash: 0,
          skills: {},
          birthYear: 0,
          birthMonth: 0,
          birthDay: 0,
          ...e,
        } as Entity;
        // `generation` and `animFrame` are optional and are read only for the species that carry them,
        // so they are repaired for those species alone. Defaulting them for every element re-materialised
        // both on all 932 grass blades and trees of a loaded world, undoing the factory's own scoping.
        if (entity.type === EntityType.Human) entity.generation ??= 0;
        if (TICKED_SPECIES.has(entity.type)) entity.animFrame ??= 0;
        migrateEntityPersistedFields(entity, e);
        if (entity.type === EntityType.Human && entity.spriteVariant === undefined && entity.gender) {
          entity.spriteVariant = pickHumanVariant(entity.id, entity.gender);
        }
        return entity;
      }),
    } as WorldState;

    // Every pass below resolves entities by id, so floor the allocators and build the index first.
    floorIdAllocators(world);
    rebuildEntityByIdMap(world);

    migrateTickTimeline(world, savedTicksPerDay);
    loadedTick = world.tick;
    world.dayInYear = getCalendarDay(loadedTick);
    world.year = Math.floor(loadedTick / (TICKS_PER_DAY * DAYS_PER_YEAR));
    if (typeof world.lastProcessedCalendarDay !== 'number') {
      world.lastProcessedCalendarDay = getAbsoluteCalendarDay(loadedTick);
    }
    for (const g of world.visitorGroups ?? []) {
      if (g.spawnedAtCalendarDay == null) {
        g.spawnedAtCalendarDay = getAbsoluteCalendarDay(loadedTick);
      }
    }
    const colonyDayOnLoad = getAbsoluteCalendarDay(loadedTick);
    const hourOnLoad = getHourOfDay(loadedTick);
    // The RNG snapshot must be in place *before* anything below draws, because `syncMoonHowlerForms`
    // transforms a cursed settler at load time and `forceMoonHowlerOutside` scatters them off the
    // stream. Restoring it afterwards (where these two calls used to sit, just before
    // `createViewFromSave`) meant those draws came from the pre-load stream — seed 1 — so a load could
    // not reproduce the positions its own save was written with (`LIVE-FINDINGS-STATUS.md`, L13).
    adoptSimSeedFromWorld(world);
    // Read the copy, like every other payload field in this body, so the load cannot hand the caller's
    // snapshot object back to the live RNG registry.
    restoreSimRng(source.simRng);
    for (const entity of world.entities) {
      migrateLegacyMoonHowler(entity, colonyDayOnLoad, hourOnLoad);
    }
    syncMoonHowlerForms(
      world.entities,
      colonyDayOnLoad,
      hourOnLoad,
      world.buildings,
      world.width ?? 1200,
      world.height ?? 900,
      loadedTick,
      world.villageLeaderId,
    );

    repairEventLogOnLoad(world);
    syncEventLogIdFromState(world);
    syncBigNewsIdFromState(world);
    world.totalBuildingsCompleted = (world.buildings ?? []).filter(
      (b) => b.completed && b.faction !== 'rival',
    ).length;
    world.challenges = world.challenges?.length
      ? world.challenges
      : structuredClone(INITIAL_CHALLENGES);
    world.yearlyStats = world.yearlyStats ?? [];
    world.lifetimeStats = normalizeLifetimeStats(world.lifetimeStats);
    world.eventsThisYear = worldData.eventsThisYear ?? [];
    if (!Array.isArray(world.chronicleChapters)) {
      world.chronicleChapters = [];
    }
    if (typeof (world.resources as { iron?: unknown }).iron !== 'number') {
      (world.resources as { iron: number }).iron = 0;
    }
    if (typeof (world.storageMax as { iron?: unknown }).iron !== 'number') {
      (world.storageMax as { iron: number }).iron = BASE_IRON_STORAGE;
    }
    world.wildlifeCounts = computeWildlifeCounts(world.entities);
    world.workingSettlers = world.workingSettlers ?? 0;
    world.idleSettlers = world.idleSettlers ?? 0;

    world.buildings = (world.buildings || []).map((b) =>
      b.type === BuildingType.Workshop && !b.workshopRecipeId
        ? { ...b, workshopRecipeId: DEFAULT_WORKSHOP_RECIPE_ID }
        : b,
    );
    const applySaveMigration = (id: string, message: string) => {
      if (!world.appliedSaveMigrations) world.appliedSaveMigrations = [];
      if (world.appliedSaveMigrations.includes(id)) return;
      world.appliedSaveMigrations.push(id);
      logEvent(world, 'event', message);
    };

    // A save written while village camps existed can hold camp structures the day pulse never reached,
    // because it retires only what a rival row still lists. Runs before the dangling references below,
    // which then clear the homes those structures were.
    const campMigrationDone = (world.appliedSaveMigrations ?? []).includes('legacy-village-camps');
    if (!campMigrationDone) {
      const retiredCampStructures = retireLegacyCampStructures(world.buildings);
      if (retiredCampStructures.size > 0) {
        applySaveMigration(
          'legacy-village-camps',
          `Save migrated — ${retiredCampStructures.size} legacy rival camp structure(s) removed from the map.`,
        );
      } else {
        if (!world.appliedSaveMigrations) world.appliedSaveMigrations = [];
        world.appliedSaveMigrations.push('legacy-village-camps');
      }
    }

    repairLoadedHumanGround(world);
    reconcileDanglingReferencesOnLoad(world);

    migrateHumanAges(world.entities, { year: world.year, dayInYear: world.dayInYear });
    rebuildChildrenIds(world.entities);
    migrateLegacySecurityRoles(world);
    assignMissingResidences(world.entities.filter(isPlayerHuman), world.buildings, world.entities, undefined, world.genealogyRegistry,
      (ledger) => applyLeaderHousePhase(world, ledger));
    assignMissingWorkers(world.entities.filter(isPlayerHuman), world.buildings, world);

    const churchMigrationDone = (world.appliedSaveMigrations ?? []).includes('church-manual-staffing');
    const clearedChurchSeats = churchMigrationDone ? 0 : clearAutoFilledChurches(world);
    if (!churchMigrationDone) {
      if (clearedChurchSeats > 0) {
        applySaveMigration(
          'church-manual-staffing',
          `Save migrated — ${clearedChurchSeats} auto-filled Church seat(s) cleared; assign a priest manually.`,
        );
      } else {
        if (!world.appliedSaveMigrations) world.appliedSaveMigrations = [];
        world.appliedSaveMigrations.push('church-manual-staffing');
      }
    }

    // Older or partial saves may not contain research nodes. Restore the
    // canonical starting tree before applying combat-research migrations.
    world.researchNodes = mergeCombatResearchNodes(
      Array.isArray(world.researchNodes) ? world.researchNodes : createInitialResearchNodes(),
    );
    // New technology must also appear in saves written before the Villa existed.
    if (!world.researchNodes.some((node) => node.id === 'architecture_3')) {
      const betterHousing = createInitialResearchNodes().find((node) => node.id === 'architecture_3');
      if (betterHousing) world.researchNodes.push(betterHousing);
    }
    syncResearchUnlocks(world);
    world.tradeRoutes = ensureFullTradeRoutes(world.tradeRoutes ?? []);
    for (let i = 0; i < world.tradeRoutes.length; i++) {
      const route = world.tradeRoutes[i];
      enrichTradeRoute(route, world, i);
      if (route.active && route.caravanCarrierId == null && route.nextDepartureTick == null) {
        scheduleTradeRouteDeparture(world, route);
      }
    }
    world.villageLeaderId = (parsed.villageLeaderId as number | null | undefined) ?? null;
    world.pendingLeaderHouseResidentIds = Array.isArray(parsed.pendingLeaderHouseResidentIds)
      ? (parsed.pendingLeaderHouseResidentIds as unknown[]).filter((id): id is number => Number.isSafeInteger(id) && (id as number) >= 0)
      : undefined;
    world.leaderSinceYear = (parsed.leaderSinceYear as number | undefined) ?? 0;
    world.lastElectionYear = (parsed.lastElectionYear as number | undefined) ?? -1;
    world.pendingElectionYear = (parsed.pendingElectionYear as number | null | undefined) ?? null;
    world.electionBuildupNotifiedYear = (parsed.electionBuildupNotifiedYear as number | null | undefined) ?? null;
    world.electionCeremony = (parsed.electionCeremony as WorldState['electionCeremony']) ?? null;
    validateVillageLeaderOnLoad(world);
    ensureValleyEcologyOnLoad(world);
    migrateVillageForgeOnLoad(world);
    repairJuvenileAssignmentsOnLoad(world);
    repairStaleFestivalOnLoad(world);
    repairStaleFestivalOnLoad(world);
    for (const challenge of world.challenges ?? []) {
      const fresh = INITIAL_CHALLENGES.find((c) => c.id === challenge.id);
      if (!fresh || challenge.completed) continue;
      if (fresh.targetPopulation != null) challenge.targetPopulation = fresh.targetPopulation;
      if (fresh.targetBuildings != null) challenge.targetBuildings = fresh.targetBuildings;
      challenge.description = fresh.description;
    }
    world.pendingRaidEvents = (world.pendingRaidEvents ?? []).map((evt) => {
      if (evt.expiresAtTick != null && evt.marchDistanceTiles != null) return evt;
      const rival = world.rivalSettlements.find((r) => r.id === evt.rivalId);
      const distPx = rival ? getCampDistancePixels(world, world.buildings, rival) : 300;
      return {
        ...evt,
        marchDistanceTiles: evt.marchDistanceTiles ?? getCampDistanceTiles(distPx),
        expiresAtTick: evt.expiresAtTick ?? evt.createdAtTick + getIncomingRaidExpireTicks(distPx),
      };
    });

    world.tutorialSeen = seedTutorialSeenForExistingState({
      ...world,
      tutorialSeen: (parsed.tutorialSeen as string[] | undefined) ?? [],
    });
    clearAllFactionWanderStates();
    // `beautyGrid` is a runtime cache (stripped from the save, and now dropped by
    // `invalidateWorldRuntimeCaches`), and it used to be rebuilt only by the **daily** layer — so a
    // loaded colony ran up to a full game day with no beauty field at all: free-time settlers were not
    // drawn toward decor and the beauty happiness nudge was skipped, which made a just-loaded village
    // behave differently from the same village a moment before the save.
    //
    // The **grid** is rebuilt here; `villageHappiness` is deliberately left at its saved value. It is
    // in the save allow-list on purpose, and recomputing it from a grid that reflects the stored
    // buildings would replace the persisted number with the base happiness a freshly loaded world has
    // not yet earned — `rebuildBeautyGridFromWorld` exists for exactly this split.
    rebuildBeautyGridFromWorld(world);
    const view = createViewFromSave(parsed, world);
    return { ok: true, world, view };
  } catch (e) {
    console.error('Save load failed:', e);
    // A refused load leaves the running colony drawing from its own RNG, not the save's seed.
    restoreSimRng(rngBeforeLoad);
    return {
      ok: false,
      reason: 'unrestorable',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Load a colony from an already-parsed save object, or `null` when it will not restore.
 *
 * The `null`-or-session shape its callers already read; `loadGameFromParsedOutcome` is where the
 * refusal reason lives.
 */
export function loadGameFromParsed(
  parsed: Record<string, unknown>,
): { world: WorldState; view: ViewState } | null {
  const outcome = loadGameFromParsedOutcome(parsed);
  return outcome.ok ? { world: outcome.world, view: outcome.view } : null;
}

/**
 * Load the browser save slot, reporting **why** it failed.
 *
 * `loadGame()` collapsed every cause — an empty slot, unavailable storage, a save from another build,
 * and a payload that parsed but could not be restored — into `null`, so the map-setup screen's "Load
 * saved game" button did nothing at all, silently, on every retry while `hasSave()` stayed true
 * (`LIVE-FINDINGS-STATUS.md`, F19). The menu's load path already named its cause; this owner is what
 * both paths now read, and `describeSaveLoadOutcome` is the one place those messages live.
 */
export function loadGameOutcome(): SaveLoadOutcome {
  try {
    const result = readSavePayload();
    if (!result.valid) return { ok: false, reason: result.reason, detail: result.detail };
    // The restore's own outcome is returned as-is, so a payload that parsed but not restored keeps
    // the field that failed (`loadGameFromParsedOutcome`) instead of a bare `unrestorable`.
    return loadGameFromParsedOutcome(result.parsed);
  } catch (e) {
    console.error('Save load failed:', e);
    return { ok: false, reason: 'unreadable', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Load a downloaded .json file body, reporting **why** it failed like the slot path does. */
export function loadGameFromFileTextOutcome(raw: string): SaveLoadOutcome {
  const result = parseSaveJson(raw);
  if (!result.valid) return { ok: false, reason: result.reason, detail: result.detail };
  return loadGameFromParsedOutcome(result.parsed);
}

/** Load a colony from a downloaded .json file body, or `null` when it will not restore. */
export function loadGameFromFileText(raw: string): { world: WorldState; view: ViewState } | null {
  const outcome = loadGameFromFileTextOutcome(raw);
  return outcome.ok ? { world: outcome.world, view: outcome.view } : null;
}

/** A save the compatibility gate accepts, verified by parsing its version. */
export function hasSave(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    return parseSaveJson(raw).valid;
  } catch (e) {
    console.error('Save slot probe failed:', e);
    return false;
  }
}

/**
 * Is there *anything* in the browser save slot? — slot presence, not loadability.
 *
 * `hasSave()` answers "does this save load", which is `false` for a version-mismatched payload. Every
 * UI gate built on it (`App.canLoadSavedGame`, the menu's disabled Load item) therefore told the
 * player there was no save at all after a build update, while their colony sat in the slot — the
 * opposite of the truth, and the reason `describeSaveReadFailure({reason:'version-mismatch'})` could
 * only ever be reached from a running session. Gating Load on *presence* runs the load path,
 * which reports the real cause through `describeSaveLoadOutcome`.
 *
 * Raw slot presence on purpose: it must not depend on parse validity. A blocked-storage throw reads
 * as "absent", which is the only safe answer when nothing can be read.
 */
export function hasSaveSlot(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) != null;
  } catch (e) {
    console.error('Save slot probe failed:', e);
    return false;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
