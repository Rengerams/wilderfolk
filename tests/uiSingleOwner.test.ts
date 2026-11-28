/**
 * UI single-owner guards: the behavioural cases prove the view follows the owner — change the owner's
 * input and the derived value moves. The view-side wiring they used to read from source is asserted
 * by `scripts/check-source-guards.mjs`.
 */
import { describe, expect, it } from 'vitest';
import { meetsDynastyThreshold, type Dynasty } from '../src/game/familyLegacy';
import { resourceFillPercent } from '../src/game/dashboardData';
import { citizenGivenName, SETTLER_NAME_FALLBACK } from '../src/game/citizenId';
import { getWallSegmentCap, WALL_SEGMENT_BASE_BONUS, WATCHTOWER_BASE_BONUS, MILITIA_BALANCE } from '../src/game/defenseStructures';
import { PRESERVE_HEALTH_BONUS } from '../src/game/dailyEcology';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import { SMITH_BONUS_PER_WORKER, SMITH_BONUS_CAP } from '../src/game/workforce';
import { MILL_FOOD_PRODUCTION_MULT } from '../src/game/dailyBuildingEconomy';
import { BARN_ADJACENCY_BONUS } from '../src/game/adjacencyIndex';
import { SILO_FOOD_STORAGE, WOOD_STOREHOUSE_STORAGE } from '../src/game/economy';
import { hasManyAdultsIdle } from '../src/game/citizenOverview';
import { REPUTATION_FRIENDLY_MIN, REPUTATION_HARSH_MAX, getReputationBand } from '../src/game/simHelpers';

describe('C2 — the view reads the owner instead of re-deriving the rule', () => {
  it('dynasty definition: a two-generation family is not a dynasty at any member count', () => {
    const twoGenerations: Dynasty = { surname: 'Ash', generationsAlive: 2, members: 9 };
    const threeGenerationsTwoMembers: Dynasty = { surname: 'Birch', generationsAlive: 3, members: 2 };
    const realDynasty: Dynasty = { surname: 'Cedar', generationsAlive: 3, members: 3 };

    expect(meetsDynastyThreshold(twoGenerations)).toBe(false);
    expect(meetsDynastyThreshold(threeGenerationsTwoMembers)).toBe(false);
    expect(meetsDynastyThreshold(realDynasty)).toBe(true);
  });

  it('resource fill % follows the owner when the cap changes', () => {
    expect(resourceFillPercent({ amount: 40, cap: 80 })).toBe(50);
    expect(resourceFillPercent({ amount: 40, cap: 160 })).toBe(25);
    expect(resourceFillPercent({ amount: 40, cap: 0 })).toBe(0);
    expect(resourceFillPercent({ amount: 900, cap: 800 })).toBe(100);
  });

  it('settler name fallback: one nameless settler shows one name', () => {
    expect(citizenGivenName({ name: undefined })).toBe(SETTLER_NAME_FALLBACK);
    expect(citizenGivenName({ name: '   ' })).toBe(SETTLER_NAME_FALLBACK);
    expect(citizenGivenName({ name: 'Rune' })).toBe('Rune');
  });
});

describe('C2 — building output copy is built from the owners, not typed as prose', () => {
  it('wall cap follows the forge owner; the base bonuses match the maths they feed', () => {
    // No forge: the base cap; with Wall Plates forged the owner raises it.
    const noForge = { villageForge: undefined };
    const wallPlatesForged = {
      villageForge: { activeOrder: null, progress: 0, completed: { wall_plates: true } },
    };
    expect(getWallSegmentCap(noForge)).toBe(72);
    expect(getWallSegmentCap(wallPlatesForged)).toBe(96);
    expect(WALL_SEGMENT_BASE_BONUS).toBe(8);
    expect(WATCHTOWER_BASE_BONUS).toBe(15);
    expect(MILL_FOOD_PRODUCTION_MULT).toBe(1.25);
    expect(BARN_ADJACENCY_BONUS).toBe(0.35);
    expect(SILO_FOOD_STORAGE).toBe(2000);
    expect(WOOD_STOREHOUSE_STORAGE).toBe(800);
    expect(SMITH_BONUS_PER_WORKER * 4).toBeGreaterThan(SMITH_BONUS_CAP - 1);
  });
});

describe('C2 — the remaining semantic duplicates read their owners (2026-09-20 sweep)', () => {
  it('"many adults idle" is one rule', () => {
    expect(hasManyAdultsIdle({ idle: 3, adults: 10 })).toBe(false); // 3 > max(2, 3.5)
    expect(hasManyAdultsIdle({ idle: 4, adults: 10 })).toBe(true); // 4 > 3.5
    expect(hasManyAdultsIdle({ idle: 3, adults: 2 })).toBe(true); // 3 > max(2, 0.7)
  });

  it('the classifier is the only reader of the band boundaries', () => {
    expect(getReputationBand(REPUTATION_FRIENDLY_MIN)).toBe('friendly');
    expect(getReputationBand(REPUTATION_FRIENDLY_MIN - 1)).toBe('normal');
    expect(getReputationBand(REPUTATION_HARSH_MAX)).toBe('harsh');
    expect(getReputationBand(REPUTATION_HARSH_MAX + 1)).toBe('normal');
  });
});

describe('U-2/U-3/U-4 — the 2026-09-20 inspector copy guards (building panel)', () => {
  it('the Farm hint counts the workers the build catalogue actually allows', () => {
    // The farm hint counts `getBuildingConfig(type).maxOccupants`, not a typed cap.
    expect(BUILDING_CONFIGS[BuildingType.Farm].maxOccupants).toBe(2);
  });

  it('the guard and preserve bonuses are the owners\' numbers', () => {
    expect(MILITIA_BALANCE.guardBonusPerGuard).toBe(14);
    expect(PRESERVE_HEALTH_BONUS).toBe(4);
  });
});
