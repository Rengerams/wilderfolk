import { describe, expect, it, vi, afterEach } from 'vitest';
import { BuildingType } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';
import {
  allLivingHumans,
  getGrassPopulationCap,
  isValidAffairTrystSite,
} from '@/game/lifeSimulation';
import { killHuman, pickResidenceForHumanExcluding } from '@/game/dayCycle';
import { freshState, makeCompletedHouse } from '@/test/fixtures/gameFixtures';
import type { Entity } from '@/game/gameTypes';

describe('Batch T lifeSimulation fixes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allLivingHumans includes same-tick newborns from newEntities', () => {
    const state = freshState();
    const mother = createEntity(EntityType.Human, 0, 0, 1, 400, false, { gender: 'female', ageYears: 30 });
    const newborn = createEntity(EntityType.Human, 5, 5, 99, 80, true, { gender: 'male', motherId: 1 });
    mother.isJuvenile = false;
    newborn.isJuvenile = true;
    state.entities = [mother];

    const living = allLivingHumans(state, [newborn], new Map([[mother.id, mother], [newborn.id, newborn]]));
    expect(living.map((h) => h.id).sort()).toEqual([1, 99]);
  });

  it('getGrassPopulationCap scales with map area', () => {
    expect(getGrassPopulationCap(1200, 900)).toBe(500);
    expect(getGrassPopulationCap(1600, 1200)).toBeGreaterThan(500);
    expect(getGrassPopulationCap(800, 600)).toBeLessThan(500);
  });

  it('pickResidenceForHumanExcluding avoids the ex-spouse home after divorce', () => {
    const state = freshState();
    const houseA = makeCompletedHouse(state, 1, 100);
    const houseB = makeCompletedHouse(state, 2, 400);
    const spouse = createEntity(EntityType.Human, houseA.x, houseA.y, 10, 400, false, { gender: 'female', ageYears: 30 });
    const cheater = createEntity(EntityType.Human, houseA.x + 5, houseA.y, 11, 400, false, { gender: 'male', ageYears: 30 });
    for (const e of [spouse, cheater]) e.isJuvenile = false;
    const villagers = [spouse, cheater];
    const residences = state.buildings.filter((b) => b.type === BuildingType.House);

    spouse.residenceBuildingId = pickResidenceForHumanExcluding(spouse, villagers, residences);
    cheater.residenceBuildingId = pickResidenceForHumanExcluding(
      cheater,
      villagers,
      residences,
      spouse.residenceBuildingId != null ? [spouse.residenceBuildingId] : [],
    );

    expect(spouse.residenceBuildingId).toBeDefined();
    expect(cheater.residenceBuildingId).toBeDefined();
    expect(cheater.residenceBuildingId).not.toBe(spouse.residenceBuildingId);
    expect([houseA.id, houseB.id]).toContain(spouse.residenceBuildingId);
    expect([houseA.id, houseB.id]).toContain(cheater.residenceBuildingId);
  });

  it('finalizeHumanDeath clears the surviving spouse partnerId (werewolf widow)', () => {
    const spouse = createEntity(EntityType.Human, 0, 0, 1, 400, false, { gender: 'female', ageYears: 30 });
    const werewolf = createEntity(EntityType.Werewolf, 10, 0, 2, 700, false, { gender: 'male', ageYears: 32 });
    spouse.isJuvenile = false;
    werewolf.isJuvenile = false;
    werewolf.moonHowlerCursed = true;
    spouse.relationshipStatus = 'married';
    werewolf.relationshipStatus = 'married';
    spouse.partnerId = werewolf.id;
    werewolf.partnerId = spouse.id;
    werewolf.moonHowlerSaved = { energy: 400, maxEnergy: 700, speed: 3, size: 14, partnerId: spouse.id };

    const byId = new Map<number, Entity>([[spouse.id, spouse], [werewolf.id, werewolf]]);
    killHuman(spouse, [], byId);

    expect(spouse.alive).toBe(false);
    expect(werewolf.partnerId).toBeUndefined();
    expect(werewolf.relationshipStatus).toBe('single');
    expect(werewolf.moonHowlerSaved?.partnerId).toBeUndefined();
  });

  it('allows tryst at married paramour marital home when their spouse is away', () => {
    const state = freshState();
    const paramourHome = makeCompletedHouse(state, 1, 200);
    const cheaterHome = makeCompletedHouse(state, 2, 500);
    const cx = paramourHome.x + paramourHome.width / 2;
    const cy = paramourHome.y + paramourHome.height / 2;
    const paramourSpouse = createEntity(EntityType.Human, 900, 900, 40, 400, false, {
      gender: 'male', surname: 'ParamourH', ageYears: 30,
    });
    const paramour = createEntity(EntityType.Human, cx, cy, 41, 400, false, {
      gender: 'female', surname: 'Paramour', ageYears: 30,
    });
    const cheater = createEntity(EntityType.Human, cx + 4, cy, 42, 400, false, {
      gender: 'male', surname: 'Cheater', ageYears: 30,
    });
    for (const e of [paramourSpouse, paramour, cheater]) e.isJuvenile = false;
    paramour.relationshipStatus = 'married';
    paramourSpouse.relationshipStatus = 'married';
    paramour.partnerId = paramourSpouse.id;
    paramourSpouse.partnerId = paramour.id;
    paramour.residenceBuildingId = paramourHome.id;
    paramourSpouse.residenceBuildingId = paramourHome.id;
    cheater.residenceBuildingId = cheaterHome.id;
    const entityById = new Map([paramourSpouse, paramour, cheater].map((e) => [e.id, e]));
    const buildingById = new Map(state.buildings.map((b) => [b.id, b]));

    expect(
      isValidAffairTrystSite(cheater, paramour, entityById, buildingById, 55),
    ).toBe(true);
  });
});