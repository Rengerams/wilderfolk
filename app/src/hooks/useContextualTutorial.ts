import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldState } from '../game/gameEngine';
import {
  detectContextualTutorials,
  type ContextualTutorialTip,
} from '../game/contextualTutorial';

/**
 * Watches sim state and surfaces one contextual tutorial tip at a time
 * when a mechanic appears for the first time this playthrough.
 */
export function useContextualTutorial(world: WorldState, enabled: boolean) {
  const prevRef = useRef<WorldState | null>(null);
  const [queue, setQueue] = useState<ContextualTutorialTip[]>([]);
  const seededRef = useRef(false);

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

  return { active, dismissActive };
}