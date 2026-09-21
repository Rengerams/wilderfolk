/**
 * Blueberry Foraging & Bush Lifecycle Module
 *
 * Owns rare blueberry tree spawning, daily regrowth, and settler
 * opportunistic picking AI.
 */

import { addResource } from './economy';
import { getAbsoluteCalendarDay } from './dayCycle';
import { addFloatingText } from './simEffects';
import { faceVelocity } from './simulation/movementSteering';
import { EntityType, Season, MapSize } from './gameTypes';
import type { Entity, WorldState } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { findClosestEntityInRadius } from './simQueries';
import type { TickContext } from './simulation/simulationTypes';
import { createEntity } from './entityFactory';
import { indexLivingEntity } from './entityIndex';
import { getSimRng } from './simRng';

export const BLUEBERRY_MAX_YIELD = 6;
export const BLUEBERRY_FOOD_PER_PICK = 4;
export const BLUEBERRY_ENERGY_PER_PICK = 45;
export const BLUEBERRY_REGROWTH_DAYS = 4;
export const BLUEBERRY_SEARCH_RADIUS = 180;
export const BLUEBERRY_PICK_RADIUS = 18;
export const BLUEBERRY_SEARCH_STAGGER = 18;

/** AGENTS.md §8: new maps contain at most three blueberry trees. */
export const BLUEBERRY_TREE_SPAWN_BY_MAP_SIZE: Partial<Record<MapSize, number>> = {
  [MapSize.Medium]: 2,
  [MapSize.Large]: 3,
  [MapSize.Huge]: 3,
};

export function isBlueberryTree(entity: Entity | undefined): entity is Entity {
  return !!entity
    && entity.alive
    && entity.type === EntityType.Tree
    && entity.forageKind === 'blueberry';
}

export function hasRipeBlueberries(entity: Entity | undefined): entity is Entity {
  return isBlueberryTree(entity) && (entity.blueberryYield ?? 0) > 0;
}

export function clearBlueberryTarget(settler: Entity): void {
  settler.blueberryForageTargetId = undefined;
}

export type PassableCheckFn = (state: WorldState, x: number, y: number, margin?: number) => boolean;

/**
 * Places rare blueberry bushes around the founding camp site during world generation.
 */
export function spawnBlueberryTrees(
  state: WorldState,
  size: MapSize,
  campX: number,
  campY: number,
  isPassable?: PassableCheckFn,
): void {
  const rng = getSimRng('worldGen');
  const target = BLUEBERRY_TREE_SPAWN_BY_MAP_SIZE[size] ?? 2;
  let spawned = 0;
  const maxAttempts = target * 72;

  const checkPassable: PassableCheckFn = isPassable ?? ((s, x, y, margin = 18) => 
    x >= margin && y >= margin && x <= s.width - margin && y <= s.height - margin
  );

  for (let attempt = 0; attempt < maxAttempts && spawned < target; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist = 155 + rng() * Math.min(state.width, state.height) * 0.28;
    const x = campX + Math.cos(angle) * dist;
    const y = campY + Math.sin(angle) * dist;

    if (!checkPassable(state, x, y, 18)) continue;

    const tooCloseToOther = state.entities.some(
      (entity) =>
        entity.alive &&
        entity.forageKind === 'blueberry' &&
        Math.hypot(entity.x - x, entity.y - y) < 165,
    );
    if (tooCloseToOther) continue;

    const tree = createEntity(EntityType.Tree, x, y, state.nextEntityId++);
    tree.forageKind = 'blueberry';
    tree.blueberryYield = BLUEBERRY_MAX_YIELD;
    tree.blueberryNextRegrowthDay = BLUEBERRY_REGROWTH_DAYS;
    state.entities.push(tree);
    indexLivingEntity(state, tree);
    spawned++;
  }
}

/**
 * Daily owner for the slow, small blueberry renewal loop.
 * Trees do not regrow during winter and replenish one portion at a time, never above six.
 */
export function tickBlueberryRegrowth(state: WorldState): void {
  if (state.season === Season.Winter) return;
  const currentDay = getAbsoluteCalendarDay(state.tick);
  const candidateTrees = state.entityByType?.[EntityType.Tree] ?? state.entities;

  for (const entity of candidateTrees) {
    if (!isBlueberryTree(entity)) continue;

    const yieldNow = Math.max(0, Math.min(BLUEBERRY_MAX_YIELD, entity.blueberryYield ?? 0));
    entity.blueberryYield = yieldNow;

    if (yieldNow >= BLUEBERRY_MAX_YIELD) continue;
    if (entity.blueberryNextRegrowthDay != null && currentDay < entity.blueberryNextRegrowthDay) continue;

    entity.blueberryYield = yieldNow + 1;
    entity.blueberryNextRegrowthDay = currentDay + BLUEBERRY_REGROWTH_DAYS;
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
 * Realtime settler picking behavior.
 * Triggered when a settler has free time, has not eaten a meal, and is hungry.
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

  // Staggered search for the nearest ripe bush
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

  // Move towards bush
  if (distance > BLUEBERRY_PICK_RADIUS) {
    settler.vx = (dx / distance) * options.speed * 0.42;
    settler.vy = (dy / distance) * options.speed * 0.42;
    faceVelocity(settler);
    return true;
  }

  // Re-verify ripe berries exist before picking
  if (!hasRipeBlueberries(target)) {
    clearBlueberryTarget(settler);
    return false;
  }

  // Harvest 1 portion from tree
  target.blueberryYield = Math.max(0, (target.blueberryYield ?? 0) - 1);

  // Maintain regrowth schedule (don't push back existing timer if one is already counting down)
  const currentDay = getAbsoluteCalendarDay(state.tick);
  if (target.blueberryNextRegrowthDay == null || target.blueberryNextRegrowthDay <= currentDay) {
    target.blueberryNextRegrowthDay = currentDay + BLUEBERRY_REGROWTH_DAYS;
  }

  // Settler eats the berries and restores energy
  settler.energy = Math.min(settler.maxEnergy, settler.energy + BLUEBERRY_ENERGY_PER_PICK);
  settler.vx = 0;
  settler.vy = 0;
  clearBlueberryTarget(settler);

  // Surplus goes to colony storage if space permits
  const addedFood = addResource(state, 'food', BLUEBERRY_FOOD_PER_PICK);

  const label = addedFood > 0
    ? `Picked blueberries +${addedFood}`
    : 'Ate wild blueberries';
  const textY = target.y - (target.size ?? 16) * 1.2;
  addFloatingText(state, target.x, textY, label, '#60a5fa');

  return true;
}