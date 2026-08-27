import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from 'react';
import type { WorldState } from '../game/gameEngine';
import { GameLoop } from '../game/gameLoop';
import type { MomentCardData } from '../components/MomentTitleCard';
import { VALLEY_CHAPTERS } from '../game/valleyChronicle';

const BIG_NEWS_DISMISS_AFTER_TICKS = 360;
const BIG_NEWS_REMOVE_AFTER_TICKS = 600;
const BIG_NEWS_CLEANUP_INTERVAL_MS = 1_000;
const NOTIFICATION_LIFETIME_MS = 12_000;
const NOTIFICATION_CLEANUP_INTERVAL_MS = 2_000;

type UseTransientGameFeedbackOptions = {
  world: WorldState;
  worldRef: RefObject<WorldState>;
  loopRef: RefObject<GameLoop | null>;
  onFeedbackInteraction: () => void;
};

/** Removes expired big-news records using the existing simulation-tick thresholds. */
export function expireBigNews(world: Pick<WorldState, 'bigNews' | 'tick'>): void {
  if (world.bigNews.length === 0) return;
  const now = world.tick;
  const updated = world.bigNews
    .map((news) => ({
      ...news,
      dismissed: news.dismissed || now - news.createdAt > BIG_NEWS_DISMISS_AFTER_TICKS,
    }))
    .filter((news) => !news.dismissed || now - news.createdAt < BIG_NEWS_REMOVE_AFTER_TICKS);
  const changed = updated.length !== world.bigNews.length
    || updated.some((news, index) => news.dismissed !== world.bigNews[index]?.dismissed);
  if (changed) world.bigNews = updated;
}

/** Removes notifications that have exceeded the existing wall-clock display lifetime. */
export function expireNotifications(
  world: Pick<WorldState, 'notifications'>,
  now = Date.now(),
): void {
  const cutoff = now - NOTIFICATION_LIFETIME_MS;
  const next = world.notifications.filter((notification) => notification.createdAt > cutoff);
  if (next.length !== world.notifications.length) world.notifications = next;
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
 * Owns transient player feedback only. Permanent world updates remain inside the
 * pre-existing GameLoop mutation callbacks, preserving worker authority.
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

  // Auto-dismiss big news after ~15s (360 ticks) — stable interval, no length dep.
  useEffect(() => {
    const timer = setInterval(() => {
      loopRef.current?.mutateWorld(expireBigNews);
    }, BIG_NEWS_CLEANUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loopRef]);

  // Fade out toast notifications after ~12s unless the player dismisses them first.
  useEffect(() => {
    const timer = setInterval(() => {
      loopRef.current?.mutateWorld((currentWorld) => expireNotifications(currentWorld));
    }, NOTIFICATION_CLEANUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loopRef]);

  // Valley Chronicle chapter moments remain derived during render.
  const pendingChapterCard = useMemo(
    () => getPendingChapterMoment(world, dismissedChapter),
    [dismissedChapter, world],
  );
  const activeMoment = momentCard ?? pendingChapterCard;

  const dismissMomentCard = useCallback(() => {
    if (momentCard) {
      setMomentCard(null);
      return;
    }
    if (pendingChapterCard) setDismissedChapter(pendingChapterCard.id);
  }, [momentCard, pendingChapterCard]);

  const dismissNotification = useCallback((id: string) => {
    onFeedbackInteraction();
    loopRef.current?.mutateWorld((currentWorld) => {
      currentWorld.dismissedNotificationIds = [
        ...new Set([...(currentWorld.dismissedNotificationIds ?? []), id]),
      ];
      currentWorld.notifications = currentWorld.notifications.filter((notification) => notification.id !== id);
    });
  }, [loopRef, onFeedbackInteraction]);

  const dismissBigNewsItem = useCallback((id: string) => {
    onFeedbackInteraction();
    setHiddenBigNewsIds((previous) => {
      if (previous.has(id)) return previous;
      const next = new Set(previous);
      next.add(id);
      return next;
    });
    loopRef.current?.mutateWorld((currentWorld) => {
      currentWorld.dismissedBigNewsIds = [
        ...new Set([...(currentWorld.dismissedBigNewsIds ?? []), id]),
      ];
      currentWorld.bigNews = currentWorld.bigNews.filter((news) => news.id !== id);
    });
  }, [loopRef, onFeedbackInteraction]);

  const dismissActiveEvent = useCallback(() => {
    const currentWorld = worldRef.current;
    const event = currentWorld.activeEvent;
    if (!event) return;

    onFeedbackInteraction();
    const visitorNewsIds = event.id.startsWith('visitor_')
      ? currentWorld.bigNews.filter((news) => news.title.includes('Visitors Arrived')).map((news) => news.id)
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
        for (const id of visitorNewsIds) next.add(id);
        return next;
      });
    }
    loopRef.current?.mutateWorld((session) => {
      session.dismissedActiveEventIds = [
        ...new Set([...(session.dismissedActiveEventIds ?? []), event.id]),
      ];
      session.activeEvent = null;
      if (visitorNewsIds.length > 0) {
        session.dismissedBigNewsIds = [
          ...new Set([...(session.dismissedBigNewsIds ?? []), ...visitorNewsIds]),
        ];
        session.bigNews = session.bigNews.filter((news) => !visitorNewsIds.includes(news.id));
      }
    });
  }, [loopRef, onFeedbackInteraction, worldRef]);

  const resetTransientFeedbackForNewSession = useCallback(() => {
    setHiddenBigNewsIds(new Set());
    setHiddenActiveEventIds(new Set());
    setDismissedChapter(null);
  }, []);

  const synchronizeTransientFeedbackFromWorld = useCallback((loadedWorld: WorldState) => {
    setHiddenBigNewsIds(new Set([
      ...(loadedWorld.dismissedBigNewsIds ?? []),
      ...loadedWorld.bigNews.filter((news) => news.dismissed).map((news) => news.id),
    ]));
    setHiddenActiveEventIds(new Set(loadedWorld.dismissedActiveEventIds ?? []));
  }, []);

  const activeBigNews = world.bigNews.filter(
    (news) => !news.dismissed && !hiddenBigNewsIds.has(news.id),
  );
  const activeEventDismissible = !!(
    world.activeEvent && !hiddenActiveEventIds.has(world.activeEvent.id)
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
