import { initGame } from '../game/gameEngine';
import { createEntity } from '../game/worldGen';
import type { Entity, WorldState } from '../game/gameTypes';
import { BuildingType, EntityType, BUILDING_CONFIGS } from '../game/gameTypes';
import { HUMAN_ADULT_MIN_AGE, setHumanBirthFromAge } from '../game/dayCycle';
import { isPlayerHuman } from '../game/groupEvents';

export function makeCompletedHouse(state: WorldState, id: number, x: number): void {
  const cfg = BUILDING_CONFIGS[BuildingType.House];
  state.buildings.push({
    id,
    type: BuildingType.House,
    x,
    y: 100,
    width: cfg.width,
    height: cfg.height,
    completed: true,
    constructionProgress: 100,
    occupants: [],
    health: 100,
    maxHealth: 100,
    level: 1,
    faction: undefined,
    buildAnimTimer: 0,
    spriteScale: 1,
  });
}

/** Five settlers in house 0, houses 1–2 empty — reproduces the in-game bug report. */
export function makeBoundsFamilyCrammedWithSingles(): {
  state: WorldState;
  family: Entity[];
  singles: Entity[];
  villagers: Entity[];
} {
  const state = initGame();
  state.entities = [];
  state.buildings = [];
  state.nextBuildingId = 0;
  state.nextEntityId = 1;

  makeCompletedHouse(state, 0, 100);
  makeCompletedHouse(state, 1, 300);
  makeCompletedHouse(state, 2, 500);

  const father = createEntity(EntityType.Human, 110, 100, 1, 250, false, {
    gender: 'male',
    surname: 'Bounds',
  });
  const mother = createEntity(EntityType.Human, 120, 100, 2, 250, false, {
    gender: 'female',
    surname: 'Bounds',
  });
  setHumanBirthFromAge(father, 30, 0);
  setHumanBirthFromAge(mother, 28, 0);
  father.partnerId = 2;
  mother.partnerId = 1;
  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'married';

  const baby = createEntity(EntityType.Human, 115, 100, 3, 250, false, {
    gender: 'female',
    surname: 'Bounds',
  });
  baby.motherId = 2;
  baby.fatherId = 1;
  baby.isJuvenile = true;
  setHumanBirthFromAge(baby, 0, 45);

  const singleA = createEntity(EntityType.Human, 130, 100, 4, 250);
  const singleB = createEntity(EntityType.Human, 140, 100, 5, 250);
  setHumanBirthFromAge(singleA, HUMAN_ADULT_MIN_AGE + 5, 0);
  setHumanBirthFromAge(singleB, HUMAN_ADULT_MIN_AGE + 8, 0);
  singleA.relationshipStatus = 'single';
  singleB.relationshipStatus = 'single';
  singleA.partnerId = undefined;
  singleB.partnerId = undefined;

  const family = [father, mother, baby];
  const singles = [singleA, singleB];
  for (const h of [...family, ...singles]) h.residenceBuildingId = 0;
  state.entities.push(...family, ...singles);

  const villagers = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  return { state, family, singles, villagers };
}

/** Two houses: family + extra singles crammed together; one lone single in the other house. */
export function makeTwoHouseFamilyWithSinglesPileup(): {
  state: WorldState;
  family: Entity[];
  singles: Entity[];
  villagers: Entity[];
} {
  const state = initGame();
  state.entities = [];
  state.buildings = [];
  state.nextBuildingId = 0;
  state.nextEntityId = 1;

  makeCompletedHouse(state, 0, 100);
  makeCompletedHouse(state, 1, 300);

  const father = createEntity(EntityType.Human, 110, 100, 1, 250, false, {
    gender: 'male',
    surname: 'Bounds',
  });
  const mother = createEntity(EntityType.Human, 120, 100, 2, 250, false, {
    gender: 'female',
    surname: 'Bounds',
  });
  setHumanBirthFromAge(father, 30, 0);
  setHumanBirthFromAge(mother, 28, 0);
  father.partnerId = 2;
  mother.partnerId = 1;
  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'married';

  const baby = createEntity(EntityType.Human, 115, 100, 3, 250, false, {
    gender: 'female',
    surname: 'Bounds',
  });
  baby.motherId = 2;
  baby.fatherId = 1;
  baby.isJuvenile = true;
  setHumanBirthFromAge(baby, 0, 45);

  const singleA = createEntity(EntityType.Human, 130, 100, 4, 250);
  const singleB = createEntity(EntityType.Human, 140, 100, 5, 250);
  const singleC = createEntity(EntityType.Human, 310, 100, 6, 250);
  setHumanBirthFromAge(singleA, HUMAN_ADULT_MIN_AGE + 5, 0);
  setHumanBirthFromAge(singleB, HUMAN_ADULT_MIN_AGE + 8, 0);
  setHumanBirthFromAge(singleC, HUMAN_ADULT_MIN_AGE + 3, 0);
  for (const s of [singleA, singleB, singleC]) {
    s.relationshipStatus = 'single';
    s.partnerId = undefined;
  }

  const family = [father, mother, baby];
  const singles = [singleA, singleB, singleC];
  for (const m of family) m.residenceBuildingId = 0;
  singleA.residenceBuildingId = 0;
  singleB.residenceBuildingId = 0;
  singleC.residenceBuildingId = 1;

  state.entities.push(...family, ...singles);

  const villagers = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  return { state, family, singles, villagers };
}