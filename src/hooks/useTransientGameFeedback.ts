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
const BIG_NEWS_DISMISS_AFTER_TICKS = 360;
const BIG_NEWS_REMOVE_AFTER_TICKS = 600;
const BIG_NEWS_CLEANUP_INTERVAL_MS = 1_000;
const NOTIFICATION_LIFETIME_MS = 12_000;
const NOTIFICATION_CLEANUP_INTERVAL_MS = 2_000;

export interface UseTransientGameFeedbackOptions {
  world: WorldState;
  worldRef: RefObject<WorldState>;
  loopRef: RefObject<GameLoop | null>;
  onFeedbackInteraction: () => void;
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

/** Removes notifications that have exceeded the wall-clock display lifetime. */
export function expireNotifications(
  world: Pick<WorldState, 'notifications'>,
  now = Date.now(),
): void {
  if (!world.notifications || world.notifications.length === 0) return;
  const cutoff = now - NOTIFICATION_LIFETIME_MS;
  const next = world.notifications.filter((notification) => notification.createdAt > cutoff);
  if (next.length !== world.notifications.length) {
    world.notifications = next;
  }
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
  const [momentCard, setMomentCard] = useState<MomentCardData | null>(null);
  const [dismissedChapter, setDismissedChapter] = useState<string | null>(null);
  const [hiddenBigNewsIds, setHiddenBigNewsIds] = useState<ReadonlySet<string>>(() => new Set());
  const [hiddenActiveEventIds, setHiddenActiveEventIds] = useState<ReadonlySet<string>>(() => new Set());

  const bigNewsTimersRef = useRef<Map<string, number>>(new Map());
  const dismissBigNewsItemRef = useRef<(id: string, playFeedback?: boolean) => void>(() => {});

  const clearBigNewsTimers = useCallback(() => {
    for (const timeout of bigNewsTimersRef.current.values()) {
      window.clearTimeout(timeout);
    }
    bigNewsTimersRef.current.clear();
  }, []);

  // Periodic simulation-tick cleanup for long-lived/restored news
  useEffect(() => {
    const timer = setInterval(() => {
      loopRef.current?.mutateWorld(expireBigNews);
    }, BIG_NEWS_CLEANUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loopRef]);

  // Periodic wall-clock expiration for toast notifications
  useEffect(() => {
    const timer = setInterval(() => {
      loopRef.current?.mutateWorld((currentWorld) => expireNotifications(currentWorld));
    }, NOTIFICATION_CLEANUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loopRef]);

  useEffect(() => {
    return () => clearBigNewsTimers();
  }, [clearBigNewsTimers]);

  // Derived Valley Chronicle moment
  const pendingChapterCard = useMemo(
    () => getPendingChapterMoment(world, dismissedChapter),
    [dismissedChapter, world.chronicleChapters],
  );
  const activeMoment = momentCard ?? pendingChapterCard;

  const dismissMomentCard = useCallback(() => {
    if (momentCard) {
      setMomentCard(null);
      return;
    }
    if (pendingChapterCard) {
      setDismissedChapter(pendingChapterCard.id);
    }
  }, [momentCard, pendingChapterCard]);

  const dismissNotification = useCallback(
    (id: string) => {
      onFeedbackInteraction();
      loopRef.current?.mutateWorld((currentWorld) => {
        const dismissed = new Set(currentWorld.dismissedNotificationIds ?? []);
        dismissed.add(id);
        currentWorld.dismissedNotificationIds = Array.from(dismissed);
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
        currentWorld.dismissedBigNewsIds = Array.from(dismissed);
        currentWorld.bigNews = currentWorld.bigNews.filter((news) => news.id !== id);
      });
    },
    [loopRef, onFeedbackInteraction],
  );

  useEffect(() => {
    dismissBigNewsItemRef.current = dismissBigNewsItem;
  }, [dismissBigNewsItem]);

  // Reconcile auto-dismissal timeouts when bigNews entries change
  useEffect(() => {
    const eligibleIds = new Set(getBigNewsAutoDismissIds(world, hiddenBigNewsIds));

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
      session.dismissedActiveEventIds = Array.from(dismissedEvents);
      session.activeEvent = null;

      if (visitorNewsIds.length > 0) {
        const dismissedNews = new Set(session.dismissedBigNewsIds ?? []);
        const visitorNewsSet = new Set(visitorNewsIds);
        for (let i = 0; i < visitorNewsIds.length; i++) {
          dismissedNews.add(visitorNewsIds[i]);
        }
        session.dismissedBigNewsIds = Array.from(dismissedNews);
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
    activeMoment,
    dismissActiveEvent,
    dismissBigNewsItem,
    dismissMomentCard,
    dismissNotification,
    resetTransientFeedbackForNewSession,
    synchronizeTransientFeedbackFromWorld,
  };
}