import { afterEach, describe, expect, it } from 'vitest';
import { MapPreset, MapSize, BuildingType, JobType, type WorldMap } from '../src/game/gameTypes';
import { Walkability } from '../src/game/terrain/terrainGrid';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { getCurrentPathGrid, resetPathGridCaches, setCurrentPathMap } from '../src/game/pathfinding';
import { resetSimRng } from '../src/game/simRng';
import { building, human } from '../src/test/factories';

function flatMap(blocked: boolean): WorldMap {
  const width = 120;
  const height = 90;
  const cols = 19;
  const rows = 15;
  const pathGrid = new Uint8Array(width * height);
  if (blocked) {
    for (let y = 0; y < height; y++) pathGrid[y * width + 50] = Walkability.Water;
  }
  return {
    width, height, seed: 2503, preset: MapPreset.Continental, size: MapSize.Medium,
    rivers: [], cols, rows, elevation: new Float32Array(cols * rows).fill(0.5),
    moisture: new Float32Array(cols * rows).fill(0.5),
    temperature: new Float32Array(cols * rows).fill(0.5),
    terrain: new Uint8Array(cols * rows), riverDist: new Float32Array(cols * rows),
    pathGrid, pCols: width, pRows: height,
  } as WorldMap;
}

afterEach(() => {
  setCurrentPathMap(null);
  resetPathGridCaches();
  resetSimRng();
});

describe('save-load workforce uses the restored navigation grid', () => {
  it.each(['absent', 'previous colony'] as const)(
    'rejects a blocked new commute with %s prior navigation state while preserving the incumbent',
    (prior) => {
      const existing = human(1, {
        x: 450, y: 450, residenceBuildingId: 1, workerBuildingId: 2, job: JobType.Farmer,
      });
      const applicant = human(2, { x: 450, y: 450, residenceBuildingId: 1 });
      const house = building(1, BuildingType.House, { x: 450, y: 450, occupants: [1, 2] });
      const farm = building(2, BuildingType.Farm, { x: 550, y: 450, occupants: [1] });

      const saved = initGame({ seed: 2503, size: MapSize.Medium, skipTerrain: true, width: 1200, height: 900 });
      const payload = buildSaveData(saved, createInitialView(saved.width, saved.height));
      payload.entities = [existing, applicant];
      payload.buildings = [house, farm];
      payload.worldMap = flatMap(true);
      payload.nextEntityId = 3;
      payload.nextBuildingId = 3;

      if (prior === 'previous colony') {
        setCurrentPathMap(flatMap(false), [house, farm]);
        expect(getCurrentPathGrid()).not.toBeNull();
      } else {
        setCurrentPathMap(null);
      }

      const outcome = loadGameFromParsedOutcome(payload);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(getCurrentPathGrid()).not.toBeNull();
      expect(outcome.world.entities.find((person) => person.id === 2)?.workerBuildingId).toBeUndefined();
      expect(outcome.world.entities.find((person) => person.id === 1)?.workerBuildingId).toBe(2);
      expect(outcome.world.buildings.find((site) => site.id === 2)?.occupants).toContain(1);
      expect(outcome.world.buildings.find((site) => site.id === 2)?.occupants).not.toContain(2);
    },
  );
});
