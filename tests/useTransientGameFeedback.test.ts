import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  expireBigNews,
  expireNotifications,
  getBigNewsAutoDismissIds,
  getPendingChapterMoment,
} from '../src/hooks/useTransientGameFeedback';
import { VALLEY_CHAPTERS } from '../src/game/valleyChronicle';

describe('transient game feedback', () => {
  it('preserves big-news dismissal and removal thresholds', () => {
    const world = initGame();
    world.tick = 700;
    world.bigNews = [
      { id: 'fresh', createdAt: 341, dismissed: false },
      { id: 'dismiss-now', createdAt: 339, dismissed: false },
      { id: 'remove-now', createdAt: 100, dismissed: true },
    ] as typeof world.bigNews;

    expireBigNews(world);

    expect(world.bigNews).toEqual([
      expect.objectContaining({ id: 'fresh', dismissed: false }),
      expect.objectContaining({ id: 'dismiss-now', dismissed: true }),
    ]);
  });

  it('keeps every active Big News item eligible for wall-clock dismissal regardless of banner visibility', () => {
    const world = initGame();
    world.bigNews = [
      { id: 'covered-by-priority-overlay', createdAt: 1, dismissed: false },
      { id: 'locally-hidden', createdAt: 2, dismissed: false },
      { id: 'already-dismissed', createdAt: 3, dismissed: true },
    ] as typeof world.bigNews;

    expect(getBigNewsAutoDismissIds(world, new Set(['locally-hidden']))).toEqual([
      'covered-by-priority-overlay',
    ]);
  });

  it('removes only notifications at or beyond the existing display-lifetime cutoff', () => {
    const world = initGame();
    world.notifications = [
      { id: 'keep', createdAt: 8_001 },
      { id: 'remove', createdAt: 8_000 },
    ] as typeof world.notifications;

    expireNotifications(world, 20_000);

    expect(world.notifications).toEqual([expect.objectContaining({ id: 'keep' })]);
  });

  it('derives the latest undismissed Valley Chronicle moment without writing to the world', () => {
    const world = initGame();
    const chapter = VALLEY_CHAPTERS[0];
    if (!chapter) throw new Error('Expected at least one Valley Chronicle chapter');
    world.chronicleChapters = [chapter.id];

    expect(getPendingChapterMoment(world, null)).toEqual(chapter);
    expect(getPendingChapterMoment(world, chapter.id)).toBeNull();
    expect(world.chronicleChapters).toEqual([chapter.id]);
  });
});
