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
} from '../src/hooks/useTransientGameFeedback';
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

describe('transient timer sweeps avoid no-op world notifications', () => {
  it('only runs notification cleanup when a toast has expired', () => {
    const world = worldWith([toast('recent', 100)]);
    expect(hasExpiredNotifications(world, NOW)).toBe(false);
    expect(hasExpiredNotifications(worldWith([]), NOW)).toBe(false);
    expect(hasExpiredNotifications(worldWith([toast('at-cutoff', NOTIFICATION_DISPLAY_MS)]), NOW)).toBe(true);
    expireNotifications(world, NOW);
    expect(hasExpiredNotifications(world, NOW)).toBe(false);
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
