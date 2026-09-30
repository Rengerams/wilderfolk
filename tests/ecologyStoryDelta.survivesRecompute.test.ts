/**
 * D-1 — a story-layer ecology adjustment must survive the daily recompute.
 *
 * `ecosystemHealth` and `pollutionLevel` are **derived**: `tickEcosystemMetrics` recomputes both from
 * buildings, pollution and wildlife once per day and assigns them outright. Twelve story call sites
 * used to write the field directly — `setEcosystemHealth(state, getEcosystemHealth(state) + 6)` and
 * `state.pollutionLevel + 0.5` — and every one of them ran *earlier in the same daily tick* than that
 * recompute, so the value was overwritten before anything could read it. The Deer Parliament card
 * promised "Ecology +6 now" and the valley never moved.
 *
 * These cases pin the contract that replaced it: a story module queues a delta
 * (`adjustEcosystemHealth` / `adjustPollutionLevel`), and the metrics owner applies and clears it.
 *
 * ## Why the fixtures build industry
 *
 * `setEcosystemHealth` clamps to 0–100 and a **pristine** world scores at the ceiling: no industry, no
 * pollution, wildlife at the ideal ratio. A `+6` assertion against a 100 baseline reads `100 → 100`
 * whether or not the delta was applied, which is exactly the vacuous-test trap this audit kept
 * finding. So the fixture never asserts a delta against the ceiling — it takes the baseline the owner
 * actually computes for a valley with a town in it, and asserts against that.
 */
import { describe, expect, it } from 'vitest';
import { initGame, createBuilding } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType } from '../src/game/gameTypes';
import {
  adjustEcosystemHealth,
  adjustPollutionLevel,
  getEcosystemHealth,
  tickEcosystemMetrics,
} from '../src/game/dailyEcology';
import { computePopulationCounts, wildlifeCountsFromPopulation } from '../src/game/entityCounts';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

/**
 * A world with enough completed industry that its derived score sits strictly below 100, plus the
 * matching `pollutionLevel`, and no queued delta.
 */
function settledWorld(seed = 4242) {
  const world = initGame({ size: 'medium', seed });
  // Four industrial buildings: `buildingImpact` is +2 each, so the pristine 100 drops by 8 before
  // pollution is even counted. That is the headroom the delta assertions need.
  const industrial = [
    BuildingType.Blacksmith,
    BuildingType.Mill,
    BuildingType.Workshop,
    BuildingType.Mine,
  ];
  industrial.forEach((type, index) => {
    const building = createBuilding(type, 200 + index * 80, 200, world.nextBuildingId++);
    building.completed = true;
    building.constructionProgress = 100;
    world.buildings.push(building);
  });

  const counts = computePopulationCounts(world.entities.filter((entity) => entity.alive));
  world.wildlifeCounts = wildlifeCountsFromPopulation(counts);
  tickEcosystemMetrics(world, counts, world.buildings);

  const baseline = getEcosystemHealth(world);
  // Guard the fixture itself: if a future balance change pins this world at the ceiling again, the
  // delta assertions below would silently become vacuous. Fail loudly instead.
  expect(baseline, 'fixture must leave headroom below the 0-100 ceiling').toBeLessThan(96);
  expect(world.pendingEcosystemHealthDelta ?? 0, 'fixture must start with an empty queue').toBe(0);
  return { world, counts, baseline };
}

describe('story ecology adjustments survive the daily recompute (D-1)', () => {
  it('applies a queued ecosystem-health delta on top of the recomputed score', () => {
    const { world, counts, baseline } = settledWorld();

    adjustEcosystemHealth(world, 6);
    tickEcosystemMetrics(world, counts, world.buildings);

    // +6 lands on what the owner computed, instead of being replaced by it. This is the Deer
    // Parliament's advertised "Ecology +6 now".
    expect(getEcosystemHealth(world)).toBe(baseline + 6);
  });

  it('applies a negative delta too, so a penalty is not silently dropped', () => {
    const { world, counts, baseline } = settledWorld();

    adjustEcosystemHealth(world, -6);
    tickEcosystemMetrics(world, counts, world.buildings);

    expect(getEcosystemHealth(world)).toBe(baseline - 6);
  });

  it('accumulates several deltas in one day instead of letting the last win', () => {
    const { world, counts, baseline } = settledWorld();

    // The shape one Deer Parliament resolution produces: the choice's delta plus its follow-up.
    adjustEcosystemHealth(world, 6);
    adjustEcosystemHealth(world, 2);
    adjustEcosystemHealth(world, -3);
    tickEcosystemMetrics(world, counts, world.buildings);

    expect(getEcosystemHealth(world)).toBe(baseline + 5);
    // And specifically not "only the first" or "only the last", which is what a last-writer-wins
    // field would have produced before the fix.
    expect(getEcosystemHealth(world)).not.toBe(baseline + 6);
    expect(getEcosystemHealth(world)).not.toBe(baseline - 3);
  });

  it('clears the queue, so a delta is never double-counted on the next day', () => {
    const { world, counts, baseline } = settledWorld();

    adjustEcosystemHealth(world, 6);
    tickEcosystemMetrics(world, counts, world.buildings);
    expect(getEcosystemHealth(world)).toBe(baseline + 6);
    // One-shot: the queue is empty the moment it has been applied.
    expect(world.pendingEcosystemHealthDelta ?? 0).toBe(0);

    // The next day recomputes the *derived* score and applies nothing, so the story's +6 is gone —
    // which is the design: the score tracks the valley, and a story beat is a one-day adjustment to it
    // rather than a permanent edit. What must NOT happen is the +6 being applied a second time (which
    // would read `baseline + 12` on the following days) or leaking into the recompute as a new floor.
    tickEcosystemMetrics(world, counts, world.buildings);
    expect(getEcosystemHealth(world)).toBe(baseline);
    expect(getEcosystemHealth(world)).not.toBe(baseline + 12);
    expect(getEcosystemHealth(world)).not.toBe(baseline + 6);
  });

  it('applies a queued pollution delta and still clamps to the 0–100 scale', () => {
    const { world, counts, baseline } = settledWorld();
    const pollutionBaseline = world.pollutionLevel;

    adjustPollutionLevel(world, 3);
    tickEcosystemMetrics(world, counts, world.buildings);
    // Pollution is recomputed with `Math.floor`, so the integer part is the owner's and the delta
    // lands on top of it.
    expect(world.pollutionLevel).toBeGreaterThanOrEqual(pollutionBaseline);

    // A delta large enough to overflow is clamped rather than escaping the scale the panels assume.
    adjustPollutionLevel(world, 1000);
    tickEcosystemMetrics(world, counts, world.buildings);
    expect(world.pollutionLevel).toBe(100);
    expect(world.pendingPollutionDelta ?? 0).toBe(0);

    // A negative delta can drive it to the floor, not below.
    adjustPollutionLevel(world, -1000);
    tickEcosystemMetrics(world, counts, world.buildings);
    expect(world.pollutionLevel).toBe(0);
    expect(baseline).toBeLessThan(96);
  });

  it('ignores a non-finite or zero delta', () => {
    const { world, counts, baseline } = settledWorld();

    adjustEcosystemHealth(world, 0);
    adjustEcosystemHealth(world, Number.NaN);
    adjustEcosystemHealth(world, Number.POSITIVE_INFINITY);
    tickEcosystemMetrics(world, counts, world.buildings);

    expect(getEcosystemHealth(world)).toBe(baseline);
    expect(world.pendingEcosystemHealthDelta ?? 0).toBe(0);
  });

  it('changes the score across a real daily tick, not only when called directly', () => {
    // The strongest form of the regression: two identical worlds, one daily tick each, differing only
    // by a story adjustment queued before the boundary. Before the fix the two ended up equal — the
    // recompute made the adjustment invisible — which is exactly what the Deer Parliament's "Ecology
    // +6 now" promised and never delivered.
    const build = (seed: number) => {
      const world = settledWorld(seed).world;
      world.tick = TICKS_PER_DAY - 1;
      return world;
    };

    const control = build(4242);
    const withStoryBeat = build(4242);
    // Same seed, so `gameTick`'s own draws are identical and the only difference is the adjustment.
    adjustEcosystemHealth(withStoryBeat, 6);

    gameTick(control);
    gameTick(withStoryBeat);

    expect(withStoryBeat.pendingEcosystemHealthDelta ?? 0).toBe(0);
    expect(getEcosystemHealth(withStoryBeat)).toBe(getEcosystemHealth(control) + 6);
  });
});
