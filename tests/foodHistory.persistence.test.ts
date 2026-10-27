/**
 * E-3 (`docs/private/audits/2026-09-20/`): the economy ledger and the rolling food history did not
 * survive a save.
 *
 * Both are carried by the tick delta (`simDelta`) and by the worker rollback payload, so the save
 * seam was the only one that dropped them — and nothing rebuilds them: `foodHistory` is a 30-day
 * archive (`FOOD_HISTORY_MAX_DAYS`) that the next day's production cannot rewrite, and
 * `getEconomyLedger` returns null until the ledger's own `day` matches today. With the ~30 s
 * auto-save, a reload blanked the dashboard's "Food, last finished day" row and the village panel's
 * food card.
 *
 * Both shapes are plain JSON — numbers and `Record<string, number>` maps
 * (`gameTypes.DailyEconomyLedger`, `gameTypes.FoodDaySample`), no Map/Set/class instance — so the
 * allow-list carries them with no reconstruction step.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { getAbsoluteCalendarDay } from '../src/game/dayCycle';
import { getEconomyLedger, summarizeFoodLedger } from '../src/game/economyLedger';
import { WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_920;

/** Save → wire → parse → load, exactly as "Save to file" / "Load from file" do. */
function roundTrip(world: WorldState): WorldState {
  const save = buildSaveData(world, createInitialView(world.width, world.height));
  const parsed = parseSaveJson(JSON.stringify(save));
  expect(parsed.valid).toBe(true);
  if (!parsed.valid) throw new Error('save refused');
  const loaded = loadGameFromParsed(parsed.parsed);
  expect(loaded).not.toBeNull();
  if (!loaded) throw new Error('save did not load');
  return loaded.world;
}

describe('E-3 — the food accounting survives a save round-trip', () => {
  it('carries today\u2019s ledger and the 30-day history through save/load', () => {
    const world = initGame({ villageName: 'Ledger', size: 'medium', seed: FIXTURE_SEED });
    const today = getAbsoluteCalendarDay(world.tick);
    world.economyLedger = {
      day: today,
      produced: { farms: 40, hunting: 12 },
      consumed: { meals: 25, spoilage: 3 },
      producedTotal: 52,
      consumedTotal: 28,
    };
    world.foodHistory = [
      { day: today - 2, produced: { farms: 30 }, consumed: { meals: 20 } },
      { day: today - 1, produced: { hunting: 18 }, consumed: { meals: 22 } },
    ];

    const save = buildSaveData(world, createInitialView(world.width, world.height));
    expect(WORLD_STATE_SAVE_KEYS).toContain('economyLedger');
    expect(WORLD_STATE_SAVE_KEYS).toContain('foodHistory');
    expect(save.economyLedger).toEqual(world.economyLedger);
    expect(save.foodHistory).toEqual(world.foodHistory);

    const loaded = roundTrip(world);

    expect(loaded.economyLedger).toEqual(world.economyLedger);
    expect(loaded.foodHistory).toEqual(world.foodHistory);
    // The readers that went blank on every load: the panel's day row and the history strip.
    expect(getEconomyLedger(loaded)).toEqual(world.economyLedger);
    expect(summarizeFoodLedger(loaded).consumedTotal).toBe(28);
  });

  it('still loads a save written before the keys existed', () => {
    const world = initGame({ villageName: 'Oldsave', size: 'medium', seed: FIXTURE_SEED });
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    delete (save as Record<string, unknown>).economyLedger;
    delete (save as Record<string, unknown>).foodHistory;

    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed);

    expect(loaded).not.toBeNull();
    expect(loaded!.world.economyLedger).toBeUndefined();
    expect(getEconomyLedger(loaded!.world)).toBeNull();
  });
});
