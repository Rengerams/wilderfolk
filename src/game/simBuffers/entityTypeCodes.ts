
import { EntityType, type EntityType as EntityTypeName } from '../gameTypes';

/** Stable numeric codes for render SoA rows (append-only when adding species). */
export const ENTITY_TYPE_CODE: Record<EntityTypeName, number> = {
  [EntityType.Grass]: 0,
  [EntityType.Rabbit]: 1,
  [EntityType.Deer]: 2,
  [EntityType.Wolf]: 3,
  [EntityType.Fox]: 4,
  [EntityType.Human]: 5,
  [EntityType.Tree]: 6,
  [EntityType.Werewolf]: 7,
  [EntityType.Wildkin]: 8,
};

/**
 * Reverse map, derived from the forward one so the two can never drift: a hand-written map silently
 * missed a new `EntityType`, and every entity of that species became invisible.
 */
export const ENTITY_CODE_TO_TYPE: Record<number, EntityTypeName> = Object.fromEntries(
  Object.entries(ENTITY_TYPE_CODE).map(([type, code]) => [code, type as EntityTypeName]),
);

/** Reserved wire code — never mapped to a real species. */
export const UNKNOWN_ENTITY_TYPE_CODE = 255;

export function entityTypeToCode(type: EntityTypeName): number {
  return ENTITY_TYPE_CODE[type] ?? UNKNOWN_ENTITY_TYPE_CODE;
}

export function isKnownEntityTypeCode(code: number): boolean {
  return Object.prototype.hasOwnProperty.call(ENTITY_CODE_TO_TYPE, code);
}

export function codeToEntityType(code: number): EntityTypeName | null {
  return ENTITY_CODE_TO_TYPE[code] ?? null;
}