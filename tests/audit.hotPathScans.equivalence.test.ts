/**
 * 2026-09-20 hot-path scan audit — differential equivalence for the four bucketing/hoisting fixes
 * that replaced a whole-collection scan inside a loop.
 *
 * Each case keeps the **pre-fix body verbatim** as a reference implementation and diffs the real
 * function against it on two identical worlds, so the assertions fail if the rewrite stops being
 * equivalent (rather than merely pinning today's output). The fixtures are built so the *live* input
 * the rewrite relies on actually moves inside the loop:
 *
 *   - `rebalanceOvercrowdedResidences` evicts (`residenceBuildingId = undefined`) while it walks the
 *     residence list, which is the only reason a naive bucket *could* diverge;
 *   - `syncJobBuildingOccupants` has a union predicate for the prison (home OR prison) and a
 *     narrower one for every other job building (home AND no prison), so a wrong bucket shows up as
 *     a missing or duplicated occupant id;
 *   - `syncResidenceOccupants` is now handed the whole alive collection instead of a pre-filtered
 *     copy, so the diff is "pre-filtered input" versus "unfiltered input".
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { createBuilding, initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { setSimSeed } from '../src/game/simRng';
import { isPlayerHuman } from '../src/game/playerHuman';
import {
  getResidenceCapacity,
  isLeaderHouseResidence,
} from '../src/game/residencyOccupancy';
import { collectFamilyMembers } from '../src/game/householdComposition';
import {
  isResidenceOccupantEntity,
  rebalanceOvercrowdedResidences,
  syncResidenceOccupants,
} from '../src/game/residencyReconciliation';
import { syncJobBuildingOccupants } from '../src/game/workforce';
import { tryMoveOutOfFamilyHome } from '../src/game/residencySelection';

const FIXTURE_SEED = 20_260_921;

function finishedBuilding(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  const building = createBuilding(type, 100 + id, 100 + id, id);
  building.completed = true;
  return Object.assign(building, overrides);
}

let nextFixtureId = 1_000;
function settler(residenceBuildingId?: number, overrides: Partial<Entity> = {}): Entity {
  const id = nextFixtureId++;
  const human = createEntity(EntityType.Human, 400 + (id % 40), 400 + (id % 40), id, 200, false, {
    name: `H${id}`,
    surname: 'Vale',
  });
  human.age = 30;
  human.residenceBuildingId = residenceBuildingId;
  return Object.assign(human, overrides);
}

// ---------------------------------------------------------------------------
// Reference implementations — the pre-fix bodies, verbatim. Not production code.
// ---------------------------------------------------------------------------

/** Pre-fix `rebalanceOvercrowdedResidences`: re-filters the whole settler list per residence. */
function referenceRebalanceOvercrowdedResidences(humans: Entity[], residences: Building[]): boolean {
  let evicted = false;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    const cap = getResidenceCapacity(residence);
    const occupants = humans.filter(
      (h) => h.alive && isPlayerHuman(h) && h.residenceBuildingId === residence.id,
    );
    if (occupants.length <= cap) continue;

    const visited = new Set<number>();
    const familiesInHouse: Entity[][] = [];
    for (const occupant of occupants.sort((a, b) => a.id - b.id)) {
      if (visited.has(occupant.id)) continue;
      familiesInHouse.push(collectFamilyMembers(occupant, occupants, visited));
    }

    familiesInHouse.sort((a, b) => b.length - a.length);

    const kept = new Set<number>();
    let count = 0;
    for (const family of familiesInHouse) {
      if (count + family.length > cap) continue;
      for (const member of family) kept.add(member.id);
      count += family.length;
    }

    for (const occupant of occupants) {
      if (!kept.has(occupant.id)) {
        occupant.residenceBuildingId = undefined;
        evicted = true;
      }
    }
  }
  return evicted;
}

/** Pre-fix `syncJobBuildingOccupants`: re-filters the whole settler list per building. */
function referenceSyncJobBuildingOccupants(humans: Entity[], buildings: Building[]): void {
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building.completed || building.faction === 'rival' || !BUILDING_JOB_TYPES_REF[building.type]) {
      continue;
    }
    if (building.type === BuildingType.Prison) {
      building.occupants = humans
        .filter(
          (h) =>
            h.alive &&
            isPlayerHuman(h) &&
            (h.homeBuildingId === building.id || h.prisonBuildingId === building.id),
        )
        .map((h) => h.id);
      continue;
    }
    building.occupants = humans
      .filter(
        (h) =>
          h.alive &&
          isPlayerHuman(h) &&
          h.homeBuildingId === building.id &&
          h.prisonBuildingId == null,
      )
      .map((h) => h.id);
  }
}

/**
 * Local copy of the production `BUILDING_JOB_TYPES` membership test. It only has to be *stable* for
 * the fixture's building types, not identical: both the reference and the real function read the
 * production table, so the reference reaches the same building set either way.
 */
const BUILDING_JOB_TYPES_REF: Partial<Record<BuildingType, unknown>> = {
  [BuildingType.Farm]: true,
  [BuildingType.Prison]: true,
  [BuildingType.Barracks]: true,
  [BuildingType.Market]: true,
  [BuildingType.Tavern]: true,
  [BuildingType.LumberMill]: true,
  [BuildingType.Quarry]: true,
  [BuildingType.Mine]: true,
  [BuildingType.Blacksmith]: true,
  [BuildingType.Workshop]: true,
  [BuildingType.TownHall]: true,
  [BuildingType.Hospital]: true,
  [BuildingType.Church]: true,
  [BuildingType.Store]: true,
  [BuildingType.Silo]: true,
  [BuildingType.Hotel]: true,
};

function residenceAssignmentById(state: WorldState): Array<[number, number | undefined]> {
  return state.entities.map((e) => [e.id, e.residenceBuildingId]);
}

function occupantLists(state: WorldState): Array<[number, number[]]> {
  return state.buildings.map((b) => [b.id, [...b.occupants]]);
}

function newWorld(): WorldState {
  setSimSeed(FIXTURE_SEED);
  return initGame({ villageName: 'AUDIT', size: 'medium', seed: FIXTURE_SEED });
}

describe('rebalanceOvercrowdedResidences buckets like its pre-fix per-residence filter', () => {
  it('evicts identically across two overcrowded residences, including the second one a naive bucket would get wrong', () => {
    const houseA = finishedBuilding(1, BuildingType.House);
    const houseB = finishedBuilding(2, BuildingType.House);
    const manor = finishedBuilding(3, BuildingType.LeaderHouse);
    const capA = getResidenceCapacity(houseA);
    const capB = getResidenceCapacity(houseB);
    expect(capA).toBeGreaterThan(0);

    // Both houses are over capacity; A's eviction happens BEFORE B is examined, which is exactly the
    // ordering a frozen bucket would have to reproduce.
    const residents = [
      ...Array.from({ length: capA + 2 }, () => settler(houseA.id)),
      ...Array.from({ length: capB + 2 }, () => settler(houseB.id)),
      // Out-of-order ids and a dead/foreign settler so the predicate and the id sort both matter.
      settler(houseA.id, { alive: false }),
      settler(houseB.id, { faction: 'rival' }),
      settler(undefined),
      settler(manor.id),
    ];

    const realWorld = newWorld();
    realWorld.buildings = [houseB, houseA, manor];
    realWorld.entities = structuredClone(residents);
    const referenceWorld = newWorld();
    referenceWorld.buildings = structuredClone([houseB, houseA, manor]);
    referenceWorld.entities = structuredClone(residents);

    const realEvicted = rebalanceOvercrowdedResidences(realWorld.entities, realWorld.buildings);
    const referenceEvicted = referenceRebalanceOvercrowdedResidences(
      referenceWorld.entities,
      referenceWorld.buildings,
    );

    expect(realEvicted, 'the boolean return').toBe(referenceEvicted);
    expect(realEvicted, 'the fixture must actually evict').toBe(true);
    expect(residenceAssignmentById(realWorld), 'who stayed where').toEqual(
      residenceAssignmentById(referenceWorld),
    );
    // The leader's household is never overcrowd-evicted, however far over capacity it is.
    expect(manor.id && realWorld.entities.filter((e) => e.residenceBuildingId === manor.id).length)
      .toBe(1);
    // Order of the surviving assignment list is humans order in both worlds — asserted above.
  });

  it('is a no-op when every residence is within capacity', () => {
    const house = finishedBuilding(1, BuildingType.House);
    const residents = Array.from({ length: getResidenceCapacity(house) }, () => settler(house.id));
    const world = newWorld();
    world.buildings = [house];
    world.entities = residents;

    expect(rebalanceOvercrowdedResidences(world.entities, world.buildings)).toBe(false);
    expect(world.entities.every((e) => e.residenceBuildingId === house.id)).toBe(true);
  });
});

describe('syncResidenceOccupants accepts the unfiltered alive collection', () => {
  it('produces the same occupant lists whether the caller pre-filters or not', () => {
    const house = finishedBuilding(1, BuildingType.House);
    const mansion = finishedBuilding(2, BuildingType.Mansion);
    const rivalHouse = finishedBuilding(3, BuildingType.House, { faction: 'rival' });
    const farm = finishedBuilding(4, BuildingType.Farm, { occupants: [999] });

    const dead = settler(house.id);
    dead.alive = false;
    const foreign = settler(house.id, { faction: 'rival' });
    const cursed = createEntity(EntityType.Werewolf, 700, 700, 8_001, 600);
    cursed.moonHowlerCursed = true;
    cursed.residenceBuildingId = mansion.id;
    const plainWolf = createEntity(EntityType.Werewolf, 720, 700, 8_002, 600);
    plainWolf.residenceBuildingId = mansion.id;

    const houseResident = settler(house.id);
    const mansionResident = settler(mansion.id);
    const allAlive = [
      houseResident,
      mansionResident,
      cursed,
      dead,
      foreign,
      plainWolf,
      settler(undefined),
      settler(farm.id),
    ];

    // Pre-fix call shape: the caller filtered first, duplicating the callee's own predicate.
    const filteredWorld = newWorld();
    filteredWorld.buildings = structuredClone([house, mansion, rivalHouse, farm]);
    filteredWorld.entities = structuredClone(allAlive);
    syncResidenceOccupants(
      filteredWorld.entities.filter((e) => e.alive && isResidenceOccupantEntity(e)),
      filteredWorld.buildings,
    );

    // Post-fix call shape: the whole collection, as `gameTick` now passes `allAlive`.
    const unfilteredWorld = newWorld();
    unfilteredWorld.buildings = structuredClone([house, mansion, rivalHouse, farm]);
    unfilteredWorld.entities = structuredClone(allAlive);
    syncResidenceOccupants(unfilteredWorld.entities, unfilteredWorld.buildings);

    expect(occupantLists(unfilteredWorld), 'occupant ids and order').toEqual(
      occupantLists(filteredWorld),
    );
    // And the lists are the ones the predicate implies — dead/foreign/unassigned are excluded.
    const byId = new Map(unfilteredWorld.buildings.map((b) => [b.id, b.occupants]));
    expect(byId.get(house.id)).toEqual([houseResident.id]);
    // The un-cursed werewolf is NOT an occupant, so the mansion holds only the settler and the
    // cursed one — in `humans` order.
    expect(byId.get(mansion.id)).toEqual([mansionResident.id, cursed.id]);
    expect(byId.get(rivalHouse.id)).toEqual([]);
    expect(byId.get(farm.id)).toEqual([999]);
  });
});

describe('syncJobBuildingOccupants buckets like its pre-fix per-building filter', () => {
  it('keeps the prison union and the narrower job predicate identical, including home === prison', () => {
    const prison = finishedBuilding(1, BuildingType.Prison);
    const farm = finishedBuilding(2, BuildingType.Farm);
    const barracks = finishedBuilding(3, BuildingType.Barracks);
    const rivalFarm = finishedBuilding(4, BuildingType.Farm, { faction: 'rival' });
    const site = createBuilding(BuildingType.Farm, 900, 900, 5);
    const deadWorker = settler(undefined, { alive: false });

    const humans: Entity[] = [
      // home === prison for both ids: the union must not emit this id twice.
      settler(undefined, { homeBuildingId: prison.id, prisonBuildingId: prison.id }),
      // homes the farm, no prison.
      settler(undefined, { homeBuildingId: farm.id }),
      // homes the farm but is imprisoned elsewhere: excluded from the farm, present in the prison list.
      settler(undefined, { homeBuildingId: farm.id, prisonBuildingId: prison.id }),
      // homeless prisoner.
      settler(undefined, { prisonBuildingId: prison.id }),
      settler(undefined, { homeBuildingId: barracks.id }),
      settler(undefined, { homeBuildingId: rivalFarm.id }),
      settler(undefined, { homeBuildingId: site.id }),
      settler(undefined, { homeBuildingId: farm.id, faction: 'rival' }),
      deadWorker,
    ];
    deadWorker.homeBuildingId = farm.id;

    const realWorld = newWorld();
    realWorld.buildings = structuredClone([prison, farm, barracks, rivalFarm, site]);
    realWorld.entities = structuredClone(humans);
    const referenceWorld = newWorld();
    referenceWorld.buildings = structuredClone([prison, farm, barracks, rivalFarm, site]);
    referenceWorld.entities = structuredClone(humans);

    syncJobBuildingOccupants(realWorld.entities, realWorld.buildings);
    referenceSyncJobBuildingOccupants(referenceWorld.entities, referenceWorld.buildings);

    expect(occupantLists(realWorld), 'every building occupant list').toEqual(
      occupantLists(referenceWorld),
    );

    const byId = new Map(realWorld.buildings.map((b) => [b.id, b.occupants]));
    // prison = home-or-prison union, deduped, in humans order.
    expect(byId.get(prison.id)).toEqual([humans[0]!.id, humans[2]!.id, humans[3]!.id]);
    // farm = home-only, so the imprisoned home-worker and the dead one are out.
    expect(byId.get(farm.id)).toEqual([humans[1]!.id]);
    expect(byId.get(barracks.id)).toEqual([humans[4]!.id]);
    // A rival camp and an unfinished site are skipped entirely: their lists keep whatever they had.
    expect(byId.get(rivalFarm.id)).toEqual([]);
    expect(byId.get(site.id)).toEqual([]);
  });
});

describe('tryMoveOutOfFamilyHome keeps its single-scan verdict', () => {
  it('moves an adult child into a fitting empty residence', () => {
    const familyHome = finishedBuilding(1, BuildingType.House);
    const emptyHome = finishedBuilding(2, BuildingType.House);
    const world = newWorld();
    world.buildings = [familyHome, emptyHome];

    const parent = settler(familyHome.id, { age: 45 });
    const child = settler(familyHome.id, { age: 22, motherId: parent.id, fatherId: undefined });
    world.entities = [parent, child];

    expect(tryMoveOutOfFamilyHome(child, world.entities, world.buildings)).toBe(true);
    expect(child.residenceBuildingId).toBe(emptyHome.id);
    expect(parent.residenceBuildingId).toBe(familyHome.id);
  });

  it('reports false and moves nobody when every other residence is occupied', () => {
    const familyHome = finishedBuilding(1, BuildingType.House);
    const takenHome = finishedBuilding(2, BuildingType.House);
    const world = newWorld();
    world.buildings = [familyHome, takenHome];

    const parent = settler(familyHome.id, { age: 45 });
    const child = settler(familyHome.id, { age: 22, motherId: parent.id, fatherId: undefined });
    const stranger = settler(takenHome.id, { age: 40 });
    world.entities = [parent, child, stranger];

    expect(tryMoveOutOfFamilyHome(child, world.entities, world.buildings)).toBe(false);
    expect(child.residenceBuildingId).toBe(familyHome.id);
    expect(stranger.residenceBuildingId).toBe(takenHome.id);
  });

  it('does not move a minor child out of the family home', () => {
    const familyHome = finishedBuilding(1, BuildingType.House);
    const emptyHome = finishedBuilding(2, BuildingType.House);
    const world = newWorld();
    world.buildings = [familyHome, emptyHome];

    const parent = settler(familyHome.id, { age: 45 });
    const minor = settler(familyHome.id, { age: 9, motherId: parent.id, fatherId: undefined });
    world.entities = [parent, minor];

    expect(tryMoveOutOfFamilyHome(minor, world.entities, world.buildings)).toBe(false);
    expect(minor.residenceBuildingId).toBe(familyHome.id);
  });
});
