/** Affair sites: either lover's own home or a genuine outdoor encounter. */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import {
  AFFAIR_WALK_IN_RADIUS,
  getAffairTrystBuilding,
  isValidAffairTrystSite,
  wouldWalkInOnAffair,
} from '../src/game/simulation/humanRelationships';

const MARITAL_HOME_ID = 10;
const PARAMOUR_HOME_ID = 20;

function house(id: number, x = 100, y = 100): Building {
  return {
    id,
    type: BuildingType.House,
    x,
    y,
    width: 40,
    height: 40,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

function settler(id: number, gender: 'male' | 'female', overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    surname: 'Vale',
    gender,
    x: 100,
    y: 100,
    energy: 200,
    maxEnergy: 200,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    reproductionCooldown: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    relationshipStatus: 'single',
    ...overrides,
  };
}

/**
 * Cheater + spouse in one house, a single paramour with their own house, and both cheater and
 * paramour standing away from the marital home (so `isAtMaritalHome` is false unless a test moves
 * people).
 */
function fixture(): {
  cheater: Entity;
  spouse: Entity;
  paramour: Entity;
  entityById: Map<number, Entity>;
  buildingById: Map<number, Building>;
} {
  const cheater = settler(1, 'male', {
    x: 500,
    y: 500,
    relationshipStatus: 'married',
    partnerId: 2,
    residenceBuildingId: MARITAL_HOME_ID,
  });
  const spouse = settler(2, 'female', {
    x: 900,
    y: 900,
    relationshipStatus: 'married',
    partnerId: 1,
    residenceBuildingId: MARITAL_HOME_ID,
  });
  const paramour = settler(3, 'female', { x: 300, y: 300, residenceBuildingId: PARAMOUR_HOME_ID });
  const entities = [cheater, spouse, paramour];
  return {
    cheater,
    spouse,
    paramour,
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
    buildingById: new Map([[MARITAL_HOME_ID, house(MARITAL_HOME_ID)], [PARAMOUR_HOME_ID, house(PARAMOUR_HOME_ID, 300, 300)]]),
  };
}

describe('affair rendezvous belongs to the lovers, not random houses', () => {
  it('uses a partner’s actual home while both lovers meet there and the spouse is away', () => {
    const { cheater, paramour, entityById, buildingById } = fixture();
    cheater.x = 110;
    cheater.y = 110;
    paramour.x = 115;
    paramour.y = 110;

    expect(getAffairTrystBuilding(cheater, paramour, entityById, buildingById)?.id).toBe(MARITAL_HOME_ID);
    expect(getAffairTrystBuilding(paramour, cheater, entityById, buildingById)?.id).toBe(MARITAL_HOME_ID);
    expect(isValidAffairTrystSite(cheater, paramour, entityById, buildingById, 22)).toBe(true);
  });

  it('uses the other lover’s home when the married lover’s spouse is at home', () => {
    const { cheater, spouse, paramour, entityById, buildingById } = fixture();
    spouse.x = 110;
    spouse.y = 110;
    cheater.x = 310;
    cheater.y = 310;
    paramour.x = 315;
    paramour.y = 310;

    expect(getAffairTrystBuilding(cheater, paramour, entityById, buildingById)?.id).toBe(PARAMOUR_HOME_ID);
    expect(getAffairTrystBuilding(paramour, cheater, entityById, buildingById)?.id).toBe(PARAMOUR_HOME_ID);
  });

  it('allows an outdoor encounter even with houses elsewhere on the map', () => {
    const { cheater, paramour, entityById, buildingById } = fixture();
    cheater.x = 500;
    cheater.y = 500;
    paramour.x = 509;
    paramour.y = 502;

    expect(getAffairTrystBuilding(cheater, paramour, entityById, buildingById)).toBeUndefined();
    expect(isValidAffairTrystSite(cheater, paramour, entityById, buildingById, 22)).toBe(true);
    expect(isValidAffairTrystSite(paramour, cheater, entityById, buildingById, 22)).toBe(true);
  });

  it('never selects an unrelated house, even when the pair is standing beside it', () => {
    const { cheater, paramour, entityById, buildingById } = fixture();
    buildingById.set(30, house(30, 500, 500));
    cheater.x = 510;
    cheater.y = 510;
    paramour.x = 515;
    paramour.y = 513;

    expect(getAffairTrystBuilding(cheater, paramour, entityById, buildingById)).toBeUndefined();
    expect(isValidAffairTrystSite(cheater, paramour, entityById, buildingById, 22)).toBe(true);
  });

  it('refuses a spouse-occupied home rather than treating it as an indoor tryst', () => {
    const { cheater, spouse, paramour, entityById, buildingById } = fixture();
    spouse.x = 110;
    spouse.y = 110;
    paramour.residenceBuildingId = undefined;
    cheater.x = 110;
    cheater.y = 110;
    paramour.x = 115;
    paramour.y = 110;

    expect(getAffairTrystBuilding(cheater, paramour, entityById, buildingById)).toBeUndefined();
    expect(isValidAffairTrystSite(cheater, paramour, entityById, buildingById, 22)).toBe(false);
  });
});

describe('walk-in rule is not limited to the marital home', () => {
  it('fires when the cheater’s spouse arrives on the pair somewhere else', () => {
    const { cheater, spouse, paramour, entityById, buildingById } = fixture();
    // The pair is at the paramour's house, far from the marital home; the spouse walks up to them.
    cheater.x = 300;
    cheater.y = 300;
    spouse.x = 300 + AFFAIR_WALK_IN_RADIUS - 5;
    spouse.y = 300;

    expect(wouldWalkInOnAffair(cheater, paramour, entityById, buildingById)).toBe(true);
  });

  it('fires at the cheater’s own home when the spouse comes back', () => {
    const { cheater, spouse, paramour, entityById, buildingById } = fixture();
    cheater.x = 110;
    cheater.y = 110;
    spouse.x = 118;
    spouse.y = 112;

    expect(wouldWalkInOnAffair(cheater, paramour, entityById, buildingById)).toBe(true);
  });

  it('counts a married paramour’s spouse as well', () => {
    const { cheater, spouse, paramour, entityById, buildingById } = fixture();
    // The cheater's spouse is far away; the paramour's own spouse is the one who walks in.
    spouse.x = 900;
    spouse.y = 900;
    const paramourSpouse = settler(4, 'male', {
      x: 305,
      y: 300,
      relationshipStatus: 'married',
      partnerId: paramour.id,
      residenceBuildingId: PARAMOUR_HOME_ID,
    });
    paramour.relationshipStatus = 'married';
    paramour.partnerId = paramourSpouse.id;
    entityById.set(paramourSpouse.id, paramourSpouse);
    cheater.x = 300;
    cheater.y = 300;
    paramour.x = 300;
    paramour.y = 300;

    expect(wouldWalkInOnAffair(cheater, paramour, entityById, buildingById)).toBe(true);
  });

  it('stays quiet when both spouses are elsewhere', () => {
    const { cheater, paramour, entityById, buildingById } = fixture();
    cheater.x = 300;
    cheater.y = 300;

    expect(wouldWalkInOnAffair(cheater, paramour, entityById, buildingById)).toBe(false);
  });
});
