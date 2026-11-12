import type { BuildingType } from './gameTypes';


export const WORKFORCE_PRESETS = ['survival', 'growth', 'defense', 'comfort'] as const;

export type WorkforcePreset = (typeof WORKFORCE_PRESETS)[number];

/** A colony-wide auto-staffing priority preset. */
export type WorkforcePolicy = WorkforcePreset;

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
  graveyard: 'graveyard',
  square: 'square',
  prison: 'prison',
  well: 'well',
  road: 'road',
  mansion: 'mansion',
  villa: 'villa',
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
  groundReinforcement: 'groundReinforcement',
  garden: 'garden',
  statue: 'statue',
  lamp: 'lamp',
  fence: 'fence',
};

/** Canonical id of a job building, typed as the `BuildingType` union. */
function jobBuildingId(key: BuildingType): BuildingType {
  return JOB_BUILDING_IDS[key] as BuildingType;
}


const PRESET_BUILDING_ORDER: Readonly<Record<WorkforcePreset, readonly BuildingType[]>> = {
  survival: [
    jobBuildingId('farm'),
    jobBuildingId('greenhouse'),
    jobBuildingId('fishingSpot'),
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
    jobBuildingId('fishingSpot'),
    jobBuildingId('huntingSpot'),
    jobBuildingId('school'),
    jobBuildingId('hospital'),
    jobBuildingId('townHall'),
    jobBuildingId('hotel'),
    jobBuildingId('tavern'),
    jobBuildingId('church'),
  ],
  defense: [
    // "Barracks and watch first": the guard posts outrank every trade, including the ones that
    // arm them — a preset that staffed the tavern before the barracks inverted its own headline.
    jobBuildingId('barracks'),
    jobBuildingId('prison'),
    jobBuildingId('mine'),
    jobBuildingId('blacksmith'),
    jobBuildingId('workshop'),
    jobBuildingId('quarry'),
    jobBuildingId('lumberMill'),
    jobBuildingId('hospital'),
    jobBuildingId('farm'),
    jobBuildingId('greenhouse'),
    jobBuildingId('fishingSpot'),
    jobBuildingId('huntingSpot'),
    jobBuildingId('store'),
    jobBuildingId('market'),
    jobBuildingId('townHall'),
    jobBuildingId('school'),
    jobBuildingId('tavern'),
    jobBuildingId('hotel'),
    jobBuildingId('church'),
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
    jobBuildingId('fishingSpot'),
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
 * Set the colony workforce policy; returns the original state unchanged (identity, so no delta is
 * produced) when the preset is unknown or already current. Generic to stay out of the import cycle.
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
