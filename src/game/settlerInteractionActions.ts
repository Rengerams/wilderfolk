import type { Entity, WorldState } from './gameTypes';
import { BuildingType, EntityType, WEREWOLF_CURSE_LINES } from './gameTypes';
import { addBigNews, addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { assignMissingWorkers } from './workforce';
import { assignMissingResidences } from './residencyReconciliation';
import { indexLivingEntity } from './entityIndex';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE, getAbsoluteCalendarDay, getColonyDay, getHourOfDay, setHumanBirthFromAge } from './dayCycle';
import { canBeginMoonHowlerCurse, canMoonHowlerCurse, curseMoonHowler, isMoonHowlerTransformTick, transformToWerewolfForm } from './moonHowler';
import { createEntity } from './entityFactory';
import { getRandomSurname } from './nameLoader';
import { logEvent } from './eventLog';
import { getSimRng } from './simRng';

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

/**
 * Whether `recruitSettler` would actually admit a newcomer: room under the
 * population cap and the recruitment price in store.
 *
 * Single definition of the recruitment rule, shared with the auto-play bot
 * (`virtualPlayer.ts`), so the bot never claims an in-game hour with a
 * recruitment the owner would refuse.
 */
export function getRecruitSettlerEligibility(
  state: WorldState,
): { ok: boolean; blockReason?: string } {
  if (playerHumanCount(state.entities) >= state.maxHumanPopulation) {
    return { ok: false, blockReason: 'At max population!' };
  }
  if (state.resources.food < RECRUITMENT_COST.food || state.resources.gold < RECRUITMENT_COST.gold) {
    return { ok: false, blockReason: `Need ${RECRUITMENT_COST.food}f ${RECRUITMENT_COST.gold}g` };
  }
  return { ok: true };
}

export function recruitSettler(originalState: WorldState): WorldState {
  const state = structuredClone(originalState);
  const eligibility = getRecruitSettlerEligibility(originalState);
  if (!eligibility.ok) {
    addFloatingText(
      state,
      state.width / 2,
      state.height / 2,
      eligibility.blockReason ?? 'Cannot recruit',
      '#ef4444',
    );
    return state;
  }
  state.resources.food -= RECRUITMENT_COST.food;
  state.resources.gold -= RECRUITMENT_COST.gold;
  const spawn = recruitSpawnPosition(state);
  // Seeded (resolved per call, since `setSimSeed` drops cached streams): a recruited
  // settler's age and spawn jitter are world state.
  const rng = getSimRng('settlerInteractionActions');
  const recruitAge = HUMAN_ADULT_MIN_AGE + Math.floor(rng() * 20);
  const settler = createEntity(
    EntityType.Human,
    spawn.x + (rng() - 0.5) * 40,
    spawn.y + (rng() - 0.5) * 40,
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
  // §5: at most one living cursed Moon Howler. The debug command is a second curse route,
  // so it must obey the owner's colony gate instead of stacking a second howler on the map.
  if (!canBeginMoonHowlerCurse(state.entities)) {
    addFloatingText(
      state,
      state.width / 2,
      state.height / 2,
      'A Moon Howler already stalks the valley',
      '#c4b5fd',
    );
    return state;
  }
  const rng = getSimRng('settlerInteractionActions');
  const candidates = state.entities.filter((entity) => entity.alive && canMoonHowlerCurse(entity));
  const pick = candidates[Math.floor(rng() * candidates.length)];

  if (pick) {
    const who = pick.name ? `${pick.name}${pick.surname ? ` ${pick.surname}` : ''}` : 'A settler';
    curseMoonHowler(pick);
    const colonyDay = getAbsoluteCalendarDay(state.tick);
    // `buildings` keeps the cursed settler out of the occupants lists the transform clears.
    if (isMoonHowlerTransformTick(colonyDay, getHourOfDay(state.tick))) {
      transformToWerewolfForm(pick, state.buildings);
    }
    const line = WEREWOLF_CURSE_LINES[Math.floor(rng() * WEREWOLF_CURSE_LINES.length)](who);
    addBigNews(state, '🌝 Debug Moon Howler!', `(Test) ${line}`, 'negative');
    addFloatingText(state, pick.x, pick.y - 20, 'Cursed…', '#c4b5fd');
    logEvent(state, 'event', `(Debug) ${who} was cursed as a Moon Howler`, who);
    return state;
  }

  const settler = createEntity(EntityType.Human, state.width / 2, state.height / 2, state.nextEntityId++, 400);
  const debugAge = HUMAN_ADULT_MIN_AGE + Math.floor(rng() * 20);
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

/**
 * Whether `tameEntity` would actually tame this creature for this settler: both
 * exist, the settler is a living player human, the creature is untamed and of a
 * tameable species, a player Taming Post stands within reach, and the colony can
 * pay the species' food cost.
 *
 * Single definition of the taming rule, shared with the auto-play bot
 * (`virtualPlayer.ts`).
 */
export function getTameEntityEligibility(
  state: WorldState,
  entityId: number,
  humanId: number,
): { ok: boolean; blockReason?: string } {
  const entity = state.entities.find((candidate) => candidate.id === entityId);
  const human = state.entities.find(
    (candidate) => candidate.id === humanId && candidate.type === EntityType.Human,
  );
  if (!entity || !human || !isPlayerHuman(human) || entity.tamedBy) {
    return { ok: false, blockReason: 'Cannot tame this creature' };
  }
  if (!TAME_INTERACTION_TYPES.has(entity.type)) {
    return { ok: false, blockReason: 'Cannot tame this creature' };
  }
  if (entity.type === EntityType.Werewolf) {
    return { ok: false, blockReason: 'Staff a Church — cures roll on full-moon nights (20:00–06:00)' };
  }
  if (!hasNearbyPlayerTamingPost(state, entity)) {
    return { ok: false, blockReason: 'Need a Taming Post nearby' };
  }
  const cost = getTameFoodCost(entity.type);
  if (cost === null) return { ok: false, blockReason: 'Cannot tame this creature' };
  if (state.resources.food < cost) return { ok: false, blockReason: `Need ${cost} food` };
  return { ok: true };
}

export function tameEntity(originalState: WorldState, entityId: number, humanId: number): WorldState {
  const state = structuredClone(originalState);
  const entity = state.entities.find((candidate) => candidate.id === entityId);
  const human = state.entities.find((candidate) => candidate.id === humanId && candidate.type === EntityType.Human);
  // An unknown creature/settler, a non-player settler, or an already-tamed
  // animal stays silent — that is not a taming attempt the UI ever offers.
  if (!entity || !human || !isPlayerHuman(human) || entity.tamedBy) return state;

  const eligibility = getTameEntityEligibility(originalState, entityId, humanId);
  if (!eligibility.ok) {
    addFloatingText(
      state,
      entity.x,
      entity.y - 10,
      eligibility.blockReason ?? 'Cannot tame this creature',
      '#ef4444',
    );
    return state;
  }

  const cost = getTameFoodCost(entity.type);
  if (cost === null) return state;
  state.resources.food -= cost;
  entity.tamedBy = human.id;
  addFloatingText(state, entity.x, entity.y - 15, 'Tamed!', '#22c55e');
  logEvent(state, 'migration', `${human.name || 'A settler'} tamed a ${entity.type}`);
  return state;
}
