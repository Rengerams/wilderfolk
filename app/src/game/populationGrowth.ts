import { BuildingType, type WorldState } from './gameTypes';
import { getResidenceCapacity, isResidenceBuilding } from './dayCycle';
import { isPlayerHuman } from './groupEvents';

interface PopulationSnapshot {
  pop: number;
  beds: number;
  houseCount: number;
  mansionCount: number;
}

function snapshotPopulation(state: WorldState): PopulationSnapshot {
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

/** Completed player house/mansion slots (upgrades included). */
export function getTotalBeds(state: WorldState): number {
  return snapshotPopulation(state).beds;
}

export function getLivePlayerPopulation(state: WorldState): number {
  return snapshotPopulation(state).pop;
}

export function getOpenBedsFromPop(state: WorldState, pop: number): number {
  return Math.max(0, getTotalBeds(state) - pop);
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
  const openSlots = cap - pop;
  const openBeds = Math.max(0, beds - pop);
  const overcrowded = pop > beds;
  const reasons: string[] = [];
  let hasFoodWarning = false;

  if (state.paused) {
    reasons.push('Game is paused — immigration and births resume when time flows.');
  }

  if (pop >= cap) {
    reasons.push(`At population cap (${pop}/${cap}).`);
    reasons.push(
      `Houses raise immigration cap (+4 each) and add beds — ${houseCount} houses, ${mansionCount} mansions (${beds} beds for ${pop} settlers).`,
    );
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

  if (state.resources.food < 40) {
    hasFoodWarning = true;
    reasons.push(`Low food (${state.resources.food}🍖) — newcomers are unlikely while stores are thin.`);
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
  const detail = state.paused
    ? 'Immigration and births are frozen while the game is paused.'
    : overcrowded
      ? `${pop} settlers in ${beds} beds — housing is the bottleneck.`
      : `${pop}/${cap} settlers · ${openSlots} slots until cap.`;

  return {
    tone,
    headline,
    detail,
    reasons,
  };
}