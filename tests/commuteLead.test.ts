import { describe, expect, it } from 'vitest';
import { MAX_COMMUTE_LEAD_HOURS, commuteLeadHoursFor } from '../src/game/simulation/humanMovement';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { EntityType } from '../src/game/gameTypes';

const WALK_SPEED = SPECIES_CONFIG[EntityType.Human].speed

describe('commute lead hours', () => {
  it('always answers inside its documented floor and ceiling', () => {
    // The contract the callers rely on: whatever the input, the scheduler gets a sane number of
    // hours. This is what keeps a long or nonsense leg from scheduling a settler to leave days ago.
    const inputs: [number, number][] = [
      [0, WALK_SPEED], [1, WALK_SPEED], [20, WALK_SPEED], [50, WALK_SPEED],
      [200, WALK_SPEED], [600, WALK_SPEED], [1200, WALK_SPEED], [1e9, WALK_SPEED],
      [-10, WALK_SPEED], [Number.NaN, WALK_SPEED], [Number.POSITIVE_INFINITY, WALK_SPEED],
      [500, 0], [500, -3], [500, Number.NaN], [500, Number.POSITIVE_INFINITY],
    ];
    for (const [distance, speed] of inputs) {
      const lead = commuteLeadHoursFor(distance, speed);
      expect(Number.isFinite(lead), `lead for ${distance}/${speed}`).toBe(true);
      expect(lead, `lead for ${distance}/${speed}`).toBeGreaterThanOrEqual(1);
      expect(lead, `lead for ${distance}/${speed}`).toBeLessThanOrEqual(MAX_COMMUTE_LEAD_HOURS);
    }
  });

  it('returns the old fixed hour for a leg at or inside the arrival radius', () => {
    // Only these are truly "no walk at all", so only these are pinned to exactly one hour.
    expect(commuteLeadHoursFor(0, WALK_SPEED)).toBe(1);
    expect(commuteLeadHoursFor(-10, WALK_SPEED)).toBe(1);
    expect(commuteLeadHoursFor(Number.NaN, WALK_SPEED)).toBe(1);
    expect(commuteLeadHoursFor(Number.POSITIVE_INFINITY, WALK_SPEED)).toBe(1);
  });

  it('grows with distance and caps at the ceiling', () => {
    const near = commuteLeadHoursFor(370, WALK_SPEED);
    const far = commuteLeadHoursFor(800, WALK_SPEED);

    expect(far).toBeGreaterThan(near);
    expect(commuteLeadHoursFor(1_000_000, WALK_SPEED)).toBe(MAX_COMMUTE_LEAD_HOURS);
  });

  it('gives a long walk more lead time than a shorter one', () => {
    expect(commuteLeadHoursFor(370, WALK_SPEED)).toBeGreaterThan(1);
    expect(commuteLeadHoursFor(800, WALK_SPEED))
      .toBeGreaterThan(commuteLeadHoursFor(370, WALK_SPEED));
  });

  it('asks for more lead from a slower walker at the same distance', () => {
    expect(commuteLeadHoursFor(200, 1.5)).toBeGreaterThan(commuteLeadHoursFor(200, 3.0));
  });
});
