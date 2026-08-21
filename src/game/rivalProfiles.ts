import type { RivalDailyAction, RivalProfile, RivalSettlement } from './gameTypes';

const TEMPERAMENTS: RivalProfile['temperament'][] = ['welcoming', 'pragmatic', 'ambitious', 'warlike'];
const PRIORITIES: RivalProfile['priority'][] = ['food', 'trade', 'security', 'shelter'];

function clamp(value: number, min: number, max: number): number {
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
      food: clamp(profile.ledger?.food, 0, 200),
      wood: clamp(profile.ledger?.wood, 0, 200),
      gold: clamp(profile.ledger?.gold, 0, 200),
      morale: clamp(profile.ledger?.morale, 0, 100),
      recovery: clamp(profile.ledger?.recovery, 0, 100),
    },
    contactCount: clamp(profile.contactCount, 0, 999),
    lastAction: profile.lastAction && ['recover', 'gather', 'trade', 'fortify', 'scout', 'cool_down', 'none'].includes(profile.lastAction)
      ? profile.lastAction : fallback.lastAction,
    lastActionDay: clamp(profile.lastActionDay ?? 0, 0, 1000000),
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

export function selectRivalDailyAction(
  profile: RivalProfile,
  relationship: RivalSettlement['relationship'],
  rng: () => number = Math.random,
): RivalDailyAction {
  const { ledger } = profile;
  if (ledger.recovery < 45 && ledger.food >= 5) return 'recover';
  if (profile.priority === 'security' && ledger.wood >= 12 && relationship !== 'friendly') return 'fortify';
  if (profile.priority === 'trade' && ledger.gold >= 5) return 'trade';
  if (profile.priority === 'food' && ledger.gold >= 5) return 'trade';
  if (profile.priority === 'shelter' && ledger.wood >= 8) return 'fortify';
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
      ledger.recovery = clamp(ledger.recovery + 22, 0, 100);
      ledger.morale = clamp(ledger.morale + 2, 0, 100);
      return { changed: true, summary: 'spent 5 food to recover' };
    case 'gather':
      ledger.food = clamp(ledger.food + 10, 0, 200);
      ledger.wood = clamp(ledger.wood + 6, 0, 200);
      ledger.recovery = clamp(ledger.recovery - 6, 0, 100);
      return { changed: true, summary: 'gathered supplies' };
    case 'trade':
      if (ledger.gold < 5) return { changed: false, summary: 'not enough gold to trade' };
      ledger.gold -= 5;
      ledger.food = clamp(ledger.food + 15, 0, 200);
      ledger.recovery = clamp(ledger.recovery - 3, 0, 100);
      return { changed: true, summary: 'spent 5 gold on provisions' };
    case 'fortify':
      if (ledger.wood < 12) return { changed: false, summary: 'not enough wood to fortify' };
      ledger.wood -= 12;
      ledger.recovery = clamp(ledger.recovery - 5, 0, 100);
      return { changed: true, summary: 'spent 12 wood preparing defenses' };
    case 'scout':
      if (ledger.gold < 3) return { changed: false, summary: 'not enough gold to scout' };
      ledger.gold -= 3;
      ledger.recovery = clamp(ledger.recovery - 4, 0, 100);
      return { changed: true, summary: 'spent 3 gold scouting the frontier' };
    case 'cool_down':
      ledger.recovery = clamp(ledger.recovery + 10, 0, 100);
      ledger.morale = clamp(ledger.morale + 1, 0, 100);
      return { changed: true, summary: 'cooled down and recovered' };
    default:
      return { changed: false, summary: 'no valid action' };
  }
}
