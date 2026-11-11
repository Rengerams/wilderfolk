import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { WorldState } from '../game/gameEngine';
import { GameLoop } from '../game/gameLoop';
import type { MomentCardData } from '../components/MomentTitleCard';
import { VALLEY_CHAPTERS } from '../game/valleyChronicle';

export const BIG_NEWS_DISPLAY_MS = 8_000;
/**
 * Wall-clock lifetime of an ordinary notification toast; without a timer, notifications left only
 * when clicked and otherwise piled up.
 */
export const NOTIFICATION_DISPLAY_MS = 12_000;
const BIG_NEWS_DISMISS_AFTER_TICKS = 360;
const BIG_NEWS_REMOVE_AFTER_TICKS = 600;
const BIG_NEWS_CLEANUP_INTERVAL_MS = 1_000;
const NOTIFICATION_CLEANUP_INTERVAL_MS = 2_000;
/**
 * Cap on the persisted dismissal ledger: it is copied into every UI patch and diffed per tick, so
 * it must stay bounded — but a tail cap above the simulation's 20-toast window can never resurrect one.
 */
const MAX_DISMISSED_NOTIFICATION_IDS = 50;

/**
 * Cap on the persisted Big News / active-event dismissal ledgers — the same tail cap as the
 * notification ledger, above the 50-entry live window, so a dropped id is long gone.
 */
const MAX_DISMISSED_BIG_NEWS_IDS = 50;
const MAX_DISMISSED_ACTIVE_EVENT_IDS = 50;

export interface UseTransientGameFeedbackOptions {
  world: WorldState;
  worldRef: RefObject<WorldState>;
  loopRef: RefObject<GameLoop | null>;
  onFeedbackInteraction: () => void;
}

/** True only when the next Big News sweep would change the world. */
export function hasExpiredBigNews(world: Pick<WorldState, 'bigNews' | 'tick'>): boolean {
  const now = world.tick;
  return (world.bigNews ?? []).some((news) => {
    const age = now - news.createdAt;
    return news.dismissed
      ? age >= BIG_NEWS_REMOVE_AFTER_TICKS
      : age > BIG_NEWS_DISMISS_AFTER_TICKS;
  });
}

/** Removes expired big-news records using the simulation-tick retention thresholds. */
export function expireBigNews(world: Pick<WorldState, 'bigNews' | 'tick'>): void {
  if (!world.bigNews || world.bigNews.length === 0) return;
  const now = world.tick;

  const updated = world.bigNews
    .map((news) => ({
      ...news,
      dismissed: news.dismissed || now - news.createdAt > BIG_NEWS_DISMISS_AFTER_TICKS,
    }))
    .filter((news) => !news.dismissed || now - news.createdAt < BIG_NEWS_REMOVE_AFTER_TICKS);

  const changed =
    updated.length !== world.bigNews.length ||
    updated.some((news, index) => news.dismissed !== world.bigNews[index]?.dismissed);

  if (changed) {
    world.bigNews = updated;
  }
}

/** Lists undismissed Big News records requiring wall-clock auto-dismissal. */
export function getBigNewsAutoDismissIds(
  world: Pick<WorldState, 'bigNews'>,
  hiddenBigNewsIds: ReadonlySet<string> = new Set(),
): string[] {
  return (world.bigNews ?? [])
    .filter((news) => !news.dismissed && !hiddenBigNewsIds.has(news.id))
    .map((news) => news.id);
}

/** True only when the notification sweep would dismiss at least one toast. */
export function hasExpiredNotifications(
  world: Pick<WorldState, 'notifications'>,
  now = Date.now(),
): boolean {
  const cutoff = now - NOTIFICATION_DISPLAY_MS;
  return (world.notifications ?? []).some((notification) => notification.createdAt <= cutoff);
}

/**
 * Removes notifications past the wall-clock display lifetime, **recording their ids** so the next
 * worker delta cannot restore a toast the player already saw leave.
 */
export function expireNotifications(
  world: Pick<WorldState, 'notifications' | 'dismissedNotificationIds'>,
  now = Date.now(),
): void {
  if (!world.notifications || world.notifications.length === 0) return;
  // One lifetime, one name: the sweeper cutoff and the per-toast timer both read `NOTIFICATION_DISPLAY_MS`.
  const cutoff = now - NOTIFICATION_DISPLAY_MS;
  const expired = world.notifications.filter((notification) => notification.createdAt <= cutoff);
  if (expired.length === 0) return;

  const dismissed = new Set(world.dismissedNotificationIds ?? []);
  for (const notification of expired) dismissed.add(notification.id);
  // Same ordering and cap as `dismissNotification`: newest last, oldest dropped past the window.
  world.dismissedNotificationIds = Array.from(dismissed).slice(-MAX_DISMISSED_NOTIFICATION_IDS);
  world.notifications = world.notifications.filter((notification) => notification.createdAt > cutoff);
}

/** Resolves the latest undismissed Valley Chronicle moment for presentation. */
export function getPendingChapterMoment(
  world: Pick<WorldState, 'chronicleChapters'>,
  dismissedChapter: string | null,
): MomentCardData | null {
  const ids = world.chronicleChapters ?? [];
  const last = ids.length > 0 ? ids[ids.length - 1] : null;
  if (!last || last === dismissedChapter) return null;
  return VALLEY_CHAPTERS.find((chapter) => chapter.id === last) ?? null;
}

/**
 * Owns transient player feedback (banners, notifications, cards).
 * Preserves worker-thread authority over permanent WorldState mutations.
 */
export function useTransientGameFeedback({
  world,
  worldRef,
  loopRef,
  onFeedbackInteraction,
}: UseTransientGameFeedbackOptions) {
  const [dismissedChapter, setDismissedChapter] = useState<string | null>(null);
  const [hiddenBigNewsIds, setHiddenBigNewsIds] = useState<ReadonlySet<string>>(() => new Set());
  const [hiddenActiveEventIds, setHiddenActiveEventIds] = useState<ReadonlySet<string>>(() => new Set());

  const bigNewsTimersRef = useRef<Map<string, number>>(new Map());
  const dismissBigNewsItemRef = useRef<(id: string, playFeedback?: boolean) => void>(() => {});
  /** One wall-clock timer per on-screen notification, mirroring the Big News timers. */
  const notificationTimersRef = useRef<Map<string, number>>(new Map());
  const dismissNotificationRef = useRef<(id: string, playFeedback?: boolean) => void>(() => {});

  const clearBigNewsTimers = useCallback(() => {
    for (const timeout of bigNewsTimersRef.current.values()) {
      window.clearTimeout(timeout);
    }
    bigNewsTimersRef.current.clear();
    for (const timeout of notificationTimersRef.current.values()) {
      window.clearTimeout(timeout);
    }
    notificationTimersRef.current.clear();
  }, []);

  // Periodic simulation-tick cleanup for long-lived/restored news
  useEffect(() => {
    const timer = setInterval(() => {
      const loop = loopRef.current;
      if (loop && hasExpiredBigNews(loop.getWorld())) {
        loop.mutateWorld(expireBigNews);
      }
    }, BIG_NEWS_CLEANUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loopRef]);

  // Periodic wall-clock expiration for toast notifications
  useEffect(() => {
    const timer = setInterval(() => {
      const loop = loopRef.current;
      const now = Date.now();
      if (loop && hasExpiredNotifications(loop.getWorld(), now)) {
        loop.mutateWorld((currentWorld) => expireNotifications(currentWorld, now));
      }
    }, NOTIFICATION_CLEANUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loopRef]);

  useEffect(() => {
    return () => clearBigNewsTimers();
  }, [clearBigNewsTimers]);

  // Derived Valley Chronicle moment
  const pendingChapterCard = useMemo(
    () => getPendingChapterMoment({ chronicleChapters: world.chronicleChapters }, dismissedChapter),
    [dismissedChapter, world.chronicleChapters],
  );

  /**
   * The card on screen is the pending chapter, so dismissal is the chapter's own ledger write.
   */
  const dismissChapterCard = useCallback(() => {
    if (pendingChapterCard) {
      setDismissedChapter(pendingChapterCard.id);
    }
  }, [pendingChapterCard]);

  const dismissNotification = useCallback(
    (id: string, playFeedback = true) => {
      if (playFeedback) onFeedbackInteraction();
      loopRef.current?.mutateWorld((currentWorld) => {
        const dismissed = new Set(currentWorld.dismissedNotificationIds ?? []);
        dismissed.add(id);
        // Keep insertion order (newest last) and drop the oldest entries past the cap.
        currentWorld.dismissedNotificationIds = Array.from(dismissed).slice(-MAX_DISMISSED_NOTIFICATION_IDS);
        currentWorld.notifications = currentWorld.notifications.filter(
          (notification) => notification.id !== id,
        );
      });
    },
    [loopRef, onFeedbackInteraction],
  );

  const dismissBigNewsItem = useCallback(
    (id: string, playFeedback = true) => {
      if (playFeedback) onFeedbackInteraction();

      const timeout = bigNewsTimersRef.current.get(id);
      if (timeout !== undefined) window.clearTimeout(timeout);
      bigNewsTimersRef.current.delete(id);

      setHiddenBigNewsIds((previous) => {
        if (previous.has(id)) return previous;
        const next = new Set(previous);
        next.add(id);
        return next;
      });

      loopRef.current?.mutateWorld((currentWorld) => {
        const dismissed = new Set(currentWorld.dismissedBigNewsIds ?? []);
        dismissed.add(id);
        currentWorld.dismissedBigNewsIds = Array.from(dismissed).slice(-MAX_DISMISSED_BIG_NEWS_IDS);
        currentWorld.bigNews = currentWorld.bigNews.filter((news) => news.id !== id);
      });
    },
    [loopRef, onFeedbackInteraction],
  );

  useEffect(() => {
    dismissBigNewsItemRef.current = dismissBigNewsItem;
  }, [dismissBigNewsItem]);

  useEffect(() => {
    dismissNotificationRef.current = dismissNotification;
  }, [dismissNotification]);

  // Reconcile auto-dismissal timeouts when notifications change, so every toast leaves the
  // screen even if the player never clicks it.
  useEffect(() => {
    const liveIds = new Set((world.notifications ?? []).map((notification) => notification.id));

    for (const [id, timeout] of notificationTimersRef.current) {
      if (!liveIds.has(id)) {
        window.clearTimeout(timeout);
        notificationTimersRef.current.delete(id);
      }
    }

    for (const id of liveIds) {
      if (notificationTimersRef.current.has(id)) continue;
      const timeout = window.setTimeout(() => {
        notificationTimersRef.current.delete(id);
        dismissNotificationRef.current(id, false);
      }, NOTIFICATION_DISPLAY_MS);
      notificationTimersRef.current.set(id, timeout);
    }
  }, [world.notifications]);

  // Reconcile auto-dismissal timeouts when bigNews entries change
  useEffect(() => {
    const eligibleIds = new Set(getBigNewsAutoDismissIds({ bigNews: world.bigNews }, hiddenBigNewsIds));

    for (const [id, timeout] of bigNewsTimersRef.current) {
      if (!eligibleIds.has(id)) {
        window.clearTimeout(timeout);
        bigNewsTimersRef.current.delete(id);
      }
    }

    for (const id of eligibleIds) {
      if (bigNewsTimersRef.current.has(id)) continue;
      const timeout = window.setTimeout(() => {
        bigNewsTimersRef.current.delete(id);
        dismissBigNewsItemRef.current(id, false);
      }, BIG_NEWS_DISPLAY_MS);
      bigNewsTimersRef.current.set(id, timeout);
    }
  }, [hiddenBigNewsIds, world.bigNews]);

  const dismissActiveEvent = useCallback(() => {
    const currentWorld = worldRef.current;
    const event = currentWorld.activeEvent;
    if (!event) return;

    onFeedbackInteraction();
    const visitorNewsIds = event.id.startsWith('visitor_')
      ? (currentWorld.bigNews ?? []).filter((news) => news.title.includes('Visitors Arrived')).map((news) => news.id)
      : [];

    setHiddenActiveEventIds((previous) => {
      if (previous.has(event.id)) return previous;
      const next = new Set(previous);
      next.add(event.id);
      return next;
    });

    if (visitorNewsIds.length > 0) {
      setHiddenBigNewsIds((previous) => {
        const next = new Set(previous);
        for (let i = 0; i < visitorNewsIds.length; i++) {
          next.add(visitorNewsIds[i]);
        }
        return next;
      });
    }

    loopRef.current?.mutateWorld((session) => {
      const dismissedEvents = new Set(session.dismissedActiveEventIds ?? []);
      dismissedEvents.add(event.id);
      session.dismissedActiveEventIds = Array.from(dismissedEvents).slice(-MAX_DISMISSED_ACTIVE_EVENT_IDS);
      session.activeEvent = null;

      if (visitorNewsIds.length > 0) {
        const dismissedNews = new Set(session.dismissedBigNewsIds ?? []);
        const visitorNewsSet = new Set(visitorNewsIds);
        for (let i = 0; i < visitorNewsIds.length; i++) {
          dismissedNews.add(visitorNewsIds[i]);
        }
        // Same tail cap as the single-item path above: `bigNews` is itself capped at 50, so a
        // capped ledger cannot resurrect a live card, and an uncapped one grows for the session.
        session.dismissedBigNewsIds = Array.from(dismissedNews).slice(-MAX_DISMISSED_BIG_NEWS_IDS);
        session.bigNews = session.bigNews.filter((news) => !visitorNewsSet.has(news.id));
      }
    });
  }, [loopRef, onFeedbackInteraction, worldRef]);

  const resetTransientFeedbackForNewSession = useCallback(() => {
    clearBigNewsTimers();
    setHiddenBigNewsIds(new Set());
    setHiddenActiveEventIds(new Set());
    setDismissedChapter(null);
  }, [clearBigNewsTimers]);

  const synchronizeTransientFeedbackFromWorld = useCallback(
    (loadedWorld: WorldState) => {
      clearBigNewsTimers();
      const dismissedIds = new Set(loadedWorld.dismissedBigNewsIds ?? []);
      const newsList = loadedWorld.bigNews ?? [];
      for (let i = 0; i < newsList.length; i++) {
        if (newsList[i].dismissed) {
          dismissedIds.add(newsList[i].id);
        }
      }
      setHiddenBigNewsIds(dismissedIds);
      setHiddenActiveEventIds(new Set(loadedWorld.dismissedActiveEventIds ?? []));
    },
    [clearBigNewsTimers],
  );

  const activeBigNews = useMemo(
    () =>
      (world.bigNews ?? []).filter(
        (news) => !news.dismissed && !hiddenBigNewsIds.has(news.id),
      ),
    [world.bigNews, hiddenBigNewsIds],
  );

  const activeEventDismissible = useMemo(
    () => Boolean(world.activeEvent && !hiddenActiveEventIds.has(world.activeEvent.id)),
    [world.activeEvent, hiddenActiveEventIds],
  );

  const activeEventForBanner = activeEventDismissible ? world.activeEvent : null;

  return {
    activeBigNews,
    activeEventDismissible,
    activeEventForBanner,
    activeChapterMoment: pendingChapterCard,
    dismissActiveEvent,
    dismissBigNewsItem,
    dismissChapterCard,
    dismissNotification,
    resetTransientFeedbackForNewSession,
    synchronizeTransientFeedbackFromWorld,
  };
}