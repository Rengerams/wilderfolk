/**
 * The food-low numbers have one definition and no surface re-derives them; "low" and "critical" stay
 * two bands by design, and which band a surface reacts to is a per-site UX choice.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FOOD_LOW_THRESHOLD,
  getFoodCriticalThreshold,
  isFoodAlert,
  isFoodAlertAmount,
  isFoodCritical,
  isFoodCriticalAmount,
} from '../src/game/resourceUtils';

function world(food: number, humanPopulation: number) {
  return { resources: { food }, humanPopulation } as never;
}

describe('the food-low rule has one owner', () => {
  it('derives the critical threshold from the population with the documented floor', () => {
    expect(FOOD_LOW_THRESHOLD).toBe(20);
    expect(getFoodCriticalThreshold(2)).toBe(15); // the floor dominates below 10 settlers
    expect(getFoodCriticalThreshold(20)).toBe(30); // 20 × 1.5
    expect(isFoodCriticalAmount(29, 20)).toBe(true);
    expect(isFoodCriticalAmount(30, 20)).toBe(false);
  });

  it('keeps "low" and "critical" as two bands, which is why the sites differ on purpose', () => {
    // 2 settlers, 18 food: above the critical floor, below the low threshold.
    expect(isFoodAlert(world(18, 2)), 'the badge/hint/mood band reacts here').toBe(true);
    expect(isFoodCritical(world(18, 2)), 'the strip/concern band does not').toBe(false);
    expect(isFoodAlertAmount(18, 2)).toBe(true);

    // Both bands at the floor, neither band when stores are healthy.
    expect(isFoodAlert(world(14, 2))).toBe(true);
    expect(isFoodCritical(world(14, 2))).toBe(true);
    expect(isFoodAlert(world(60, 30))).toBe(false);
    expect(isFoodCritical(world(60, 30))).toBe(false);
  });

  it('leaves no surface deriving its own threshold', () => {
    const files: Array<[string, RegExp]> = [
      ['src/game/priorityAlerts.ts', /Math\.max\(15,/],
      ['src/game/contextualTutorial.ts', /Math\.max\(15,/],
      ['src/game/focusHints.ts', /Math\.max\(20,/],
      ['src/game/citizenOverview.ts', /Math\.max\(20,/],
      ['src/game/dashboardData.ts', /humans \* 3/],
      // A component, not a domain module: the same no-own-threshold rule applies to the screen.
      ['src/components/CitizenOverviewScreen.tsx', /Math\.max\(20,/],
    ];
    for (const [file, restated] of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, `${file} re-derives a food threshold`).not.toMatch(restated);
      expect(source, `${file} does not call the owner at all`).toMatch(
        /isFood(Alert|Critical|AlertAmount|CriticalAmount|Low)/,
      );
    }
  });
});
