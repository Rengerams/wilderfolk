import { BuildingType, BUILDING_CONFIGS, type WorldState } from './gameTypes';
import { countResidentsInBuilding, getResidenceCapacity, isLeaderHouseResidence, isResidenceBuilding } from './dayCycle';
import { isPlayerHuman } from './playerHuman';

export interface PopulationSnapshot {
  pop: number;
  beds: number;
  houseCount: number;
  mansionCount: number;
}

interface PopulationSnapshotCacheEntry {
  tick: number;
  entityCount: number;
  buildingCount: number;
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

  const entities = state.entities ?? [];
  const buildings = state.buildings ?? [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    if (entity.alive && isPlayerHuman(entity)) pop += 1;
  }

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building.completed || building.faction === 'rival' || !isResidenceBuilding(building)) continue;
    beds += getResidenceCapacity(building);
    if (building.type === BuildingType.House) houseCount += 1;
    else if (building.type === BuildingType.Mansion) mansionCount += 1;
  }

  return { pop, beds, houseCount, mansionCount };
}

/** Single-pass population/beds snapshot; cached per tick until population or building states change. */
export function snapshotPopulation(state: WorldState): PopulationSnapshot {
  const entityCount = state.entities?.length ?? 0;
  const buildingCount = state.buildings?.length ?? 0;
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
  ) {
    return cached.snapshot;
  }

  const snapshot = computePopulationSnapshot(state);
  populationSnapshotCache.set(state, {
    tick: state.tick,
    entityCount,
    buildingCount,
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
    + `— ${houseCount} houses, ${mansionCount} mansions (${beds} beds for ${pop} settlers).`
  );
}

function buildGrowthDetail(options: {
  paused: boolean;
  overcrowded: boolean;
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

export function getOpenBeds(state: WorldState): number {
  const { pop, beds } = snapshotPopulation(state);
  return Math.max(0, beds - pop);
}

/**
 * Open beds a settler may actually be assigned.
 *
 * `getOpenBeds` counts every residence, including the Leader's House — and those
 * beds are reserved for the leader's household (`leaderHouse.syncLeaderHouseResidency`
 * evicts anyone else and re-homes them), so they are not spare housing for the
 * rest of the colony. Counting them would read as "a settler was simply not
 * assigned a bed" while the village is in fact short of housing.
 */
export function getOpenPlayerBeds(state: WorldState): number {
  const entities = state.entities ?? [];
  const buildings = state.buildings ?? [];
  let open = 0;

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!isResidenceBuilding(building) || isLeaderHouseResidence(building)) continue;
    open += Math.max(0, getResidenceCapacity(building) - countResidentsInBuilding(entities, building.id));
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
  const { pop, beds, houseCount, mansionCount } = snapshotPopulation(state);
  const reputation = typeof state.villageReputation === 'number' && Number.isFinite(state.villageReputation)
    ? state.villageReputation
    : 0;

  const cap = typeof state.maxHumanPopulation === 'number' && Number.isFinite(state.maxHumanPopulation)
    ? state.maxHumanPopulation
    : 5 + beds + Math.floor(reputation / 10);

  const openSlots = openCapSlots(cap, pop);
  const openBeds = Math.max(0, beds - pop);
  const overcrowded = pop > beds;
  const food = getFoodAmount(state);
  const reasons: string[] = [];
  const hasFoodWarning = food < 40;

  if (state.paused) {
    reasons.push('Game is paused — immigration and births resume when time flows.');
  }

  if (pop >= cap) {
    reasons.push(`At population cap (${pop}/${cap}).`);
    reasons.push(formatHousingCapReason(houseCount, mansionCount, beds, pop));
    reasons.push(`⭐ Reputation adds cap (+1 per 10 rep, now ${reputation}).`);
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
  } else if (openBeds > 4 && openSlots > 4) {
    reasons.push(`${openBeds} empty beds and ${openSlots} cap slots available now.`);
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

  const tone: PopulationGrowthTone = state.paused || overcrowded || hasFoodWarning ? 'warn' : 'good';
  const headline = state.paused
    ? 'Time paused — growth on hold'
    : overcrowded
      ? 'Overcrowded — build housing'
      : openSlots <= 8
        ? 'Growth slowing'
        : 'Growing steadily';
  const detail = buildGrowthDetail({
    paused: !!state.paused,
    overcrowded,
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