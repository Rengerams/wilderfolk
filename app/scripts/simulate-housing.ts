/**
 * Housing regression — family + singles must not share when empty houses exist.
 * Run: npm run simulate:housing
 */
import { initGame, createEntity, EntityType } from '../src/game/gameEngine';
import {
  assignMissingResidences,
  auditHousingSharingIssues,
  countResidentsInBuilding,
  isResidenceBuilding,
  setHumanBirthFromAge,
  HUMAN_ADULT_MIN_AGE,
} from '../src/game/dayCycle';
import { BuildingType, BUILDING_CONFIGS } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/groupEvents';
import { loadNames } from '../src/game/nameLoader';

function makeHouse(state: ReturnType<typeof initGame>, id: number, x: number) {
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

function scenarioFamilyPlusSinglesCrammed() {
  const state = initGame();
  state.entities = [];
  state.buildings = [];
  state.nextBuildingId = 0;
  state.nextEntityId = 1;

  makeHouse(state, 0, 100);
  makeHouse(state, 1, 300);
  makeHouse(state, 2, 500);

  const father = createEntity(EntityType.Human, 110, 100, 1, 250, false, { gender: 'male', surname: 'Bounds' });
  const mother = createEntity(EntityType.Human, 120, 100, 2, 250, false, { gender: 'female', surname: 'Bounds' });
  setHumanBirthFromAge(father, 30, 0);
  setHumanBirthFromAge(mother, 28, 0);
  father.partnerId = 2;
  mother.partnerId = 1;
  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'married';
  father.childrenIds = [3];
  mother.childrenIds = [3];

  const baby = createEntity(EntityType.Human, 115, 100, 3, 250, false, { gender: 'female', surname: 'Bounds' });
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

  for (const h of [father, mother, baby, singleA, singleB]) h.residenceBuildingId = 0;
  state.entities.push(father, mother, baby, singleA, singleB);
  return state;
}

await loadNames();

const state = scenarioFamilyPlusSinglesCrammed();
const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
assignMissingResidences(humans, state.buildings);

const residences = state.buildings.filter(isResidenceBuilding);
const occ = residences.map((r) => countResidentsInBuilding(humans, r.id));
const sharingIssues = auditHousingSharingIssues(humans, state.buildings);
const maxOcc = Math.max(...occ, 0);

console.log('Occupancy:', occ.join(', '));
console.log('Max per house:', maxOcc);
console.log('Sharing issues:', sharingIssues.length);

if (maxOcc >= 5) {
  console.error('FAIL: 5+ settlers still in one house');
  process.exit(1);
}
if (sharingIssues.length > 0) {
  for (const msg of sharingIssues) console.error(`FAIL: ${msg}`);
  process.exit(1);
}

console.log('PASS — housing regression');