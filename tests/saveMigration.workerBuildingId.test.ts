import { beforeAll, describe, expect, it } from 'vitest';
import { BuildingType, JobType, type Entity, type WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { building, human } from '../src/test/factories';
import { setHumanBirthFromAge } from '../src/game/dayCycle';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import { packEntityRenderMeta } from '../src/game/simBuffers/entityRenderMeta';

let payload: Record<string, unknown>;

beforeAll(() => {
  const world = initGame({ seed: 42021 });
  world.worldMap = null;
  const settler = human(11, {
    x: 100, y: 100, gender: 'male', job: JobType.Farmer,
    workerBuildingId: 0, residenceBuildingId: 20,
    moonHowlerSaved: { energy: 100, maxEnergy: 100, speed: 6.4, size: 10, workerBuildingId: 0 },
  });
  setHumanBirthFromAge(settler, 25, 0);
  world.entities = [settler];
  world.buildings = [
    building(0, BuildingType.Farm, { x: 180, y: 100, occupants: [11], staffingMode: 'manual' }),
    building(3, BuildingType.Farm, { x: 180, y: 180, staffingMode: 'manual' }),
    building(20, BuildingType.House, { x: 100, y: 100, occupants: [11] }),
  ];
  payload = structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
});

describe('workplace field migration at the save boundary', () => {
  it.each(['legacy', 'current', 'both'] as const)('loads %s assignments without changing identities or birthdates', (format) => {
    const input = structuredClone(payload);
    const saved = (input.entities as Array<Entity & { homeBuildingId?: number }>)[0];
    const form = saved.moonHowlerSaved as NonNullable<Entity['moonHowlerSaved']> & { homeBuildingId?: number };
    for (const assignment of [saved, form]) {
      if (format !== 'current') assignment.homeBuildingId = format === 'both' ? 3 : 0;
      if (format === 'legacy') delete assignment.workerBuildingId;
    }
    const original = structuredClone(input);
    const outcome = loadGameFromParsedOutcome(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.detail);
    const settler = outcome.world.entities.find((entity) => entity.id === saved.id)!;
    expect(settler.workerBuildingId).toBe(0);
    expect(settler.moonHowlerSaved?.workerBuildingId).toBe(0);
    expect(settler).not.toHaveProperty('homeBuildingId');
    expect(settler.moonHowlerSaved).not.toHaveProperty('homeBuildingId');
    expect(settler.residenceBuildingId).toBe(20);
    expect([settler.birthYear, settler.birthMonth, settler.birthDay])
      .toEqual([saved.birthYear, saved.birthMonth, saved.birthDay]);
    expect(input).toEqual(original);

    const exported = buildSaveData(outcome.world, createInitialView(outcome.world.width, outcome.world.height));
    expect(JSON.stringify(exported)).not.toContain('homeBuildingId');
    const again = loadGameFromParsedOutcome(structuredClone(exported));
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error(again.detail);
    expect(again.world.entities.find((entity) => entity.id === saved.id)?.workerBuildingId).toBe(0);

    const receiver: WorldState = structuredClone(outcome.world);
    receiver.entities[0].workerBuildingId = undefined;
    applySimPrep(receiver, structuredClone(extractSimPrep(outcome.world)));
    expect(receiver.entities.find((entity) => entity.id === saved.id)?.workerBuildingId).toBe(0);
    expect(packEntityRenderMeta(settler)).toHaveProperty('workerBuildingId', 0);
    expect(packEntityRenderMeta(settler)).not.toHaveProperty('homeBuildingId');
  });
});
