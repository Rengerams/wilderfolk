/**
 * Simulation helper utilities: season lookup, tech checks, multipliers, reputation.
 */
import type { WorldState } from './gameTypes';
import { Season } from './gameTypes';
import { Time } from './gameConstants';

/** Retrieves the active season based on the day of the year (0–359). */
export function getSeason(dayInYear: number): Season {
  const normalizedDay = ((dayInYear % Time.DAYS_PER_YEAR) + Time.DAYS_PER_YEAR) % Time.DAYS_PER_YEAR;
  if (normalizedDay < Time.DAYS_PER_SEASON) return Season.Spring;
  if (normalizedDay < Time.DAYS_PER_SEASON * 2) return Season.Summer;
  if (normalizedDay < Time.DAYS_PER_SEASON * 3) return Season.Fall;
  return Season.Winter;
}

/**
 * Season transition lerp — within `blendDays` of a boundary the terrain bake fades between seasons'
 * palettes instead of swapping instantly; null far from a boundary.
 */
export function seasonBlendForDay(
  dayInYear: number,
  blendDays = 5,
): { from: Season; to: Season; t: number } | null {
  const normalizedDay = ((dayInYear % Time.DAYS_PER_YEAR) + Time.DAYS_PER_YEAR) % Time.DAYS_PER_YEAR;
  const boundaries = [Time.DAYS_PER_SEASON, Time.DAYS_PER_SEASON * 2, Time.DAYS_PER_SEASON * 3, Time.DAYS_PER_YEAR];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const until = boundary - normalizedDay;
    if (until <= 0 || until > blendDays) continue;

    return {
      from: getSeason(boundary - 1),
      to: getSeason(boundary % Time.DAYS_PER_YEAR),
      t: 1 - until / blendDays,
    };
  }

  return null;
}

export function getReproductionMultiplier(season: Season): number {
  switch (season) {
    case Season.Spring:
      return 1.4;
    case Season.Summer:
      return 1.0;
    case Season.Fall:
      return 0.8;
    case Season.Winter:
      return 0.5;
    default:
      return 1.0;
  }
}

export function hasTech(state: Pick<WorldState, 'unlockedTechs'>, techId: string): boolean {
  return state.unlockedTechs.includes(techId);
}

export const TIERED_ADD_TARGETS: ReadonlySet<string> = new Set(['counter_attack', 'predator_block']);

/** The combined research contribution for one effect target. */
export interface ResearchEffectTotals {
  /** Product of every declared `effect.multiplier` (1 when none is declared). */
  multiplier: number;
  /** Strongest tier for `TIERED_ADD_TARGETS`, otherwise the sum of every declared `effect.add`. */
  add: number;
}


export function resolveResearchEffect(
  state: Pick<WorldState, 'researchNodes'>,
  target: string,
): ResearchEffectTotals | undefined {
  let multiplier = 1;
  let add = 0;
  let found = false;

  // Focused or legacy worlds may have no research tree; this means no bonuses.
  const nodes = state.researchNodes ?? [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.researched || !node.effects) continue;

    for (let j = 0; j < node.effects.length; j++) {
      const effect = node.effects[j];
      if (effect.target !== target) continue;
      found = true;

      if (typeof effect.multiplier === 'number') {
        multiplier *= effect.multiplier;
      }
      if (typeof effect.add === 'number') {
        add = TIERED_ADD_TARGETS.has(target) ? Math.max(add, effect.add) : add + effect.add;
      }
    }
  }

  return found ? { multiplier, add } : undefined;
}


export function getMultiplier(state: WorldState, key: string): number {
  const totals = resolveResearchEffect(state, key);
  return totals ? totals.multiplier + totals.add : 1;
}


export const REPUTATION_MAX = 100;


export function addReputation(state: WorldState, amount: number): number {
  const current = state.villageReputation ?? 0;
  const next = Math.max(0, Math.min(REPUTATION_MAX, current + amount));
  state.villageReputation = next;
  return next - current;
}


export const REPUTATION_FRIENDLY_MIN = 80;
export const REPUTATION_HARSH_MAX = 30;

export type ReputationBand = 'friendly' | 'normal' | 'harsh';

/** The band a reputation sits in. The single classifier every consumer reads. */
export function getReputationBand(rep: number): ReputationBand {
  if (rep >= REPUTATION_FRIENDLY_MIN) return 'friendly';
  if (rep <= REPUTATION_HARSH_MAX) return 'harsh';
  return 'normal';
}

export function getPollutionProductionMultiplier(state: WorldState): number {
  const pollution = state.pollutionLevel ?? 0;
  return Math.max(0.5, 1 - pollution / 200);
}