import { BuildingType, BUILDING_CONFIGS, type WorldState } from './gameTypes';
import { getResidenceCapacity, isResidenceBuilding } from './dayCycle';
import { isPlayerHuman } from './groupEvents';

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
  snapshot: PopulationSnapshot;
}

const populationSnapshotCache = new WeakMap<WorldState, PopulationSnapshotCacheEntry>();

function computePopulationSnapshot(state: WorldState): PopulationSnapshot {
  let pop = 0;
  let beds = 0;
  let houseCount = 0;
  let mansionCount = 0;

  for (const entity of state.entities) {
    if (entity.alive && isPlayerHuman(entity)) pop += 1;
  }
  for (const building of state.buildings) {
    if (!building.completed || building.faction === 'rival' || !isResidenceBuilding(building)) continue;
    beds += getResidenceCapacity(building);
    if (building.type === BuildingType.House) houseCount += 1;
    else if (building.type === BuildingType.Mansion) mansionCount += 1;
  }

  return { pop, beds, houseCount, mansionCount };
}

/** Single-pass population/beds snapshot; cached per tick until entity/building counts change. */
export function snapshotPopulation(state: WorldState): PopulationSnapshot {
  const entityCount = state.entities.length;
  const buildingCount = state.buildings.length;
  const cached = populationSnapshotCache.get(state);
  if (
    cached
    && cached.tick === state.tick
    && cached.entityCount === entityCount
    && cached.buildingCount === buildingCount
  ) {
    return cached.snapshot;
  }

  const snapshot = computePopulationSnapshot(state);
  populationSnapshotCache.set(state, {
    tick: state.tick,
    entityCount,
    buildingCount,
    snapshot,
  });
  return snapshot;
}

function getFoodAmount(state: WorldState): number {
  const food = state.resources?.food;
  return typeof food === 'number' && Number.isFinite(food) ? Math.max(0, food) : 0;
}

function openCapSlots(cap: number, pop: number): number {
  return Math.max(0, Math.floor(cap - pop));
}

function formatHousingCapReason(
  houseCount: number,
  mansionCount: number,
  beds: number,
  pop: number,
): string {
  const houseBeds = BUILDING_CONFIGS[BuildingType.House].maxOccupants;
  const mansionBeds = BUILDING_CONFIGS[BuildingType.Mansion].maxOccupants;
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

export function getOpenBedsFromPop(state: WorldState, pop: number): number {
  const { pop: livePop, beds } = snapshotPopulation(state);
  if (!Number.isFinite(pop)) return Math.max(0, beds - livePop);
  const normalizedPop = Math.max(0, Math.floor(pop));
  const effectivePop = normalizedPop > livePop ? livePop : normalizedPop;
  return Math.max(0, beds - effectivePop);
}

export function getOpenBeds(state: WorldState): number {
  const { pop, beds } = snapshotPopulation(state);
  return Math.max(0, beds - pop);
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
  const cap = state.maxHumanPopulation;
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
    reasons.push(`⭐ Reputation adds cap (+1 per 10 rep, now ${state.villageReputation}).`);
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
  if (state.villageReputation < 25) {
    reasons.push(`Low reputation (${state.villageReputation}⭐) — immigrants arrive rarely. Trade and gifts raise rep.`);
  }
  if (overcrowded) {
    reasons.push(`${pop} settlers sharing ${beds} beds — build houses or mansions now.`);
  } else if (openBeds > 4 && openSlots > 4) {
    reasons.push(`${openBeds} empty beds and ${openSlots} cap slots available now.`);
  }
  if (!state.festival?.active && state.villageReputation < 60) {
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
    paused: state.paused,
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