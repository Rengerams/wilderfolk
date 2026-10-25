/**
 * A prison sentence holds the settler's bed and their post.
 *
 * While a settler is jailed only attendance stops: the residence link, the home's roster entry and
 * the workplace all stay put, so nobody is rehoused and no post is refilled behind them.
 */
import { describe, expect, it } from 'vitest';
import { createBuilding, initGame } from '../src/game/worldGen';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { getResidenceCapacity } from '../src/game/residencyOccupancy';
import { assignMissingResidences, restoreCustodyAfterRelease } from '../src/game/residencyReconciliation';
import { prepareWorkforce, releasePrisoners } from '../src/game/workforce';
import { exposeAffair } from '../src/game/simulation/humanRelationships';
import { setSimSeed } from '../src/game/simRng';
import { isPlayerHuman } from '../src/game/playerHuman';
import { finishedBuilding, human } from '../src/test/factories';

const FIXTURE_SEED = 20261023;
const PRISON_ID = 900;
const HOUSE_ID = 901;
const FARM_ID = 902;

function completed(type: BuildingType, x: number, y: number, id: number) {
  const building = createBuilding(type, x, y, id);
  building.completed = true;
  return building;
}

/**
 * The world the affair path needs: a guarded prison, and a housed, employed, married pair that is
 * caught. Neither spouse is in the world, so the caught affair cannot divorce and rehouse anyone —
 * the arrest is then the only thing that could change a link.
 */
function scandalWorld(): { state: WorldState; cheater: Entity; paramour: Entity; house: { occupants: number[] } } {
  const state = initGame({ seed: FIXTURE_SEED });
  const prison = completed(BuildingType.Prison, 400, 400, PRISON_ID);
  const house = completed(BuildingType.House, 100, 100, HOUSE_ID);
  const farm = completed(BuildingType.Farm, 120, 100, FARM_ID);
  const settler = (id: number, spouseId: number) => human(id, {
    job: JobType.Farmer,
    residenceBuildingId: house.id,
    workerBuildingId: farm.id,
    partnerId: spouseId,
    relationshipStatus: 'married',
  });
  const cheater = settler(7001, 7002);
  const paramour = settler(8001, 8002);
  const guard = human(9001, {
    job: JobType.PrisonGuard,
    workerBuildingId: prison.id,
    residenceBuildingId: house.id,
  });
  house.occupants = [cheater.id, paramour.id, guard.id];
  prison.occupants = [guard.id];
  state.buildings = [prison, house, farm];
  state.entities = [cheater, paramour, guard];
  return { state, cheater, paramour, house };
}

describe('a jailed settler keeps a reserved bed', () => {
  it('does not read the reserved bed as a free one for a homeless settler', () => {
    const house = finishedBuilding(HOUSE_ID, BuildingType.House);
    const prison = finishedBuilding(PRISON_ID, BuildingType.Prison);
    const residents = Array.from({ length: getResidenceCapacity(house) }, (_, index) =>
      human(10 + index, { residenceBuildingId: house.id }));
    const jailed = residents[residents.length - 1];
    jailed.prisonBuildingId = prison.id;
    const homeless = human(99, { residenceBuildingId: undefined });
    house.occupants = residents.map((resident) => resident.id);
    prison.occupants = [jailed.id];

    assignMissingResidences([...residents, homeless], [house, prison]);

    expect(homeless.residenceBuildingId).toBeUndefined();
    expect(jailed.residenceBuildingId).toBe(house.id);
  });
});

describe('an arrest leaves both links alone', () => {
  it('keeps the offenders housed and posted for the whole sentence', () => {
    let jailed = 0;

    // The arrest roll is seeded, so the case is searched across seeds rather than stubbed.
    for (let seed = 1; seed <= 25 && jailed === 0; seed++) {
      const { state, cheater, paramour, house } = scandalWorld();
      setSimSeed(seed);

      exposeAffair(
        state,
        cheater,
        paramour,
        'caught',
        new Map(state.entities.map((entity) => [entity.id, entity])),
        state.buildings,
        state.entities.filter(isPlayerHuman),
      );

      for (const offender of [cheater, paramour]) {
        if (offender.prisonBuildingId !== PRISON_ID) continue;
        jailed += 1;
        expect(offender.residenceBuildingId).toBe(HOUSE_ID);
        expect(offender.workerBuildingId).toBe(FARM_ID);
        expect(house.occupants).toContain(offender.id);
      }
    }

    expect(jailed).toBeGreaterThan(0);
  }, 45_000);
});

describe('a workforce pulse during the sentence', () => {
  it('leaves the jailed settler holding the post and the job', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    const prison = completed(BuildingType.Prison, 400, 400, PRISON_ID);
    const house = completed(BuildingType.House, 100, 100, HOUSE_ID);
    const farm = completed(BuildingType.Farm, 120, 100, FARM_ID);
    const settler = human(7001, {
      job: JobType.Farmer,
      residenceBuildingId: house.id,
      workerBuildingId: farm.id,
    });
    settler.prisonBuildingId = prison.id;
    settler.prisonerUntilTick = state.tick + 100;
    house.occupants = [settler.id];
    prison.occupants = [settler.id];
    farm.occupants = [settler.id];
    state.entities = [settler];
    state.buildings = [prison, house, farm];

    prepareWorkforce(state.entities, state.buildings);

    expect(settler.workerBuildingId).toBe(FARM_ID);
    expect(settler.job).toBe(JobType.Farmer);
    expect(settler.residenceBuildingId).toBe(HOUSE_ID);
    expect(prison.occupants).toContain(settler.id);
  });
});

describe('a release is uneventful', () => {
  it('walks out to the same home and post', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    const prison = completed(BuildingType.Prison, 400, 400, PRISON_ID);
    const house = completed(BuildingType.House, 100, 100, HOUSE_ID);
    const farm = completed(BuildingType.Farm, 120, 100, FARM_ID);
    const settler = human(7001, {
      job: JobType.Farmer,
      residenceBuildingId: house.id,
      workerBuildingId: farm.id,
    });
    settler.prisonBuildingId = prison.id;
    settler.prisonerUntilTick = state.tick - 1;
    house.occupants = [settler.id];
    prison.occupants = [settler.id];
    state.entities = [settler];
    state.buildings = [prison, house, farm];

    releasePrisoners(state);

    expect(settler.prisonBuildingId).toBeUndefined();
    expect(settler.residenceBuildingId).toBe(HOUSE_ID);
    expect(settler.workerBuildingId).toBe(FARM_ID);
    expect(house.occupants).toContain(settler.id);
    expect(prison.occupants).not.toContain(settler.id);
  });
});

describe('custody restoration when a prisoner is released', () => {
  it('does not move children already living with their available mother', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    const prison = completed(BuildingType.Prison, 400, 400, PRISON_ID);
    const motherHome = completed(BuildingType.House, 100, 100, HOUSE_ID);
    const fatherHome = completed(BuildingType.House, 200, 100, 903);
    const mother = human(7101, { gender: 'female', residenceBuildingId: motherHome.id });
    const father = human(7102, { gender: 'male', residenceBuildingId: fatherHome.id });
    const child = human(7103, {
      age: 8, isJuvenile: true, motherId: mother.id, fatherId: father.id,
      residenceBuildingId: motherHome.id,
    });
    father.prisonBuildingId = prison.id;
    father.prisonerUntilTick = state.tick - 1;
    prison.occupants = [father.id];
    motherHome.occupants = [mother.id, child.id];
    fatherHome.occupants = [father.id];
    state.entities = [mother, father, child];
    state.buildings = [prison, motherHome, fatherHome];

    releasePrisoners(state);

    expect(father.prisonBuildingId).toBeUndefined();
    expect(child.residenceBuildingId).toBe(motherHome.id);
    expect(motherHome.occupants).toContain(child.id);
    expect(fatherHome.occupants).not.toContain(child.id);
    expect(restoreCustodyAfterRelease(father, state.entities)).toEqual([]);
  });

  it('clears temporary guardians but leaves the child with an available natural custodian', () => {
    const mother = human(7201, { gender: 'female', residenceBuildingId: HOUSE_ID });
    const father = human(7202, { gender: 'male', residenceBuildingId: 903 });
    const child = human(7203, {
      age: 8, isJuvenile: true, motherId: mother.id, fatherId: father.id,
      adoptiveFatherId: 7299, residenceBuildingId: HOUSE_ID,
    });
    expect(restoreCustodyAfterRelease(father, [mother, father, child])).toEqual([]);
    expect(child.adoptiveFatherId).toBeUndefined();
    expect(child.residenceBuildingId).toBe(HOUSE_ID);
  });
});
