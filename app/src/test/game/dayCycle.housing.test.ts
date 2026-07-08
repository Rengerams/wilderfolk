import { beforeAll, describe, expect, it } from 'vitest';
import {
  assignMissingResidences,
  auditHousingSharingIssues,
  buildHousingUnits,
  countResidentsInBuilding,
  HUMAN_ADULT_MIN_AGE,
  housingUnitNeedsReassignment,
  isResidenceBuilding,
  isUnnecessarilySharingHousing,
  pickResidenceForFamily,
  setHumanBirthFromAge,
  syncPartnerResidence,
} from '@/game/dayCycle';
import { loadNames } from '@/game/nameLoader';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';
import {
  makeBoundsFamilyCrammedWithSingles,
  makeCompletedHouse,
  makeTwoHouseFamilyWithSinglesPileup,
} from '@/test/housingFixtures';
import { initGame } from '@/game/gameEngine';

beforeAll(async () => {
  await loadNames();
});

describe('housing rules (logic)', () => {
  it('flags singles bunking with a family when another house has singles-only beds', () => {
    const { state, villagers } = makeTwoHouseFamilyWithSinglesPileup();
    const residences = state.buildings.filter(isResidenceBuilding);
    const units = buildHousingUnits(villagers);
    const singlesInFamilyHouse = units.filter(
      (u) => u.length === 1 && u[0].residenceBuildingId === 0,
    );

    expect(singlesInFamilyHouse).toHaveLength(2);
    expect(
      singlesInFamilyHouse.every((u) => housingUnitNeedsReassignment(u, villagers, residences)),
    ).toBe(true);
    expect(auditHousingSharingIssues(villagers, state.buildings).length).toBeGreaterThan(0);
  });

  it('flags family and singles as needing reassignment when sharing one house with empties available', () => {
    const { state, villagers } = makeBoundsFamilyCrammedWithSingles();
    const residences = state.buildings.filter(isResidenceBuilding);
    const units = buildHousingUnits(villagers);

    const familyUnit = units.find((u) => u.length === 3)!;
    const singleUnits = units.filter((u) => u.length === 1);

    expect(familyUnit).toBeDefined();
    expect(singleUnits).toHaveLength(2);
    expect(housingUnitNeedsReassignment(familyUnit, villagers, residences)).toBe(true);
    expect(singleUnits.every((u) => housingUnitNeedsReassignment(u, villagers, residences))).toBe(
      true,
    );
    expect(isUnnecessarilySharingHousing(familyUnit, villagers, residences)).toBe(true);
  });

  it('does not reassign a household that already solely occupies its house', () => {
    const { state, family, villagers } = makeBoundsFamilyCrammedWithSingles();
    const residences = state.buildings.filter(isResidenceBuilding);
    for (const s of villagers.filter((h) => !family.includes(h))) {
      s.residenceBuildingId = undefined;
    }
    assignMissingResidences(villagers, state.buildings);

    const familyUnit = buildHousingUnits(villagers).find((u) => u.length === 3)!;
    expect(countResidentsInBuilding(villagers, family[0].residenceBuildingId!)).toBe(3);
    expect(housingUnitNeedsReassignment(familyUnit, villagers, residences)).toBe(false);
  });

  it('does not force split when every house already has someone', () => {
    const { state, villagers } = makeBoundsFamilyCrammedWithSingles();
    state.buildings = state.buildings.filter((b) => b.id === 0);
    const residences = state.buildings.filter(isResidenceBuilding);
    const units = buildHousingUnits(villagers);

    expect(units.every((u) => !housingUnitNeedsReassignment(u, villagers, residences))).toBe(true);
  });
});

describe('pickResidenceForFamily (lone single)', () => {
  it('prefers an empty house over staying in a crowded shared home', () => {
    const { state, family, singles, villagers } = makeBoundsFamilyCrammedWithSingles();
    const residences = state.buildings.filter(isResidenceBuilding);
    const single = singles[0];
    const emptyHouse = residences.find((r) => countResidentsInBuilding(villagers, r.id) === 0)!;

    const picked = pickResidenceForFamily([single], villagers, residences);

    expect(picked).toBe(emptyHouse.id);
    expect(single.residenceBuildingId).toBe(0);
    expect(family.every((m) => m.residenceBuildingId === 0)).toBe(true);
  });
});

describe('countResidentsInBuilding', () => {
  it('ignores rival-faction occupants', () => {
    const state = initGame();
    state.entities = [];
    makeCompletedHouse(state, 0, 100);
    const player = createEntity(EntityType.Human, 100, 100, 1, 250);
    const rival = createEntity(EntityType.Human, 110, 100, 2, 250);
    rival.faction = 'rival';
    rival.residenceBuildingId = 0;
    player.residenceBuildingId = 0;
    state.entities.push(player, rival);

    expect(countResidentsInBuilding(state.entities, 0)).toBe(1);
  });
});

describe('syncPartnerResidence', () => {
  it('moves a new couple into an empty house when one exists', () => {
    const state = initGame();
    state.entities = [];
    state.buildings = [];
    makeCompletedHouse(state, 0, 100);
    makeCompletedHouse(state, 1, 300);

    const roommate = createEntity(EntityType.Human, 90, 100, 3, 250);
    setHumanBirthFromAge(roommate, HUMAN_ADULT_MIN_AGE + 10, 0);
    roommate.residenceBuildingId = 0;

    const a = createEntity(EntityType.Human, 100, 100, 1, 250);
    const b = createEntity(EntityType.Human, 110, 100, 2, 250);
    setHumanBirthFromAge(a, HUMAN_ADULT_MIN_AGE + 4, 0);
    setHumanBirthFromAge(b, HUMAN_ADULT_MIN_AGE + 6, 0);
    a.partnerId = 2;
    b.partnerId = 1;
    a.residenceBuildingId = 0;
    b.residenceBuildingId = 0;
    state.entities.push(roommate, a, b);

    const residences = state.buildings.filter(isResidenceBuilding);
    syncPartnerResidence(a, b, residences, state.entities);

    expect(a.residenceBuildingId).toBe(1);
    expect(b.residenceBuildingId).toBe(1);
    expect(countResidentsInBuilding(state.entities, 0)).toBe(1);
    expect(countResidentsInBuilding(state.entities, 1)).toBe(2);
  });

  it('keeps existing homes when no shared residence is available', () => {
    const state = initGame();
    state.entities = [];
    state.buildings = [];
    makeCompletedHouse(state, 0, 100);

    const a = createEntity(EntityType.Human, 100, 100, 1, 250);
    const b = createEntity(EntityType.Human, 110, 100, 2, 250);
    setHumanBirthFromAge(a, HUMAN_ADULT_MIN_AGE + 4, 0);
    setHumanBirthFromAge(b, HUMAN_ADULT_MIN_AGE + 6, 0);
    a.partnerId = 2;
    b.partnerId = 1;
    a.residenceBuildingId = 0;
    b.residenceBuildingId = 0;
    state.entities.push(a, b);

    const residences = state.buildings.filter(isResidenceBuilding);
    syncPartnerResidence(a, b, residences, state.entities);

    expect(a.residenceBuildingId).toBe(0);
    expect(b.residenceBuildingId).toBe(0);
  });
});

describe('minor and orphan placement', () => {
  it('does not place children in singles-only houses when a family home has room', () => {
    const state = initGame();
    state.entities = [];
    state.buildings = [];
    makeCompletedHouse(state, 0, 100);
    makeCompletedHouse(state, 1, 300);

    const single = createEntity(EntityType.Human, 300, 100, 10, 250);
    setHumanBirthFromAge(single, 30, 0);
    single.residenceBuildingId = 1;

    const coupleA = createEntity(EntityType.Human, 100, 100, 11, 250);
    const coupleB = createEntity(EntityType.Human, 110, 100, 12, 250);
    setHumanBirthFromAge(coupleA, 30, 0);
    setHumanBirthFromAge(coupleB, 28, 0);
    coupleA.partnerId = 12;
    coupleB.partnerId = 11;
    coupleA.residenceBuildingId = 0;
    coupleB.residenceBuildingId = 0;

    const child = createEntity(EntityType.Human, 105, 100, 13, 250, true);
    setHumanBirthFromAge(child, 8, 0);
    child.motherId = 11;
    child.fatherId = 12;
    child.residenceBuildingId = undefined;

    state.entities.push(single, coupleA, coupleB, child);
    assignMissingResidences(state.entities, state.buildings);

    expect(child.residenceBuildingId).toBe(0);
    expect(child.residenceBuildingId).not.toBe(1);
  });

  it('prefers couple homes over singles-only for orphans without kin', () => {
    const state = initGame();
    state.entities = [];
    state.buildings = [];
    makeCompletedHouse(state, 0, 100);
    makeCompletedHouse(state, 1, 300);

    const single = createEntity(EntityType.Human, 300, 100, 20, 250);
    setHumanBirthFromAge(single, 30, 0);
    single.residenceBuildingId = 1;

    const coupleA = createEntity(EntityType.Human, 100, 100, 21, 250);
    const coupleB = createEntity(EntityType.Human, 110, 100, 22, 250);
    setHumanBirthFromAge(coupleA, 30, 0);
    setHumanBirthFromAge(coupleB, 28, 0);
    coupleA.partnerId = 22;
    coupleB.partnerId = 21;
    coupleA.residenceBuildingId = 0;
    coupleB.residenceBuildingId = 0;

    const orphan = createEntity(EntityType.Human, 50, 50, 23, 250, true);
    setHumanBirthFromAge(orphan, 6, 0);

    state.entities.push(single, coupleA, coupleB, orphan);
    assignMissingResidences(state.entities, state.buildings);

    expect(orphan.residenceBuildingId).toBe(0);
    expect(orphan.residenceBuildingId).not.toBe(1);
  });
});

describe('assignMissingResidences (integration)', () => {
  it('moves singles out of the family house when the other house has open beds', () => {
    const { state, family, singles, villagers } = makeTwoHouseFamilyWithSinglesPileup();

    assignMissingResidences(villagers, state.buildings);

    const familyHome = family[0].residenceBuildingId!;
    const singlesHome = singles.find((s) => s.residenceBuildingId !== familyHome)!.residenceBuildingId!;

    expect(countResidentsInBuilding(villagers, familyHome)).toBe(3);
    expect(countResidentsInBuilding(villagers, singlesHome)).toBe(3);
    expect(family.every((m) => m.residenceBuildingId === familyHome)).toBe(true);
    expect(singles.every((s) => s.residenceBuildingId === singlesHome)).toBe(true);
    expect(auditHousingSharingIssues(villagers, state.buildings)).toEqual([]);
  });

  it('splits 5 settlers into 1+3+1 across three houses', () => {
    const { state, family, villagers } = makeBoundsFamilyCrammedWithSingles();

    assignMissingResidences(villagers, state.buildings);

    const residences = state.buildings.filter(isResidenceBuilding);
    const occupancy = residences.map((r) => countResidentsInBuilding(villagers, r.id));

    expect(occupancy.sort((a, b) => a - b)).toEqual([1, 1, 3]);
    expect(family.every((m) => m.residenceBuildingId === family[0].residenceBuildingId)).toBe(true);
    expect(countResidentsInBuilding(villagers, family[0].residenceBuildingId!)).toBe(3);
    expect(auditHousingSharingIssues(villagers, state.buildings)).toEqual([]);
  });
});