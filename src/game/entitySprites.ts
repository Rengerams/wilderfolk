import { EntityType, type Entity } from './gameTypes';
import { HUMAN_WORLD_HEIGHT } from './humanSprites';

/** Visual heights in world units — tuned vs house (40wu) and settler (20wu). */
export const ANIMAL_WORLD_HEIGHT: Partial<Record<EntityType, number>> = {
  [EntityType.Rabbit]: HUMAN_WORLD_HEIGHT * 0.4,
  [EntityType.Fox]: HUMAN_WORLD_HEIGHT * 0.58,
  [EntityType.Wolf]: HUMAN_WORLD_HEIGHT * 0.7,
  [EntityType.Werewolf]: HUMAN_WORLD_HEIGHT * 0.88,
  [EntityType.Deer]: HUMAN_WORLD_HEIGHT * 0.8,
  [EntityType.Wildkin]: HUMAN_WORLD_HEIGHT * 0.8,
};

const ANIMAL_MIN_SCREEN_PX: Partial<Record<EntityType, number>> = {
  [EntityType.Rabbit]: 18,
  [EntityType.Fox]: 22,
  [EntityType.Wolf]: 24,
  [EntityType.Werewolf]: 26,
  [EntityType.Deer]: 24,
  [EntityType.Wildkin]: 24,
};

/** Y anchor for quadruped sprites (feet near bottom of art). */
export const ANIMAL_SPRITE_ANCHOR_Y = 0.88;

export interface AnimalSpriteMetrics {
  spriteH: number;
  shadowW: number;
  shadowY: number;
}

export function getAnimalSpriteMetrics(entity: Entity, camZoom: number): AnimalSpriteMetrics {
  const baseH = ANIMAL_WORLD_HEIGHT[entity.type] ?? HUMAN_WORLD_HEIGHT * 0.65;
  const worldH = entity.isJuvenile ? baseH * 0.72 : baseH;
  const minPx = ANIMAL_MIN_SCREEN_PX[entity.type] ?? 22;
  const spriteH = Math.max(minPx, worldH * camZoom);
  const shadowW = spriteH * 0.55;
  const shadowY = spriteH * 0.12;
  return { spriteH, shadowW, shadowY };
}