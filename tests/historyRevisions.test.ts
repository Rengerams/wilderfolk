/**
 * History families ship by owner revision, not by a per-tick fingerprint: a writer that changes a
 * history without bumping its revision would freeze that panel in the display world.
 */
import { describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { assignPendingGraves, logDeath } from '../src/game/eventLog';
import {
  recordGenealogyBirth,
  recordGenealogyDeath,
  syncGenealogyRegistry,
} from '../src/game/genealogyRegistry';
import { advanceValleyChronicle } from '../src/game/valleyChronicle';
import {
  HISTORY_FAMILIES,
  resetHistoryRevisions,
  snapshotHistoryRevisions,
} from '../src/game/historyRevisions';

function makeWorld(seed: number): WorldState {
  const world = initGame({ size: MapSize.Medium, seed });
  resetHistoryRevisions(world);
  return world;
}

function completeBuilding(id: number, type: BuildingType): Building {
  return {
    id, type, completed: true, faction: 'player', x: 0, y: 0, width: 2, height: 2,
  } as unknown as Building;
}

describe('history revisions', () => {
  it('are bumped by every history owner', () => {
    const world = makeWorld(900);
    const start = snapshotHistoryRevisions(world);

    logDeath(world, 'Tester died', 'Tester');
    expect(snapshotHistoryRevisions(world).graveRecords).toBe(start.graveRecords + 1);

    world.buildings.push(completeBuilding(9001, BuildingType.Graveyard));
    const beforeGraveAssignment = snapshotHistoryRevisions(world).graveRecords;
    assignPendingGraves(world);
    expect(snapshotHistoryRevisions(world).graveRecords).toBeGreaterThan(beforeGraveAssignment);

    const child = {
      id: 9100,
      type: EntityType.Human,
      name: 'Baby',
      surname: 'Test',
      birthYear: 0,
      birthDay: 1,
      alive: true,
    } as unknown as Entity;
    const beforeBirth = snapshotHistoryRevisions(world).genealogyRegistry;
    recordGenealogyBirth(world, child);
    expect(snapshotHistoryRevisions(world).genealogyRegistry).toBe(beforeBirth + 1);

    const beforeDeath = snapshotHistoryRevisions(world).genealogyRegistry;
    recordGenealogyDeath(world, child);
    expect(snapshotHistoryRevisions(world).genealogyRegistry).toBe(beforeDeath + 1);

    const beforeSync = snapshotHistoryRevisions(world).genealogyRegistry;
    syncGenealogyRegistry(world);
    expect(snapshotHistoryRevisions(world).genealogyRegistry).toBe(beforeSync + 1);

    world.buildings.push(completeBuilding(9002, BuildingType.House));
    const beforeChronicle = snapshotHistoryRevisions(world).chronicleChapters;
    const chapters = advanceValleyChronicle(world);
    expect(chapters.length).toBeGreaterThan(0);
    expect(snapshotHistoryRevisions(world).chronicleChapters).toBeGreaterThan(beforeChronicle);
  });

  it('bumps yearly stats on the year rollover', () => {
    const world = makeWorld(901);
    world.tick = TICKS_PER_DAY * DAYS_PER_YEAR - 1;
    world.dayInYear = DAYS_PER_YEAR - 1;
    const before = snapshotHistoryRevisions(world).yearlyStats;

    gameTick(world);

    expect(snapshotHistoryRevisions(world).yearlyStats).toBe(before + 1);
  });

  it('never changes a seeded-run history without bumping its revision', () => {
    const world = makeWorld(902);
    let fingerprints = HISTORY_FAMILIES.map((family) => JSON.stringify(world[family] ?? null));
    let previous = snapshotHistoryRevisions(world);

    for (let i = 0; i < 2 * TICKS_PER_DAY; i++) {
      gameTick(world);
      const current = snapshotHistoryRevisions(world);
      HISTORY_FAMILIES.forEach((family, index) => {
        const fingerprint = JSON.stringify(world[family] ?? null);
        if (fingerprint !== fingerprints[index]) {
          expect(
            current[family],
            `${family} changed at tick ${world.tick} without bumping its revision`,
          ).toBeGreaterThan(previous[family]);
        }
        fingerprints[index] = fingerprint;
      });
      previous = current;
    }
  });
});
