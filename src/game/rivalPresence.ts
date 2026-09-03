import type { RivalSettlement, WorldState } from './gameTypes';
import { normalizeRivalProfile } from './rivalProfiles';

export type RivalPresenceMode = 'trading' | 'recovering' | 'preparing' | 'scouting' | 'quiet' | 'under_treaty';

export interface RivalPresenceSummary {
  mode: RivalPresenceMode;
  modeLabel: string;
  stanceLabel: string;
  latestContact: string;
  history: string[];
  cueColor: 'cyan' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';
}

function actionMode(action: string | undefined, treaty: boolean): RivalPresenceMode {
  if (treaty) return 'under_treaty';
  switch (action) {
    case 'trade': return 'trading';
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

function cueColor(rival: RivalSettlement, mode: RivalPresenceMode): RivalPresenceSummary['cueColor'] {
  if (mode === 'under_treaty') return 'cyan';
  if (rival.relationship === 'tense') return 'rose';
  if (rival.relationship === 'competitive') return 'orange';
  if (rival.relationship === 'friendly') return 'emerald';
  if (mode === 'recovering') return 'cyan';
  return 'amber';
}

export function getRivalPresenceSummary(state: Pick<WorldState, 'eventLog' | 'pendingDiplomacyEvents'>, rival: RivalSettlement): RivalPresenceSummary {
  const profile = normalizeRivalProfile(rival);
  const mode = actionMode(profile.lastAction, rival.peaceTreatyDays > 0);
  const contactEvents = (state.eventLog ?? [])
    .filter((event) => event.entityName === rival.name)
    .slice(0, 3)
    .map((event) => event.message);
  const pending = (state.pendingDiplomacyEvents ?? []).find((event) => event.rivalId === rival.id);
  return {
    mode,
    modeLabel: modeLabel(mode),
    stanceLabel: stanceLabel(rival),
    latestContact: contactEvents[0] ?? (pending ? pending.title : 'No recent contact recorded'),
    history: contactEvents,
    cueColor: cueColor(rival, mode),
  };
}

export function getRivalActivityLabel(state: Pick<WorldState, 'eventLog' | 'pendingDiplomacyEvents'>, rival: RivalSettlement): string {
  return getRivalPresenceSummary(state, rival).modeLabel;
}
