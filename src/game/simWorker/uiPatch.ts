import type { WorldState } from '../gameTypes';
import type { WorkerUiPatch } from './GameWorkerHost';

/**
 * Apply a main-thread UI patch to the worker's authoritative world. Only the fields the player authors
 * are adopted: a patch can be four ticks stale, so the worker's own presentation state is never taken.
 */
export function applyWorkerUiPatch(world: WorldState, patch: WorkerUiPatch): void {
  if (patch.autoSave !== undefined) world.autoSave = patch.autoSave;
  if (patch.dismissedBigNewsIds !== undefined) world.dismissedBigNewsIds = patch.dismissedBigNewsIds;
  if (patch.dismissedNotificationIds !== undefined) {
    world.dismissedNotificationIds = patch.dismissedNotificationIds;
  }
  if (patch.dismissedActiveEventIds !== undefined) {
    world.dismissedActiveEventIds = patch.dismissedActiveEventIds;
  }
  if (patch.tutorialSeen !== undefined) world.tutorialSeen = patch.tutorialSeen;
  if (patch.nextFloatingTextId !== undefined) {
    world.nextFloatingTextId = Math.max(world.nextFloatingTextId ?? 0, patch.nextFloatingTextId);
  }
}
