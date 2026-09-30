import type { WorldState, Entity } from './gameTypes';
import { EntityType, BuildingType, JobType, DEFAULT_WORKSHOP_RECIPE_ID, TERRAIN_TILE_SIZE } from './gameTypes';
import { INITIAL_CHALLENGES } from './challenges';
import { createEmptyLifetimeStats } from './stats';
import {
  mergeForSave,
  createViewFromSave,
  restoreTransientWorldFieldsFromSave,
  type ViewState,
} from './viewState';
import { ENTITY_PERSISTED_FIELDS, WORLD_STATE_SAVE_KEYS } from './saveSchema';
import { generateWorldMap } from './terrainGen';
import {
  getCalendarDay, getHourOfDay, getAbsoluteCalendarDay, migrateHumanAges, rebuildChildrenIds,
  TICKS_PER_DAY, DAYS_PER_YEAR,
  assignMissingResidences,
} from './dayCycle';
import { displayYear } from './dayCycleClock';
import { mergeCombatResearchNodes } from './combat';
import { loadAutoSavePreference, saveAutoSavePreference } from './preferences';
import { logEvent, syncEventLogIdFromState } from './eventLog';
import { pickHumanVariant } from './humanSprites';
import { migrateLegacyMoonHowler, syncMoonHowlerForms } from './moonHowler';
import { isPlayerHuman } from './playerHuman';
import { GAME_VERSION } from './version';
import { ensureEntitySkills } from './skills';
import { normalizeWorkSchedule } from './workSchedule';
import { normalizeWorkforcePolicy } from './workforcePolicy';

import { seedTutorialSeenForExistingState } from './contextualTutorial';
import { adoptSimSeedFromWorld, restoreSimRng, snapshotSimRng } from './simRng';
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
import { ensureValleyEcologyOnLoad } from './ecologyStage';
import { migrateVillageForgeOnLoad } from './forge';

const SAVE_KEY = 'ecosim_save';

/** Restore entity fields that must survive save/load (see ENTITY_PERSISTED_FIELDS). */
function migrateEntityPersistedFields(entity: Entity, saved: Partial<Entity>): void {
  for (const key of ENTITY_PERSISTED_FIELDS) {
    const value = saved[key];
    if (value !== undefined) {
      (entity as unknown as Record<string, unknown>)[key] = value;
    }
  }
  ensureEntitySkills(entity);
}

export type SaveResult = { success: true } | { success: false; error: string };

/** Why a save payload was refused — the player-facing reason comes from this. */
export type SaveReadFailure = 'empty' | 'unreadable' | 'malformed' | 'version-mismatch';

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
    return { valid: false, reason: 'malformed', detail };
  }
  const parsed = payload;
  if (parsed._version !== GAME_VERSION) {
    const version = parsed._version;
    const versionLabel =
      typeof version === 'string' || typeof version === 'number' ? String(version) : 'unknown';
    return {
      valid: false,
      reason: 'version-mismatch',
      detail: `save ${versionLabel} vs build ${GAME_VERSION}`,
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
    case 'version-mismatch':
      return `Save is from a different build${failure.detail ? ` (${failure.detail})` : ''} — Beta keeps only current-build saves. Start a new settlement.`;
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
  return `This build is v${GAME_VERSION}, and it loads only saves written by v${GAME_VERSION}. A save from another build is refused with its reason instead of half-loading — after an update, start a new settlement.`;
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
  const persistable = stripRuntimeWorldFields(world);
  return {
    ...mergeForSave(persistable, view),
    simRng: snapshotSimRng(),
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

/** Download colony save as a file (also writes browser slot when possible). */
export function downloadSaveFile(world: WorldState, view: ViewState): SaveResult {
  try {
    const saveData = buildSaveData(world, view);
    const json = JSON.stringify(saveData);
    try {
      localStorage.setItem(SAVE_KEY, json);
    } catch {
      /* file download still works if storage is full */
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
    return { success: true };
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
    _compact: true as const,
  };
}

function restoreWorldMapFromSave(parsed: { worldMap?: WorldState['worldMap'] & { _compact?: boolean } }): WorldState['worldMap'] {
  if (!parsed.worldMap) return null;
  // Only a compact save (`_compact: true`) is a seed/preset reference to regenerate below; every
  // other save carries its own map data and is restored as it was written. The old test also
  // required a `tiles` array, which the four-layer map model no longer stores, so it was never
  // true and a full save was silently regenerated instead of restored.
  if (!parsed.worldMap._compact) {
    return parsed.worldMap;
  }
  const wm = parsed.worldMap;
  if (typeof wm.width === 'number' && typeof wm.height === 'number') {
    // A compact save records the map in TILES (`WorldMap.width/height`, terrainGen's
    // return), while `generateWorldMap(width, height, …)` takes PIXELS. Passing the tile
    // counts straight through regenerated the valley at a hundredth of its area — a
    // 1600x1200 px colony came back as 160x120 px, leaving 1197 of its 1202 entities off
    // the map, which reads to the player as "the save failed to load".
    return generateWorldMap(
      wm.width * TERRAIN_TILE_SIZE,
      wm.height * TERRAIN_TILE_SIZE,
      wm.seed,
      wm.size ?? 'medium',
      wm.preset ?? 'continental',
    );
  }
  return generateWorldMap(
    wm.size ?? 'medium',
    wm.preset ?? 'continental',
    wm.seed,
  );
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
    const workplace = entity.homeBuildingId == null ? undefined : buildingsById.get(entity.homeBuildingId);
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

export function saveGame(world: WorldState, view: ViewState): SaveResult {
  try {
    const saveData = buildSaveData(world, view);
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
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
      if (human && human.alive && human.homeBuildingId === church.id) {
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
  // Present values must be finite; absent ones are defaulted by the load path.
  for (const key of ['tick', 'width', 'height', 'nextEntityId', 'nextBuildingId'] as const) {
    if (parsed[key] !== undefined && !isFiniteNumber(parsed[key])) return key;
  }
  return findUnrestorableEntityField(parsed);
}

/** One `(field, rule)` pair — the shape every entity and building element is checked against. */
interface ElementFieldRule {
  field: string;
  isValid: (value: unknown) => boolean;
}

const ENTITY_TYPE_VALUES: ReadonlySet<unknown> = new Set(Object.values(EntityType));
const JOB_TYPE_VALUES: ReadonlySet<unknown> = new Set(Object.values(JobType));
const BUILDING_TYPE_VALUES: ReadonlySet<unknown> = new Set(Object.values(BuildingType));

/** Membership in one of the `as const` enums this file already imports for the restore path. */
function isMemberOf(values: ReadonlySet<unknown>): (value: unknown) => boolean {
  return (value) => values.has(value);
}

/** A finite number inside `[0, limit]` — the bound `assertSimInvariants` reports on a position. */
function isFiniteWithin(limit: number): (value: unknown) => boolean {
  return (value) => isFiniteNumber(value) && value >= 0 && value <= limit;
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
    { field: 'id', isValid: isFiniteNumber },
    { field: 'type', isValid: isMemberOf(ENTITY_TYPE_VALUES) },
    { field: 'x', isValid: isFiniteWithin(width) },
    { field: 'y', isValid: isFiniteWithin(height) },
    { field: 'age', isValid: isFiniteNumber },
    { field: 'job', isValid: isMemberOf(JOB_TYPE_VALUES) },
  ];
}

function buildingFieldRules(width: number, height: number): readonly ElementFieldRule[] {
  return [
    { field: 'id', isValid: isFiniteNumber },
    { field: 'type', isValid: isMemberOf(BUILDING_TYPE_VALUES) },
    { field: 'x', isValid: isFiniteWithin(width) },
    { field: 'y', isValid: isFiniteWithin(height) },
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
 * payload from a build that omitted it is accepted anyway. Returns `null` when either list is absent
 * or not an array — that is the restore's own `?? []`, not this function's business to refuse.
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
    const list = parsed[key];
    if (!Array.isArray(list)) continue;
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
    }
  }
  return null;
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
    const savedTicksPerDay = typeof source._ticksPerDay === 'number' && source._ticksPerDay > 0
      ? (source._ticksPerDay as number)
      : TICKS_PER_DAY;
    const autoSave = typeof worldData.autoSave === 'boolean'
      ? worldData.autoSave
      : loadAutoSavePreference();
    saveAutoSavePreference(autoSave);

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
      tick: loadedTick,
      lastProcessedCalendarDay: typeof worldData.lastProcessedCalendarDay === 'number'
        ? worldData.lastProcessedCalendarDay
        : undefined,
      dayInYear: 0,
      year: 0,
      paused: true,
      ...transient,
      bigNews: [],
      screenShakeImpulse: 0,
      festival: worldData.festival ?? null,
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
        tradesCompleted: g.tradesCompleted ?? 0,
        refugeeResolved: g.refugeeResolved ?? g.kind !== 'refugees',
        leaderTalked: g.leaderTalked ?? false,
        spawnedAtCalendarDay: g.spawnedAtCalendarDay,
      })),
      rivalSettlements: (worldData.rivalSettlements ?? []).map((r) => ({
        ...r,
        raidCooldownDays: r.raidCooldownDays ?? 30,
        peaceTreatyDays: r.peaceTreatyDays ?? 0,
      })),
      pendingDiplomacyEvents: worldData.pendingDiplomacyEvents ?? [],
      pendingRaidEvents: worldData.pendingRaidEvents ?? [],
      pendingOutgoingRaidEvents: worldData.pendingOutgoingRaidEvents ?? [],
      entities: (worldData.entities || []).map((e: Partial<Entity>) => {
        const entity = {
          childrenIds: [],
          generation: 0,
          spriteAngle: 0,
          animFrame: 0,
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
        migrateEntityPersistedFields(entity, e);
        if (entity.type === EntityType.Human && entity.spriteVariant === undefined && entity.gender) {
          entity.spriteVariant = pickHumanVariant(entity.id, entity.gender);
        }
        return entity;
      }),
    } as WorldState;

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

    syncEventLogIdFromState(world);
    syncBigNewsIdFromState(world);
    world.totalBuildingsCompleted = (world.buildings ?? []).filter(
      (b) => b.completed && b.faction !== 'rival',
    ).length;
    world.challenges = world.challenges?.length
      ? world.challenges
      : structuredClone(INITIAL_CHALLENGES);
    world.yearlyStats = world.yearlyStats ?? [];
    world.lifetimeStats = world.lifetimeStats ?? createEmptyLifetimeStats();
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

    migrateHumanAges(world.entities, { year: world.year, dayInYear: world.dayInYear });
    rebuildChildrenIds(world.entities);
    migrateLegacySecurityRoles(world);
    assignMissingResidences(world.entities.filter(isPlayerHuman), world.buildings, world.entities);
    assignMissingWorkers(world.entities.filter(isPlayerHuman), world.buildings, world);

    const applySaveMigration = (id: string, message: string) => {
      if (!world.appliedSaveMigrations) world.appliedSaveMigrations = [];
      if (world.appliedSaveMigrations.includes(id)) return;
      world.appliedSaveMigrations.push(id);
      logEvent(world, 'event', message);
    };

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

    mergeCombatResearchNodes(world.researchNodes);
    syncResearchUnlocks(world);
    world.tradeRoutes = ensureFullTradeRoutes(world.tradeRoutes ?? []);
    world.lifetimeStats.tradeCaravansCompleted ??= 0;
    world.lifetimeStats.goldFromTradeRoutes ??= 0;
    for (let i = 0; i < world.tradeRoutes.length; i++) {
      const route = world.tradeRoutes[i];
      enrichTradeRoute(route, world, i);
      if (route.active && route.caravanCarrierId == null && route.nextDepartureTick == null) {
        scheduleTradeRouteDeparture(world, route);
      }
    }
    world.villageLeaderId = (parsed.villageLeaderId as number | null | undefined) ?? null;
    world.leaderSinceYear = (parsed.leaderSinceYear as number | undefined) ?? 0;
    world.lastElectionYear = (parsed.lastElectionYear as number | undefined) ?? -1;
    world.pendingElectionYear = (parsed.pendingElectionYear as number | null | undefined) ?? null;
    world.electionBuildupNotifiedYear = (parsed.electionBuildupNotifiedYear as number | null | undefined) ?? null;
    world.electionCeremony = (parsed.electionCeremony as WorldState['electionCeremony']) ?? null;
    validateVillageLeaderOnLoad(world);
    ensureValleyEcologyOnLoad(world);
    migrateVillageForgeOnLoad(world);
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
    rebuildEntityByIdMap(world);
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

/** Load a colony from a downloaded .json file body. */
export function loadGameFromFileText(raw: string): { world: WorldState; view: ViewState } | null {
  const result = parseSaveJson(raw);
  if (!result.valid) return null;
  return loadGameFromParsed(result.parsed);
}

/**
 * A save in the browser slot that **this build can load** — not the same question as
 * `hasSaveSlot()`.
 */
export function hasSave(): boolean {
  return readSavePayload().valid;
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