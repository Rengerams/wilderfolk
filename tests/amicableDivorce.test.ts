/**
 * Amicable divorce (no affair needed).
 * Baseline: real ~7.5‰ marriages/year scaled ×10 for game pace (7.5%/year).
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { MARRIAGE_DAILY_AMICABLE_DIVORCE_CHANCE, tryDailyAmicableDivorce } from '../src/game/simulation/humanRelationships';

function human(id: number, gender: 'male' | 'female', overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    surname: 'Test',
    gender,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: undefined,
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function building(id: number, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type: BuildingType.House,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

function state(entities: Entity[], buildings: Building[]): WorldState {
  return {
    entities,
    buildings,
    tick: 0,
    year: 1,
    dayInYear: 1,
    eventLog: [],
    notifications: [],
    bigNews: [],
    storyFlags: {},
    pendingStoryEvents: [],
    resources: {},
    villageReputation: 10,
    nextFloatingTextId: 1,
    floatingTexts: [],
  } as unknown as WorldState;
}

describe('amicable divorce', () => {
  it('divorces a married couple when the daily roll succeeds', () => {
    const husband = human(1, 'male', { partnerId: 2, relationshipStatus: 'married', residenceBuildingId: 10 });
    const wife = human(2, 'female', { partnerId: 1, relationshipStatus: 'married', residenceBuildingId: 10, surname: 'HusbandName', maidenSurname: 'OriginalName' });
    const child = human(3, 'female', { isJuvenile: true, motherId: 2, fatherId: 1, residenceBuildingId: 10 });
    const home = building(10, { occupants: [1, 2, 3] });
    const secondHome = building(20, { occupants: [] });
    const world = state([husband, wife, child], [home, secondHome]);
    const entityById = new Map(world.entities.map((e) => [e.id, e]));

    tryDailyAmicableDivorce(world, husband, entityById, world.buildings, world.entities, () => 0);

    expect(husband.partnerId).toBeUndefined();
    expect(wife.partnerId).toBeUndefined();
    expect(husband.relationshipStatus).toBe('single');
    expect(wife.relationshipStatus).toBe('single');
    // Maiden name is restored for the woman.
    expect(wife.surname).toBe('OriginalName');
    // One of the two leaves the house; kids stay with the mother.
    expect(wife.residenceBuildingId).toBe(10);
    expect(husband.residenceBuildingId).toBe(20);
    expect(child.residenceBuildingId).toBe(10);
    expect(home.occupants).toContain(wife.id);
    expect(home.occupants).toContain(child.id);
    expect(home.occupants).not.toContain(husband.id);
    expect(secondHome.occupants).toContain(husband.id);
    expect(world.eventLog.some((e) => e.message.includes('divorced amicably'))).toBe(true);
  });

  it('does not divorce when the daily roll fails', () => {
    const husband = human(1, 'male', { partnerId: 2, relationshipStatus: 'married', residenceBuildingId: 10 });
    const wife = human(2, 'female', { partnerId: 1, relationshipStatus: 'married', residenceBuildingId: 10 });
    const home = building(10, { occupants: [1, 2] });
    const world = state([husband, wife], [home]);
    const entityById = new Map(world.entities.map((e) => [e.id, e]));

    tryDailyAmicableDivorce(world, husband, entityById, world.buildings, world.entities, () => 1);

    expect(husband.partnerId).toBe(2);
    expect(wife.partnerId).toBe(1);
    expect(husband.relationshipStatus).toBe('married');
  });

  it('rolls only once per couple (lower id leads)', () => {
    const husband = human(1, 'male', { partnerId: 2, relationshipStatus: 'married', residenceBuildingId: 10 });
    const wife = human(2, 'female', { partnerId: 1, relationshipStatus: 'married', residenceBuildingId: 10 });
    const home = building(10, { occupants: [1, 2] });
    const world = state([husband, wife], [home]);
    const entityById = new Map(world.entities.map((e) => [e.id, e]));

    // Calling with the higher-id partner must not trigger anything.
    tryDailyAmicableDivorce(world, wife, entityById, world.buildings, world.entities, () => 0);

    expect(wife.partnerId).toBe(1);
    expect(husband.partnerId).toBe(2);
    expect(world.eventLog.some((e) => e.message.includes('divorced amicably'))).toBe(false);
  });

  it('daily chance matches 7.5% per game year', () => {
    const yearDays = 360;
    expect(MARRIAGE_DAILY_AMICABLE_DIVORCE_CHANCE).toBeCloseTo(0.075 / yearDays, 6);
  });
});