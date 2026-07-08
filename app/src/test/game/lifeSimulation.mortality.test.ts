import { describe, expect, it, vi, afterEach } from 'vitest';
import { withRandomSequence } from '@/test/helpers/seededRandom';
import { initGame } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { EntityType, BuildingType } from '@/game/gameTypes';
import { HUMAN_MAX_LIFESPAN_YEARS, killHuman } from '@/game/dayCycle';
import { curseMoonHowler, transformToWerewolfForm } from '@/game/moonHowler';
import { tryDailyHumanMortality } from '@/game/lifeSimulation';
import {
  addCompletedBuilding,
  assignWorkerToBuilding,
  makeAdultSettler,
} from '@/test/fixtures/gameFixtures';

describe('tryDailyHumanMortality', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when illness roll is above daily chance', () => {
    withRandomSequence([0.99], () => {
      const state = initGame();
      const ent = createEntity(EntityType.Human, 0, 0, 1, 250, false);
      ent.age = 30;
      expect(tryDailyHumanMortality(state, ent, state.buildings)).toBe(false);
      expect(ent.alive).toBe(true);
    });
  });

  it('kills at guaranteed max lifespan', () => {
    const state = initGame();
    const ent = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    ent.age = HUMAN_MAX_LIFESPAN_YEARS;
    expect(tryDailyHumanMortality(state, ent, state.buildings)).toBe(true);
    expect(ent.alive).toBe(false);
  });

  it('kills from illness when roll is below daily chance but below max lifespan', () => {
    withRandomSequence([0.00001], () => {
      const state = initGame();
      const ent = createEntity(EntityType.Human, 0, 0, 1, 250, false);
      ent.age = 25;
      expect(tryDailyHumanMortality(state, ent, state.buildings)).toBe(true);
      expect(ent.alive).toBe(false);
    });
  });

  it('removes dead humans from building occupants via finalizeHumanDeath', () => {
    let state = initGame();
    const farm = addCompletedBuilding(state, BuildingType.Farm, 42, 200, 200);
    const workerId = state.nextEntityId++;
    const worker = makeAdultSettler(workerId, 'Worker', HUMAN_MAX_LIFESPAN_YEARS);
    state.entities.push(worker);
    state = assignWorkerToBuilding(state, farm.id, worker.id);

    const assigned = state.entities.find((e) => e.id === worker.id)!;
    const farmAfterAssign = state.buildings.find((b) => b.id === farm.id)!;
    expect(farmAfterAssign.occupants).toContain(assigned.id);
    expect(assigned.homeBuildingId).toBe(farm.id);

    expect(tryDailyHumanMortality(state, assigned, state.buildings)).toBe(true);
    expect(farmAfterAssign.occupants).not.toContain(assigned.id);
    expect(assigned.homeBuildingId).toBeUndefined();
  });

  it('widows surviving spouse when partner dies', () => {
    const state = initGame();
    const husband = createEntity(EntityType.Human, 0, 0, 10, 400, false, { gender: 'male', ageYears: 30 });
    const wife = createEntity(EntityType.Human, 5, 0, 11, 400, false, { gender: 'female', ageYears: 30 });
    husband.isJuvenile = false;
    wife.isJuvenile = false;
    husband.relationshipStatus = 'married';
    wife.relationshipStatus = 'married';
    husband.partnerId = wife.id;
    wife.partnerId = husband.id;
    state.entities = [husband, wife];
    const entityById = new Map(state.entities.map((e) => [e.id, e]));

    killHuman(wife, state.buildings, entityById);

    expect(wife.alive).toBe(false);
    expect(husband.alive).toBe(true);
    expect(husband.partnerId).toBeUndefined();
    expect(husband.relationshipStatus).toBe('single');
  });

  it('widows surviving spouse when partner dies in werewolf form', () => {
    const state = initGame();
    const husband = createEntity(EntityType.Human, 0, 0, 10, 400, false, { gender: 'male', ageYears: 30 });
    const wife = createEntity(EntityType.Human, 5, 0, 11, 400, false, { gender: 'female', ageYears: 30 });
    husband.isJuvenile = false;
    wife.isJuvenile = false;
    husband.relationshipStatus = 'married';
    wife.relationshipStatus = 'married';
    husband.partnerId = wife.id;
    wife.partnerId = husband.id;
    curseMoonHowler(wife);
    transformToWerewolfForm(wife);
    state.entities = [husband, wife];
    const entityById = new Map(state.entities.map((e) => [e.id, e]));

    killHuman(wife, state.buildings, entityById);

    expect(wife.alive).toBe(false);
    expect(wife.type).toBe(EntityType.Werewolf);
    expect(husband.partnerId).toBeUndefined();
    expect(husband.relationshipStatus).toBe('single');
  });
});