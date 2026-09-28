/**
 * Single source of truth for militia / barricade strength (frontier raids).
 * Weapon and armor tiers do not stack — higher replaces lower (stone → iron → sword / wooden → iron → scale).
 */

import type { Entity, WorldState } from './gameTypes';
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
import { BuildingType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { isImprisoned } from './residencyOccupancy';

/** Weapon tier used for militia multiplier (legacy name kept for call sites). */
export type MilitiaSpearTier = 'none' | 'stone' | 'iron' | 'sword';
/** Armor tier used for militia flat bonus. */
export type MilitiaShieldTier = 'none' | 'wooden' | 'iron' | 'scale';

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

export function getMilitiaSpearTier(state: WorldState): MilitiaSpearTier {
  if (hasIronSwords(state)) return 'sword';
  if (hasIronSpears(state)) return 'iron';
  if (hasStoneSpears(state)) return 'stone';
  return 'none';
}

export function getMilitiaShieldTier(state: WorldState): MilitiaShieldTier {
  if (hasScaleMail(state)) return 'scale';
  if (hasIronShields(state)) return 'iron';
  if (hasWoodenShields(state)) return 'wooden';
  return 'none';
}

export function getMilitiaSpearMultiplier(tier: MilitiaSpearTier): number {
  if (tier === 'sword') return MILITIA_BALANCE.ironSwordMult;
  if (tier === 'iron') return MILITIA_BALANCE.ironSpearMult;
  if (tier === 'stone') return MILITIA_BALANCE.stoneSpearMult;
  return 1;
}

export function getMilitiaShieldPerAdult(tier: MilitiaShieldTier): number {
  if (tier === 'scale') return MILITIA_BALANCE.scaleMailPerAdult;
  if (tier === 'iron') return MILITIA_BALANCE.ironShieldPerAdult;
  if (tier === 'wooden') return MILITIA_BALANCE.woodenShieldPerAdult;
  return 0;
}

export function getMilitiaArmamentLabel(state: WorldState): string | null {
  const spear = getMilitiaSpearTier(state);
  const shield = getMilitiaShieldTier(state);
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
 * count, the raid fighter pool and the raid casualty pool all share.
 *
 * Imprisonment is the exclusion those three used to disagree on: `isImprisoned` guards every
 * staffing rule (`workforce`, `buildingStaffingActions`) and both election paths, but the militia
 * paths counted a prisoner as a full adult — so a jailed settler added militia strength, was drawn
 * as a barricade fighter, and could be killed "defending the village"
 * (`docs/private/audits/2026-09-16/LIVE-FINDINGS-STATUS.md`, M1).
 */
export function canBeMustered(entity: Entity): boolean {
  return entity.alive && isPlayerHuman(entity) && !entity.isJuvenile && !isImprisoned(entity);
}

function countMusterableAdults(entities: Entity[]): number {
  return entities.filter((e) => canBeMustered(e)).length;
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

  const adultCount = countMusterableAdults(entities);
  const guardCount = getBarracksGuardCount(state, state.buildings);
  const spearTier = getMilitiaSpearTier(state);
  const shieldTier = getMilitiaShieldTier(state);
  const spearMultiplier = getMilitiaSpearMultiplier(spearTier);
  const shieldPerAdult = getMilitiaShieldPerAdult(shieldTier);
  const lines: string[] = [];

  // Early exit: no adults means no militia and no barricade
  if (adultCount === 0) {
    lines.push('No adult settlers to muster');
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

  // Calculate raw total first; round ONLY at the end to avoid cumulative rounding drift
  const base = adultCount * MILITIA_BALANCE.basePerAdult;
  lines.push(`${adultCount} adults × ${MILITIA_BALANCE.basePerAdult} = ${base}`);

  let rawTotal = base * spearMultiplier;

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
    lines.push(`+ ${add} scale mail (replaces shields)`);
  } else if (shieldTier === 'iron') {
    const add = adultCount * MILITIA_BALANCE.ironShieldPerAdult;
    rawTotal += add;
    lines.push(`+ ${add} iron shields (replaces wooden)`);
  } else if (shieldTier === 'wooden') {
    const add = adultCount * MILITIA_BALANCE.woodenShieldPerAdult;
    rawTotal += add;
    lines.push(`+ ${add} wooden shields`);
  } else {
    lines.push('No armor equipped');
  }

  if (guardCount > 0) {
    const guardBonus = getBarracksGuardBonus(state, state.buildings);
    rawTotal += guardBonus;
    const perGuard = guardBonus / guardCount;
    // Show 1 decimal to avoid misleading integer rounding (e.g. 14.0, 14.5)
    lines.push(`+ ${guardBonus} barracks guards (${guardCount} staffed × ${perGuard.toFixed(1)})`);
  }

  // Chivalrous settlers add a protective edge to the whole militia. Only settlers who can actually
  // be mustered count — a rival, visitor, child or prisoner carrying the trait must not raise *your*
  // strength (and `resolveDefenseRatio` turns that into a raid outcome), so this uses the same
  // `canBeMustered` predicate as the count above.
  const chivalrous = entities.filter(
    (e) => canBeMustered(e) && e.traits?.includes('chivalrous'),
  ).length;
  if (chivalrous > 0) {
    const bonus = Math.round(rawTotal * 0.08);
    rawTotal += bonus;
    // The bonus is a flat 8 % of the raw total, applied once — the line used to read
    // "(N × 8 %)", claiming per-protector scaling the arithmetic never did. Whether it
    // *should* scale per protector is a balance question for the owner, recorded open in
    // the report; this label states what the code does.
    lines.push(`+ ${bonus} chivalrous (flat +8%, ${chivalrous} protector${chivalrous === 1 ? '' : 's'})`);
  }

  const militiaStrength = Math.round(rawTotal);

  // Structure bonus — only calculate if requested
  const includeStructures = options?.includeStructures !== false;
  const wallBonus = includeStructures ? getWallSegmentBonus(state.buildings, state) : 0;
  const towerBonus = includeStructures ? getWatchtowerBonus(state.buildings, state) : 0;
  const structureBonus = wallBonus + towerBonus;

  // Barricade requires at least some militia to man it
  const barricadeStrength = militiaStrength > 0
    ? Math.round(
        militiaStrength * MILITIA_BALANCE.barricadeMilitiaFactor
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

/** @deprecated Access breakdown.militiaStrength directly instead. */
export function getMilitiaStrengthFromBreakdown(breakdown: MilitiaBreakdown): number {
  return breakdown.militiaStrength;
}

/** @deprecated Access breakdown.barricadeStrength directly instead. */
export function getBarricadeStrengthFromBreakdown(breakdown: MilitiaBreakdown): number {
  return breakdown.barricadeStrength;
}