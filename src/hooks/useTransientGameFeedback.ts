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
 * Wall-clock lifetime of an ordinary notification toast. Big News already had a
 * timer; notifications had none, so they only ever left the screen when the player
 * clicked the ✕ and otherwise piled up.
 */
export const NOTIFICATION_DISPLAY_MS = 12_000;
const BIG_NEWS_DISMISS_AFTER_TICKS = 360;
const BIG_NEWS_REMOVE_AFTER_TICKS = 600;
const BIG_NEWS_CLEANUP_INTERVAL_MS = 1_000;
const NOTIFICATION_CLEANUP_INTERVAL_MS = 2_000;
/**
 * Cap on the persisted dismissal ledger. Every notification the player ever sees lands here once
 * (an explicit ✕ or the 12 s auto-dismiss timer below both route through `dismissNotification`),
 * and the ledger is the filter that keeps a dismissed toast from reappearing on the next worker
 * delta (`simDelta.preserveNotificationDismissals`). It is also copied into every UI patch and
 * diffed per tick, so it must stay bounded — but it may only drop ids whose notification can no
 * longer arrive: the simulation's own `notifications` list holds at most 20 entries
 * (`simEffects.addNotification` shifts past 20), so a tail cap above 20 can never let one back in.
 * 50 is that window with margin; lowering it below the simulation's 20 would resurrect old toasts.
 */
const MAX_DISMISSED_NOTIFICATION_IDS = 50;

/**
 * Cap on the persisted Big News / active-event dismissal ledgers.
 *
 * The two sibling ledgers had **no** cap while the notification one above did, so they grew for the life
 * of a colony: every dismissal paid an O(n) `Array.from(set)`, the whole array was re-scanned by
 * `simEffects.highestBigNewsSeq` on **every** `addBigNews`, copied into every UI patch (`extractUiPatch`)
 * and diffed per tick (`idsPatchChanged`), and written into every save — and `bigNews` itself is capped at
 * 50 (`simEffects.addBigNews` shifts past 50) while its dismissal ledger was not (2026-09-20 audit,
 * F-misc-1).
 *
 * A tail cap is safe here for the same reason it is safe above: the ledger's only job is to suppress a
 * card that is still *live*, and `dismissedBigNewsIds` additionally exists to stop `addBigNews` re-minting
 * a sequence. 50 matches the live `bigNews` window with margin, so an id can only be dropped long after
 * its card has left the list.
 */
const MAX_DISMISSED_BIG_NEWS_IDS = 50;
const MAX_DISMISSED_ACTIVE_EVENT_IDS = 50;

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

/**
 * Removes notifications that have exceeded the wall-clock display lifetime, **recording their ids**.
 *
 * The ledger write is the whole point, not bookkeeping: this sweep mutates the *display* world, which is
 * rebuilt from the worker on the next tick, and `simDelta.preserveNotificationDismissals` drops only ids
 * the ledger knows. Without it the sweep and the 12 s per-toast timer fought each other — the sweep
 * removed an expired toast, the next delta restored it (its id was never recorded), the reconciliation
 * effect cancelled the restored toast's timer, a fresh 12 s timer was armed, and 2 s later the sweep
 * removed it again. The player saw the card blink out and back every two seconds and never leave on its
 * own, which is what `NOTIFICATION_DISPLAY_MS` was added to fix. Every
 * removal now routes through the same ledger the comment on `MAX_DISMISSED_NOTIFICATION_IDS` claims.
 */
export function expireNotifications(
  world: Pick<WorldState, 'notifications' | 'dismissedNotificationIds'>,
  now = Date.now(),
): void {
  if (!world.notifications || world.notifications.length === 0) return;
  // One lifetime, one name: the sweeper cutoff and the per-toast timer both read
  // `NOTIFICATION_DISPLAY_MS`. They were two 12_000 constants, so lowering the sweeper's copy
  // below the timer's restored the blink loop.
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
  const [momentCard, setMomentCard] = useState<MomentCardData | null>(null);
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
    () => getPendingChapterMoment({ chronicleChapters: world.chronicleChapters }, dismissedChapter),
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

  // Reconcile auto-dismissal timeouts when notifications change, so a toast the
  // player never clicks still leaves the screen (it used to stay until dismissed).
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
    activeMoment,
    dismissActiveEvent,
    dismissBigNewsItem,
    dismissMomentCard,
    dismissNotification,
    resetTransientFeedbackForNewSession,
    synchronizeTransientFeedbackFromWorld,
  };
}