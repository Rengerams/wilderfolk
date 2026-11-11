/**
 * `spendFood(state, sink, amount)` deducts and records in one call; this file pins that contract and
 * guards the converted files against a raw food deduction returning.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { spendFood, summarizeFoodLedger, ECONOMY_SOURCE_LABELS } from '../src/game/economyLedger';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;

function world(food: number): WorldState {
  const state = initGame({ villageName: 'Spend', size: 'medium', seed: FIXTURE_SEED });
  state.resources.food = food;
  return state;
}

/** Files whose food spends have been converted to `spendFood`. */
const CONVERTED = [
  'src/game/groupEvents.ts',
  'src/game/tradeCaravans.ts',
  'src/game/townHall.ts',
  'src/game/settlerInteractionActions.ts',
  'src/game/frontierCombat.ts',
  'src/game/weddingDiplomacy.ts',
  'src/game/travelingTheatre.ts',
  'src/game/deerParliament.ts',
  'src/game/storyEvents.ts',
  'src/game/animalCare.ts',
  'src/game/worldEvents.ts',
];

describe('spending food reaches the ledger (F2 sweep)', () => {
  it('deducts and records under the named sink', () => {
    const state = world(100);

    expect(spendFood(state, 'gift', 20)).toBe(20);

    expect(state.resources.food).toBe(80);
    expect(summarizeFoodLedger(state).consumed).toEqual([{ source: 'gift', amount: 20 }]);
    expect(summarizeFoodLedger(state).net).toBe(-20);
  });

  it('records what was actually taken, not what was asked for', () => {
    const state = world(10);

    // The old raw `-=` sites could deduct more than the store held; the owner floors at zero and the
    // ledger must record the real spend.
    expect(spendFood(state, 'tribute', 500)).toBe(10);

    expect(state.resources.food).toBe(0);
    expect(summarizeFoodLedger(state).consumedTotal).toBe(10);
  });

  it('has a display label for every sink', () => {
    for (const sink of ['gift', 'treaty', 'refugees', 'trade', 'festival', 'raid'] as const) {
      expect(ECONOMY_SOURCE_LABELS[sink], `${sink} has no label`).toBeTruthy();
      expect(ECONOMY_SOURCE_LABELS[sink]).not.toBe(sink);
    }
  });

  it('leaves no raw food deduction in the converted files', () => {
    for (const file of CONVERTED) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(src, `${file} still deducts food directly`).not.toMatch(/state\.resources\.food\s*-=/);
      expect(src).toContain('spendFood(');
    }
  });
});
