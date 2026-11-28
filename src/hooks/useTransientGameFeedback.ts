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
import { MAX_PENDING_NOTIFICATIONS } from '../game/simEffects';

const BIG_NEWS_DISPLAY_MS = 8_000;
/**
 * Wall-clock lifetime of an ordinary notification toast; without a timer, notifications left only
 * when clicked and otherwise piled up.
 */
export const NOTIFICATION_DISPLAY_MS = 12_000;
const BIG_NEWS_DISMISS_AFTER_TICKS = 360;
const BIG_NEWS_REMOVE_AFTER_TICKS = 600;
const BIG_NEWS_CLEANUP_INTERVAL_MS = 1_000;
const NOTIFICATION_CLEANUP_INTERVAL_MS = 1_000;
const MAX_VISIBLE_NOTIFICATIONS = 4;
/**
 * Cap on the persisted dismissal ledger: it is copied into every UI patch and diffed per tick, so
 * it must stay bounded. Keep more IDs than a full queue so delayed worker deltas cannot
 * resurrect recently acknowledged notifications.
 */
const MAX_DISMISSED_NOTIFICATION_IDS = MAX_PENDING_NOTIFICATIONS * 2;

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
  hudNotificationsEnabled: boolean;
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
function getBigNewsAutoDismissIds(
  world: Pick<WorldState, 'bigNews'>,
  hiddenBigNewsIds: ReadonlySet<string> = new Set(),
): string[] {
  return (world.bigNews ?? [])
    .filter((news) => !news.dismissed && !hiddenBigNewsIds.has(news.id))
    .map((news) => news.id);
}

/** Oldest pending notifications keep their slots until dismissed; newer ones wait. */
export function getVisibleNotifications(
  notifications: WorldState['notifications'] | undefined,
  enabled: boolean,
): WorldState['notifications'] {
  return enabled ? (notifications ?? []).slice(0, MAX_VISIBLE_NOTIFICATIONS) : [];
}

/** Track elapsed presentation time only for eligible cards, never for a hidden queue entry. */
export function reconcileNotificationVisibility(
  visibleSince: Map<string, number>,
  eligible: WorldState['notifications'],
  now: number,
): void {
  const ids = new Set(eligible.map((notification) => notification.id));
  for (const id of visibleSince.keys()) {
    if (!ids.has(id)) visibleSince.delete(id);
  }
  for (const id of ids) {
    if (!visibleSince.has(id)) visibleSince.set(id, now);
  }
}

/** The single wall-clock expiry rule, anchored to first presentation rather than creation. */
function getExpiredNotificationIds(
  world: Pick<WorldState, 'notifications'>,
  visibleSince: ReadonlyMap<string, number>,
  now: number,
): string[] {
  const cutoff = now - NOTIFICATION_DISPLAY_MS;
  return (world.notifications ?? []).filter((notification) => {
    const since = visibleSince.get(notification.id);
    return since !== undefined && since <= cutoff;
  }).map((notification) => notification.id);
}

export function hasExpiredNotifications(
  world: Pick<WorldState, 'notifications'>,
  visibleSince: ReadonlyMap<string, number>,
  now = Date.now(),
): boolean {
  return getExpiredNotificationIds(world, visibleSince, now).length > 0;
}

/** One dismissal path for both clicks and expiry, preserving worker-delta suppression. */
export function dismissNotifications(
  world: Pick<WorldState, 'notifications' | 'dismissedNotificationIds'>,
  ids: readonly string[],
): void {
  if (ids.length === 0) return;
  const removed = new Set(ids);
  const dismissed = new Set(world.dismissedNotificationIds ?? []);
  for (const id of removed) dismissed.add(id);
  world.dismissedNotificationIds = Array.from(dismissed).slice(-MAX_DISMISSED_NOTIFICATION_IDS);
  world.notifications = (world.notifications ?? []).filter((notification) => !removed.has(notification.id));
}

export function expireNotifications(
  world: Pick<WorldState, 'notifications' | 'dismissedNotificationIds'>,
  visibleSince: ReadonlyMap<string, number>,
  now = Date.now(),
): void {
  dismissNotifications(world, getExpiredNotificationIds(world, visibleSince, now));
}

/** Resolves the latest undismissed Valley Chronicle moment for presentation. */
function getPendingChapterMoment(
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
  hudNotificationsEnabled,
}: UseTransientGameFeedbackOptions) {
  const [dismissedChapter, setDismissedChapter] = useState<string | null>(null);
  const [hiddenBigNewsIds, setHiddenBigNewsIds] = useState<ReadonlySet<string>>(() => new Set());
  const [hiddenActiveEventIds, setHiddenActiveEventIds] = useState<ReadonlySet<string>>(() => new Set());

  const bigNewsTimersRef = useRef<Map<string, number>>(new Map());
  const dismissBigNewsItemRef = useRef<(id: string, playFeedback?: boolean) => void>(() => {});
  const notificationVisibleSinceRef = useRef<Map<string, number>>(new Map());
  // Simulation and command paths may append to the existing array before a UI render.
  // Derive the tiny visible batch on every render, not only when the array identity changes.
  const visibleNotifications = getVisibleNotifications(world.notifications, hudNotificationsEnabled);

  const clearFeedbackTiming = useCallback(() => {
    for (const timeout of bigNewsTimersRef.current.values()) {
      window.clearTimeout(timeout);
    }
    bigNewsTimersRef.current.clear();
    notificationVisibleSinceRef.current.clear();
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

  // Changing the preference starts a fresh presentation interval. Muted cards expire quietly
  // instead of building up a backlog; any card shown after unmuting gets its full display time.
  useEffect(() => {
    notificationVisibleSinceRef.current.clear();
  }, [hudNotificationsEnabled]);

  useEffect(() => {
    reconcileNotificationVisibility(
      notificationVisibleSinceRef.current,
      hudNotificationsEnabled ? visibleNotifications : (world.notifications ?? []),
      Date.now(),
    );
  }, [hudNotificationsEnabled, visibleNotifications, world.notifications]);

  // One expiry sweep; waiting cards cannot expire before they enter the visible batch.
  useEffect(() => {
    const timer = setInterval(() => {
      const loop = loopRef.current;
      const now = Date.now();
      const visibleSince = notificationVisibleSinceRef.current;
      if (loop && hasExpiredNotifications(loop.getWorld(), visibleSince, now)) {
        loop.mutateWorld((currentWorld) => expireNotifications(currentWorld, visibleSince, now));
      }
    }, NOTIFICATION_CLEANUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loopRef]);

  useEffect(() => {
    return () => clearFeedbackTiming();
  }, [clearFeedbackTiming]);

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
        dismissNotifications(currentWorld, [id]);
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
    setHiddenActiveEventIds((previous) => {
      if (previous.has(event.id)) return previous;
      const next = new Set(previous);
      next.add(event.id);
      return next;
    });

    loopRef.current?.mutateWorld((session) => {
      const dismissedEvents = new Set(session.dismissedActiveEventIds ?? []);
      dismissedEvents.add(event.id);
      session.dismissedActiveEventIds = Array.from(dismissedEvents).slice(-MAX_DISMISSED_ACTIVE_EVENT_IDS);
      session.activeEvent = null;
    });
  }, [loopRef, onFeedbackInteraction, worldRef]);

  const resetTransientFeedbackForNewSession = useCallback(() => {
    clearFeedbackTiming();
    setHiddenBigNewsIds(new Set());
    setHiddenActiveEventIds(new Set());
    setDismissedChapter(null);
  }, [clearFeedbackTiming]);

  const synchronizeTransientFeedbackFromWorld = useCallback(
    (loadedWorld: WorldState) => {
      clearFeedbackTiming();
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
    [clearFeedbackTiming],
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
    visibleNotifications,
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
