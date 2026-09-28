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
 * Season transition lerp — within `blendDays` of a season boundary the terrain
 * bake fades from the outgoing season's palette into the incoming one instead
 * of swapping instantly. Returns null far from a boundary.
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

export function hasTech(state: WorldState, techId: string): boolean {
  return state.unlockedTechs.includes(techId);
}

/**
 * Research effect targets whose additive (`effect.add`) values are TIERS rather than stackable
 * bonuses: the strongest researched tier applies and replaces the one below it. This is the
 * project's law — "Weapon/armor tiers replace lower ones — do not stack" (`frontierCombat.ts`,
 * restated by `militiaBalance.ts` and `guideHelp.ts`) — and summing these two targets is how
 * `counter_attack` 0.45 + 0.55 = 1.0 once made every predator contact a guaranteed kill.
 *
 * Named here so the rule has exactly one home. `ResearchEffect.replaces` is declared by the type
 * but no shipped node populates it, so the tier membership lives in this set.
 * Every other `add` target is genuinely additive and still sums.
 */
export const TIERED_ADD_TARGETS: ReadonlySet<string> = new Set(['counter_attack', 'predator_block']);

/** The combined research contribution for one effect target. */
export interface ResearchEffectTotals {
  /** Product of every declared `effect.multiplier` (1 when none is declared). */
  multiplier: number;
  /** Strongest tier for `TIERED_ADD_TARGETS`, otherwise the sum of every declared `effect.add`. */
  add: number;
}

/**
 * The single reader of `ResearchNode.effects` — every consumer of research effects goes through
 * here so the multiplier product and the additive combination rule cannot drift apart again.
 * Returns undefined when no researched node declares `target`.
 */
export function resolveResearchEffect(
  state: Pick<WorldState, 'researchNodes'>,
  target: string,
): ResearchEffectTotals | undefined {
  let multiplier = 1;
  let add = 0;
  let found = false;

  const nodes = state.researchNodes;
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

/**
 * Calculates compound technology bonuses (multipliers and flat additions)
 * for a specific effect key across all unlocked research nodes.
 */
export function getMultiplier(state: WorldState, key: string): number {
  const totals = resolveResearchEffect(state, key);
  return totals ? totals.multiplier + totals.add : 1;
}

/**
 * The reputation ceiling, exported so a reader that must ask "can reputation still rise?" compares
 * against the owner's own bound instead of re-typing `100`.
 *
 * The clamp below is the single definition; this constant is that definition named. A caller that
 * wrote `< 100` by hand would silently stop agreeing with the clamp the day it moved, which is the
 * same class of drift that let `storyHelpers` push reputation past the cap before it delegated here.
 */
export const REPUTATION_MAX = 100;

/**
 * Clamps reputation strictly between 0 and 100, and **returns the amount actually applied**.
 *
 * The return value is not decoration: the clamp means a request of `+4` can move the number by 0–4,
 * and a caller that wants to say "reputation rises" has to know which. Comparing the value before and
 * after works for that, but it is the same question asked with a wider window, and a caller that
 * instead tests `reputation < MAX` after the fact is wrong in both directions — it announces a rise
 * that a full bar refused, and (the bug this return value removes) it fires whenever the number
 * merely *sits* below the ceiling. `frontierCombat`'s leader-honored banner reads this.
 */
export function addReputation(state: WorldState, amount: number): number {
  const current = state.villageReputation ?? 0;
  const next = Math.max(0, Math.min(REPUTATION_MAX, current + amount));
  state.villageReputation = next;
  return next - current;
}

/**
 * The reputation bands — one definition for how the valley treats the village at each level.
 *
 * These live with `addReputation` because the band is a property of reputation itself, not of any
 * one consumer of it. Visitor caravans price their trade by band (`groupEvents`), and rival
 * settlements decide how likely they are to raid by the same band (`frontierCombat`), so the
 * thresholds cannot live in either owner without the other hand-writing them — which is exactly
 * what had happened (audit "Reputation 80/30 bands": three separate `>= 80` / `<= 30` literals).
 *
 * Retuning a threshold here moves both the prices and the raid odds together, by construction.
 */
export const REPUTATION_FRIENDLY_MIN = 80;
export const REPUTATION_HARSH_MAX = 30;

export type ReputationBand = 'friendly' | 'normal' | 'harsh';

/** The band a reputation sits in. The single classifier every consumer reads. */
export function getReputationBand(rep: number): ReputationBand {
  if (rep >= REPUTATION_FRIENDLY_MIN) return 'friendly';
  if (rep <= REPUTATION_HARSH_MAX) return 'harsh';
  return 'normal';
}

/**
 * Production penalty from pollution.
 * At 0% pollution: 1.0 · At 100% pollution: 0.5.
 * Lives here so daily production can import without coupling layers.
 */
export function getPollutionProductionMultiplier(state: WorldState): number {
  const pollution = state.pollutionLevel ?? 0;
  return Math.max(0.5, 1 - pollution / 200);
}