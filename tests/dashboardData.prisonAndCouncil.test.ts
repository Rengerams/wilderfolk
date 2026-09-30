/**
 * The dashboard's two 2026-09-17 owner rulings, pinned.
 *
 * **F9 — a prisoner is neither homeless nor idle.** An arrest deliberately clears `homeBuildingId`
 * and `residenceBuildingId` (`humanRelationships`), so the projection must not read that absence as a
 * player-actionable gap in any of its three surfaces: the council concerns, the settler table's
 * `noHome`/`noWork` flags, and the per-settler explanation's suggestion.
 *
 * **F10 — "vs yesterday" must compare a real previous day.** `populationHistory` is sampled every
 * `STATS_SAMPLE_INTERVAL_TICKS` (10 ticks ≈ 3.3 in-game hours), so the previous entry is not yesterday.
 *
 * Both reports recorded "Regression test: Not written"; these are those tests.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { collectDashboard, explainSettler } from '../src/game/dashboardData';
import { EntityType } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/playerHuman';
import type { Entity, PopulationHistoryEntry, WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;

function freshWorld(): WorldState {
  return initGame({ villageName: 'Jail', size: 'medium', seed: FIXTURE_SEED });
}

function firstAdultSettler(state: WorldState): Entity {
  const settler = state.entities.find(
    (e) => e.type === EntityType.Human && e.alive && !e.isJuvenile && isPlayerHuman(e),
  );
  if (!settler) throw new Error('fixture has no adult player settler');
  return settler;
}

/** The state an arrest leaves behind — exactly what the imprisonment path writes. */
function imprison(state: WorldState, settler: Entity): void {
  settler.homeBuildingId = undefined;
  settler.residenceBuildingId = undefined;
  settler.prisonBuildingId = state.buildings[0]?.id ?? 1;
}

/** The count a concern's own title reports ("3 settlers without a home" → 3). */
function concernCount(state: WorldState, id: string): number {
  const concern = collectDashboard(state).concerns.find((c) => c.id === id);
  return concern ? Number(/^(\d+)/.exec(concern.title)?.[1] ?? 0) : 0;
}

const SAMPLE_KEYS = {
  year: 5,
  grass: 0,
  rabbits: 0,
  deer: 0,
  wolves: 0,
  foxes: 0,
  werewolves: 0,
  wildkin: 0,
  buildings: 0,
} as const;

function sample(tick: number, day: number, humans: number): PopulationHistoryEntry {
  return { ...SAMPLE_KEYS, tick, day, humans, food: 100 };
}

describe('a prisoner is neither homeless nor idle', () => {
  it('does not flag the settler row as idle or homeless', () => {
    const state = freshWorld();
    const settler = firstAdultSettler(state);
    imprison(state, settler);

    const data = collectDashboard(state);
    const row = data.settlers.find((s) => s.id === settler.id);
    expect(row).toBeDefined();
    expect(row?.noHome).toBe(false);
    expect(row?.noWork).toBe(false);
    expect(row?.status).toBe('prison');
    // The imprisonment is still reported — prisoners must not vanish from the panel.
    expect(data.concerns.some((c) => c.id === 'prison')).toBe(true);
  });

  it('removes the settler from the homeless and idle council counts', () => {
    const state = freshWorld();
    const settler = firstAdultSettler(state);
    // Make them count as both *before* the arrest, so the assertions are about the jail, not housing.
    settler.residenceBuildingId = undefined;
    settler.homeBuildingId = undefined;

    const homelessBefore = concernCount(state, 'homeless');
    const idleBefore = concernCount(state, 'idle');
    expect(homelessBefore).toBeGreaterThan(0);
    expect(idleBefore).toBeGreaterThan(0);

    imprison(state, settler);

    expect(concernCount(state, 'homeless')).toBe(homelessBefore - 1);
    expect(concernCount(state, 'idle')).toBe(idleBefore - 1);
  });

  it('does not tell a prisoner to build a House', () => {
    const state = freshWorld();
    const settler = firstAdultSettler(state);
    imprison(state, settler);

    const lines = explainSettler(state, settler.id);
    expect(lines.some((l) => l.label === 'Prison')).toBe(true);
    expect(lines.some((l) => l.label === 'Suggested home' && /House/.test(l.value))).toBe(false);
  });
});

describe('"vs yesterday" compares a real previous day', () => {
  it('ignores the previous 10-tick sample in favour of yesterday', () => {
    const state = freshWorld();
    state.humanPopulation = 20;
    state.populationHistory = [
      sample(4 * TICKS_PER_DAY + 60, 4, 18), // yesterday's last sample
      sample(5 * TICKS_PER_DAY - 10, 5, 30), // ten ticks ago, same day — the old baseline
      sample(5 * TICKS_PER_DAY, 5, 20), // the newest sample
    ];

    const line = collectDashboard(state).council.find((l) => l.label === 'Settlers');
    // 20 − 18 = +2 against yesterday. The ten-tick baseline is +10 different and would print −10.
    expect(line?.value).toContain('+2 vs yesterday');
  });
});
