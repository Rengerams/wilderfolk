import type { Entity, WorldState } from './gameTypes';
import { BuildingType, EntityType, WEREWOLF_CURSE_LINES } from './gameTypes';
import { addBigNews, addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { assignMissingWorkers } from './workforce';
import { assignMissingResidences } from './residencyReconciliation';
import { indexLivingEntity } from './entityIndex';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE, getAbsoluteCalendarDay, getColonyDay, getHourOfDay, setHumanBirthFromAge } from './dayCycle';
import { canMoonHowlerCurse, curseMoonHowler, isMoonHowlerTransformTick, transformToWerewolfForm } from './moonHowler';
import { createEntity } from './entityFactory';
import { getRandomSurname } from './nameLoader';
import { logEvent } from './eventLog';

const RECRUITMENT_COST = { food: 30, gold: 20 } as const;
const TAMING_FOOD_COSTS: Partial<Record<EntityType, number>> = {
  [EntityType.Wolf]: 40,
  [EntityType.Fox]: 25,
  [EntityType.Deer]: 30,
  [EntityType.Rabbit]: 10,
};
const TAME_INTERACTION_TYPES: ReadonlySet<EntityType> = new Set([
  EntityType.Wolf,
  EntityType.Fox,
  EntityType.Deer,
  EntityType.Rabbit,
  EntityType.Werewolf,
]);

function listPlayerHumans(state: WorldState): Entity[] {
  return state.entities.filter(isPlayerHuman);
}

function reconcileNewSettlerAssignments(state: WorldState): void {
  const settlers = listPlayerHumans(state);
  assignMissingResidences(settlers, state.buildings, state.entities);
  assignMissingWorkers(settlers, state.buildings);
}

function recruitSpawnPosition(state: WorldState): { x: number; y: number } {
  // Buildings only stand on valid land; favor a house without changing the existing fallback.
  const anchor = state.buildings.find(
    (building) => building.type === BuildingType.House && building.completed && building.faction !== 'rival',
  ) ?? state.buildings.find((building) => building.completed && building.faction !== 'rival');
  if (!anchor) return { x: state.width / 2, y: state.height / 2 };
  return { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
}

export function recruitSettler(originalState: WorldState): WorldState {
  const state = structuredClone(originalState);
  if (playerHumanCount(state.entities) >= state.maxHumanPopulation) {
    addFloatingText(state, state.width / 2, state.height / 2, 'At max population!', '#ef4444');
    return state;
  }
  if (state.resources.food < RECRUITMENT_COST.food || state.resources.gold < RECRUITMENT_COST.gold) {
    addFloatingText(
      state,
      state.width / 2,
      state.height / 2,
      `Need ${RECRUITMENT_COST.food}f ${RECRUITMENT_COST.gold}g`,
      '#ef4444',
    );
    return state;
  }

  state.resources.food -= RECRUITMENT_COST.food;
  state.resources.gold -= RECRUITMENT_COST.gold;
  const spawn = recruitSpawnPosition(state);
  const recruitAge = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 20);
  const settler = createEntity(
    EntityType.Human,
    spawn.x + (Math.random() - 0.5) * 40,
    spawn.y + (Math.random() - 0.5) * 40,
    state.nextEntityId++,
    undefined,
    false,
    { ageYears: recruitAge, colonyDay: getColonyDay(state), surname: getRandomSurname() },
  );
  settler.relationshipStatus = 'single';
  settler.partnerId = undefined;
  settler.courtshipProgress = 0;
  state.entities.push(settler);
  indexLivingEntity(state, settler);
  reconcileNewSettlerAssignments(state);

  createDeathParticles(state, settler.x, settler.y, '#fcd34d', 12, 'star');
  addFloatingText(state, settler.x, settler.y - 15, '+1 Settler!', '#22c55e');
  impulseScreenShake(state, 2);
  return state;
}

/** Debug/testing-only command: curse an eligible human or spawn a cursed wanderer. */
export function spawnMoonHowlerDebug(originalState: WorldState): WorldState {
  const state = structuredClone(originalState);
  const candidates = state.entities.filter((entity) => entity.alive && canMoonHowlerCurse(entity));
  const pick = candidates[Math.floor(Math.random() * candidates.length)];

  if (pick) {
    const who = pick.name ? `${pick.name}${pick.surname ? ` ${pick.surname}` : ''}` : 'A settler';
    curseMoonHowler(pick);
    const colonyDay = getAbsoluteCalendarDay(state.tick);
    if (isMoonHowlerTransformTick(colonyDay, getHourOfDay(state.tick))) transformToWerewolfForm(pick);
    const line = WEREWOLF_CURSE_LINES[Math.floor(Math.random() * WEREWOLF_CURSE_LINES.length)](who);
    addBigNews(state, '🌝 Debug Moon Howler!', `(Test) ${line}`, 'negative');
    addFloatingText(state, pick.x, pick.y - 20, 'Cursed…', '#c4b5fd');
    logEvent(state, 'event', `(Debug) ${who} was cursed as a Moon Howler`, who);
    return state;
  }

  const settler = createEntity(EntityType.Human, state.width / 2, state.height / 2, state.nextEntityId++, 400);
  const debugAge = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 20);
  settler.generation = 1;
  setHumanBirthFromAge(settler, debugAge, getColonyDay(state));
  curseMoonHowler(settler);
  state.entities.push(settler);
  indexLivingEntity(state, settler);
  addBigNews(state, '🌝 Debug Moon Howler!', '(Test) A cursed wanderer arrived from the woods.', 'negative');
  addFloatingText(state, settler.x, settler.y - 20, 'Cursed…', '#c4b5fd');
  logEvent(state, 'event', '(Debug) Cursed Moon Howler spawned at map center', settler.name);
  return state;
}

export function getTameFoodCost(type: EntityType): number | null {
  return TAMING_FOOD_COSTS[type] ?? null;
}

function hasNearbyPlayerTamingPost(state: WorldState, entity: Entity): boolean {
  return state.buildings.some(
    (building) =>
      building.completed
      && building.faction !== 'rival'
      && building.type === BuildingType.TamingPost
      && Math.hypot(building.x + building.width / 2 - entity.x, building.y + building.height / 2 - entity.y) < 140,
  );
}

export function tameEntity(originalState: WorldState, entityId: number, humanId: number): WorldState {
  const state = structuredClone(originalState);
  const entity = state.entities.find((candidate) => candidate.id === entityId);
  const human = state.entities.find((candidate) => candidate.id === humanId && candidate.type === EntityType.Human);
  if (!entity || !human || !isPlayerHuman(human) || entity.tamedBy) return state;

  if (!TAME_INTERACTION_TYPES.has(entity.type)) {
    addFloatingText(state, entity.x, entity.y - 10, 'Cannot tame this creature', '#ef4444');
    return state;
  }
  if (entity.type === EntityType.Werewolf) {
    addFloatingText(state, entity.x, entity.y - 10, 'Staff a Church — cures roll on full-moon nights (20:00–06:00)', '#ef4444');
    return state;
  }
  if (!hasNearbyPlayerTamingPost(state, entity)) {
    addFloatingText(state, entity.x, entity.y - 10, 'Need a Taming Post nearby', '#ef4444');
    return state;
  }

  const cost = getTameFoodCost(entity.type);
  if (cost === null) {
    addFloatingText(state, entity.x, entity.y - 10, 'Cannot tame this creature', '#ef4444');
    return state;
  }
  if (state.resources.food < cost) {
    addFloatingText(state, entity.x, entity.y - 10, `Need ${cost} food`, '#ef4444');
    return state;
  }

  state.resources.food -= cost;
  entity.tamedBy = human.id;
  addFloatingText(state, entity.x, entity.y - 15, 'Tamed!', '#22c55e');
  logEvent(state, 'migration', `${human.name || 'A settler'} tamed a ${entity.type}`);
  return state;
}
