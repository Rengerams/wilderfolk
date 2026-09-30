/**
 * F20 — five different "food is low" thresholds, with the owner helper bypassed
 * (`docs/private/audits/2026-09-16/ui-logic.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The surfaces disagreed because each re-derived the rule: `humans * 3` in the dashboard,
 * `max(20, pop × 2)` in the focus hints and the citizen mood, `max(15, pop × 1.5)` in the alert strip and
 * the low-food tip, and `isFoodLow`/`isFoodCritical` in the owner. At 2 settlers with 18 food the header
 * badge warned and the Focus panel said "Feed the village" while the alert strip said nothing.
 *
 * There are still **two bands** — the owner's `isFoodLow` floor ("low") and its per-settler rule
 * ("critical", `max(15, pop × 1.5)`) — and which band a surface reacts to is a deliberate UX choice, now
 * stated per site instead of being an accident of arithmetic. What is pinned here is that the *numbers*
 * have one definition and that no site re-derives them.
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
    // The audit's example: 2 settlers, 18 food.
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
      // The sixth site, missed by the F20 sweep and fixed as R6 of the 2026-09-17 UI audit: the
      // Valley overview's Food card computed `max(20, pop × 2)` itself, so at 20 settlers with 35
      // food it showed red beside the owner's green "Thriving" mood.
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
