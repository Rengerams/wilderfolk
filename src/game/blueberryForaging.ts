import { addResource } from './economy';
import { getAbsoluteCalendarDay } from './dayCycle';
import { addFloatingText } from './simEffects';
import { EntityType, Season } from './gameTypes';
import type { Entity, WorldState } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { findClosestEntityInRadius } from './simQueries';
import type { TickContext } from './simulation/simulationTypes';

export const BLUEBERRY_MAX_YIELD = 6;
export const BLUEBERRY_FOOD_PER_PICK = 4;
export const BLUEBERRY_ENERGY_PER_PICK = 45;
export const BLUEBERRY_REGROWTH_DAYS = 4;
export const BLUEBERRY_SEARCH_RADIUS = 180;
export const BLUEBERRY_PICK_RADIUS = 18;
export const BLUEBERRY_SEARCH_STAGGER = 18;

export function isBlueberryTree(entity: Entity | undefined): entity is Entity {
  return !!entity
    && entity.alive
    && entity.type === EntityType.Tree
    && entity.forageKind === 'blueberry';
}

export function hasRipeBlueberries(entity: Entity | undefined): entity is Entity {
  return isBlueberryTree(entity) && (entity.blueberryYield ?? 0) > 0;
}

function clearBlueberryTarget(settler: Entity): void {
  settler.blueberryForageTargetId = undefined;
}

/**
 * Daily owner for the slow, small blueberry renewal loop. Trees do not produce
 * berries during winter and replenish one portion at a time, never above six.
 */
export function tickBlueberryRegrowth(state: WorldState): void {
  if (state.season === Season.Winter) return;
  const day = getAbsoluteCalendarDay(state.tick);
  for (const entity of state.entities) {
    if (!isBlueberryTree(entity)) continue;
    const yieldNow = Math.max(0, Math.min(BLUEBERRY_MAX_YIELD, entity.blueberryYield ?? 0));
    entity.blueberryYield = yieldNow;
    if (yieldNow >= BLUEBERRY_MAX_YIELD) continue;
    if (day < (entity.blueberryNextRegrowthDay ?? day + BLUEBERRY_REGROWTH_DAYS)) continue;

    entity.blueberryYield = yieldNow + 1;
    entity.blueberryNextRegrowthDay = day + BLUEBERRY_REGROWTH_DAYS;
  }
}

export interface BlueberryForagingOptions {
  /** The existing human behavior owner has already determined this settler is free to roam. */
  freeTime: boolean;
  ateMeal: boolean;
  festivalGathering: boolean;
  famine: boolean;
  speed: number;
}

/**
 * Realtime follower/pick behavior only. HumanTick owns the larger routine
 * priority; this owner never searches the whole map and never takes over work,
 * school, meals, festivals, or urgent famine hunting.
 */
export function tryTickBlueberryForaging(
  state: WorldState,
  ctx: TickContext,
  settler: Entity,
  options: BlueberryForagingOptions,
): boolean {
  const hungry = settler.energy < settler.maxEnergy * 0.72;
  if (
    !options.freeTime
    || options.ateMeal
    || options.festivalGathering
    || options.famine
    || !isPlayerHuman(settler)
    || !hungry
  ) {
    clearBlueberryTarget(settler);
    return false;
  }

  let target = settler.blueberryForageTargetId == null
    ? undefined
    : ctx.entityById.get(settler.blueberryForageTargetId);
  if (!hasRipeBlueberries(target)) {
    clearBlueberryTarget(settler);
    target = undefined;
  }

  if (!target && (state.tick + settler.id) % BLUEBERRY_SEARCH_STAGGER === 0) {
    const hit = findClosestEntityInRadius(
      ctx.treeGrid,
      settler.x,
      settler.y,
      BLUEBERRY_SEARCH_RADIUS,
      (tree) => hasRipeBlueberries(tree),
      'social',
      ctx.byType[EntityType.Tree],
    );
    target = hit ?? undefined;
    if (target) settler.blueberryForageTargetId = target.id;
  }
  if (!target) return false;

  const dx = target.x - settler.x;
  const dy = target.y - settler.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (distance > BLUEBERRY_PICK_RADIUS) {
    settler.vx = (dx / distance) * options.speed * 0.42;
    settler.vy = (dy / distance) * options.speed * 0.42;
    settler.spriteAngle = Math.atan2(settler.vy, settler.vx);
    return true;
  }

  const addedFood = addResource(state, 'food', BLUEBERRY_FOOD_PER_PICK);
  if (addedFood <= 0) {
    clearBlueberryTarget(settler);
    return false;
  }

  target.blueberryYield = Math.max(0, (target.blueberryYield ?? 0) - 1);
  target.blueberryNextRegrowthDay = getAbsoluteCalendarDay(state.tick) + BLUEBERRY_REGROWTH_DAYS;
  settler.energy = Math.min(settler.maxEnergy, settler.energy + BLUEBERRY_ENERGY_PER_PICK);
  settler.vx = 0;
  settler.vy = 0;
  clearBlueberryTarget(settler);
  addFloatingText(state, target.x, target.y - target.size * 1.2, `Picked blueberries +${addedFood}`, '#60a5fa');
  return true;
}
