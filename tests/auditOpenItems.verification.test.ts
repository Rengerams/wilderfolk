/**
 * Verification for the tracked N-IDs that had no dedicated regression: one run seed, persisted
 * predator scent, the null-leader invariant, the session-scoped relocation counters, and the Moon
 * Howler population census.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { adoptSimSeedFromWorld, getSimSeed, resetSimRng, setSimSeed } from '../src/game/simRng';
import { initGame } from '../src/game/worldGen';
import { ensureScentGrid } from '../src/game/scentGrid';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { computePopulationCounts } from '../src/game/entityCounts';
import {
  getHousingRelocationSnapshot,
  recordHousingRelocation,
  resetHousingRelocationMonitor,
  setHousingRelocationMonitorEnabled,
} from '../src/game/housingRelocationMonitor';
import { clearColonySessionState } from '../src/hooks/useGameSession';
import { EntityType, LEADER_OCCUPATION, MapSize } from '../src/game/gameTypes';

function freshWorld() {
  resetSimRng();
  return initGame({ skipTerrain: true, villageName: 'N-IDs', size: MapSize.Medium, seed: 20_261_112 });
}

afterEach(() => {
  resetSimRng();
  setHousingRelocationMonitorEnabled(false);
  resetHousingRelocationMonitor();
});

describe('N-15 — one run seed feeds every decision owner', () => {
  it('adopting a saved map seed makes getSimSeed that seed', () => {
    resetSimRng();
    setSimSeed(7);
    adoptSimSeedFromWorld({ worldMap: { seed: 424_242 } });

    expect(getSimSeed()).toBe(424_242);
  });

  it('no gameplay module outside the seed carrier reads worldMap.seed directly', () => {
    const root = resolve(process.cwd(), 'src/game');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        const rel = relative(root, full).replaceAll('\\', '/');
        // `simRng` adopts the saved seed; `saveLoad` writes it into the file. No decision owner reads it.
        if (rel === 'simRng.ts' || rel === 'saveLoad.ts') continue;
        readFileSync(full, 'utf8').split('\n').forEach((line, index) => {
          if (/\bworldMap\??\.seed\b/.test(line)) offenders.push(`src/game/${rel}:${index + 1}`);
        });
      }
    };
    walk(root);

    expect(offenders).toEqual([]);
  });
});

describe('N-19 — predator scent survives a save and load', () => {
  it('restores the decaying field instead of starting cold', () => {
    const world = freshWorld();
    ensureScentGrid(world).deposit(300, 300, 9);
    const saved = buildSaveData(world, createInitialView(world.width, world.height));
    const parsed = parseSaveJson(JSON.stringify(saved));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    expect(loaded.world.scentGrid?.getScentAt(300, 300)).toBeCloseTo(9);
    expect(loaded.world.scentGrid?.cols).toBe(world.scentGrid?.cols);
  });

  it('drops a malformed sidecar and loads a legacy save without one', () => {
    const world = freshWorld();
    ensureScentGrid(world).deposit(300, 300, 9);
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    payload.scentGrid = { cols: 1_000_000, rows: 2, cellSize: 80, values: [1, 2] };
    const parsed = parseSaveJson(JSON.stringify(payload));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    expect(loadGameFromParsed(parsed.parsed)?.world.scentGrid).toBeUndefined();

    const legacy = buildSaveData(world, createInitialView(world.width, world.height));
    delete legacy.scentGrid;
    const legacyParsed = parseSaveJson(JSON.stringify(legacy));
    expect(legacyParsed.valid).toBe(true);
    if (!legacyParsed.valid) return;
    expect(loadGameFromParsed(legacyParsed.parsed)?.world.scentGrid).toBeUndefined();
  });
});

describe('N-27 — the leadership invariant also covers the null-leader case', () => {
  it('reports a human still labelled leader while villageLeaderId is unset', () => {
    const world = freshWorld();
    const leader = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human)!;
    world.villageLeaderId = null;
    leader.occupation = LEADER_OCCUPATION;

    const errors = collectSimulationInvariantErrors(world);

    expect(errors.some((error) => error.includes('villageLeaderId is unset but human'))).toBe(true);
  });
});

describe('N-29 — housing-relocation counters are session-scoped', () => {
  it('clears the accumulated churn counters at the colony boundary', () => {
    setHousingRelocationMonitorEnabled(true);
    recordHousingRelocation({ phase: 'audit', reason: 'test', members: [{ id: 1 }] });
    expect(getHousingRelocationSnapshot().totalMoves).toBe(1);

    clearColonySessionState({
      cancelStripDemolition: () => {},
      setBattleReport: (() => {}) as never,
      setCampaignActive: (() => {}) as never,
      setFamilyTreeFor: (() => {}) as never,
      setHasPlacedHouse: (() => {}) as never,
      setSelectedBuildingType: (() => {}) as never,
      setWorkHoursOpen: (() => {}) as never,
    });

    expect(getHousingRelocationSnapshot().totalMoves).toBe(0);
    expect(getHousingRelocationSnapshot().recent).toEqual([]);
  });
});

describe('N-30 — the census keeps a cursed settler during Moon Howler nights', () => {
  it('counts the temporary werewolf form as one of the colony people', () => {
    const world = freshWorld();
    const settler = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human)!;
    settler.type = EntityType.Werewolf;
    settler.moonHowlerCursed = true;
    settler.moonHowlerSaved = {} as never;

    const counts = computePopulationCounts([settler]);

    expect(counts.humans).toBe(1);
    expect(counts.werewolves).toBe(0);
  });
});
