/**
 * F22 — toasts could never auto-expire (`docs/private/audits/2026-09-16/ui-logic.md`, tracked in
 * `LIVE-FINDINGS-STATUS.md`; the audit filed it as SUSPECTED — reading the reconciliation makes it
 * confirmed).
 *
 * Two mechanisms expire a toast: the 2 s sweep (`expireNotifications`, `NOTIFICATION_LIFETIME_MS`) and a
 * per-toast 12 s timer that calls `dismissNotification`. Only `dismissNotification` recorded the id, and
 * the display world is rebuilt from the worker every tick with
 * `simDelta.preserveNotificationDismissals`, which filters on that ledger alone — so the sweep's removal
 * was undone by the very next delta, the reconciliation effect then cancelled the restored toast's timer,
 * a fresh timer was armed, and the sweep removed it again. The observable defect is a toast that blinks
 * out and back every ~2 s and never leaves by itself.
 */
import { describe, expect, it } from 'vitest';
import { expireNotifications, NOTIFICATION_DISPLAY_MS } from '../src/hooks/useTransientGameFeedback';
import { preserveNotificationDismissals } from '../src/game/simBuffers/simDelta';
import type { WorldState } from '../src/game/gameTypes';

const NOW = 1_000_000_000;

function toast(id: string, ageMs: number): WorldState['notifications'][number] {
  return { id, message: `toast ${id}`, createdAt: NOW - ageMs } as WorldState['notifications'][number];
}

function worldWith(notifications: WorldState['notifications'], dismissed: string[] = []) {
  return { notifications, dismissedNotificationIds: dismissed } as Pick<
    WorldState,
    'notifications' | 'dismissedNotificationIds'
  >;
}

describe('an expired toast is dismissed for good, not just removed once', () => {
  it('records the ids it drops, so the next worker delta cannot restore them', () => {
    const world = worldWith([toast('old', NOTIFICATION_DISPLAY_MS + 500)], []);
    expireNotifications(world, NOW);

    expect(world.notifications).toHaveLength(0);
    expect(world.dismissedNotificationIds, 'the sweep left no ledger entry').toEqual(['old']);

    // The consequence that matters: the same notification arriving in a worker delta stays filtered.
    expect(preserveNotificationDismissals([toast('old', 0)], world.dismissedNotificationIds)).toHaveLength(0);
  });

  it('leaves a fresh toast alone, and keeps the ledger otherwise untouched', () => {
    const world = worldWith([toast('old', NOTIFICATION_DISPLAY_MS + 500), toast('fresh', 1_000)], ['already']);
    expireNotifications(world, NOW);

    expect(world.notifications.map((n) => n.id)).toEqual(['fresh']);
    expect(world.dismissedNotificationIds).toEqual(['already', 'old']);
    // A toast that never arrives again is not resurrected by the delta filter either.
    expect(preserveNotificationDismissals([toast('fresh', 0)], world.dismissedNotificationIds)).toHaveLength(1);
  });

  it('does nothing when every toast is still live', () => {
    const world = worldWith([toast('fresh', 10)], []);
    expireNotifications(world, NOW);
    expect(world.notifications).toHaveLength(1);
    expect(world.dismissedNotificationIds).toEqual([]);
  });
});
