/**
 * Single source of truth for militia / barricade strength (frontier raids).
 * Weapon and armor tiers do not stack — higher replaces lower (stone → iron → sword / wooden → iron → scale).
 */

import type { Entity, WorldState } from './gameTypes';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import {
  hasIronShields,
  hasIronSpears,
  hasIronSwords,
  hasScaleMail,
  hasStoneSpears,
  hasWoodenShields,
} from './combat';
import {
  getBarracksGuardBonus,
  getBarracksGuardCount,
  countCompletedDefenseBuildings,
  getWallSegmentBonus,
  getWallSegmentCap,
  getWatchtowerBonus,
  MILITIA_BALANCE,
} from './defenseStructures';
import { BuildingType, JobType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { isImprisoned } from './housingModel';
import { evaluateAptitudeInfluence } from './personality/traitEvaluation';

/** Each already-mustered soldier's own defensive aptitude, applied to that soldier's base only. */

/** Weapon tier used for militia multiplier (legacy name kept for call sites). */
type MilitiaSpearTier = 'none' | 'stone' | 'iron' | 'sword';
/** Armor tier used for militia flat bonus. */
type MilitiaShieldTier = 'none' | 'wooden' | 'iron' | 'scale';

export interface MilitiaBreakdown {
  adultCount: number;
  guardCount: number;
  spearTier: MilitiaSpearTier;
  shieldTier: MilitiaShieldTier;
  spearMultiplier: number;
  shieldPerAdult: number;
  militiaStrength: number;
  barricadeStrength: number;
  structureBonus: number;
  lines: string[];
}

/** One chain per armament, strongest first: a researched tier replaces every lower one. */
const SPEAR_TIER_CHAIN: readonly (readonly [MilitiaSpearTier, (state: WorldState) => boolean])[] = [
  ['sword', hasIronSwords],
  ['iron', hasIronSpears],
  ['stone', hasStoneSpears],
];
const SHIELD_TIER_CHAIN: readonly (readonly [MilitiaShieldTier, (state: WorldState) => boolean])[] = [
  ['scale', hasScaleMail],
  ['iron', hasIronShields],
  ['wooden', hasWoodenShields],
];

const SPEAR_TIER_MULTIPLIER: Readonly<Record<MilitiaSpearTier, number>> = {
  sword: MILITIA_BALANCE.ironSwordMult,
  iron: MILITIA_BALANCE.ironSpearMult,
  stone: MILITIA_BALANCE.stoneSpearMult,
  none: 1,
};
const SHIELD_TIER_PER_ADULT: Readonly<Record<MilitiaShieldTier, number>> = {
  scale: MILITIA_BALANCE.scaleMailPerAdult,
  iron: MILITIA_BALANCE.ironShieldPerAdult,
  wooden: MILITIA_BALANCE.woodenShieldPerAdult,
  none: 0,
};

/** Highest tier researched along an armament chain; `'none'` when nothing is researched. */
function getMilitiaTier<T extends string>(
  state: WorldState,
  chain: readonly (readonly [T, (state: WorldState) => boolean])[],
): T | 'none' {
  for (const [tier, isResearched] of chain) if (isResearched(state)) return tier;
  return 'none';
}

export function getMilitiaArmamentLabel(state: WorldState): string | null {
  const spear = getMilitiaTier(state, SPEAR_TIER_CHAIN);
  const shield = getMilitiaTier(state, SHIELD_TIER_CHAIN);
  if (spear === 'none' && shield === 'none') return null;
  const spearLabel =
    spear === 'sword' ? 'Iron swords'
      : spear === 'iron' ? 'Iron spears'
        : spear === 'stone' ? 'Stone spears'
          : null;
  const shieldLabel =
    shield === 'scale' ? 'Scale mail'
      : shield === 'iron' ? 'Iron shields'
        : shield === 'wooden' ? 'Wooden shields'
          : null;
  if (spearLabel && shieldLabel) return `${spearLabel} + ${shieldLabel}`;
  return spearLabel ?? shieldLabel;
}

/**
 * An adult settler who may be mustered for the village's defence — the one definition the militia
 * count, the raid fighter pool and the raid casualty pool share. Imprisonment excludes.
 */
export function canBeMustered(entity: Entity): boolean {
  return entity.alive && isPlayerHuman(entity) && entity.age >= HUMAN_ADULT_MIN_AGE && !isImprisoned(entity) && entity.job === JobType.Soldier && !entity.raidDeploymentId;
}

export function computeMilitiaBreakdown(
  state: WorldState,
  entities: Entity[],
  options?: { includeStructures?: boolean },
): MilitiaBreakdown {
  // Guard against invalid input
  if (!state || !entities) {
    return {
      adultCount: 0,
      guardCount: 0,
      spearTier: 'none',
      shieldTier: 'none',
      spearMultiplier: 1,
      shieldPerAdult: 0,
      militiaStrength: 0,
      barricadeStrength: 0,
      structureBonus: 0,
      lines: ['Invalid state or entities provided'],
    };
  }

  const mustered = entities.filter(canBeMustered);
  const adultCount = mustered.length;
  const staffedGuards = getBarracksGuardCount(state, state.buildings);
  const activeIds = new Set(mustered.map((soldier) => soldier.id));
  const guardCount = state.buildings.filter((building) => building.type === BuildingType.Barracks && building.completed)
    .reduce((total, building) => total + building.occupants.filter((id) => activeIds.has(id)).length, 0);
  const spearTier = getMilitiaTier(state, SPEAR_TIER_CHAIN);
  const shieldTier = getMilitiaTier(state, SHIELD_TIER_CHAIN);
  const spearMultiplier = SPEAR_TIER_MULTIPLIER[spearTier];
  const shieldPerAdult = SHIELD_TIER_PER_ADULT[shieldTier];
  const lines: string[] = [];

  // Early exit: no adults means no militia and no barricade
  if (adultCount === 0) {
    lines.push('No available soldiers to muster');
    return {
      adultCount: 0,
      guardCount,
      spearTier,
      shieldTier,
      spearMultiplier,
      shieldPerAdult,
      militiaStrength: 0,
      barricadeStrength: 0,
      structureBonus: 0,
      lines,
    };
  }

  // Each mustered soldier is priced with their own bounded DNA factor, never one army-wide bonus.
  const plainBase = adultCount * MILITIA_BALANCE.basePerAdult;
  let base = 0;
  for (const soldier of mustered) {
    base += MILITIA_BALANCE.basePerAdult * evaluateAptitudeInfluence(soldier, 'defense').factor;
  }
  lines.push(`${adultCount} adults × ${MILITIA_BALANCE.basePerAdult} = ${Math.round(base)}`);
  if (base !== plainBase) {
    lines.push(`defender aptitudes (per-soldier) → ${Math.round(base)}`);
  }

  let rawTotal = base * spearMultiplier;
  let plainTotal = plainBase * spearMultiplier;

  if (spearTier === 'sword') {
    lines.push(`× ${MILITIA_BALANCE.ironSwordMult} iron swords (replaces spears) → ${Math.round(rawTotal)}`);
  } else if (spearTier === 'iron') {
    lines.push(`× ${MILITIA_BALANCE.ironSpearMult} iron spears (replaces stone) → ${Math.round(rawTotal)}`);
  } else if (spearTier === 'stone') {
    lines.push(`× ${MILITIA_BALANCE.stoneSpearMult} stone spears → ${Math.round(rawTotal)}`);
  } else {
    lines.push('No weapons equipped');
  }

  if (shieldTier === 'scale') {
    const add = adultCount * MILITIA_BALANCE.scaleMailPerAdult;
    rawTotal += add;
    plainTotal += add;
    lines.push(`+ ${add} scale mail (replaces shields)`);
  } else if (shieldTier === 'iron') {
    const add = adultCount * MILITIA_BALANCE.ironShieldPerAdult;
    rawTotal += add;
    plainTotal += add;
    lines.push(`+ ${add} iron shields (replaces wooden)`);
  } else if (shieldTier === 'wooden') {
    const add = adultCount * MILITIA_BALANCE.woodenShieldPerAdult;
    rawTotal += add;
    plainTotal += add;
    lines.push(`+ ${add} wooden shields`);
  } else {
    lines.push('No armor equipped');
  }

  if (guardCount > 0) {
    const guardBonus = staffedGuards > 0 ? getBarracksGuardBonus(state, state.buildings) * guardCount / staffedGuards : 0;
    rawTotal += guardBonus;
    plainTotal += guardBonus;
    const perGuard = guardBonus / guardCount;
    // Show 1 decimal to avoid misleading integer rounding (e.g. 14.0, 14.5)
    lines.push(`+ ${guardBonus} barracks guards (${guardCount} staffed × ${perGuard.toFixed(1)})`);
  }

  const militiaStrength = Math.round(rawTotal);

  // Structure bonus — only calculate if requested
  const includeStructures = options?.includeStructures !== false;
  const wallBonus = includeStructures ? getWallSegmentBonus(state.buildings, state) : 0;
  const towerBonus = includeStructures ? getWatchtowerBonus(state.buildings, state) : 0;
  const structureBonus = wallBonus + towerBonus;

  // Barricade requires at least some militia to man it; per-soldier DNA prices the militia only.
  const barricadeStrength = militiaStrength > 0
    ? Math.round(
        plainTotal * MILITIA_BALANCE.barricadeMilitiaFactor
        + MILITIA_BALANCE.barricadeFlatBonus
        + structureBonus,
      )
    : 0;

  if (includeStructures && structureBonus > 0) {
    const walls = countCompletedDefenseBuildings(state.buildings, [
      BuildingType.Wall,
      BuildingType.WallGate,
    ]);
    if (walls > 0) {
      // One definition of the cap, shared with `getWallSegmentBonus` and the defense break-down:
      // forged wall plates raise it from 72 to 96.
      lines.push(
        `Barricade only: +${wallBonus} wall segments (${walls} built, max +${getWallSegmentCap(state)})`,
      );
    }
    const towers = countCompletedDefenseBuildings(state.buildings, BuildingType.Watchtower);
    if (towers > 0) {
      lines.push(`Barricade only: +${towerBonus} watchtowers (${towers})`);
    }
  }

  return {
    adultCount,
    guardCount,
    spearTier,
    shieldTier,
    spearMultiplier,
    shieldPerAdult,
    militiaStrength,
    barricadeStrength,
    structureBonus,
    lines,
  };
}
