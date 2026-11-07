
import type { Entity } from '../gameTypes';
import { EntityType } from '../gameTypes';
import { isPlayerHuman } from '../playerHuman';
import {
  isDialogueBusy,
  type ChatSpeaker,
  type HumanChatContext,
  type ChatPickOptions,
} from '../humanChat';
import { maybeDialogueChat } from '../dialogueTrees';
import {
  forEachAdaptiveInRadius,
  socialAdaptiveOptions,
  SOCIAL_STAGGER,
  SOCIAL_BANTER_RADIUS,
} from '../adaptiveSpatialQuery';
import type { EntitySpatialGrid } from '../spatialGrid';

/**
 * Pair banter — only the lower-ID side initiates the roll,
 * guaranteeing pairs never double-fire in the same tick.
 */
export function simSettlerPairChat(
  entityA: Entity,
  entityB: Entity,
  context: HumanChatContext,
  chance: number,
  tick: number,
  chatHints: ChatPickOptions,
): void {
  if (entityA.id < entityB.id) {
    maybeDialogueChat(entityA, entityB, context, tick, chance, chatHints);
  }
}

/**
 * Scans for nearby human settlers for ambient conversation.
 * Prioritizes domestic partners, immediate children/parents, and workplace colleagues.
 */
export function simAmbientChatNeighbors(
  self: Entity,
  tick: number,
  humanSocialGrid: EntitySpatialGrid | undefined,
  allHumans: Entity[],
  width: number,
  height: number,
): Entity[] {
  // 1. Guard checks: stagger ticks and avoid queries if self cannot converse
  if (!self.alive || self.prisonBuildingId != null || isDialogueBusy(self)) {
    return [];
  }
  if ((tick + self.id) % SOCIAL_STAGGER !== 0) {
    return [];
  }

  const preferred: Entity[] = [];
  const standard: Entity[] = [];

  forEachAdaptiveInRadius(
    humanSocialGrid,
    allHumans,
    self.x,
    self.y,
    SOCIAL_BANTER_RADIUS,
    (other) => {
      if (
        other.id !== self.id &&
        other.alive &&
        other.prisonBuildingId == null &&
        other.type === EntityType.Human &&
        isPlayerHuman(other) &&
        !isDialogueBusy(other)
      ) {
        // High-priority social bonds
        const isPartner = self.partnerId === other.id || other.partnerId === self.id;
        const isKin =
          other.motherId === self.id ||
          other.fatherId === self.id ||
          self.motherId === other.id ||
          self.fatherId === other.id ||
          (self.childrenIds?.includes(other.id) ?? false) ||
          (other.childrenIds?.includes(self.id) ?? false);
        const isCoworker =
          self.workerBuildingId != null &&
          other.workerBuildingId === self.workerBuildingId;

        if (isPartner || isKin || isCoworker) {
          preferred.push(other);
        } else {
          standard.push(other);
        }
      }
    },
    socialAdaptiveOptions('social', allHumans.length, width, height),
  );

  // Close bonds sort first and are **id-stable within each tier** — order is part of the contract,
  // because callers index this list with a seeded roll.
  const byId = (a: ChatSpeaker, b: ChatSpeaker): number => a.id - b.id;
  preferred.sort(byId);
  standard.sort(byId);
  for (let i = 0; i < standard.length; i++) {
    preferred.push(standard[i]);
  }
  return preferred;
}
