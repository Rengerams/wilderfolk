import type { WorldState, Entity } from './gameTypes';
import { EntityType, BuildingType, DEFAULT_WORKSHOP_RECIPE_ID, INITIAL_CHALLENGES } from './gameTypes';
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
  TICKS_PER_DAY, DAYS_PER_YEAR, LEGACY_TICKS_PER_DAY,
  assignMissingResidences,
} from './dayCycle';
import { mergeCombatResearchNodes } from './combat';
import { loadAutoSavePreference, saveAutoSavePreference } from './preferences';
import { logEvent, syncEventLogIdFromState } from './eventLog';
import { pickHumanVariant } from './humanSprites';
import { migrateLegacyMoonHowler, syncMoonHowlerForms } from './moonHowler';
import { isPlayerHuman } from './playerHuman';
import { GAME_VERSION } from './version';
import { ensureEntitySkills } from './skills';

import { seedTutorialSeenForExistingState } from './contextualTutorial';
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
import { ensureFullTradeRoutes } from './economy';
import { enrichTradeRoute, scheduleTradeRouteDeparture } from './tradeCaravans';
import { clearAllFactionWanderStates } from './factionWander';
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

export type SaveReadResult =
  | { valid: false }
  | { valid: true; parsed: Record<string, unknown> };

function pickWorldStateFromSave(parsed: Record<string, unknown>): Partial<WorldState> {
  const out: Partial<WorldState> = {};
  for (const key of WORLD_STATE_SAVE_KEYS) {
    if (key in parsed) (out as Record<string, unknown>)[key] = parsed[key];
  }
  return out;
}

/** Parse save JSON from localStorage or a downloaded .json file. */
export function parseSaveJson(raw: string | null | undefined): SaveReadResult {
  try {
    if (!raw || !raw.trim()) return { valid: false };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Beta: no historical-save compatibility — only the exact current build's
    // saves load. Old-version saves are rejected (start a new settlement).
    if (parsed._version !== GAME_VERSION) {
      return { valid: false };
    }
    return { valid: true, parsed };
  } catch (e) {
    console.error('Save parse failed:', e);
    return { valid: false };
  }
}

export function readSavePayload(): SaveReadResult {
  try {
    return parseSaveJson(localStorage.getItem(SAVE_KEY));
  } catch (e) {
    console.error('Save read failed:', e);
    return { valid: false };
  }
}

/** Build the JSON object written to browser storage or a .json file. */
export function buildSaveData(world: WorldState, view: ViewState): Record<string, unknown> {
  const persistable = stripRuntimeWorldFields(world);
  return {
    ...mergeForSave(persistable, view),
    worldMap: compactWorldMapForSave(persistable.worldMap),
    _savedAt: Date.now(),
    _version: GAME_VERSION,
    _ticksPerDay: TICKS_PER_DAY,
  };
}

export function buildSaveFilename(villageName: string, year: number, dayInYear: number): string {
  const safe = (villageName || 'village')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'village';
  return `wilderfolk-${safe}-Y${year}-D${dayInYear}.json`;
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
      // BUG-4: revoking synchronously can cancel the download in some browsers
      // (Firefox/older Chromium) — defer the revoke to the next task.
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
  if (parsed.worldMap.tiles && !parsed.worldMap._compact) {
    return parsed.worldMap;
  }
  return generateWorldMap(
    parsed.worldMap.size ?? 'medium',
    parsed.worldMap.preset ?? 'verdant',
    parsed.worldMap.seed
  );
}

/** Strip per-tick runtime indexes before persistence (not in WORLD_STATE_SAVE_KEYS). */
function stripRuntimeWorldFields(world: WorldState): WorldState {
  const {
    entityByType: _entityByType,
    grassGrid: _grassGrid,
    mobileGrid: _mobileGrid,
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
    scaleField(rec, 'lastMetPartner');
    // pregnancyProgress is 0..PREGNANCY_TICKS absolute progress — scale with day length
    scaleField(rec, 'pregnancyProgress');
    // Nested snapshot while hunting (EK-C5) — same absolute progress units
    const saved = rec.moonHowlerSaved;
    if (saved && typeof saved === 'object') {
      scaleField(saved as Record<string, unknown>, 'pregnancyProgress');
    }
    // chatTicks / combatTicks are short remaining counters — leave unscaled
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

/**
 * One-time legacy migration — Church manual staffing.
 *
 * Older 0.6.1-line saves can contain Churches that were auto-filled before
 * manual priest selection existed. The Church must start empty until the
 * player assigns a priest (SIMULATION_AUTHORITY.md §5: "The Church has capacity
 * for four but requires only the player-selected priest"; manual buildings are
 * never filled by generic auto-staffing).
 *
 * Clears every occupant of a completed player Church through the workforce
 * owner's removal transition and returns the number of cleared seats. Uses
 * `removeWorkerTransition` so `homeBuildingId` / `occupation` / `job` stay
 * consistent; occupants who were never the assigned worker are only dropped
 * from the list.
 */
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

/** Hydrate a world+view from an already-parsed save object (browser or file). */
export function loadGameFromParsed(parsed: Record<string, unknown>): { world: WorldState; view: ViewState } | null {
  try {
    const worldData = pickWorldStateFromSave(parsed);

    let loadedTick = (worldData.tick ?? (parsed.tick as number | undefined) ?? 0) as number;
    const savedTicksPerDay = typeof parsed._ticksPerDay === 'number' && parsed._ticksPerDay > 0
      ? (parsed._ticksPerDay as number)
      : LEGACY_TICKS_PER_DAY;
    const autoSave = typeof worldData.autoSave === 'boolean'
      ? worldData.autoSave
      : loadAutoSavePreference();
    saveAutoSavePreference(autoSave);

    const transient = restoreTransientWorldFieldsFromSave(parsed);
    const world = {
      ...worldData,
      buildings: worldData.buildings ?? [],
      scentGrid: undefined,
      autoSave,
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
      storageMax: worldData.storageMax || { wood: 800, stone: 300, food: 800, gold: 20000, iron: 300 },
      foodSpoilageRate: worldData.foodSpoilageRate ?? 0.03,
      eventLog: worldData.eventLog || [],
      worldMap: restoreWorldMapFromSave(parsed),
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
    for (const entity of world.entities) {
      // Legacy permanent-werewolf → cursed; early-out when already cursed (EK-C4).
      migrateLegacyMoonHowler(entity, colonyDayOnLoad, hourOnLoad);
    }
    // Form must match full-moon night window after load — migrateLegacy alone is not enough.
    syncMoonHowlerForms(
      world.entities,
      colonyDayOnLoad,
      hourOnLoad,
      world.buildings,
      world.width ?? 1200,
      world.height ?? 900,
      loadedTick,
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
    // Valley Chronicle (added mid-0.5.4.2) — same-version saves predating it default to empty.
    if (!Array.isArray(world.chronicleChapters)) {
      world.chronicleChapters = [];
    }
    // Iron was added mid-0.5.4.2 — backfill saves that predate it (same _version).
    if (typeof (world.resources as { iron?: unknown }).iron !== 'number') {
      (world.resources as { iron: number }).iron = 0;
    }
    if (typeof (world.storageMax as { iron?: unknown }).iron !== 'number') {
      (world.storageMax as { iron: number }).iron = 300;
    }
    world.wildlifeCounts = computeWildlifeCounts(world.entities);
    world.workingSettlers = world.workingSettlers ?? 0;
    world.idleSettlers = world.idleSettlers ?? 0;

    world.buildings = (world.buildings || []).map((b) =>
      b.type === BuildingType.Workshop && !b.workshopRecipeId
        ? { ...b, workshopRecipeId: DEFAULT_WORKSHOP_RECIPE_ID }
        : b,
    );

    const saveVersion = parsed._version as string;
    const forceAgeMigration = saveVersion === '0.4' || saveVersion === '0.4.1';
    migrateHumanAges(
      world.entities,
      { year: world.year, dayInYear: world.dayInYear },
      { forceCalendar: forceAgeMigration },
    );
    rebuildChildrenIds(world.entities);
    assignMissingResidences(world.entities.filter(isPlayerHuman), world.buildings, world.entities);
    assignMissingWorkers(world.entities.filter(isPlayerHuman), world.buildings);

    const applySaveMigration = (id: string, message: string) => {
      if (!world.appliedSaveMigrations) world.appliedSaveMigrations = [];
      if (world.appliedSaveMigrations.includes(id)) return;
      world.appliedSaveMigrations.push(id);
      logEvent(world, 'event', message);
    };

    if (forceAgeMigration) {
      world.foodSpoilageRate = 0.03;
      applySaveMigration('v0.4', 'Save migrated to v0.4 — calendar, housing, and balance refreshed.');
    }

    if (saveVersion === '0.4') {
      applySaveMigration('v0.4.1', 'Save migrated to v0.4.1 — diplomacy, leadership, trade routes, and victory paths refreshed.');
    }

    if (saveVersion === '0.4.1' || saveVersion === '0.4') {
      applySaveMigration('v0.4.2', 'Save migrated to v0.4.2 — 6-tab UI, forge, defense buildings, and balance pass features are active.');
    }

    if (saveVersion === '0.4.2' || saveVersion === '0.4.1' || saveVersion === '0.4') {
      applySaveMigration(
        'v0.5.0',
        'Save migrated to v0.5.0 — scale foundation, sim trust pass (Batch EK), and forge tier 5 (swords, scale mail, ballistae).',
      );
    }

    if (
      saveVersion === '0.5.0' ||
      saveVersion === '0.4.2' ||
      saveVersion === '0.4.1' ||
      saveVersion === '0.4'
    ) {
      applySaveMigration(
        'v0.5.1',
        'Save migrated to v0.5.1 — clearer valley: fairer raid spoils and presentation polish.',
      );
    }

    // Church manual staffing (one-time): older 0.6.1-line saves may carry
    // Churches auto-filled before manual priest selection existed. The Church
    // must be empty until the player assigns a priest — never auto-refilled.
    const clearedChurchSeats = clearAutoFilledChurches(world);
    if (clearedChurchSeats > 0) {
      applySaveMigration(
        'church-manual-staffing',
        `Save migrated — ${clearedChurchSeats} auto-filled Church seat(s) cleared; assign a priest manually.`,
      );
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
    const view = createViewFromSave(parsed, world);
    return { world, view };
  } catch (e) {
    console.error('Save load failed:', e);
    return null;
  }
}

export function loadGame(): { world: WorldState; view: ViewState } | null {
  try {
    const result = readSavePayload();
    if (!result.valid) return null;
    return loadGameFromParsed(result.parsed);
  } catch (e) {
    console.error('Save load failed:', e);
    return null;
  }
}

/** Load a colony from a downloaded .json file body. */
export function loadGameFromFileText(raw: string): { world: WorldState; view: ViewState } | null {
  const result = parseSaveJson(raw);
  if (!result.valid) return null;
  return loadGameFromParsed(result.parsed);
}

export function hasSave(): boolean {
  return readSavePayload().valid;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
