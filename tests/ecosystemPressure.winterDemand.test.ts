/**
 * Audit L30 (2026-09-13): `grassEcology.getGrazerDailyDemand` was exported but never called,
 * so its winter energy penalty was never applied to grazing demand.
 *
 * The grazing-pressure report is the live consumer; it called the low-level
 * `grazerGrassEnergyDemandPerDay` with `winterPenalty = 0` inline. It now goes through the
 * owner of the daily-demand rule, which is also the only place the penalty is applied.
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
    const expected =
      getGrazerDailyDemand('deer', Season.Winter) * 6 +
      getGrazerDailyDemand('rabbit', Season.Winter) * 4 +
      getGrazerDailyDemand('wildkin', Season.Winter) * 2;

    expect(winter.grazingDemandPerDay).toBe(Math.round(expected));
  });
});
