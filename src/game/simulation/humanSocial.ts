/**
 * Human social — ambient dialogue, pair banter, and nearby-chat scanning.
 * Extracted verbatim from humanTick.ts (humanTick-split plan, Task 3) — behavior unchanged.
 * The tick loop keeps thin adapters that bind loop-local state (tick, chatHints, grids).
 */
import type { Entity } from '../gameTypes';
import { EntityType } from '../gameTypes';
import { isPlayerHuman } from '../playerHuman';
import { isDialogueBusy, maybeDialogueChat, type HumanChatContext, type ChatPickOptions } from '../humanChat';
import {
  forEachAdaptiveInRadius,
  socialAdaptiveOptions,
  SOCIAL_STAGGER,
  SOCIAL_BANTER_RADIUS,
} from '../adaptiveSpatialQuery';
import type { EntitySpatialGrid } from '../spatialGrid';

/** Single-sided dialogue roll — partner may be null (self-directed line). */
export function simSettlerChat(
  entity: Entity,
  partner: Entity | null,
  context: HumanChatContext,
  chance: number,
  tick: number,
  chatHints: ChatPickOptions,
): void {
  maybeDialogueChat(entity, partner, context, tick, chance, chatHints);
}

/** Pair banter — only the lower-id side rolls, so pairs never double-fire. */
export function simSettlerPairChat(
  entityA: Entity,
  entityB: Entity,
  context: HumanChatContext,
  chance: number,
  tick: number,
  chatHints: ChatPickOptions,
): void {
  if (entityA.id < entityB.id) simSettlerChat(entityA, entityB, context, chance, tick, chatHints);
}

/** Nearby humans for random pair banter — prefer partner, kids, coworkers. */
export function simAmbientChatNeighbors(
  self: Entity,
  tick: number,
  humanSocialGrid: EntitySpatialGrid | undefined,
  allHumans: Entity[],
  width: number,
  height: number,
): Entity[] {
  // Ambient banter is staggered — each human scans 1 in SOCIAL_STAGGER ticks.
  if ((tick + self.id) % SOCIAL_STAGGER !== 0) return [];
  const out: Entity[] = [];
  const prefer: Entity[] = [];
  forEachAdaptiveInRadius(
    humanSocialGrid,
    allHumans,
    self.x,
    self.y,
    SOCIAL_BANTER_RADIUS,
    (other) => {
      if (
        other.id !== self.id
        && other.alive
        && other.type === EntityType.Human
        && isPlayerHuman(other)
        && !isDialogueBusy(other)
      ) {
        const isPartner = self.partnerId === other.id || other.partnerId === self.id;
        const isKid = (self.childrenIds ?? []).includes(other.id)
          || (other.childrenIds ?? []).includes(self.id);
        const isCoworker = self.homeBuildingId != null
          && other.homeBuildingId === self.homeBuildingId;
        if (isPartner || isKid || isCoworker) prefer.push(other);
        else out.push(other);
      }
    },
    socialAdaptiveOptions('social', allHumans.length, width, height),
  );
  // Bonds first so dialogue trees fire between people who share a life.
  return prefer.length > 0 ? [...prefer, ...out] : out;
}
