import type { Entity } from './gameTypes';

/** Hidden property for the relationship-record revision (worker delta transport). */
export const RELATIONSHIP_REVISION = '__relationshipRevision';
/** Hidden property for the rarely-written profile fields (skills, traits, career, bonds). */
export const PROFILE_REVISION = '__profileRevision';

/** Read a runtime-only revision; the property is non-enumerable, so saves and spreads skip it. */
export function revisionOf(entity: Entity, property: string): number {
  return (entity as unknown as Record<string, number>)[property] ?? 0;
}

/** Bump a runtime-only revision after a field's owner changed the value. */
export function bumpRevision(entity: Entity, property: string): void {
  Object.defineProperty(entity, property, {
    value: revisionOf(entity, property) + 1,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
