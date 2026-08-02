import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldState } from '../game/gameEngine';
import {
  detectContextualTutorials,
  type ContextualTutorialTip,
} from '../game/contextualTutorial';

const TUTORIAL_SEEN_KEY = 'wilderfolk-contextual-tutorial-seen';

function loadPersistedSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(TUTORIAL_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Watches sim state and surfaces one contextual tutorial tip at a time
 * when a mechanic appears for the first time this playthrough.
 */
export function useContextualTutorial(world: WorldState, enabled: boolean) {
  const prevRef = useRef<WorldState | null>(null);
  const [queue, setQueue] = useState<ContextualTutorialTip[]>([]);
  const seededRef = useRef(false);
  // Seen ids survive reloads and new games (localStorage), so tips a player
  // already dismissed never replay — only world.tutorialSeen is per-save.
  const locallySeenRef = useRef<Set<string>>(loadPersistedSeen());

  const active = enabled && queue.length > 0 ? queue[0] : null;

  useEffect(() => {
    if (!enabled) {
      prevRef.current = null;
      seededRef.current = false;
      return;
    }

    if (!seededRef.current) {
      prevRef.current = world;
      seededRef.current = true;
      return;
    }

    const discovered = detectContextualTutorials(prevRef.current!, world);
    if (discovered.length > 0) {
      setQueue((q) => {
        const seen = new Set([
          ...locallySeenRef.current,
          ...(world.tutorialSeen ?? []),
          ...q.map((t) => t.id),
          ...(active ? [active.id] : []),
        ]);
        const fresh = discovered.filter((t) => !seen.has(t.id));
        return fresh.length > 0 ? [...q, ...fresh] : q;
      });
    }

    prevRef.current = world;
  }, [
    world,
    enabled,
    world.tick,
    world.tutorialSeen,
    world.visitorGroups,
    world.rivalSettlements,
    world.pendingDiplomacyEvents,
    world.pendingRaidEvents,
    world.season,
    world.activeResearch,
    world.researchNodes,
    world.tradeRoutes,
    world.entities,
    world.buildings,
    world.challenges,
    world.victories,
    world.festival,
    active,
  ]);

  const dismissActive = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const markSeen = useCallback((id: string) => {
    locallySeenRef.current.add(id);
    persistSeen(locallySeenRef.current);
    setQueue((q) => q.filter((t) => t.id !== id));
  }, []);

  return { active, dismissActive, markSeen };
}