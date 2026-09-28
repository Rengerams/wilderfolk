import type { BuildingType } from './gameTypes';

/**
 * Workforce Policy Presets — roadmap F3 (Roadmap_V0_6.4.1.MD line 36).
 *
 * A preset is *only* a priority order over which job building receives the next idle
 * worker. It is the strategic layer on top of auto-staffing; it is never an authority
 * over an existing assignment:
 *
 * - A preset never takes a worker away from a manual assignment. The auto-staff pass
 *   (`workforce.assignMissingWorkers`) only *adds* idle settlers to open slots — it has
 *   no removal path at all — and the one transfer path (`rebalanceJobWorkers`) only
 *   donors from a building holding two or more workers, so a hand-placed worker is
 *   never moved by a preset.
 * - `removeWorkerFromBuilding` keeps working: it is a player-command removal that runs
 *   through `workforce.removeWorkerTransition`, which does not read this module. Changing
 *   the preset cannot refuse or reroute that removal.
 * - Per-building `staffingMode: 'manual'` (`workforce.isManualStaffingBuilding`) still
 *   wins: a manual building is skipped by the auto pass under every preset. The preset is
 *   the colony-wide default behind that per-building override, never in front of it.
 *
 * `gameTypes` is imported as a **type only**: this owner must not sit in a runtime import
 * cycle with the god file. The ordering table below spells its building types as string
 * literals, which the `readonly BuildingType[]` annotation still validates against the
 * `BuildingType` union — a mechanism the repo already uses for its typed catalogues
 * (`visitorQuest.ts`, `workshops.ts`, `huntingSpots.ts`).
 *
 * Invariant guarded by `tests/workforcePolicy.presets.test.ts`.
 */

/** The four strategic presets, in display order. */
export const WORKFORCE_PRESETS = ['survival', 'growth', 'defense', 'comfort'] as const;

export type WorkforcePreset = (typeof WORKFORCE_PRESETS)[number];

/** A colony-wide auto-staffing priority preset. */
export type WorkforcePolicy = WorkforcePreset;

/**
 * The default preset for a new colony **and** for a save written before this field existed.
 * `Survival` reproduces the historical `AUTO_JOB_BUILDING_PRIORITY` order exactly, so an old
 * save loads with unchanged auto-staffing behaviour (see the survival row below).
 */
export const DEFAULT_WORKFORCE_POLICY: WorkforcePolicy = 'survival';

/** Player-facing preset copy — the single definition, read by the work-schedule panel. */
export const WORKFORCE_PRESET_DETAILS: Readonly<
  Record<WorkforcePreset, { label: string; description: string }>
> = {
  survival: {
    label: 'Survival',
    description: 'Feed the colony first: farms and foraging before everything else.',
  },
  growth: {
    label: 'Growth',
    description: 'Build the economy: timber, stone and ore before food and services.',
  },
  defense: {
    label: 'Defense',
    description: 'Guard the valley: barracks and watch first, then the trades that arm them.',
  },
  comfort: {
    label: 'Comfort',
    description: 'Keep settlers content: taverns, inns and markets before the trades.',
  },
};

/**
 * Tunable: the position at which a job building that a preset does not name is ranked.
 * Unnamed types sort after every named type, in building-id order among themselves.
 */
export const UNRANKED_JOB_BUILDING_RANK = Number.MAX_SAFE_INTEGER;

/**
 * Every assignable job building, as its canonical id. The `Record<BuildingType, string>`
 * annotation makes this mapping exhaustive and typo-proof without a value import of
 * `buildings.ts`, which is what keeps this owner out of a runtime import cycle.
 */
const JOB_BUILDING_IDS: Readonly<Record<BuildingType, string>> = {
  house: 'house',
  farm: 'farm',
  greenhouse: 'greenhouse',
  barn: 'barn',
  silo: 'silo',
  woodStorehouse: 'woodStorehouse',
  lumberMill: 'lumberMill',
  quarry: 'quarry',
  mine: 'mine',
  mill: 'mill',
  blacksmith: 'blacksmith',
  workshop: 'workshop',
  store: 'store',
  market: 'market',
  school: 'school',
  hospital: 'hospital',
  townHall: 'townHall',
  leaderHouse: 'leaderHouse',
  church: 'church',
  prison: 'prison',
  well: 'well',
  road: 'road',
  mansion: 'mansion',
  tamingPost: 'tamingPost',
  wall: 'wall',
  wallGate: 'wallGate',
  watchtower: 'watchtower',
  barracks: 'barracks',
  huntingSpot: 'huntingSpot',
  fishingSpot: 'fishingSpot',
  wildlifePreserve: 'wildlifePreserve',
  tavern: 'tavern',
  hotel: 'hotel',
  bridge: 'bridge',
  garden: 'garden',
  statue: 'statue',
  lamp: 'lamp',
  fence: 'fence',
};

/** Canonical id of a job building, typed as the `BuildingType` union. */
function jobBuildingId(key: BuildingType): BuildingType {
  return JOB_BUILDING_IDS[key] as BuildingType;
}

/**
 * The one ordering table. Each preset is a list of job buildings from highest to lowest
 * priority; every preset's spillover tail is the unranked rule above. There is deliberately
 * no per-preset branch anywhere — `jobBuildingPriorityForPolicy` walks this table.
 *
 * `survival` is the historical auto-staff order (`workforce.AUTO_JOB_BUILDING_PRIORITY`),
 * kept verbatim so the default preset is behaviour-preserving.
 */
const PRESET_BUILDING_ORDER: Readonly<Record<WorkforcePreset, readonly BuildingType[]>> = {
  survival: [
    jobBuildingId('farm'),
    jobBuildingId('greenhouse'),
    jobBuildingId('huntingSpot'),
    jobBuildingId('lumberMill'),
    jobBuildingId('quarry'),
    jobBuildingId('mine'),
    jobBuildingId('blacksmith'),
    jobBuildingId('workshop'),
    jobBuildingId('store'),
    jobBuildingId('market'),
    jobBuildingId('school'),
    jobBuildingId('hospital'),
    jobBuildingId('townHall'),
    jobBuildingId('church'),
    jobBuildingId('tavern'),
    jobBuildingId('hotel'),
  ],
  growth: [
    jobBuildingId('lumberMill'),
    jobBuildingId('quarry'),
    jobBuildingId('mine'),
    jobBuildingId('workshop'),
    jobBuildingId('blacksmith'),
    jobBuildingId('store'),
    jobBuildingId('market'),
    jobBuildingId('greenhouse'),
    jobBuildingId('farm'),
    jobBuildingId('huntingSpot'),
    jobBuildingId('school'),
    jobBuildingId('hospital'),
    jobBuildingId('townHall'),
    jobBuildingId('hotel'),
    jobBuildingId('tavern'),
    jobBuildingId('church'),
  ],
  defense: [
    jobBuildingId('mine'),
    jobBuildingId('blacksmith'),
    jobBuildingId('workshop'),
    jobBuildingId('quarry'),
    jobBuildingId('lumberMill'),
    jobBuildingId('hospital'),
    jobBuildingId('farm'),
    jobBuildingId('greenhouse'),
    jobBuildingId('huntingSpot'),
    jobBuildingId('store'),
    jobBuildingId('market'),
    jobBuildingId('townHall'),
    jobBuildingId('school'),
    jobBuildingId('tavern'),
    jobBuildingId('hotel'),
    jobBuildingId('church'),
    // Named, but never auto-filled: `workforce.MANUAL_STAFF_BUILDINGS` has the player staff
    // Barracks and Prison by hand under every preset. They are listed so the preset states the
    // intended order out loud rather than leaving the two defense workplaces unranked.
    jobBuildingId('barracks'),
    jobBuildingId('prison'),
  ],
  comfort: [
    jobBuildingId('tavern'),
    jobBuildingId('hotel'),
    jobBuildingId('market'),
    jobBuildingId('store'),
    jobBuildingId('greenhouse'),
    jobBuildingId('hospital'),
    jobBuildingId('church'),
    jobBuildingId('school'),
    jobBuildingId('townHall'),
    jobBuildingId('farm'),
    jobBuildingId('huntingSpot'),
    jobBuildingId('lumberMill'),
    jobBuildingId('quarry'),
    jobBuildingId('mine'),
    jobBuildingId('blacksmith'),
    jobBuildingId('workshop'),
  ],
};

/** True when `value` is one of the four named presets. */
export function isWorkforcePreset(value: unknown): value is WorkforcePreset {
  return typeof value === 'string' && (WORKFORCE_PRESETS as readonly string[]).includes(value);
}

/**
 * Parse untrusted input (save payload, worker command) into a preset, falling back to the
 * documented default rather than throwing — the same contract `normalizeWorkSchedule` has.
 */
export function normalizeWorkforcePolicy(value: unknown): WorkforcePolicy {
  return isWorkforcePreset(value) ? value : DEFAULT_WORKFORCE_POLICY;
}

/** The colony's effective preset — a world that predates the field reads as the default. */
export function getWorkforcePolicy(state: { workforcePolicy?: unknown }): WorkforcePolicy {
  return normalizeWorkforcePolicy(state.workforcePolicy);
}

export function getWorkforcePresetLabel(preset: WorkforcePreset): string {
  return WORKFORCE_PRESET_DETAILS[preset].label;
}

export function getWorkforcePresetDescription(preset: WorkforcePreset): string {
  return WORKFORCE_PRESET_DETAILS[preset].description;
}

/**
 * Rank of one job building under `preset`: lower is served first by the auto pass.
 * Unnamed types share `UNRANKED_JOB_BUILDING_RANK` and fall back to building-id order.
 */
export function jobBuildingPriorityForPolicy(
  preset: WorkforcePolicy,
  type: BuildingType,
): number {
  const index = PRESET_BUILDING_ORDER[preset].indexOf(type);
  return index === -1 ? UNRANKED_JOB_BUILDING_RANK : index;
}

/**
 * Set the colony workforce policy. Returns the original state unchanged (identity, so no
 * delta is produced) when the preset is unknown or already current.
 *
 * Generic over the world shape so this owner imports no `WorldState` value and stays out of
 * the `gameTypes.ts` import cycle.
 */
export function setWorkforcePolicy<T extends { workforcePolicy?: WorkforcePolicy }>(
  originalState: T,
  preset: WorkforcePolicy,
): T {
  if (!isWorkforcePreset(preset)) return originalState;
  if (getWorkforcePolicy(originalState) === preset) return originalState;

  return {
    ...originalState,
    workforcePolicy: preset,
  };
}

/**
 * The player-facing option list. The panel renders exactly this, so a new preset is a change
 * to this module alone — the view restates no ordering or copy.
 */
export const WORKFORCE_PRESET_OPTIONS: readonly { preset: WorkforcePreset; label: string; description: string }[] =
  WORKFORCE_PRESETS.map((preset) => ({
    preset,
    label: WORKFORCE_PRESET_DETAILS[preset].label,
    description: WORKFORCE_PRESET_DETAILS[preset].description,
  }));
