import { describe, expect, it } from 'vitest';
import { BuildingType, LEADER_OCCUPATION } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { human, building } from '../src/test/factories';
import { getChildCustodian } from '../src/game/householdComposition';
import { collectLeaderHousehold, syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { assignMissingResidences, ensureOrphanAdoption, moveResident, rebalanceOvercrowdedResidences } from '../src/game/residencyReconciliation';
import { buildCommuteRelocationIndex, buildResidenceTraits, collectFamilyHousingShortages, pickCommuteRelocation } from '../src/game/residencySelection';
import { buildResidenceOccupancy, getResidenceCapacity } from '../src/game/residencyOccupancy';
import { getPriorityAlerts } from '../src/game/priorityAlerts';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

function family(children: number, homeId: number): Entity[] {
  const mother = human(1, { gender: 'female', partnerId: 2, residenceBuildingId: homeId });
  const father = human(2, { gender: 'male', partnerId: 1, residenceBuildingId: homeId });
  const kids = Array.from({ length: children }, (_, index) => human(10 + index, {
    motherId: 1, fatherId: 2, isJuvenile: true, age: 4, residenceBuildingId: homeId,
  }));
  mother.childrenIds = kids.map((child) => child.id);
  father.childrenIds = [...mother.childrenIds];
  return [mother, father, ...kids];
}

describe('family shortage, reunion and a single residence writer', () => {
  it('moves an unrelated resident first, preserving the family home', () => {
    const home = building(0, BuildingType.House);
    const spare = building(25, BuildingType.House);
    const household = family(getResidenceCapacity(home) - 2, home.id);
    const outsider = human(99, { residenceBuildingId: home.id });
    rebalanceOvercrowdedResidences([...household, outsider], [home, spare]);
    expect(household.every((member) => member.residenceBuildingId === home.id)).toBe(true);
    expect(outsider.residenceBuildingId).toBe(spare.id);
  });

  it('leaves an outsider it has just rehoused in their new home', () => {
    const home = building(0, BuildingType.House);
    const spare = building(25, BuildingType.House);
    const household = family(2, home.id);
    const spareFamily = [
      human(200, { gender: 'female', partnerId: 201, residenceBuildingId: spare.id }),
      human(201, { gender: 'male', partnerId: 200, residenceBuildingId: spare.id }),
      ...Array.from({ length: 3 }, (_, index) => human(210 + index, {
        motherId: 200, fatherId: 201, isJuvenile: true, age: 4, residenceBuildingId: spare.id,
      })),
    ];
    const outsiders = Array.from({ length: 4 }, (_, index) => human(90 + index, { residenceBuildingId: home.id }));

    rebalanceOvercrowdedResidences([...household, ...spareFamily, ...outsiders], [home, spare]);

    // The fallback unhouses the outsiders still sleeping here until the home fits its family; the one
    // it already rehoused keeps the spare bed instead of losing it.
    expect(outsiders.filter((outsider) => outsider.residenceBuildingId === spare.id)).toHaveLength(1);
    expect(buildResidenceOccupancy([...household, ...spareFamily, ...outsiders]).get(home.id))
      .toBeLessThanOrEqual(getResidenceCapacity(home));
    expect(household.every((member) => member.residenceBuildingId === home.id)).toBe(true);
  });

  it('moves the entire growing family before considering separation', () => {
    const home = building(0, BuildingType.House);
    const larger = building(99, BuildingType.Mansion, { level: 3 });
    const household = family(getResidenceCapacity(home) - 1, home.id);
    rebalanceOvercrowdedResidences(household, [home, larger]);
    expect(household.every((member) => member.residenceBuildingId === larger.id)).toBe(true);
  });

  it('keeps children with their mother, warns, stays stable, and reunites when a home opens', () => {
    const home = building(0, BuildingType.House);
    const household = family(getResidenceCapacity(home) - 1, home.id);
    assignMissingResidences(household, [home]);
    expect(household[1].residenceBuildingId).toBeUndefined();
    expect(household.filter((member) => member.id !== 2).every((member) => member.residenceBuildingId === 0)).toBe(true);
    expect(collectFamilyHousingShortages(household, [home])).toHaveLength(1);
    const before = household.map((member) => member.residenceBuildingId);
    assignMissingResidences(household, [home]);
    expect(household.map((member) => member.residenceBuildingId)).toEqual(before);
    const state = initGame({ seed: 4242 });
    state.entities = household;
    state.buildings = [home];
    state.resources.food = 10000;
    state.humanPopulation = household.length;
    expect(getPriorityAlerts(state).some((alert) => alert.id === 'family-housing-shortage')).toBe(true);
    const larger = building(1351, BuildingType.Mansion, { level: 3 });
    assignMissingResidences(household, [home, larger]);
    expect(household.every((member) => member.residenceBuildingId === larger.id)).toBe(true);
    expect(collectFamilyHousingShortages(household, [home, larger])).toEqual([]);
  });

  it('never overfills a home or separates dependents when even the guardian group cannot fit', () => {
    const home = building(0, BuildingType.House);
    const household = family(getResidenceCapacity(home), home.id);
    assignMissingResidences(household, [home]);
    expect(household.filter((member) => member.residenceBuildingId === home.id).length).toBeLessThanOrEqual(getResidenceCapacity(home));
    expect(household.filter((member) => member.id !== 2).every((member) => member.residenceBuildingId === household[0].residenceBuildingId)).toBe(true);
    expect(collectFamilyHousingShortages(household, [home])).toHaveLength(1);
  });

  it('updates reference, count, traits and rosters together, with a no-op on repetition', () => {
    const first = building(0, BuildingType.House, { occupants: [1] });
    const second = building(1351, BuildingType.House);
    const resident = human(1, { residenceBuildingId: 0 });
    const occupancy = buildResidenceOccupancy([resident]);
    const traits = buildResidenceTraits([resident]);
    const context = { occupancy, traits, buildings: [first, second] };
    moveResident(resident, second.id, 'family', context);
    moveResident(resident, second.id, 'family', context);
    expect(resident.residenceBuildingId).toBe(second.id);
    expect(first.occupants).toEqual([]);
    expect(second.occupants).toEqual([1]);
    expect([...occupancy]).toEqual([[second.id, 1]]);
    expect(traits.get(second.id)?.occupants.size).toBe(1);
  });
});

describe('grandparents and sibling-set guardianship', () => {
  it.each(['maternal', 'paternal'])('reaches a legitimate orphan’s %s grandfather and keeps siblings together', (side) => {
    const home = building(25, BuildingType.Mansion);
    const grandfather = human(5, { gender: 'male', surname: 'Vale', residenceBuildingId: home.id });
    const mother = human(6, { alive: false, fatherId: side === 'maternal' ? 5 : undefined });
    const father = human(7, { alive: false, fatherId: side === 'paternal' ? 5 : undefined });
    const first = human(10, { motherId: 6, fatherId: 7, isJuvenile: true, age: 4 });
    const second = human(11, { motherId: 6, fatherId: 7, isJuvenile: true, age: 6 });
    const people = [grandfather, mother, father, first, second];
    expect(getChildCustodian(first, people)).toBe(grandfather);
    expect(ensureOrphanAdoption(first, people, [home])).toBe(true);
    expect(first.adoptiveFatherId).toBe(grandfather.id);
    expect(second.adoptiveFatherId).toBe(grandfather.id);
    expect(first.residenceBuildingId).toBe(home.id);
    expect(second.residenceBuildingId).toBe(home.id);
    expect(ensureOrphanAdoption(second, people.filter((person) => person.alive), [home])).toBe(false);
    expect(getChildCustodian(first, people.filter((person) => person.alive))).toBe(grandfather);
  });

  it('recovers grandparent custody from genealogy after both parent entities were pruned', () => {
    const grandfather = human(5, { gender: 'male', residenceBuildingId: 25 });
    const child = human(10, { motherId: 6, fatherId: 7, isJuvenile: true, age: 4 });
    const home = building(25, BuildingType.House);
    const genealogy = { people: { '6': { id: 6, name: 'Mother', birthSurname: '', surname: '', alive: false,
      fatherId: 5, partners: [], childrenIds: [10] } } };
    assignMissingResidences([grandfather, child], [home], undefined, undefined, genealogy);
    expect(child.adoptiveFatherId).toBe(grandfather.id);
    expect(child.residenceBuildingId).toBe(home.id);
  });

  it('chooses one couple with space for both siblings instead of independently random homes', () => {
    const small = building(20, BuildingType.House);
    const large = building(30, BuildingType.Mansion, { level: 3 });
    const firstCouple = family(getResidenceCapacity(small) - 2, small.id);
    const a = human(50, { gender: 'female', partnerId: 51, residenceBuildingId: large.id });
    const b = human(51, { gender: 'male', partnerId: 50, residenceBuildingId: large.id });
    const siblings = [70, 71].map((id) => human(id, { motherId: 80, fatherId: 81, isJuvenile: true, age: 5 }));
    const people = [...firstCouple, a, b, ...siblings];
    ensureOrphanAdoption(siblings[0], people, [small, large]);
    expect(siblings[0].adoptiveMotherId).toBe(a.id);
    expect(siblings[1].adoptiveMotherId).toBe(a.id);
    expect(siblings.every((child) => child.residenceBuildingId === large.id)).toBe(true);
  });
});

describe('manor entitlement and succession at an arbitrary building id', () => {
  it('includes married children and spouses, retains vacancy rights, then rehouses the outgoing family once', () => {
    const leader = human(1, { occupation: LEADER_OCCUPATION, childrenIds: [2] });
    const child = human(2, { motherId: 1, partnerId: 3 });
    const spouse = human(3, { partnerId: 2 });
    const stranger = human(4);
    const manor = building(1351, BuildingType.LeaderHouse);
    const ordinary = building(0, BuildingType.Mansion, { level: 3 });
    const state = { entities: [leader, child, spouse, stranger], buildings: [ordinary, manor],
      villageLeaderId: 1, tick: 0, eventLog: [] } as unknown as WorldState;
    expect(collectLeaderHousehold(state).map((member) => member.id)).toEqual([1, 2, 3]);
    syncLeaderHouseResidency(state);
    expect(manor.occupants).toEqual([1, 2, 3]);
    leader.alive = false;
    state.villageLeaderId = null;
    state.pendingLeaderHouseResidentIds = [2, 3];
    syncLeaderHouseResidency(state);
    expect(child.residenceBuildingId).toBe(manor.id);
    expect(spouse.residenceBuildingId).toBe(manor.id);
    state.villageLeaderId = stranger.id;
    syncLeaderHouseResidency(state);
    expect(stranger.residenceBuildingId).toBe(manor.id);
    expect(child.residenceBuildingId).toBe(ordinary.id);
    expect(spouse.residenceBuildingId).toBe(ordinary.id);
    const events = state.eventLog.length;
    syncLeaderHouseResidency(state);
    expect(state.eventLog).toHaveLength(events);
  });
});

describe('explicit legacy identity policy', () => {
  it('refuses unknown retirement history without modifying the input or pretending to infer it', () => {
    const world = initGame({ seed: 4242 });
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    delete payload.nextBuildingId;
    const before = structuredClone(payload);
    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain('retired building identities');
    expect(payload).toEqual(before);
  });
});

describe('indexed daily commute selection', () => {
  it('matches the unindexed selection with work and school trips and ordered vacant homes', () => {
    const home = building(0, BuildingType.House, { x: 0 });
    const near = building(20, BuildingType.House, { x: 600 });
    const far = building(30, BuildingType.House, { x: 800 });
    const job = building(40, BuildingType.Farm, { x: 600 });
    const school = building(50, BuildingType.School, { x: 600 });
    const unit = family(1, home.id);
    unit[0].workerBuildingId = job.id;
    unit[1].workerBuildingId = job.id;
    unit[2].schoolBuildingId = school.id;
    const residences = [home, near, far];
    const buildings = [...residences, job, school];
    const occupancy = buildResidenceOccupancy(unit);
    const plain = pickCommuteRelocation(unit, unit, residences, buildings, occupancy, new Map(), 6.4);
    const indexed = pickCommuteRelocation(unit, unit, residences, buildings, occupancy, new Map(), 6.4,
      buildCommuteRelocationIndex(residences, buildings, occupancy));
    expect(indexed).toBe(near.id);
    expect(indexed).toBe(plain);
  });
});
