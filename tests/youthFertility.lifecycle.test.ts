import { afterEach, describe, expect, it, vi } from 'vitest';
import { initGame, createEntity } from '../src/game/worldGen';
import { EntityType, emptyEntityByType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { HUMAN_FERTILITY_START, getFemaleFertility, getYouthConceptionMultiplier } from '../src/game/dayCycle';
import { tryDailyConception } from '../src/game/simulation/humanRelationships';
import type { TickContext } from '../src/game/simulation/simulationTypes';

function contextFor(state: WorldState): TickContext {
  const byType = emptyEntityByType();
  const aliveEntities = state.entities.filter((entity) => entity.alive);
  for (const entity of aliveEntities) byType[entity.type].push(entity);
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 20,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: false,
    byType,
    aliveEntities,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: aliveEntities.filter((entity) => entity.type === EntityType.Human),
    entityById: new Map(aliveEntities.map((entity) => [entity.id, entity])),
    buildingById: new Map(state.buildings.map((building) => [building.id, building])),
  };
}

function addYouthPair(state: WorldState, femaleAge = 14): { female: Entity; male: Entity } {
  const female = createEntity(EntityType.Human, 240, 240, state.nextEntityId++, 400, false, {
    gender: 'female', ageYears: femaleAge, colonyDay: 0, name: 'Mara', surname: 'Vale',
  });
  const male = createEntity(EntityType.Human, 248, 240, state.nextEntityId++, 400, false, {
    gender: 'male', ageYears: Math.max(14, femaleAge), colonyDay: 0, name: 'Rowan', surname: 'Vale',
  });
  female.relationshipStatus = 'single';
  male.relationshipStatus = 'single';
  female.reproductionCooldown = 0;
  male.reproductionCooldown = 0;
  female.youthLovePartnerId = male.id;
  male.youthLovePartnerId = female.id;
  female.youthLoveProgress = 20;
  male.youthLoveProgress = 20;
  state.entities.push(female, male);
  return { female, male };
}

afterEach(() => vi.restoreAllMocks());

describe('age-14 fertility lifecycle', () => {
  it('starts fertility at 14 and keeps the age-14 youth multiplier deliberately low', () => {
    expect(HUMAN_FERTILITY_START).toBe(14);
    expect(getFemaleFertility(13)).toBe(0);
    expect(getFemaleFertility(14)).toBe(1);
    expect(getYouthConceptionMultiplier(13)).toBe(0);
    expect(getYouthConceptionMultiplier(14)).toBe(0.12);
    expect(getYouthConceptionMultiplier(17)).toBe(0.30);
    expect(getYouthConceptionMultiplier(18)).toBe(0);
  });

  it('allows a deterministic low-probability youth conception only through a mutual nearby youth-love pair', () => {
    const state = initGame();
    const { female, male } = addYouthPair(state, 14);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(tryDailyConception(state, contextFor(state), female)).toBe(true);
    expect(female.pregnant).toBe(true);
    expect(female.pregnantById).toBe(male.id);
    expect(female.relationshipStatus).toBe('single');
    expect(female.youthLovePartnerId).toBe(male.id);
    expect(male.youthLovePartnerId).toBe(female.id);
  });

  it('rejects a one-sided youth link and any candidate below age 14', () => {
    const oneSided = initGame();
    const { female: oneSidedFemale, male: oneSidedMale } = addYouthPair(oneSided, 14);
    oneSidedMale.youthLovePartnerId = undefined;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(tryDailyConception(oneSided, contextFor(oneSided), oneSidedFemale)).toBe(false);
    expect(oneSidedFemale.pregnant).toBeUndefined();

    const belowThreshold = initGame();
    const { female: youngFemale } = addYouthPair(belowThreshold, 13);
    expect(tryDailyConception(belowThreshold, contextFor(belowThreshold), youngFemale)).toBe(false);
    expect(youngFemale.pregnant).toBeUndefined();
  });

  it('keeps the existing adult married conception path available at age 18', () => {
    const state = initGame();
    const female = createEntity(EntityType.Human, 360, 360, state.nextEntityId++, 400, false, {
      gender: 'female', ageYears: 18, colonyDay: 0,
    });
    const male = createEntity(EntityType.Human, 364, 360, state.nextEntityId++, 400, false, {
      gender: 'male', ageYears: 18, colonyDay: 0,
    });
    female.relationshipStatus = 'married';
    male.relationshipStatus = 'married';
    female.reproductionCooldown = 0;
    male.reproductionCooldown = 0;
    female.partnerId = male.id;
    male.partnerId = female.id;
    state.entities.push(female, male);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(tryDailyConception(state, contextFor(state), female)).toBe(true);
    expect(female.pregnant).toBe(true);
    expect(female.pregnantById).toBeUndefined();
    expect(female.relationshipStatus).toBe('expecting');
  });
});
