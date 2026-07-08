import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '@/game/gameTypes';
import {
  createBuilding,
  createEntity,
  createImmigrantSettler,
  getAgeInYears,
  initGame,
  replenishDepletedWildlife,
  spawnWildlifeRing,
} from '@/game/worldGen';
import { freshState } from '@/test/fixtures/gameFixtures';
import { getColonyDay } from '@/game/dayCycle';

describe('createBuilding', () => {
  it('stores 180° and 270° rotations', () => {
    const at180 = createBuilding(BuildingType.Wall, 100, 100, 1, 180);
    const at270 = createBuilding(BuildingType.WallCorner, 120, 100, 2, 270);

    expect(at180.rotation).toBe(180);
    expect(at270.rotation).toBe(270);
  });

  it('omits rotation field for unrotated buildings', () => {
    const house = createBuilding(BuildingType.House, 100, 100, 1, 0);
    expect(house.rotation).toBeUndefined();
  });
});

describe('replenishDepletedWildlife', () => {
  it('does not spawn wolves when prey is nearly gone', () => {
    const state = freshState();
    state.entities = [
      createEntity(EntityType.Rabbit, 100, 100, 1, 200),
      createEntity(EntityType.Rabbit, 110, 100, 2, 200),
    ];

    replenishDepletedWildlife(state);

    expect(state.entities.some((e) => e.alive && e.type === EntityType.Wolf)).toBe(false);
  });

  it('logs grass-only replenishment when pasture recovers without wildlife spawns', () => {
    const state = freshState();
    state.entities = Array.from({ length: 12 }, (_, i) =>
      createEntity(EntityType.Rabbit, 100 + i, 100, 10 + i, 200),
    );
    state.wildlifeCounts = {
      grass: 5,
      rabbits: 12,
      deer: 8,
      wolves: 1,
      foxes: 2,
      werewolves: 0,
      wildkin: 0,
      trees: 0,
    };
    state.lastWildlifeReplenishLogDay = -999;
    state.eventLog = [];

    const didReplenish = replenishDepletedWildlife(state);

    expect(didReplenish).toBe(true);
    expect(state.eventLog.some((e) => e.message.includes('Fresh grass'))).toBe(true);
  });

  it('updates replenish log day even when prey is not fully depleted', () => {
    const state = freshState();
    state.entities = [
      createEntity(EntityType.Grass, 100, 100, 1, 100),
      ...Array.from({ length: 11 }, (_, i) =>
        createEntity(EntityType.Rabbit, 100 + i, 100, 10 + i, 200),
      ),
    ];
    state.wildlifeCounts = {
      grass: 40,
      rabbits: 11,
      deer: 4,
      wolves: 0,
      foxes: 0,
      werewolves: 0,
      wildkin: 0,
      trees: 0,
    };

    state.lastWildlifeReplenishLogDay = -999;
    const day = getColonyDay(state);
    replenishDepletedWildlife(state);

    expect(state.lastWildlifeReplenishLogDay).toBe(day);
  });
});

describe('createEntity', () => {
  it('sets human calendar age via ageYears without stale birthYear=0', () => {
    const human = createEntity(EntityType.Human, 0, 0, 1, 250, false, {
      gender: 'female',
      ageYears: 32,
      colonyDay: 120,
    });
    expect(human.age).toBe(32);
    expect(getAgeInYears(human, { year: 0, dayInYear: 120, tick: 120 * 24 })).toBe(32);
  });

  it('assigns pregnantById from partner when spawning pregnant immigrants', () => {
    const father = createEntity(EntityType.Human, 0, 0, 10, 250, false, { gender: 'male', ageYears: 30 });
    const mother = createEntity(EntityType.Human, 10, 0, 11, 250, false, {
      gender: 'female',
      ageYears: 28,
      pregnant: true,
      pregnancyProgress: 40,
      partnerId: father.id,
    });
    expect(mother.pregnant).toBe(true);
    expect(mother.pregnantById).toBe(father.id);
    expect(mother.relationshipStatus).toBe('married');
  });
});

describe('createImmigrantSettler', () => {
  it('can spawn a pregnant wife with partner id linked', () => {
    const state = freshState();
    const originals = Math.random;
    Math.random = () => 0;
    try {
      const settlers = createImmigrantSettler(state, 200, 200);
      expect(settlers).toHaveLength(2);
      const wife = settlers.find((h) => h.gender === 'female')!;
      const husband = settlers.find((h) => h.gender === 'male')!;
      expect(wife.pregnant).toBe(true);
      expect(wife.pregnantById).toBe(husband.id);
      expect(husband.partnerId).toBe(wife.id);
    } finally {
      Math.random = originals;
    }
  });
});

describe('getAgeInYears', () => {
  it('converts wildlife life-days to display years', () => {
    const deer = createEntity(EntityType.Deer, 0, 0, 1, 200);
    deer.age = 720;
    expect(getAgeInYears(deer, { year: 2, dayInYear: 0, tick: 720 * 24 })).toBe(2);
  });
});

describe('spawnWildlifeRing', () => {
  it('still spawns when camp is near a map border', () => {
    const state = freshState();
    state.entities = [];
    state.nextEntityId = 0;
    const before = state.entities.length;
    spawnWildlifeRing(state, EntityType.Rabbit, 40, 40, 5, 120, 400);
    expect(state.entities.length - before).toBeGreaterThan(0);
  });
});

describe('initGame', () => {
  it('computes wildlife counts after all world entities are spawned', () => {
    const state = initGame();
    const rabbits = state.entities.filter((e) => e.alive && e.type === EntityType.Rabbit).length;

    expect(state.wildlifeCounts.rabbits).toBe(rabbits);
    expect(state.wildlifeCounts.grass).toBeGreaterThan(30);
  });

  it('founders have correct calendar ages at start', () => {
    const state = initGame();
    const founders = state.entities.filter((e) => e.type === EntityType.Human && e.generation === 1);
    const ages = founders.map((h) => h.age).sort((a, b) => a - b);
    expect(ages).toEqual([28, 30]);
  });
});