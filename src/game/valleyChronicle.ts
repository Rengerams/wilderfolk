import type { Resources, WorldState } from './gameTypes';
import { BuildingType } from './buildings';
import { logEvent } from './eventLog';
import { isRivalAtPeace } from './rivalPeace';
import { addCappedResource } from './resourceUtils';

/**
 * Valley Chronicle — the sandbox's story spine (replaces the removed victory
 * paths). Chapters are milestone moments that the village reaches naturally;
 * each unlocks once, logs to the chronicle, and grants a small reward. No
 * win/lose — the valley just keeps living, and history keeps writing itself.
 */
export interface ChronicleChapter {
  id: string;
  icon: string;
  title: string;
  detail: string;
  isMet: (w: WorldState) => boolean;
  reward?: Partial<Resources>;
}

const hasCompleted = (w: WorldState, type: BuildingType) =>
  w.buildings.some((b) => b.completed && b.type === type && b.faction !== 'rival');

const anyForgeOrderDone = (w: WorldState): boolean =>
  Object.values(w.villageForge?.completed ?? {}).some(Boolean);

export const VALLEY_CHAPTERS: ChronicleChapter[] = [
  {
    id: 'foundation', icon: '🏠', title: 'The Foundation',
    detail: 'The first house rises in the wild valley.',
    isMet: (w) => hasCompleted(w, BuildingType.House), reward: { gold: 20 },
  },
  {
    id: 'first_harvest', icon: '🌾', title: 'The First Harvest',
    detail: 'Fields planted, mouths fed — the village learns to grow.',
    isMet: (w) => hasCompleted(w, BuildingType.Farm) && w.resources.food >= 300, reward: { food: 100 },
  },
  {
    id: 'the_hunt', icon: '🏹', title: 'The Great Hunt',
    detail: 'Hunters feed the village from the living wild.',
    isMet: (w) => hasCompleted(w, BuildingType.HuntingSpot), reward: { food: 80 },
  },
  {
    id: 'the_river', icon: '🎣', title: "The River's Gift",
    detail: 'The waters feed the people — a fishing post on the bank.',
    isMet: (w) => hasCompleted(w, BuildingType.FishingSpot), reward: { food: 80 },
  },
  {
    id: 'the_iron_age', icon: '🔩', title: 'The Iron Age',
    detail: 'The forge rings with real iron — the frontier hardens.',
    isMet: anyForgeOrderDone, reward: { gold: 100 },
  },
  {
    id: 'the_market', icon: '🏪', title: 'The Market Opens',
    detail: 'Gold flows, trade routes open — the valley finds the wider world.',
    isMet: (w) => w.resources.gold >= 500 && w.tradeRoutes.some((r) => r.active), reward: { gold: 100 },
  },
  {
    id: 'keeper_of_the_wild', icon: '🌳', title: 'Keeper of the Wild',
    detail: 'A preserve shelters the valley creatures — the village gives back.',
    isMet: (w) => hasCompleted(w, BuildingType.WildlifePreserve), reward: { wood: 200, stone: 100 },
  },
  {
    id: 'the_alliance', icon: '🤝', title: 'The Alliance',
    detail: 'A rival becomes a friend — peace written in ink, not blood.',
    isMet: (w) => w.rivalSettlements.some((r) => isRivalAtPeace(r)), reward: { gold: 150 },
  },
  {
    id: 'the_century', icon: '⏳', title: 'A Century',
    detail: 'One hundred years — the valley remembers your name.',
    isMet: (w) => w.year >= 100, reward: { gold: 500 },
  },
];

/** Check every unmet chapter once per day; return ids triggered this day. */
export function advanceValleyChronicle(state: WorldState): string[] {
  const done = new Set(state.chronicleChapters ?? []);
  const newly: string[] = [];
  for (const ch of VALLEY_CHAPTERS) {
    if (done.has(ch.id)) continue;
    if (ch.isMet(state)) {
      state.chronicleChapters = [...(state.chronicleChapters ?? []), ch.id];
      logEvent(state, 'milestone', `${ch.icon} ${ch.title} — ${ch.detail}`);
      if (ch.reward) {
        for (const [key, amount] of Object.entries(ch.reward)) {
          if (amount > 0) addCappedResource(state, key as keyof Resources, amount);
        }
      }
      newly.push(ch.id);
    }
  }
  return newly;
}
