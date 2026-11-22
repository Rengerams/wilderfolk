import type { RivalDailyAction, RivalProfile, RivalSettlement } from './gameTypes';
import { getSimRng, hashSalt } from './simRng';

const TEMPERAMENTS: RivalProfile['temperament'][] = ['welcoming', 'pragmatic', 'ambitious', 'warlike'];
const PRIORITIES: RivalProfile['priority'][] = ['food', 'trade', 'security', 'shelter'];

/** Clamp with a non-finite guard: a corrupt save value falls back to `min`. */
function clampFinite(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function createRivalProfile(seed: number, relationship: RivalSettlement['relationship']): RivalProfile {
  const temperament = relationship === 'friendly' ? 'welcoming'
    : relationship === 'tense' ? 'warlike'
      : TEMPERAMENTS[Math.abs(seed) % TEMPERAMENTS.length];
  const priority = PRIORITIES[Math.abs(seed * 3 + 1) % PRIORITIES.length];
  return {
    temperament,
    priority,
    ledger: {
      food: 30 + Math.abs(seed * 7) % 31,
      wood: 20 + Math.abs(seed * 5) % 26,
      gold: 10 + Math.abs(seed * 3) % 21,
      morale: relationship === 'friendly' ? 70 : relationship === 'tense' ? 35 : 55,
      recovery: 100,
    },
    contactCount: 0,
    lastAction: 'none',
    lastActionDay: 0,
  };
}

export function normalizeRivalProfile(
  rival: Pick<RivalSettlement, 'id' | 'relationship' | 'profile'>,
): RivalProfile {
  const fallback = createRivalProfile(rival.id.length, rival.relationship);
  const profile = rival.profile;
  if (!profile) return fallback;
  return {
    temperament: TEMPERAMENTS.includes(profile.temperament) ? profile.temperament : fallback.temperament,
    priority: PRIORITIES.includes(profile.priority) ? profile.priority : fallback.priority,
    ledger: {
      food: clampFinite(profile.ledger?.food, 0, 200),
      wood: clampFinite(profile.ledger?.wood, 0, 200),
      gold: clampFinite(profile.ledger?.gold, 0, 200),
      morale: clampFinite(profile.ledger?.morale, 0, 100),
      recovery: clampFinite(profile.ledger?.recovery, 0, 100),
    },
    contactCount: clampFinite(profile.contactCount, 0, 999),
    lastAction: profile.lastAction && ['recover', 'gather', 'trade', 'fortify', 'scout', 'cool_down', 'none'].includes(profile.lastAction)
      ? profile.lastAction : fallback.lastAction,
    lastActionDay: clampFinite(profile.lastActionDay ?? 0, 0, 1000000),
  };
}

export function ensureRivalProfile(rival: RivalSettlement): RivalProfile {
  const normalized = normalizeRivalProfile(rival);
  rival.profile = normalized;
  return normalized;
}

export function getRivalProfileLabel(profile: RivalProfile): string {
  return `${profile.temperament} · prioritizes ${profile.priority}`;
}

/** A camp takes stock of its stores on this cadence, whatever its action timer says. */
export const RIVAL_GROWTH_INTERVAL_DAYS = 9;
/** A camp this size has outgrown the room the valley leaves it. */
const RIVAL_CAMP_MAX_POPULATION = 12;
/** Stores a camp must hold per head, and the morale/recovery below which nobody joins it. */
const RIVAL_GROWTH_FOOD_PER_HEAD = 10;
const RIVAL_GROWTH_MIN_MORALE = 55;
const RIVAL_GROWTH_MIN_RECOVERY = 40;

/** What a camp spends from its stores to settle another family. */
export function getRivalGrowthFoodCost(): number {
  return RIVAL_GROWTH_FOOD_PER_HEAD * 2;
}

/** Whether this camp's own stores can support another settler — the gate the growth roll asks. */
export function canRivalCampGrow(rival: RivalSettlement): boolean {
  if (rival.population >= RIVAL_CAMP_MAX_POPULATION) return false;
  const profile = normalizeRivalProfile(rival);
  const needed = RIVAL_GROWTH_FOOD_PER_HEAD * Math.max(1, rival.population);
  return profile.ledger.food >= needed
    && profile.ledger.morale >= RIVAL_GROWTH_MIN_MORALE
    && profile.ledger.recovery >= RIVAL_GROWTH_MIN_RECOVERY;
}

/** Which day of the cadence this camp takes stock on — staggered by stable identity, not list order. */
export function isRivalGrowthDay(rivalId: string, colonyDay: number): boolean {
  return (colonyDay + (hashSalt(rivalId) % RIVAL_GROWTH_INTERVAL_DAYS)) % RIVAL_GROWTH_INTERVAL_DAYS === 0;
}

export function selectRivalDailyAction(
  profile: RivalProfile,
  relationship: RivalSettlement['relationship'],
  rng: () => number = getSimRng('rivalProfiles'),
): RivalDailyAction {
  const { ledger } = profile;
  if (ledger.recovery < 45 && ledger.food >= 5) return 'recover';
  if (profile.priority === 'security' && ledger.wood >= 12 && relationship !== 'friendly') return 'fortify';
  if (profile.priority === 'trade' && ledger.gold >= 5) return 'trade';
  if (profile.priority === 'food' && ledger.gold >= 5) return 'trade';
  if (profile.priority === 'shelter' && ledger.wood >= 12) return 'fortify';
  if (ledger.food < 45 || ledger.wood < 30) return 'gather';
  if (relationship === 'tense' && ledger.gold >= 3) return 'scout';
  if (ledger.recovery < 75) return 'cool_down';
  return rng() < 0.5 ? 'gather' : 'cool_down';
}

export function applyRivalDailyAction(
  profile: RivalProfile,
  action: RivalDailyAction,
): { changed: boolean; summary: string } {
  const ledger = profile.ledger;
  switch (action) {
    case 'recover':
      if (ledger.food < 5) return { changed: false, summary: 'no food for recovery' };
      ledger.food -= 5;
      ledger.recovery = clampFinite(ledger.recovery + 22, 0, 100);
      ledger.morale = clampFinite(ledger.morale + 2, 0, 100);
      return { changed: true, summary: 'spent 5 food to recover' };
    case 'gather':
      ledger.food = clampFinite(ledger.food + 10, 0, 200);
      ledger.wood = clampFinite(ledger.wood + 6, 0, 200);
      ledger.recovery = clampFinite(ledger.recovery - 6, 0, 100);
      return { changed: true, summary: 'gathered supplies' };
    case 'trade':
      if (ledger.gold < 5) return { changed: false, summary: 'not enough gold to trade' };
      ledger.gold -= 5;
      ledger.food = clampFinite(ledger.food + 15, 0, 200);
      ledger.recovery = clampFinite(ledger.recovery - 3, 0, 100);
      return { changed: true, summary: 'spent 5 gold on provisions' };
    case 'fortify':
      if (ledger.wood < 12) return { changed: false, summary: 'not enough wood to fortify' };
      ledger.wood -= 12;
      ledger.recovery = clampFinite(ledger.recovery - 5, 0, 100);
      return { changed: true, summary: 'spent 12 wood preparing defenses' };
    case 'scout':
      if (ledger.gold < 3) return { changed: false, summary: 'not enough gold to scout' };
      ledger.gold -= 3;
      ledger.recovery = clampFinite(ledger.recovery - 4, 0, 100);
      return { changed: true, summary: 'spent 3 gold scouting the frontier' };
    case 'cool_down':
      ledger.recovery = clampFinite(ledger.recovery + 10, 0, 100);
      ledger.morale = clampFinite(ledger.morale + 1, 0, 100);
      return { changed: true, summary: 'cooled down and recovered' };
    default:
      return { changed: false, summary: 'no valid action' };
  }
}