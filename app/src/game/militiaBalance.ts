/**
 * Single source of truth for militia / barricade strength (frontier raids).
 * Spear and shield tiers do not stack — iron replaces stone / wooden.
 */

import type { Entity, WorldState } from './gameTypes';
import {
  hasIronShields, hasIronSpears, hasStoneSpears, hasWoodenShields,
} from './combat';
import {
  getBarracksGuardBonus,
  getBarracksGuardCount,
  countCompletedDefenseBuildings,
  getWallSegmentBonus,
  getWatchtowerBonus,
} from './defenseStructures';
import { BuildingType } from './gameTypes';
import { isPlayerHuman } from './groupEvents';

/** Tuned July 2026 — spear/militia balance review (10-year sim targets). */
export const MILITIA_BALANCE = {
  basePerAdult: 10,
  /** Iron replaces stone — not multiplied together. */
  stoneSpearMult: 1.3,
  ironSpearMult: 1.52,
  /** Iron replaces wooden — per-adult additive, not stacked. */
  woodenShieldPerAdult: 4,
  ironShieldPerAdult: 9,
  /** Trained barracks guards — bonus on top of their adult base (they are in adult count). */
  guardBonusPerGuard: 14,
  barricadeMilitiaFactor: 0.85,
  barricadeFlatBonus: 25,
} as const;

export type MilitiaSpearTier = 'none' | 'stone' | 'iron';
export type MilitiaShieldTier = 'none' | 'wooden' | 'iron';

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
  if (hasIronSpears(state)) return 'iron';
  if (hasStoneSpears(state)) return 'stone';
  return 'none';
}

export function getMilitiaShieldTier(state: WorldState): MilitiaShieldTier {
  if (hasIronShields(state)) return 'iron';
  if (hasWoodenShields(state)) return 'wooden';
  return 'none';
}

export function getMilitiaSpearMultiplier(tier: MilitiaSpearTier): number {
  if (tier === 'iron') return MILITIA_BALANCE.ironSpearMult;
  if (tier === 'stone') return MILITIA_BALANCE.stoneSpearMult;
  return 1;
}

export function getMilitiaShieldPerAdult(tier: MilitiaShieldTier): number {
  if (tier === 'iron') return MILITIA_BALANCE.ironShieldPerAdult;
  if (tier === 'wooden') return MILITIA_BALANCE.woodenShieldPerAdult;
  return 0;
}

export function getMilitiaArmamentLabel(state: WorldState): string | null {
  const spear = getMilitiaSpearTier(state);
  const shield = getMilitiaShieldTier(state);
  if (spear === 'none' && shield === 'none') return null;
  const spearLabel = spear === 'iron' ? 'Iron spears' : spear === 'stone' ? 'Stone spears' : null;
  const shieldLabel = shield === 'iron' ? 'iron shields' : shield === 'wooden' ? 'wooden shields' : null;
  if (spearLabel && shieldLabel) return `${spearLabel} + ${shieldLabel}`;
  return spearLabel ?? shieldLabel;
}

function countAdultSettlers(entities: Entity[]): number {
  return entities.filter((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile).length;
}

export function computeMilitiaBreakdown(
  state: WorldState,
  entities: Entity[],
  options?: { includeStructures?: boolean },
): MilitiaBreakdown {
  const adultCount = countAdultSettlers(entities);
  const guardCount = getBarracksGuardCount(state, state.buildings);
  const spearTier = getMilitiaSpearTier(state);
  const shieldTier = getMilitiaShieldTier(state);
  const spearMultiplier = getMilitiaSpearMultiplier(spearTier);
  const shieldPerAdult = getMilitiaShieldPerAdult(shieldTier);
  const lines: string[] = [];

  let militiaStrength = 0;
  if (adultCount === 0) {
    lines.push('No adult settlers to muster');
  } else {
    const base = adultCount * MILITIA_BALANCE.basePerAdult;
    lines.push(`${adultCount} adults × ${MILITIA_BALANCE.basePerAdult} = ${base}`);
    let working = base;

    if (spearTier === 'iron') {
      working = Math.round(working * MILITIA_BALANCE.ironSpearMult);
      lines.push(`× ${MILITIA_BALANCE.ironSpearMult} iron spears (replaces stone) → ${working}`);
    } else if (spearTier === 'stone') {
      working = Math.round(working * MILITIA_BALANCE.stoneSpearMult);
      lines.push(`× ${MILITIA_BALANCE.stoneSpearMult} stone spears → ${working}`);
    }

    if (shieldTier === 'iron') {
      const add = adultCount * MILITIA_BALANCE.ironShieldPerAdult;
      working += add;
      lines.push(`+ ${add} iron shields (replaces wooden)`);
    } else if (shieldTier === 'wooden') {
      const add = adultCount * MILITIA_BALANCE.woodenShieldPerAdult;
      working += add;
      lines.push(`+ ${add} wooden shields`);
    }

    if (guardCount > 0) {
      const guardBonus = getBarracksGuardBonus(state, state.buildings);
      working += guardBonus;
      const perGuard = Math.round(guardBonus / guardCount);
      lines.push(`+ ${guardBonus} barracks guards (${guardCount} staffed × ${perGuard})`);
    }

    militiaStrength = Math.round(working);
  }

  const structureBonus = getWallSegmentBonus(state.buildings, state) + getWatchtowerBonus(state.buildings);
  const barricadeStrength = Math.round(
    militiaStrength * MILITIA_BALANCE.barricadeMilitiaFactor
    + MILITIA_BALANCE.barricadeFlatBonus
    + (options?.includeStructures !== false ? structureBonus : 0),
  );

  if (options?.includeStructures !== false && structureBonus > 0) {
    const walls = countCompletedDefenseBuildings(state.buildings, [
      BuildingType.Wall,
      BuildingType.WallCorner,
      BuildingType.WallGate,
    ]);
    const wallBonus = getWallSegmentBonus(state.buildings, state);
    if (walls > 0) {
      lines.push(`Barricade only: +${wallBonus} wall segments (${walls} built, max +72)`);
    }
    const towers = countCompletedDefenseBuildings(state.buildings, BuildingType.Watchtower);
    const towerBonus = getWatchtowerBonus(state.buildings);
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

export function getMilitiaStrengthFromBreakdown(breakdown: MilitiaBreakdown): number {
  return breakdown.militiaStrength;
}

export function getBarricadeStrengthFromBreakdown(breakdown: MilitiaBreakdown): number {
  return breakdown.barricadeStrength;
}