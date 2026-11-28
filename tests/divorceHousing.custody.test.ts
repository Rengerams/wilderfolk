import { scenarioSettler, scenarioBuilding, scenarioWorld } from './helpers/humanScenario';
import { exposeAffair } from '../src/game/simulation/humanRelationships';
import { isPlayerHuman } from '../src/game/playerHuman';
import { resetSimRng } from '../src/game/simRng';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { describe, expect, it, afterEach } from 'vitest';
import { BuildingType, LEADER_OCCUPATION } from '../src/game/gameTypes';
import { human, building } from '../src/test/factories';
import { getChildCustodian } from '../src/game/housingModel';
import { reassignDivorcedResidences } from '../src/game/housingPipeline';

describe('divorce custody and housing', () => {
  it('makes one stable custody selection for siblings regardless of lookup order', () => {
    const mother = human(1, { gender: 'female', pastPartnerTicks: { 2: 1201 } });
    const father = human(2, { gender: 'male', pastPartnerTicks: { 1: 1201 } });
    const first = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2 });
    const second = human(4, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2 });
    const people = [mother, father, first, second];
    const selected = getChildCustodian(first, people);
    expect(selected).toBeDefined();
    expect(getChildCustodian(second, [...people].reverse())?.id).toBe(selected?.id);
    expect(getChildCustodian(first, people)?.id).toBe(selected?.id);
  });

  it('also selects the father for the alternate divorce outcome', () => {
    const mother = human(1, { gender: 'female', pastPartnerTicks: { 2: 1200 } });
    const father = human(2, { gender: 'male', pastPartnerTicks: { 1: 1200 } });
    const first = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2 });
    const second = human(4, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2 });
    const people = [mother, father, first, second];
    expect(getChildCustodian(first, people)?.id).toBe(father.id);
    expect(getChildCustodian(second, people)?.id).toBe(father.id);
  });

  it.each(['mother', 'father'] as const)('prioritizes the elected %s after separation, until they leave office', (role) => {
    const endedAt = role === 'mother' ? 1200 : 1201;
    const mother = human(1, { gender: 'female', pastPartnerTicks: { 2: endedAt } });
    const father = human(2, { gender: 'male', pastPartnerTicks: { 1: endedAt } });
    const child = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2 });
    const people = [mother, father, child];
    const leader = role === 'mother' ? mother : father;
    const otherParent = role === 'mother' ? father : mother;
    expect(getChildCustodian(child, people)?.id).toBe(otherParent.id);
    leader.occupation = LEADER_OCCUPATION;
    expect(getChildCustodian(child, people)?.id).toBe(leader.id);
    leader.occupation = 'settler';
    expect(getChildCustodian(child, people)?.id).toBe(otherParent.id);
  });

  it('moves the departing parent alone while the keeper keeps the minors', () => {
    const home = building(10, BuildingType.House, { x: 0, y: 0 });
    const near = building(20, BuildingType.Mansion, { x: 40, y: 0, level: 3 });
    const far = building(30, BuildingType.Mansion, { x: 150, y: 0, level: 3 });
    const mother = human(1, { gender: 'female', residenceBuildingId: 10, pastPartnerTicks: { 2: 1201 } });
    const father = human(2, { gender: 'male', residenceBuildingId: 10, pastPartnerTicks: { 1: 1201 } });
    const first = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const second = human(4, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const people = [mother, father, first, second];
    reassignDivorcedResidences(mother, father, [home, near, far], people, father);
    expect(mother.residenceBuildingId).toBe(30);
    expect(father.residenceBuildingId).toBe(10);
    expect(first.residenceBuildingId).toBe(10);
    expect(second.residenceBuildingId).toBe(10);
  });
  it('reserves the only family-sized home for an unhoused retaining parent and minors', () => {
    const large = building(10, BuildingType.House, { x: 100, y: 0 });
    const shared = building(20, BuildingType.House, { x: 200, y: 0 });
    const mother = human(1, { gender: 'female', pastPartnerTicks: { 2: 1201 } });
    const father = human(2, { gender: 'male', pastPartnerTicks: { 1: 1201 } });
    const children = Array.from({ length: 5 }, (_, index) => human(3 + index, {
      age: 5, isJuvenile: true, motherId: 1, fatherId: 2,
    }));
    const occupants = Array.from({ length: 2 }, (_, index) => human(20 + index, {
      residenceBuildingId: shared.id,
    }));
    const people = [mother, father, ...children, ...occupants];
    reassignDivorcedResidences(mother, father, [large, shared], people);
    expect(mother.residenceBuildingId).toBe(large.id);
    expect(father.residenceBuildingId).toBe(shared.id);
    expect(children.every((child) => child.residenceBuildingId === large.id)).toBe(true);
  });

  it('uses spare beds in an occupied home when no vacant home exists', () => {
    const marital = building(10, BuildingType.House, { x: 0, y: 0 });
    const shared = building(20, BuildingType.House, { x: 120, y: 0 });
    const mother = human(1, { gender: 'female', residenceBuildingId: 10, pastPartnerTicks: { 2: 1201 } });
    const father = human(2, { gender: 'male', residenceBuildingId: 10, pastPartnerTicks: { 1: 1201 } });
    const housemate = human(3, { residenceBuildingId: 20 });
    const people = [mother, father, housemate];
    reassignDivorcedResidences(mother, father, [marital, shared], people);
    expect(mother.residenceBuildingId).toBe(10);
    expect(father.residenceBuildingId).toBe(20);
    expect(housemate.residenceBuildingId).toBe(20);
  });

  it('seats the departing parent alone and keeps the children with the keeper', () => {
    const oldHome = building(10, BuildingType.Mansion, { x: 0, y: 0, level: 3 });
    const occupied = building(20, BuildingType.Mansion, { x: 150, y: 0 });
    const spare = building(30, BuildingType.House, { x: 40, y: 0 });
    const mother = human(1, { gender: 'female', residenceBuildingId: 10, pastPartnerTicks: { 2: 1201 } });
    const father = human(2, { gender: 'male', residenceBuildingId: 10, pastPartnerTicks: { 1: 1201 } });
    const first = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const second = human(4, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const occupant = human(5, { age: 30, partnerId: 6, residenceBuildingId: 20 });
    const spouse = human(6, { age: 30, partnerId: 5, residenceBuildingId: 20 });
    const moreChildren = Array.from({ length: 4 }, (_, index) => human(7 + index, {
      age: 6, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10,
    }));
    const people = [mother, father, first, second, ...moreChildren, occupant, spouse];
    reassignDivorcedResidences(mother, father, [oldHome, occupied, spare], people, father);
    expect(occupant.residenceBuildingId).toBe(20);
    expect(spouse.residenceBuildingId).toBe(20);
    expect(father.residenceBuildingId).toBe(10);
    expect(mother.residenceBuildingId).toBe(30);
    expect(first.residenceBuildingId).toBe(10);
    expect(second.residenceBuildingId).toBe(10);
    expect(moreChildren.every((child) => child.residenceBuildingId === 10)).toBe(true);
  });

});

describe('Caught-affair custody regression', () => {
  afterEach(resetSimRng);

  describe('L60 — imprisoned custodian in a caught-affair divorce', () => {
    function caughtScandal(state: WorldState, entities: Entity[]): void {
      exposeAffair(
        state,
        entities.find((e) => e.id === 10)!,
        entities.find((e) => e.id === 12)!,
        'caught',
        new Map(entities.map((e) => [e.id, e])),
        state.buildings,
        entities.filter(isPlayerHuman),
      );
    }

    function scandalWorld(): { state: WorldState; cheater: Entity; child: Entity; spouse: Entity } {
      const state = scenarioWorld();
      // No staffed prison: `arrestForScandal` returns before its roll, so the cheater
      // stays in the sentence the scenario already gave them.
      const houseA = scenarioBuilding(1, BuildingType.House, { x: 0, y: 0 });
      const houseB = scenarioBuilding(2, BuildingType.House, { x: 80, y: 0 });
      const prison = scenarioBuilding(9, BuildingType.Prison, { x: 300, y: 300 });
      const cheater = scenarioSettler(10, {
        gender: 'female',
        relationshipStatus: 'married',
        partnerId: 11,
        prisonBuildingId: prison.id,
        prisonSentenceCrime: 'scandal',
        prisonerUntilTick: state.tick + 500,
      });
      const spouse = scenarioSettler(11, { gender: 'male', relationshipStatus: 'married', partnerId: 10, residenceBuildingId: houseB.id });
      const paramour = scenarioSettler(12, { gender: 'male', relationshipStatus: 'single' });
      const child = scenarioSettler(13, {
        isJuvenile: true,
        age: 6,
        motherId: cheater.id,
        fatherId: spouse.id,
        residenceBuildingId: houseB.id,
      });
      prison.occupants = [cheater.id];
      houseB.occupants = [cheater.id, spouse.id, child.id];
      state.buildings = [houseA, houseB, prison];
      state.entities = [cheater, spouse, paramour, child];
      state.tick = TICKS_PER_DAY + 10 * TICKS_PER_HOUR;
      return { state, cheater, child, spouse };
    }

    it('leaves the imprisoned custodian unhoused and keeps minors out of the cell home', () => {
      const { state, cheater, child, spouse } = scandalWorld();
      caughtScandal(state, state.entities);

      // The imprisoned cheater stays unhoused; the wronged parent retains the family home.
      expect(cheater.residenceBuildingId).toBeUndefined();
      expect(child.residenceBuildingId).toBe(2);
      expect(spouse.residenceBuildingId).toBe(2);
      expect(child.residenceBuildingId).toBe(spouse.residenceBuildingId);
    });
  });
});
