/**
 * The grazing-pressure report bills each grazer through `grassEcology.getGrazerDailyDemand`, the one
 * rule that applies the winter energy penalty; predators such as the Wildkin are not billed.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize, Season } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { getGrazingPressureReport } from '../src/game/ecosystemPressure';
import { getGrazerDailyDemand } from '../src/game/grassEcology';

function worldWithGrazers(season: Season): WorldState {
  const state = initGame({ size: MapSize.Medium, seed: 5 });
  state.season = season;
  state.wildlifeCounts.deer = 6;
  state.wildlifeCounts.rabbits = 4;
  state.wildlifeCounts.wildkin = 2;
  return state;
}

describe('L30 — grazing demand reaches the winter penalty', () => {
  it('reports a higher daily demand in winter than in summer for the same herd', () => {
    const summer = getGrazingPressureReport(worldWithGrazers(Season.Summer));
    const winter = getGrazingPressureReport(worldWithGrazers(Season.Winter));

    expect(winter.grazingDemandPerDay).toBeGreaterThan(summer.grazingDemandPerDay);
  });

  it('uses the owner rule per species instead of an inline metabolism sum', () => {
    const winter = getGrazingPressureReport(worldWithGrazers(Season.Winter));
    // Grazers only: the Wildkin eats meat (`speciesConfig`), so its 2 must not appear in the
    // pasture's demand — its count still travels on the report.
    const expected =
      getGrazerDailyDemand('deer', Season.Winter) * 6 +
      getGrazerDailyDemand('rabbit', Season.Winter) * 4;

    expect(winter.grazingDemandPerDay).toBe(Math.round(expected));
    expect(winter.wildkinCount).toBe(2);
    expect(winter.grazingDemandPerDay).toBeLessThan(
      Math.round(expected + getGrazerDailyDemand('wildkin', Season.Winter) * 2),
    );
  });
});
