/**
 * An expired toast must be recorded in `dismissedNotificationIds`, so the next worker
 * delta cannot restore it.
 */
import { describe, expect, it } from 'vitest';
import {
  expireBigNews,
  expireNotifications,
  hasExpiredBigNews,
  hasExpiredNotifications,
  NOTIFICATION_DISPLAY_MS,
  getVisibleNotifications,
  reconcileNotificationVisibility,
  dismissNotifications,
} from '../src/hooks/useTransientGameFeedback';
import { addNotification, MAX_PENDING_NOTIFICATIONS, preserveNotificationDismissals } from '../src/game/simEffects';
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
    expireNotifications(world, new Map([['old', NOW - NOTIFICATION_DISPLAY_MS]]), NOW);

    expect(world.notifications).toHaveLength(0);
    expect(world.dismissedNotificationIds, 'the sweep left no ledger entry').toEqual(['old']);

    // The consequence that matters: the same notification arriving in a worker delta stays filtered.
    expect(preserveNotificationDismissals([toast('old', 0)], world.dismissedNotificationIds)).toHaveLength(0);
  });

  it('leaves a fresh toast alone, and keeps the ledger otherwise untouched', () => {
    const world = worldWith([toast('old', NOTIFICATION_DISPLAY_MS + 500), toast('fresh', 1_000)], ['already']);
    expireNotifications(world, new Map([['old', NOW - NOTIFICATION_DISPLAY_MS], ['fresh', NOW - 1_000]]), NOW);

    expect(world.notifications.map((n) => n.id)).toEqual(['fresh']);
    expect(world.dismissedNotificationIds).toEqual(['already', 'old']);
    // A toast that never arrives again is not resurrected by the delta filter either.
    expect(preserveNotificationDismissals([toast('fresh', 0)], world.dismissedNotificationIds)).toHaveLength(1);
  });

  it('does nothing when every toast is still live', () => {
    const world = worldWith([toast('fresh', 10)], []);
    expireNotifications(world, new Map([['fresh', NOW - 10]]), NOW);
    expect(world.notifications).toHaveLength(1);
    expect(world.dismissedNotificationIds).toEqual([]);
  });
});

describe('transient timer sweeps avoid no-op world notifications', () => {
  it('only runs notification cleanup when a toast has expired', () => {
    const world = worldWith([toast('recent', 100)]);
    const recent = new Map([['recent', NOW - 100]]);
    const cutoff = new Map([['at-cutoff', NOW - NOTIFICATION_DISPLAY_MS]]);
    expect(hasExpiredNotifications(world, recent, NOW)).toBe(false);
    expect(hasExpiredNotifications(worldWith([]), cutoff, NOW)).toBe(false);
    expect(hasExpiredNotifications(worldWith([toast('at-cutoff', NOTIFICATION_DISPLAY_MS)]), cutoff, NOW)).toBe(true);
    expireNotifications(world, recent, NOW);
    expect(hasExpiredNotifications(world, recent, NOW)).toBe(false);
  });

  it('only runs Big News cleanup when dismissal or removal is due', () => {
    const world = {
      tick: 400,
      bigNews: [
        { id: 'fresh', createdAt: 40, dismissed: false },
        { id: 'dismissed', createdAt: 0, dismissed: true },
      ],
    } as Pick<WorldState, 'bigNews' | 'tick'>;
    expect(hasExpiredBigNews({ tick: 400, bigNews: [] })).toBe(false);
    expect(hasExpiredBigNews(world)).toBe(false);
    world.tick = 401;
    expect(hasExpiredBigNews(world)).toBe(true);
    expireBigNews(world);
    expect(world.bigNews.find((news) => news.id === 'fresh')?.dismissed).toBe(true);
    expect(hasExpiredBigNews(world)).toBe(false);
    world.tick = 641;
    expect(hasExpiredBigNews(world)).toBe(true);
    expireBigNews(world);
    expect(world.bigNews).toHaveLength(0);
    expect(hasExpiredBigNews(world)).toBe(false);
  });
});

describe('the HUD presents queued notifications before their display lifetime begins', () => {
  it('keeps the first four stable, then gives previously hidden cards their own full lifetime', () => {
    const world = worldWith(Array.from({ length: 7 }, (_, index) =>
      toast(String(index + 1), NOTIFICATION_DISPLAY_MS * 10)));
    const visibleSince = new Map<string, number>();
    const first = getVisibleNotifications(world.notifications, true);
    expect(first.map((note) => note.id)).toEqual(['1', '2', '3', '4']);
    reconcileNotificationVisibility(visibleSince, first, NOW);
    world.notifications.push(toast('8', 0));
    expect(getVisibleNotifications(world.notifications, true).map((note) => note.id))
      .toEqual(['1', '2', '3', '4']);

    expect(hasExpiredNotifications(world, visibleSince, NOW + NOTIFICATION_DISPLAY_MS - 1)).toBe(false);
    expireNotifications(world, visibleSince, NOW + NOTIFICATION_DISPLAY_MS);
    expect(world.dismissedNotificationIds).toEqual(['1', '2', '3', '4']);
    expect(world.notifications.map((note) => note.id)).toEqual(['5', '6', '7', '8']);

    const next = getVisibleNotifications(world.notifications, true);
    reconcileNotificationVisibility(visibleSince, next, NOW + NOTIFICATION_DISPLAY_MS);
    expect(hasExpiredNotifications(world, visibleSince, NOW + NOTIFICATION_DISPLAY_MS * 2 - 1)).toBe(false);
    expireNotifications(world, visibleSince, NOW + NOTIFICATION_DISPLAY_MS * 2);
    expect(world.notifications).toHaveLength(0);
    expect(world.dismissedNotificationIds).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('manual dismissal opens a slot without restarting the other visible cards', () => {
    const world = worldWith(['1', '2', '3', '4', '5'].map((id) => toast(id, 0)));
    const visibleSince = new Map<string, number>();
    reconcileNotificationVisibility(visibleSince, getVisibleNotifications(world.notifications, true), NOW);
    dismissNotifications(world, ['2']);
    reconcileNotificationVisibility(visibleSince, getVisibleNotifications(world.notifications, true), NOW + 1000);
    expect(visibleSince.get('1')).toBe(NOW);
    expect(visibleSince.get('5')).toBe(NOW + 1000);
    expect(visibleSince.has('2')).toBe(false);
    expect(preserveNotificationDismissals([toast('2', 0)], world.dismissedNotificationIds)).toHaveLength(0);
    expect(getVisibleNotifications(world.notifications, false)).toEqual([]);
  });
});

describe('the simulation notification queue handles extreme bursts explicitly', () => {
  it('keeps the visible head and bounds the queue with a counted overflow summary', () => {
    const world = { tick: 10, notifications: [] } as unknown as WorldState;
    for (let i = 0; i < MAX_PENDING_NOTIFICATIONS; i++) {
      addNotification(world, 'Event', `notice ${i}`);
    }
    const originalHead = getVisibleNotifications(world.notifications, true).map((note) => note.id);
    addNotification(world, 'Event', 'overflow one');
    const summaryId = world.notifications.at(-1)?.id;
    addNotification(world, 'Event', 'overflow two');
    expect(world.notifications).toHaveLength(MAX_PENDING_NOTIFICATIONS);
    expect(getVisibleNotifications(world.notifications, true).map((note) => note.id)).toEqual(originalHead);
    expect(world.notifications.at(-1)).toMatchObject({ id: summaryId, overflowCount: 3 });
    expect(world.notifications.at(-1)?.message).toContain('3 notifications');
    dismissNotifications(world, originalHead);
    addNotification(world, 'Event', 'fresh notice');
    expect(world.notifications.at(-1)?.message).toBe('fresh notice');
  });
});
