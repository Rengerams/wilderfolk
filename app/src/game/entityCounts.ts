import type { Entity, WildlifeCounts } from './gameTypes';
import { EntityType } from './gameTypes';
import { isPlayerHuman } from './groupEvents';
import { isActiveMoonHowler } from './moonHowler';

export type PopulationCounts = WildlifeCounts & { humans: number };

function emptyWildlifeCounts(): WildlifeCounts {
  return {
    grass: 0,
    rabbits: 0,
    deer: 0,
    wolves: 0,
    foxes: 0,
    werewolves: 0,
    wildkin: 0,
    trees: 0,
  };
}

function emptyPopulationCounts(): PopulationCounts {
  return { humans: 0, ...emptyWildlifeCounts() };
}

/**
 * Map a non–player-human entity to a wildlife bucket.
 * Humans are handled separately so isActiveMoonHowler is only called for Werewolf type.
 */
function wildlifeCountBucket(e: Entity): keyof WildlifeCounts | null {
  switch (e.type) {
    case EntityType.Grass:
      return 'grass';
    case EntityType.Tree:
      return 'trees';
    case EntityType.Rabbit:
      return 'rabbits';
    case EntityType.Deer:
      return 'deer';
    case EntityType.Wolf:
      return 'wolves';
    case EntityType.Fox:
      return 'foxes';
    case EntityType.Werewolf:
      return isActiveMoonHowler(e) ? 'werewolves' : null;
    case EntityType.Wildkin:
      return 'wildkin';
    case EntityType.Human:
      return null;
    default: {
      console.warn('[entityCounts] Unknown entity type skipped:', e.type as string);
      return null;
    }
  }
}

/** Scan alive entities once — used on load and after world generation. */
export function computeWildlifeCounts(entities: Entity[]): WildlifeCounts {
  const counts = emptyWildlifeCounts();
  for (const e of entities) {
    if (!e.alive) continue;
    const bucket = wildlifeCountBucket(e);
    if (bucket) counts[bucket]++;
  }
  return counts;
}

/** Player humans + wildlife — same rules as gameTick population counting. */
export function computePopulationCounts(entities: Entity[]): PopulationCounts {
  const counts = emptyPopulationCounts();
  for (const e of entities) {
    if (!e.alive) continue;
    if (isPlayerHuman(e)) {
      counts.humans++;
      continue;
    }
    const bucket = wildlifeCountBucket(e);
    if (bucket) counts[bucket]++;
  }
  return counts;
}