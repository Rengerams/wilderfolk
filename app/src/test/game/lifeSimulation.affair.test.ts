import { describe, expect, it, vi, afterEach } from 'vitest';
import { initGame, BuildingType } from '@/game/gameEngine';
import { createBuilding, createEntity } from '@/game/worldGen';
import { EntityType, JobType } from '@/game/gameTypes';
import { assignMissingResidences, TICKS_PER_DAY } from '@/game/dayCycle';
import {
  tryDailyConception,
  tryDailyAffairGossip,
  findAffairLover,
  reconcileAffairPartner,
  hasAffairPartner,
  pickAffairExposureReason,
  exposeAffair,
  type TickContext,
} from '@/game/lifeSimulation';
import { isPlayerHuman } from '@/game/groupEvents';
import { freshState, makeCompletedHouse } from '@/test/fixtures/gameFixtures';
import type { Entity } from '@/game/gameTypes';

function entityMap(entities: readonly Entity[]): Map<number, Entity> {
  return new Map(entities.map((e) => [e.id, e]));
}

function humanCtx(state: ReturnType<typeof initGame>, humans: ReturnType<typeof createEntity>[]): TickContext {
  const byType = {
    [EntityType.Human]: humans,
    [EntityType.Grass]: [],
    [EntityType.Tree]: [],
    [EntityType.Rabbit]: [],
    [EntityType.Deer]: [],
    [EntityType.Wolf]: [],
    [EntityType.Fox]: [],
    [EntityType.Werewolf]: [],
    [EntityType.Wildkin]: [],
  };
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 12,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById: new Map(humans.map((e) => [e.id, e])),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
  };
}

function staffedPrisonSetup(state: ReturnType<typeof initGame>) {
  const prison = createBuilding(BuildingType.Prison, 100, 100, 90, 0);
  prison.completed = true;
  const guard = createEntity(EntityType.Human, 100, 100, 10, 400, false, {
    gender: 'male', surname: 'Guard', ageYears: 30,
  });
  guard.isJuvenile = false;
  guard.homeBuildingId = prison.id;
  guard.job = JobType.Guard;
  prison.occupants = [guard.id];
  state.buildings.push(prison);
  state.entities.push(guard);
  return prison;
}

describe('affair scandal pipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('findAffairLover rejects one-sided established affairs', () => {
    const a = createEntity(EntityType.Human, 0, 0, 1, 400, false, { gender: 'male', ageYears: 30 });
    const b = createEntity(EntityType.Human, 10, 0, 2, 400, false, { gender: 'female', ageYears: 30 });
    a.isJuvenile = false;
    b.isJuvenile = false;
    a.affairPartnerId = b.id;
    b.affairPartnerId = undefined;
    expect(findAffairLover(a, entityMap([a, b]), 0)).toBeUndefined();
  });

  it('findAffairLover requires both sides above progress threshold', () => {
    const a = createEntity(EntityType.Human, 0, 0, 1, 400, false, { gender: 'male', ageYears: 30 });
    const b = createEntity(EntityType.Human, 10, 0, 2, 400, false, { gender: 'female', ageYears: 30 });
    a.isJuvenile = false;
    b.isJuvenile = false;
    a.affairProgress = 80;
    b.affairProgress = 44;
    expect(findAffairLover(a, entityMap([a, b]), 0, undefined, [a, b])).toBeUndefined();
  });

  it('reconcileAffairPartner clears dead lovers, progress, and throttling', () => {
    const alive = createEntity(EntityType.Human, 0, 0, 1, 400, false, { gender: 'male', ageYears: 30 });
    const dead = createEntity(EntityType.Human, 10, 0, 2, 400, false, { gender: 'female', ageYears: 30 });
    alive.isJuvenile = false;
    dead.isJuvenile = false;
    dead.alive = false;
    alive.affairPartnerId = dead.id;
    alive.affairProgress = 80;
    alive.lastAffairSiteDay = 3;
    alive.lastAffairSiteX = 50;
    reconcileAffairPartner(alive, entityMap([alive, dead]));
    expect(alive.affairPartnerId).toBeUndefined();
    expect(alive.affairProgress).toBe(0);
    expect(alive.lastAffairSiteDay).toBeUndefined();
    expect(hasAffairPartner(alive, entityMap([alive]))).toBe(false);
  });

  it('findAffairLover rejects imprisoned paramours', () => {
    const free = createEntity(EntityType.Human, 0, 0, 1, 400, false, { gender: 'male', ageYears: 30 });
    const jailed = createEntity(EntityType.Human, 10, 0, 2, 400, false, { gender: 'female', ageYears: 30 });
    free.isJuvenile = false;
    jailed.isJuvenile = false;
    free.affairPartnerId = jailed.id;
    jailed.affairPartnerId = free.id;
    jailed.prisonBuildingId = 99;
    expect(findAffairLover(free, entityMap([free, jailed]), 0)).toBeUndefined();
  });

  it('pickAffairExposureReason stays rumor when no staffed prison exists', () => {
    const state = initGame();
    const cheater = createEntity(EntityType.Human, 0, 0, 1, 400, false, { gender: 'male', ageYears: 30 });
    const lover = createEntity(EntityType.Human, 200, 0, 2, 400, false, { gender: 'female', ageYears: 30 });
    cheater.isJuvenile = false;
    lover.isJuvenile = false;
    const humans = state.entities.filter(isPlayerHuman);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickAffairExposureReason(state, cheater, lover, humans)).toBe('rumor');
  });

  it('pickAffairExposureReason can catch anywhere when a guard staffs the prison', () => {
    const state = initGame();
    staffedPrisonSetup(state);
    const cheater = createEntity(EntityType.Human, 0, 0, 1, 400, false, { gender: 'male', ageYears: 30 });
    const lover = createEntity(EntityType.Human, 900, 900, 2, 400, false, { gender: 'female', ageYears: 30 });
    cheater.isJuvenile = false;
    lover.isJuvenile = false;
    const humans = state.entities.filter(isPlayerHuman);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickAffairExposureReason(state, cheater, lover, humans)).toBe('caught');
  });

  it('caught exposeAffair imprisons married cheaters but not single paramours', () => {
    const state = initGame();
    state.eventLog = [];
    staffedPrisonSetup(state);
    const spouse = createEntity(EntityType.Human, 100, 100, 19, 400, false, { gender: 'female', surname: 'A', ageYears: 30 });
    const m = createEntity(EntityType.Human, 105, 105, 20, 400, false, { gender: 'male', surname: 'A', ageYears: 30 });
    const f = createEntity(EntityType.Human, 110, 110, 21, 400, false, { gender: 'female', surname: 'B', ageYears: 30 });
    for (const e of [spouse, m, f]) e.isJuvenile = false;
    m.relationshipStatus = 'married';
    m.partnerId = spouse.id;
    spouse.relationshipStatus = 'married';
    spouse.partnerId = m.id;
    f.relationshipStatus = 'single';
    m.affairPartnerId = f.id;
    f.affairPartnerId = m.id;
    const humans = [...state.entities.filter(isPlayerHuman), spouse, m, f];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    exposeAffair(state, m, f, 'caught', entityMap(humans), state.buildings, humans);
    expect(state.eventLog.some((e) => e.type === 'scandal' && e.message.includes('was caught'))).toBe(true);
    expect(m.prisonBuildingId).toBeDefined();
    expect(f.prisonBuildingId).toBeUndefined();
    expect(state.eventLog.filter((e) => e.message.includes('imprisoned for scandal'))).toHaveLength(1);
  });

  it('caught exposeAffair can imprison both lovers when both are married', () => {
    const state = initGame();
    state.eventLog = [];
    staffedPrisonSetup(state);
    const mSpouse = createEntity(EntityType.Human, 90, 100, 18, 400, false, { gender: 'female', surname: 'A', ageYears: 30 });
    const fSpouse = createEntity(EntityType.Human, 120, 100, 22, 400, false, { gender: 'male', surname: 'B', ageYears: 30 });
    const m = createEntity(EntityType.Human, 105, 105, 20, 400, false, { gender: 'male', surname: 'A', ageYears: 30 });
    const f = createEntity(EntityType.Human, 110, 110, 21, 400, false, { gender: 'female', surname: 'B', ageYears: 30 });
    for (const e of [mSpouse, fSpouse, m, f]) e.isJuvenile = false;
    m.relationshipStatus = 'married';
    m.partnerId = mSpouse.id;
    mSpouse.relationshipStatus = 'married';
    mSpouse.partnerId = m.id;
    f.relationshipStatus = 'married';
    f.partnerId = fSpouse.id;
    fSpouse.relationshipStatus = 'married';
    fSpouse.partnerId = f.id;
    m.affairPartnerId = f.id;
    f.affairPartnerId = m.id;
    const humans = [...state.entities.filter(isPlayerHuman), mSpouse, fSpouse, m, f];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    exposeAffair(state, m, f, 'caught', entityMap(humans), state.buildings, humans);
    expect(m.prisonBuildingId).toBeDefined();
    expect(f.prisonBuildingId).toBeDefined();
  });

  it('tryDailyAffairGossip can surface caught scandal and imprisonment', () => {
    const state = initGame();
    state.eventLog = [];
    state.tick = TICKS_PER_DAY;
    staffedPrisonSetup(state);
    const church = createBuilding(BuildingType.Church, 80, 80, 80, 0);
    church.completed = true;
    state.buildings.push(church);
    const spouse = createEntity(EntityType.Human, 100, 100, 19, 400, false, { gender: 'female', surname: 'A', ageYears: 30 });
    const m = createEntity(EntityType.Human, 105, 105, 20, 400, false, { gender: 'male', surname: 'A', ageYears: 30 });
    const f = createEntity(EntityType.Human, 110, 110, 21, 400, false, { gender: 'female', surname: 'B', ageYears: 30 });
    for (const e of [spouse, m, f]) e.isJuvenile = false;
    m.relationshipStatus = 'married';
    m.partnerId = spouse.id;
    spouse.relationshipStatus = 'married';
    spouse.partnerId = m.id;
    f.relationshipStatus = 'single';
    m.affairPartnerId = f.id;
    f.affairPartnerId = m.id;
    m.affairProgress = 100;
    f.affairProgress = 100;
    const humans = [...state.entities.filter(isPlayerHuman), spouse, m, f];
    let roll = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      roll++;
      return roll === 1 ? 0 : 0;
    });
    tryDailyAffairGossip(
      state,
      m,
      entityMap(humans),
      state.buildings,
      new Map(state.buildings.map((b) => [b.id, b])),
      1,
      humans,
    );
    const scandals = state.eventLog.filter((e) => e.type === 'scandal');
    expect(scandals.some((e) => e.message.includes('was caught'))).toBe(true);
    expect(state.eventLog.some((e) => e.message.includes('imprisoned for scandal'))).toBe(true);
  });

  it('does not extend non-scandal prison sentences on a later caught affair', () => {
    const state = initGame();
    staffedPrisonSetup(state);
    const offender = createEntity(EntityType.Human, 0, 0, 30, 400, false, { gender: 'male', ageYears: 30 });
    offender.isJuvenile = false;
    offender.relationshipStatus = 'married';
    offender.partnerId = 99;
    offender.prisonBuildingId = 1;
    offender.prisonerUntilTick = 1000;
    const prison = state.buildings.find((b) => b.type === BuildingType.Prison)!;
    offender.prisonBuildingId = prison.id;
    const lover = createEntity(EntityType.Human, 10, 0, 31, 400, false, { gender: 'female', ageYears: 30 });
    lover.isJuvenile = false;
    const humans = [...state.entities.filter(isPlayerHuman), offender, lover];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    exposeAffair(state, offender, lover, 'caught', entityMap(humans), state.buildings, humans);
    expect(offender.prisonerUntilTick).toBe(1000);
  });

  it('restores maiden surname when the wife is caught cheating', () => {
    const state = freshState();
    const house = makeCompletedHouse(state, 1, 200);
    const husband = createEntity(EntityType.Human, house.x + 5, house.y + 5, 40, 400, false, {
      gender: 'male', surname: 'Husband', ageYears: 30,
    });
    const wife = createEntity(EntityType.Human, house.x + 8, house.y + 5, 41, 400, false, {
      gender: 'female', surname: 'Husband', ageYears: 30,
    });
    wife.maidenSurname = 'Maiden';
    const paramour = createEntity(EntityType.Human, house.x + 12, house.y + 5, 42, 400, false, {
      gender: 'male', surname: 'Other', ageYears: 30,
    });
    for (const e of [husband, wife, paramour]) e.isJuvenile = false;
    wife.relationshipStatus = 'married';
    husband.relationshipStatus = 'married';
    wife.partnerId = husband.id;
    husband.partnerId = wife.id;
    state.entities = [husband, wife, paramour];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    exposeAffair(state, wife, paramour, 'caught', entityMap(state.entities), state.buildings, state.entities);
    expect(wife.surname).toBe('Maiden');
    expect(husband.surname).toBe('Husband');
    expect(wife.relationshipStatus).toBe('single');
    expect(husband.relationshipStatus).toBe('single');
  });

  it('divorce removes ex-spouses from old residence occupants', () => {
    const state = freshState();
    const house = makeCompletedHouse(state, 1, 200);
    const spouse = createEntity(EntityType.Human, house.x + 5, house.y + 5, 40, 400, false, {
      gender: 'female', surname: 'Wife', ageYears: 30,
    });
    const cheater = createEntity(EntityType.Human, house.x + 8, house.y + 5, 41, 400, false, {
      gender: 'male', surname: 'Husband', ageYears: 30,
    });
    const paramour = createEntity(EntityType.Human, house.x + 20, house.y + 5, 42, 400, false, {
      gender: 'female', surname: 'Other', ageYears: 30,
    });
    for (const e of [spouse, cheater, paramour]) e.isJuvenile = false;
    spouse.relationshipStatus = 'married';
    cheater.relationshipStatus = 'married';
    spouse.partnerId = cheater.id;
    cheater.partnerId = spouse.id;
    state.entities = [spouse, cheater, paramour];
    assignMissingResidences(state.entities, state.buildings);
    house.occupants = [spouse.id, cheater.id];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    exposeAffair(state, cheater, paramour, 'caught', entityMap(state.entities), state.buildings, state.entities);
    expect(house.occupants).not.toContain(spouse.id);
    expect(house.occupants).not.toContain(cheater.id);
  });

  it('married women fall through to affair conception when apart from husband', () => {
    const state = freshState();
    const house = makeCompletedHouse(state, 1, 200);
    const father = createEntity(EntityType.Human, house.x + 10, house.y + 10, 101, 400, false, {
      gender: 'male', surname: 'Founder', ageYears: 30,
    });
    const mother = createEntity(EntityType.Human, house.x + 12, house.y + 10, 102, 400, false, {
      gender: 'female', surname: 'Founder', ageYears: 30,
    });
    const lover = createEntity(EntityType.Human, 0, 0, 201, 400, false, {
      gender: 'male', surname: 'Lover', ageYears: 30,
    });
    for (const e of [father, mother, lover]) e.isJuvenile = false;
    father.relationshipStatus = 'married';
    mother.relationshipStatus = 'married';
    father.partnerId = mother.id;
    mother.partnerId = father.id;
    mother.affairPartnerId = lover.id;
    lover.affairPartnerId = mother.id;
    mother.affairProgress = 100;
    lover.affairProgress = 100;
    mother.energy = mother.maxEnergy;
    mother.reproductionCooldown = 0;
    mother.x = 500;
    mother.y = 500;
    lover.x = 510;
    lover.y = 510;
    father.x = 900;
    father.y = 900;
    mother.residenceBuildingId = undefined;
    father.residenceBuildingId = undefined;
    state.entities = [father, mother, lover];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    tryDailyConception(state, humanCtx(state, state.entities), mother);
    expect(mother.pregnant).toBe(true);
    expect(mother.pregnantById).toBe(lover.id);
  });

  it('does not conceive when the affair would be at the marital home', () => {
    const state = freshState();
    const marital = makeCompletedHouse(state, 1, 200);
    const loverHouse = makeCompletedHouse(state, 2, 450);
    const husband = createEntity(EntityType.Human, marital.x + 10, marital.y + 10, 40, 400, false, {
      gender: 'male', surname: 'Husband', ageYears: 30,
    });
    const wife = createEntity(EntityType.Human, marital.x + 12, marital.y + 12, 41, 400, false, {
      gender: 'female', surname: 'Husband', ageYears: 30,
    });
    const lover = createEntity(EntityType.Human, marital.x + 14, marital.y + 14, 42, 400, false, {
      gender: 'male', surname: 'Single', ageYears: 30,
    });
    for (const e of [husband, wife, lover]) e.isJuvenile = false;
    husband.relationshipStatus = 'married';
    wife.relationshipStatus = 'married';
    husband.partnerId = wife.id;
    wife.partnerId = husband.id;
    lover.relationshipStatus = 'single';
    wife.affairPartnerId = lover.id;
    lover.affairPartnerId = wife.id;
    wife.affairProgress = 100;
    lover.affairProgress = 100;
    wife.energy = wife.maxEnergy;
    wife.reproductionCooldown = 0;
    wife.residenceBuildingId = marital.id;
    husband.residenceBuildingId = marital.id;
    lover.residenceBuildingId = loverHouse.id;
    husband.x = 900;
    husband.y = 900;
    state.entities = [husband, wife, lover];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    tryDailyConception(state, humanCtx(state, state.entities), wife);
    expect(wife.pregnant).not.toBe(true);
  });

  it('conceives when both lovers meet at the single paramour\'s house', () => {
    const state = freshState();
    const marital = makeCompletedHouse(state, 1, 200);
    const loverHouse = makeCompletedHouse(state, 2, 450);
    const cx = loverHouse.x + loverHouse.width / 2;
    const cy = loverHouse.y + loverHouse.height / 2;
    const husband = createEntity(EntityType.Human, 900, 900, 40, 400, false, {
      gender: 'male', surname: 'Husband', ageYears: 30,
    });
    const wife = createEntity(EntityType.Human, cx, cy, 41, 400, false, {
      gender: 'female', surname: 'Husband', ageYears: 30,
    });
    const lover = createEntity(EntityType.Human, cx + 4, cy, 42, 400, false, {
      gender: 'male', surname: 'Single', ageYears: 30,
    });
    for (const e of [husband, wife, lover]) e.isJuvenile = false;
    husband.relationshipStatus = 'married';
    wife.relationshipStatus = 'married';
    husband.partnerId = wife.id;
    wife.partnerId = husband.id;
    lover.relationshipStatus = 'single';
    wife.affairPartnerId = lover.id;
    lover.affairPartnerId = wife.id;
    wife.affairProgress = 100;
    lover.affairProgress = 100;
    wife.energy = wife.maxEnergy;
    wife.reproductionCooldown = 0;
    wife.residenceBuildingId = marital.id;
    husband.residenceBuildingId = marital.id;
    lover.residenceBuildingId = loverHouse.id;
    state.entities = [husband, wife, lover];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    tryDailyConception(state, humanCtx(state, state.entities), wife);
    expect(wife.pregnant).toBe(true);
    expect(wife.pregnantById).toBe(lover.id);
  });

  it('affair conception uses same spouse radius as pursuit (22, not 52)', () => {
    const state = freshState();
    const father = createEntity(EntityType.Human, 0, 0, 101, 400, false, {
      gender: 'male', surname: 'Founder', ageYears: 30,
    });
    const mother = createEntity(EntityType.Human, 35, 0, 102, 400, false, {
      gender: 'female', surname: 'Founder', ageYears: 30,
    });
    const lover = createEntity(EntityType.Human, 40, 0, 201, 400, false, {
      gender: 'male', surname: 'Lover', ageYears: 30,
    });
    for (const e of [father, mother, lover]) e.isJuvenile = false;
    father.relationshipStatus = 'married';
    mother.relationshipStatus = 'married';
    father.partnerId = mother.id;
    mother.partnerId = father.id;
    mother.affairPartnerId = lover.id;
    lover.affairPartnerId = mother.id;
    mother.affairProgress = 100;
    lover.affairProgress = 100;
    mother.energy = mother.maxEnergy;
    mother.reproductionCooldown = 0;
    lover.x = 42;
    lover.y = 0;
    father.x = 0;
    father.y = 0;
    state.entities = [father, mother, lover];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    tryDailyConception(state, humanCtx(state, state.entities), mother);
    expect(mother.pregnant).toBe(true);
    expect(mother.pregnantById).toBe(lover.id);
  });
});