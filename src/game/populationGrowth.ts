import { BuildingType, BUILDING_CONFIGS, type Building, type WorldState } from './gameTypes';
import { buildResidenceOccupancy, countHomelessSettlers, getResidenceCapacity, isLeaderHouseResidence, isAssignableHome } from './housingModel';
import { isPlayerHumanShiftOwner } from './playerHuman';

export interface PopulationSnapshot {
  pop: number;
  beds: number;
  houseCount: number;
  mansionCount: number;
  /** Beds inside the Leader's House complex: held for the leader's household, never assignable. */
  leaderHouseBeds: number;
}

interface PopulationSnapshotCacheEntry {
  tick: number;
  entityCount: number;
  buildingCount: number;
  buildingSignature: string;
  humanPopulation: number;
  totalBuildingsCompleted: number;
  snapshot: PopulationSnapshot;
}

const populationSnapshotCache = new WeakMap<WorldState, PopulationSnapshotCacheEntry>();

/** Allows external systems to manually invalidate the snapshot cache (e.g. after building upgrades). */
export function invalidatePopulationSnapshotCache(state?: WorldState): void {
  if (state) {
    populationSnapshotCache.delete(state);
  }
}

function computePopulationSnapshot(state: WorldState): PopulationSnapshot {
  let pop = 0;
  let beds = 0;
  let houseCount = 0;
  let mansionCount = 0;
  let leaderHouseBeds = 0;

  const entities = state.entities ?? [];
  const buildings = state.buildings ?? [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    // A cursed settler in Moon Howler form still sleeps in the manor and still counts toward `pop`.
    if (entity.alive && isPlayerHumanShiftOwner(entity)) pop += 1;
  }

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!isAssignableHome(building)) continue;
    beds += getResidenceCapacity(building);
    if (isLeaderHouseResidence(building)) leaderHouseBeds += getResidenceCapacity(building);
    if (building.type === BuildingType.House) houseCount += 1;
    else if (building.type === BuildingType.Mansion || building.type === BuildingType.Villa) mansionCount += 1;
  }

  return { pop, beds, houseCount, mansionCount, leaderHouseBeds };
}

/** Everything a bed projection depends on — level, type, ownership and completion. */
function buildingStateSignature(buildings: readonly Building[]): string {
  let signature = String(buildings.length);
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    signature += `|${building.id}:${building.type}:${building.level ?? 1}:${building.completed ? 1 : 0}:${building.faction ?? ''}`;
  }
  return signature;
}

/** Single-pass population/beds snapshot; cached per tick until population or building states change. */
export function snapshotPopulation(state: WorldState): PopulationSnapshot {
  const entityCount = state.entities?.length ?? 0;
  const buildings = state.buildings ?? [];
  const buildingCount = buildings.length;
  const humanPopulation = state.humanPopulation ?? 0;
  const totalBuildingsCompleted = state.totalBuildingsCompleted ?? 0;

  const cached = populationSnapshotCache.get(state);
  if (
    cached
    && cached.tick === state.tick
    && cached.entityCount === entityCount
    && cached.buildingCount === buildingCount
    && cached.humanPopulation === humanPopulation
    && cached.totalBuildingsCompleted === totalBuildingsCompleted
    && cached.buildingSignature === buildingStateSignature(buildings)
  ) {
    return cached.snapshot;
  }

  const snapshot = computePopulationSnapshot(state);
  populationSnapshotCache.set(state, {
    tick: state.tick,
    entityCount,
    buildingCount,
    buildingSignature: buildingStateSignature(buildings),
    humanPopulation,
    totalBuildingsCompleted,
    snapshot,
  });
  return snapshot;
}

function getFoodAmount(state: WorldState): number {
  const food = state.resources?.food;
  return typeof food === 'number' && Number.isFinite(food) ? Math.max(0, food) : 0;
}

function openCapSlots(cap: number, pop: number): number {
  return Math.max(0, Math.floor((cap || 0) - (pop || 0)));
}

/** The colony's reputation, or 0 when the field is absent or not a finite number. */
function resolveReputation(state: WorldState): number {
  return typeof state.villageReputation === 'number' && Number.isFinite(state.villageReputation)
    ? state.villageReputation
    : 0;
}

/**
 * The immigration cap every growth rule reads: the stored cap when finite, otherwise
 * 5 + beds + 1 per 10 reputation. One definition for the growth report and the header chip.
 */
export function resolvePopulationCap(state: WorldState): number {
  if (typeof state.maxHumanPopulation === 'number' && Number.isFinite(state.maxHumanPopulation)) {
    return state.maxHumanPopulation;
  }
  const { beds } = snapshotPopulation(state);
  return 5 + beds + Math.floor(resolveReputation(state) / 10);
}

/** Fraction of the immigration cap at which the HUD flags the colony as near-capacity. */
export const POPULATION_NEAR_CAP_RATIO = 0.9;

/**
 * True when the living population is within {@link POPULATION_NEAR_CAP_RATIO} of the
 * immigration cap. Owned here so both surfaces divide the same population by the same cap.
 */
export function isPopulationNearCap(state: WorldState): boolean {
  const cap = resolvePopulationCap(state);
  if (!(cap > 0)) return false;
  return snapshotPopulation(state).pop / cap >= POPULATION_NEAR_CAP_RATIO;
}

function formatHousingCapReason(
  houseCount: number,
  mansionCount: number,
  beds: number,
  pop: number,
): string {
  const houseBeds = BUILDING_CONFIGS[BuildingType.House]?.maxOccupants ?? 4;
  const mansionBeds = BUILDING_CONFIGS[BuildingType.Mansion]?.maxOccupants ?? 8;
  return (
    `Housing raises immigration cap by resident capacity `
    + `(houses ~${houseBeds} beds, mansions ~${mansionBeds} beds each; upgrades add +2 per level) `
    + `— ${houseCount} houses, ${mansionCount} mansions/villas (${beds} beds for ${pop} settlers).`
  );
}

function buildGrowthDetail(options: {
  paused: boolean;
  overcrowded: boolean;
  homeless: number;
  leaderHouseBeds: number;
  hasFoodWarning: boolean;
  food: number;
  pop: number;
  beds: number;
  cap: number;
  openSlots: number;
}): string {
  const parts: string[] = [];
  if (options.paused) {
    parts.push('Immigration and births are frozen while the game is paused.');
  }
  if (options.overcrowded) {
    parts.push(`${options.pop} settlers in ${options.beds} beds — housing is the bottleneck.`);
  } else if (options.homeless > 0) {
    const reserved = options.leaderHouseBeds > 0
      ? ` — ${options.leaderHouseBeds} Leader's House beds are reserved for the leader's household`
      : '';
    parts.push(`${options.homeless} settler${options.homeless === 1 ? '' : 's'} without a bed${reserved}.`);
  }
  if (options.hasFoodWarning) {
    parts.push(`Low food (${options.food}🍖) — newcomers are unlikely while stores are thin.`);
  }
  if (parts.length > 0) return parts.join(' ');
  return `${options.pop}/${options.cap} settlers · ${options.openSlots} slots until cap.`;
}

/** Completed player house/mansion slots (upgrades included). */
export function getTotalBeds(state: WorldState): number {
  return snapshotPopulation(state).beds;
}

export function getLivePlayerPopulation(state: WorldState): number {
  return snapshotPopulation(state).pop;
}

/** Returns remaining open beds against a projected or passed population count. */
export function getOpenBedsFromPop(state: WorldState, pop: number): number {
  const { pop: livePop, beds } = snapshotPopulation(state);
  if (typeof pop !== 'number' || !Number.isFinite(pop) || pop < 0) {
    return Math.max(0, beds - livePop);
  }
  return Math.max(0, beds - Math.floor(pop));
}

/**
 * Empty beds, counted over every residence — the Leader's House included. The inclusive
 * twin of {@link getOpenPlayerBeds}, which counts only beds a settler may be assigned.
 */
export function getOpenBeds(state: WorldState): number {
  const { pop, beds } = snapshotPopulation(state);
  return Math.max(0, beds - pop);
}

/**
 * `pop > beds` — more settlers than beds. One definition for the growth report's tone and the
 * Focus panel's "Build more housing" hint.
 */
export function isOvercrowded(state: WorldState): boolean {
  const { pop, beds } = snapshotPopulation(state);
  return pop > beds;
}

/**
 * Open beds a settler may actually be assigned: every residence except the Leader's House,
 * whose beds are reserved for the leader's household.
 */
export function getOpenPlayerBeds(state: WorldState): number {
  const entities = state.entities ?? [];
  const buildings = state.buildings ?? [];
  // Count occupied beds once. Calling countResidentsInBuilding separately for
  // every home scans the entire population B times (and blocks paused UI).
  const occupancy = buildResidenceOccupancy(entities);
  let open = 0;

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!isAssignableHome(building) || isLeaderHouseResidence(building)) continue;
    open += Math.max(0, getResidenceCapacity(building) - (occupancy.get(building.id) ?? 0));
  }

  return open;
}

export type PopulationGrowthTone = 'good' | 'warn' | 'blocked';

export interface PopulationGrowthReport {
  tone: PopulationGrowthTone;
  headline: string;
  detail: string;
  reasons: string[];
}

export function getPopulationGrowthReport(state: WorldState): PopulationGrowthReport {
  const { pop, beds, houseCount, mansionCount, leaderHouseBeds } = snapshotPopulation(state);
  const reputation = resolveReputation(state);

  const cap = resolvePopulationCap(state);

  const openSlots = openCapSlots(cap, pop);
  // Immigration and placement read assignable beds (`getOpenPlayerBeds`), so the report never offers
  // a reserved manor bed as spare housing and names the reservation instead.
  const openPlayerBeds = getOpenPlayerBeds(state);
  const homeless = countHomelessSettlers(state);
  const overcrowded = isOvercrowded(state);
  const food = getFoodAmount(state);
  const reasons: string[] = [];
  const hasFoodWarning = food < 40;
  const reservedBedsReason = leaderHouseBeds > 0
    ? `${leaderHouseBeds} Leader's House bed${leaderHouseBeds === 1 ? '' : 's'} reserved for the leader's household`
    : 'no assignable bed is free';

  if (state.paused) {
    reasons.push('Game is paused — immigration and births resume when time flows.');
  }

  if (pop >= cap) {
    reasons.push(`At population cap (${pop}/${cap}).`);
    reasons.push(formatHousingCapReason(houseCount, mansionCount, beds, pop));
    reasons.push(`⭐ Reputation adds cap (+1 per 10 rep, now ${reputation}).`);
    if (homeless > 0) {
      reasons.push(`${homeless} settler${homeless === 1 ? '' : 's'} without a bed — ${reservedBedsReason}.`);
    }
    return {
      tone: 'blocked',
      headline: 'Population cap reached',
      detail: overcrowded
        ? `${pop} settlers in ${beds} beds — build housing to sleep everyone, then raise cap with more houses.`
        : 'Immigration and recruitment stop until cap rises.',
      reasons,
    };
  }

  if (hasFoodWarning) {
    reasons.push(`Low food (${food}🍖) — newcomers are unlikely while stores are thin.`);
  }
  if (reputation < 25) {
    reasons.push(`Low reputation (${reputation}⭐) — immigrants arrive rarely. Trade and gifts raise rep.`);
  }
  if (overcrowded) {
    reasons.push(`${pop} settlers sharing ${beds} beds — build houses or mansions now.`);
  } else if (homeless > 0) {
    reasons.push(`${homeless} settler${homeless === 1 ? '' : 's'} without a bed — ${reservedBedsReason}.`);
  } else if (openPlayerBeds > 4 && openSlots > 4) {
    reasons.push(`${openPlayerBeds} empty beds and ${openSlots} cap slots available now.`);
  }
  if (!state.festival?.active && reputation < 60) {
    reasons.push('Festivals, a staffed Town Hall, and more housing speed immigration checks.');
  }

  if (reasons.length === 0) {
    return {
      tone: 'good',
      headline: 'Room to grow',
      detail: `${openSlots} cap slots open · immigrants arrive on periodic checks.`,
      reasons: [
        `Cap ${cap} (${pop} settlers now).`,
        'Houses and reputation are the main cap drivers.',
      ],
    };
  }

  const tone: PopulationGrowthTone = state.paused || overcrowded || homeless > 0 || hasFoodWarning ? 'warn' : 'good';
  const headline = state.paused
    ? 'Time paused — growth on hold'
    : overcrowded
      ? 'Overcrowded — build housing'
      : homeless > 0
        ? 'Housing shortage — build housing'
        : openSlots <= 8
          ? 'Growth slowing'
          : 'Growing steadily';
  const detail = buildGrowthDetail({
    paused: !!state.paused,
    overcrowded,
    homeless,
    leaderHouseBeds,
    hasFoodWarning,
    food,
    pop,
    beds,
    cap,
    openSlots,
  });

  return {
    tone,
    headline,
    detail,
    reasons,
  };
}