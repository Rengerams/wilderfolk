/**
 * N-7 (`src/game/residencyReconciliation.ts`, `syncResidenceOccupants`) — differential equivalence,
 * with the occupant **order** pinned.
 *
 * The function used to re-scan the whole `humans` array for every residence
 * (O(residences × humans)); it now buckets ids in one forward pass. The rewrite is only equivalent
 * if `building.occupants` still comes out in `humans` order — the old per-building
 * `.filter(h => ...).map(h => h.id)` emitted ids in array order, and a bucket that sorts ids, that
 * walks `buildings` in the outer loop, or that rebuilds per residence would change the UI's list.
 *
 * So this file does three things:
 *   1. pins the exact expected arrays for a fixture whose `humans` order is deliberately neither
 *      id-sorted nor building-sorted (and asserts that it is not id-sorted, so the fixture can never
 *      silently stop being order-sensitive);
 *   2. diffs the real function against {@link referenceSyncResidenceOccupants} — the pre-N-7 loop,
 *      kept verbatim below as the reference implementation — on two identical worlds;
 *   3. covers the edges the predicate hides: building id 0, a dead settler, a foreign-faction
 *      settler, a cursed werewolf (counted) versus a plain werewolf (not counted), an assignment to
 *      a rival house, to a non-residence, and to an id that does not exist.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { createBuilding, initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { isResidenceBuilding } from '../src/game/residencyOccupancy';
import { isResidenceOccupantEntity, syncResidenceOccupants } from '../src/game/residencyReconciliation';
import { setSimSeed } from '../src/game/simRng';

const FIXTURE_SEED = 20_260_920;

const HOUSE_ZERO_ID = 0;
const HOUSE_ONE_ID = 1;
const MANSION_ID = 2;
const LEADER_HOUSE_ID = 3;
const RIVAL_HOUSE_ID = 4;
const SITE_ID = 5;
const FARM_ID = 9;
const MISSING_ID = 777;

/** Pre-existing occupant lists that `syncResidenceOccupants` must not touch. */
const FARM_OCCUPANTS = [999];
const RIVAL_HOUSE_OCCUPANTS = [888];
const SITE_OCCUPANTS = [666];

/**
 * REFERENCE IMPLEMENTATION — the pre-N-7 body of `syncResidenceOccupants`, verbatim. Not production
 * code: it exists only to be diffed against the real function.
 */
function referenceSyncResidenceOccupants(humans: Entity[], buildings: Building[]): void {
  for (const building of buildings) {
    if (!isResidenceBuilding(building) || building.faction === 'rival') continue;
    building.occupants = humans
      .filter((h) => isResidenceOccupantEntity(h) && h.residenceBuildingId === building.id)
      .map((h) => h.id);
  }
}

function finishedBuilding(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  const building = createBuilding(type, 100 + id, 100 + id, id);
  building.completed = true;
  return Object.assign(building, overrides);
}

function settler(id: number, residenceBuildingId?: number): Entity {
  const human = createEntity(EntityType.Human, 400, 400, id, 200, false, {
    ageYears: 30,
    name: `H${id}`,
    surname: 'Vale',
  });
  human.residenceBuildingId = residenceBuildingId;
  return human;
}

/**
 * A village where the `humans` array order carries the answer: house 1's occupants appear as
 * `[91, 7]` (array order) and not `[7, 91]` (id order), and mansion's as `[42, 13, 62]`. Buildings
 * are listed in a third order again, so neither loop order can produce the expectations by accident.
 */
function buildVillage(): WorldState {
  setSimSeed(FIXTURE_SEED);
  const state = initGame({ villageName: 'N7', size: 'medium', seed: FIXTURE_SEED });

  const site = createBuilding(BuildingType.House, 900, 900, SITE_ID);
  // Under construction: not a residence, so its occupant list is left alone.
  site.occupants = [...SITE_OCCUPANTS];

  state.buildings = [
    finishedBuilding(MANSION_ID, BuildingType.Mansion),
    finishedBuilding(FARM_ID, BuildingType.Farm, { occupants: [...FARM_OCCUPANTS] }),
    finishedBuilding(HOUSE_ZERO_ID, BuildingType.House, { occupants: [555] }),
    finishedBuilding(RIVAL_HOUSE_ID, BuildingType.House, { faction: 'rival', occupants: [...RIVAL_HOUSE_OCCUPANTS] }),
    finishedBuilding(HOUSE_ONE_ID, BuildingType.House),
    site,
    finishedBuilding(LEADER_HOUSE_ID, BuildingType.LeaderHouse),
  ];

  const deadResident = settler(60, HOUSE_ONE_ID);
  deadResident.alive = false;
  const rivalResident = settler(61, HOUSE_ONE_ID);
  rivalResident.faction = 'rival';
  const cursedHowler = createEntity(EntityType.Werewolf, 700, 700, 62, 600);
  cursedHowler.moonHowlerCursed = true;
  cursedHowler.residenceBuildingId = MANSION_ID;
  const plainWerewolf = createEntity(EntityType.Werewolf, 720, 700, 63, 600);
  plainWerewolf.residenceBuildingId = MANSION_ID;
  const visitor = settler(69, LEADER_HOUSE_ID);
  visitor.faction = 'visitor';
  const deadHowler = createEntity(EntityType.Werewolf, 740, 700, 70, 600);
  deadHowler.moonHowlerCursed = true;
  deadHowler.residenceBuildingId = HOUSE_ONE_ID;
  deadHowler.alive = false;

  // Spawn order — deliberately not sorted by id, and interleaved across the residences.
  state.entities = [
    settler(91, HOUSE_ONE_ID),
    settler(42, MANSION_ID),
    settler(7, HOUSE_ONE_ID),
    settler(13, MANSION_ID),
    settler(5, HOUSE_ZERO_ID),
    deadResident,
    rivalResident,
    cursedHowler,
    plainWerewolf,
    settler(64, LEADER_HOUSE_ID),
    settler(65, FARM_ID),
    settler(66, MISSING_ID),
    settler(67),
    settler(68, HOUSE_ZERO_ID),
    visitor,
    deadHowler,
    settler(71, RIVAL_HOUSE_ID),
  ];

  return state;
}

/** Entities and buildings are the only state the function writes: clone those, share the rest. */
function cloneWorld(state: WorldState): WorldState {
  return {
    ...state,
    entities: structuredClone(state.entities),
    buildings: structuredClone(state.buildings),
  };
}

function occupantsById(state: WorldState): Array<[number, number[]]> {
  return state.buildings.map((b) => [b.id, [...b.occupants]]);
}

describe('syncResidenceOccupants is equivalent to its pre-N-7 body (N-7)', () => {
  it('buckets in one pass and keeps the humans-array order of every occupant list', () => {
    const source = buildVillage();
    const expected: Array<[number, number[]]> = [
      [MANSION_ID, [42, 13, 62]],
      [FARM_ID, [...FARM_OCCUPANTS]],
      [HOUSE_ZERO_ID, [5, 68]],
      [RIVAL_HOUSE_ID, [...RIVAL_HOUSE_OCCUPANTS]],
      [HOUSE_ONE_ID, [91, 7]],
      [SITE_ID, [...SITE_OCCUPANTS]],
      [LEADER_HOUSE_ID, [64]],
    ];

    // The fixture is only able to detect an order regression while its resident ids are out of id
    // order: by construction `humans` order (`[91, 7]`) is not the sorted order (`[7, 91]`).
    expect(expected[4][1]).not.toEqual([...expected[4][1]].sort((a, b) => a - b));
    expect(expected[0][1]).not.toEqual([...expected[0][1]].sort((a, b) => a - b));

    // Reference on one world, real on an identical one.
    const referenceWorld = cloneWorld(source);
    referenceSyncResidenceOccupants(referenceWorld.entities, referenceWorld.buildings);
    syncResidenceOccupants(source.entities, source.buildings);

    expect(occupantsById(source), 'occupant ids and their order').toEqual(occupantsById(referenceWorld));
    expect(occupantsById(source), 'occupant ids and their order').toEqual(expected);
    // `toEqual` ignores extra properties, so the frozen lists are compared by value here too.
    expect(source.buildings.find((b) => b.id === FARM_ID)?.occupants).toEqual(FARM_OCCUPANTS);
  });

  it('leaves non-residence, rival and unassigned housing untouched', () => {
    const state = buildVillage();

    syncResidenceOccupants(state.entities, state.buildings);

    const byId = new Map(state.buildings.map((b) => [b.id, b]));
    // A non-residence (the farm) and a rival camp keep whatever their own owners wrote.
    expect(byId.get(FARM_ID)?.occupants).toEqual(FARM_OCCUPANTS);
    expect(byId.get(RIVAL_HOUSE_ID)?.occupants).toEqual(RIVAL_HOUSE_OCCUPANTS);
    // An unfinished house is not a residence yet, even though a settler claims it.
    expect(byId.get(SITE_ID)?.occupants).toEqual(SITE_OCCUPANTS);
    // Nobody points at the missing id, so it is simply empty.
    expect(byId.get(MISSING_ID)).toBeUndefined();
    // Building id 0 is a valid residence — a truthiness check would drop its occupants.
    expect(byId.get(HOUSE_ZERO_ID)?.occupants).toEqual([5, 68]);
  });

  it('drops the settlers the occupant predicate rejects', () => {
    const state = buildVillage();

    syncResidenceOccupants(state.entities, state.buildings);

    const houseOne = state.buildings.find((b) => b.id === HOUSE_ONE_ID)?.occupants ?? [];
    // Dead, foreign-faction and un-cursed-werewolf assignments are not occupants …
    expect(houseOne).not.toContain(60);
    expect(houseOne).not.toContain(61);
    expect(houseOne).not.toContain(70);
    // … while a cursed settler in werewolf form still counts (and keeps its position in the list).
    const mansion = state.buildings.find((b) => b.id === MANSION_ID)?.occupants ?? [];
    expect(mansion).toEqual([42, 13, 62]);
  });
});
