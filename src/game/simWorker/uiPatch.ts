import type { WorldState } from '../gameTypes';
import type { WorkerUiPatch } from './GameWorkerHost';

/**
 * Apply a main-thread UI patch to the worker's authoritative world.
 *
 * `bigNews`, `floatingTexts`, `activeEvent` and `nextFloatingTextId` are authored by the **tick** on
 * the worker side, while a patch is composed from the host's snapshot — which can be up to
 * `MAX_PIPELINE_DEPTH` (4) ticks behind because ticks are pipelined and applied one message at a
 * time. Assigning them wholesale therefore rewound the worker and destroyed events the player had
 * not seen yet: a Big News banner flashed for one tick and vanished, and an event card (raid, story)
 * could be replaced by `null` before it was answered, while `nextFloatingTextId` could move
 * backwards and reuse floating-text ids (worker-boundary audit F2).
 *
 * Only the fields the player authors are adopted here. The worker keeps its own presentation state;
 * the floating-text id allocator may only move forward, so a stale patch can never hand out an id
 * twice.
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
