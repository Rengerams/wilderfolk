/**
 * Medium-tier fixes, batch C2 (audit report, 2026-09-13).
 *
 * - M6 — the Nature tab's "Why this score" recomputed the ecosystem-health formula with a
 *   four-species wildlife tally and no Wildlife Preserve bonus, so it disagreed with the
 *   Health number the score owner recorded.
 * - M17 — `tickInventionFair` re-pushed a fresh Demonstration card every colony day and each
 *   duplicate could be answered again for free wood/reputation.
 * - M29 — `StripPlacementPiece.replacesBuildingId` was never produced, so the gate-over-wall
 *   replacement and its 50% refund were unreachable.
 * - M30 — a wall run that touched an existing wall gate emitted a piece on the gate, which made
 *   the whole run invalid and silently refused it.
 * - M33 — the time-cyclic `winter_watch` predicate made the first-spring guide reappear every
 *   year after it had finished.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import { EntityType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { calculateEcosystemMetrics, tickEcosystemMetrics } from '../src/game/dailyEcology';
import { getEcosystemBreakdown } from '../src/game/ecoBreakdown';
import { inventionFairEligibleDay, maybeOfferInventionFair, resolveInventionFair, tickInventionFair } from '../src/game/inventionFair';
import { canPlaceBuilding, buildStripPreview, placeStripChain } from '../src/game/buildingPlacementActions';
import { resolveWallStripPlan } from '../src/game/stripTopology';
import { snapBuildingCenter } from '../src/game/buildingRotation';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { currentCampaignStep } from '../src/game/tutorialCampaign';

const FIXTURE_SEED = 20240913;

function building(id: number, type: BuildingType, x: number, y: number): Building {
  const cfg = BUILDING_CONFIGS[type];
  return {
    id,
    type,
    x,
    y,
    width: cfg.width,
    height: cfg.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

describe('M6 — the Nature-tab breakdown shares the ecosystem-health owner', () => {
  it('explains the recorded Health with the owner formula, preserves and all six species', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.buildings = [
      building(1, BuildingType.House, 100, 100),
      building(2, BuildingType.WildlifePreserve, 200, 200),
    ];
    state.humanPopulation = 0;
    state.unlockedTechs = [];
    state.wildlifeCounts = {
      grass: 0,
      rabbits: 40,
      deer: 0,
      wolves: 0,
      foxes: 0,
      werewolves: 4,
      wildkin: 4,
      trees: 0,
    };

    const counts = { ...state.wildlifeCounts, humans: 0, visitorHumans: 0, rivalHumans: 0 };
    tickEcosystemMetrics(state, counts, state.buildings);

    const breakdown = getEcosystemBreakdown(state);
    const metrics = calculateEcosystemMetrics(state, counts, state.buildings);
    const preserveLine = breakdown.lines.find((line) => line.label === 'Wildlife preserves');
    const lineTotal = breakdown.lines.reduce((total, line) => total + line.delta, 0);

    // Owner: 100 base − 4 footprint + 4 preserve − 2 wildlife (48/80 ratio) = 98.
    expect(state.ecosystemHealth).toBe(98);
    expect(metrics.totalWildlife).toBe(48);
    // The breakdown counts moon howlers and wildkin, not just the four prey/predator species.
    expect(breakdown.wildlifeCount).toBe(48);
    // ...and it now reports the preserve bonus the build panel advertises.
    expect(preserveLine?.delta).toBe(4);
    // The card's two Health numbers are the same owner value, and the lines sum to it.
    expect(breakdown.health).toBe(state.ecosystemHealth);
    expect(lineTotal).toBe(state.ecosystemHealth);
  });
});

describe('M17 — the Demonstration card is offered once and pays out once', () => {
  function demoCount(state: WorldState): number {
    return (state.pendingStoryEvents ?? []).filter((event) => event.id.startsWith('invention_stage2_')).length;
  }

  function advanceDays(state: WorldState, days: number): void {
    state.dayInYear += days;
    state.tick += days * TICKS_PER_DAY;
  }

  function fundedInventionFair(): WorldState {
    const state = initGame({ seed: FIXTURE_SEED });
    state.pendingStoryEvents = [];
    state.storyFlags = {};
    state.year = 0;
    state.dayInYear = inventionFairEligibleDay(state.worldMap?.seed) + 1;
    state.tick = state.dayInYear * TICKS_PER_DAY;
    state.buildings = [building(1, BuildingType.Workshop, 100, 100)];
    state.resources.wood = 100;
    const apprentice = state.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    if (!apprentice) throw new Error('fixture has no settler');
    apprentice.apprenticeOfId = 1;

    maybeOfferInventionFair(state);
    if (!resolveInventionFair(state, 'fund_gate')) throw new Error('funding the gate was refused');
    return state;
  }

  it('pushes one Demonstration card even when several colony days pass', () => {
    const state = fundedInventionFair();

    advanceDays(state, 10);
    tickInventionFair(state);
    expect(demoCount(state)).toBe(1);

    // Next colony day, card still unanswered: it must not be re-offered with a fresh id.
    advanceDays(state, 1);
    tickInventionFair(state);
    expect(demoCount(state)).toBe(1);
  });

  it('does not repeat the stage-2 payout for a leftover duplicate answer', () => {
    const state = fundedInventionFair();
    advanceDays(state, 10);
    tickInventionFair(state);

    expect(resolveInventionFair(state, 'dismantle')).toBe(true);
    const woodAfterResolve = state.resources.wood;
    const reputationAfterResolve = state.villageReputation;

    // A duplicate card from a pre-fix save would dispatch on the still-funded status again.
    expect(resolveInventionFair(state, 'keep')).toBe(true);
    expect(state.resources.wood).toBe(woodAfterResolve);
    expect(state.villageReputation).toBe(reputationAfterResolve);
  });
});

describe('M29/M30 — wall strips replace gates, never stack on them', () => {
  function unlockDefense1(state: WorldState): void {
    state.unlockedTechs.push('defense_1');
    const node = state.researchNodes.find((research) => research.id === 'defense_1');
    if (node) node.researched = true;
  }

  function findBuildableStripSpot(state: WorldState): { x: number; y: number } {
    for (let y = 60; y < state.height - 60; y += 20) {
      for (let x = 60; x < state.width - 60; x += 20) {
        if (
          canPlaceBuilding(state, BuildingType.Wall, x, y, 0)
          && canPlaceBuilding(state, BuildingType.WallGate, x, y, 0)
        ) {
          return snapBuildingCenter(BuildingType.Wall, x, y, 0);
        }
      }
    }
    throw new Error('fixture map has no buildable wall spot');
  }

  it('a gate dropped on a wall replaces it and refunds half the wall', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.buildings = [];
    unlockDefense1(state);
    const spot = findBuildableStripSpot(state);
    const wall = building(1, BuildingType.Wall, spot.x, spot.y);
    state.buildings = [wall];

    const preview = buildStripPreview(state, BuildingType.WallGate, spot.x, spot.y, spot.x, spot.y, 0);
    expect(preview.segments).toHaveLength(1);
    expect(preview.segments[0].replacesBuildingId).toBe(wall.id);
    expect(preview.segments[0].valid).toBe(true);

    state.resources.wood = 200;
    state.resources.stone = 200;
    state.resources.gold = 200;
    const next = placeStripChain(state, BuildingType.WallGate, preview.segments, 0);

    expect(next.buildings.some((b) => b.id === wall.id)).toBe(false);
    expect(next.buildings.some((b) => b.type === BuildingType.WallGate)).toBe(true);
    // Gate cost (18 wood / 28 stone / 8 gold) offset by half the replaced wall (8 wood / 14 stone).
    expect(next.resources.wood).toBe(200 - 18 + 4);
    expect(next.resources.stone).toBe(200 - 28 + 7);
    expect(next.resources.gold).toBe(200 - 8);
  });

  it('a wall run steps over an existing gate instead of refusing the whole run', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.buildings = [building(1, BuildingType.WallGate, 300, 300)];

    const plan = resolveWallStripPlan(
      state,
      BuildingType.Wall,
      [
        { x: 240, y: 300 },
        { x: 300, y: 300 },
        { x: 360, y: 300 },
      ],
      0,
    );

    expect(plan.map((piece) => piece.x)).toEqual([240, 360]);
    expect(plan.some((piece) => piece.replacesBuildingId !== undefined)).toBe(false);
  });
});

describe('M33 — the first-spring guide finishes instead of regressing every year', () => {
  function guidedWorld(): WorldState {
    const state = initGame({ seed: FIXTURE_SEED });
    state.buildings = [
      building(1, BuildingType.House, 100, 100),
      building(2, BuildingType.Farm, 200, 100),
      building(3, BuildingType.HuntingSpot, 300, 100),
      building(4, BuildingType.Store, 400, 100),
    ];
    state.buildings[1].occupants = [1];
    return state;
  }

  it('stays finished at the start of year 2', () => {
    const state = guidedWorld();
    state.year = 2;
    state.dayInYear = 0;

    expect(currentCampaignStep(state)).toBeNull();
  });

  it('stays finished on later years too', () => {
    const state = guidedWorld();
    state.year = 4;
    state.dayInYear = 10;

    expect(currentCampaignStep(state)).toBeNull();
  });

  it('still completes the winter step during the first winter', () => {
    const state = guidedWorld();
    state.year = 0;
    state.dayInYear = 260;

    expect(currentCampaignStep(state)?.id).toBe('year_two');
  });
});
