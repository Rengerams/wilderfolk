import type { RivalDailyAction, RivalProfile, RivalSettlement, WorldState } from './gameTypes';
import { normalizeRivalProfile } from './rivalProfiles';
import { isRivalAtPeace } from './rivalPeace';

export type RivalPresenceMode = 'trading' | 'gathering' | 'recovering' | 'preparing' | 'scouting' | 'quiet' | 'under_treaty';

export interface RivalPresenceSummary {
  /** The single normalized profile used by all frontier-panel readings. */
  profile: RivalProfile;
  mode: RivalPresenceMode;
  modeLabel: string;
  stanceLabel: string;
  latestContact: string;
  history: string[];
}

function actionMode(action: RivalDailyAction | undefined, treaty: boolean): RivalPresenceMode {
  if (treaty) return 'under_treaty';
  switch (action) {
    case 'trade': return 'trading';
    case 'gather': return 'gathering';
    case 'recover':
    case 'cool_down': return 'recovering';
    case 'fortify': return 'preparing';
    case 'scout': return 'scouting';
    default: return 'quiet';
  }
}

function modeLabel(mode: RivalPresenceMode): string {
  switch (mode) {
    case 'trading': return 'Trading for provisions';
    case 'gathering': return 'Gathering supplies';
    case 'recovering': return 'Recovering after exertion';
    case 'preparing': return 'Preparing the camp';
    case 'scouting': return 'Scouting the frontier';
    case 'under_treaty': return 'Under a peace treaty';
    default: return 'Quiet at camp';
  }
}

function stanceLabel(rival: RivalSettlement): string {
  switch (rival.relationship) {
    case 'friendly': return 'Friendly neighbor';
    case 'competitive': return 'Competitive neighbor';
    case 'tense': return 'Tense border';
    default: return 'Neutral neighbor';
  }
}

export function getRivalPresenceSummary(state: Pick<WorldState, 'eventLog' | 'pendingDiplomacyEvents'>, rival: RivalSettlement): RivalPresenceSummary {
  const profile = normalizeRivalProfile(rival);
  const mode = actionMode(profile.lastAction, isRivalAtPeace(rival));
  const contactEvents = (state.eventLog ?? [])
    .filter((event) => event.entityName === rival.name)
    .slice(0, 3)
    .map((event) => event.message);
  const pending = (state.pendingDiplomacyEvents ?? []).find((event) => event.rivalId === rival.id);
  return {
    profile,
    mode,
    modeLabel: modeLabel(mode),
    stanceLabel: stanceLabel(rival),
    latestContact: contactEvents[0] ?? (pending ? pending.title : 'No recent contact recorded'),
    history: contactEvents,
  };
}
