import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { computeMilitiaBreakdown, MILITIA_BALANCE } from '@/game/militiaBalance';
import { makeAdultSettler } from '@/test/fixtures/gameFixtures';
import { BuildingType, BUILDING_CONFIGS } from '@/game/gameTypes';

describe('computeMilitiaBreakdown includeStructures', () => {
  it('excludes wall and tower bonus when includeStructures is false', () => {
    const state = initGame();
    const settler = makeAdultSettler(1);
    state.entities = [settler];
    const cfg = BUILDING_CONFIGS[BuildingType.Watchtower];
    state.buildings.push({
      id: 1,
      type: BuildingType.Watchtower,
      x: 200,
      y: 200,
      width: cfg.width,
      height: cfg.height,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    const full = computeMilitiaBreakdown(state, state.entities);
    const militiaOnly = computeMilitiaBreakdown(state, state.entities, { includeStructures: false });

    expect(full.structureBonus).toBeGreaterThan(0);
    expect(militiaOnly.barricadeStrength).toBe(
      Math.round(
        militiaOnly.militiaStrength * MILITIA_BALANCE.barricadeMilitiaFactor
        + MILITIA_BALANCE.barricadeFlatBonus,
      ),
    );
    expect(militiaOnly.barricadeStrength).toBeLessThan(full.barricadeStrength);
  });
});