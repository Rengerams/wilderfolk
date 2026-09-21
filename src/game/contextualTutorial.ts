import type { WorldState } from './gameTypes';
import { BuildingType, EntityType, Season } from './gameTypes';
import type { VisitorKind } from './gameTypes';
import type { FocusHintAction } from './focusHints';
import { NIGHT_START, TICKS_PER_DAY, getHourOfDay } from './dayCycle';
import { isPlayerHuman } from './playerHuman';
import { ELECTION_INTERVAL_YEARS } from './villageLeadership';
import { isFoodCritical } from './resourceUtils';

export type ContextualTutorialId =
  | 'shelter_night'
  | 'first_building_done'
  | 'first_worker_assigned'
  | 'visitors_arrived'
  | 'visitor_traders'
  | 'visitor_pilgrims'
  | 'visitor_scholars'
  | 'visitor_hunters'
  | 'visitor_nomads'
  | 'visitor_refugees'
  | 'visitor_performers'
  | 'rivals_arrived'
  | 'diplomacy_event'
  | 'raid_incoming'
  | 'first_winter'
  | 'research_started'
  | 'research_complete'
  | 'trade_route_ready'
  | 'trade_route_opened'
  | 'moon_howler_curse'
  | 'moon_howler_hunt'
  | 'low_food'
  | 'ecosystem_low'
  | 'valley_strained'
  | 'first_birth'
  | 'first_marriage'
  | 'festival_started'
  | 'leadership_election'
  | 'first_challenge_done';

export interface ContextualTutorialTip {
  id: ContextualTutorialId;
  icon: string;
  title: string;
  detail: string;
  action?: FocusHintAction;
}

export const CONTEXTUAL_TUTORIALS: Record<ContextualTutorialId, ContextualTutorialTip> = {
  shelter_night: {
    id: 'shelter_night',
    icon: '🌙',
    title: 'Night is approaching',
    detail: 'Build a House (key 1), click the map, then assign pioneers as workers. Settlers need shelter before nightfall on day one.',
    action: { label: 'Place house', id: 'build_house' },
  },
  first_building_done: {
    id: 'first_building_done',
    icon: '🏗️',
    title: 'Building finished',
    detail: 'Select the building on the map and press + Fill workers to staff it. Lumber mills, farms, and wells only produce when workers are assigned.',
  },
  first_worker_assigned: {
    id: 'first_worker_assigned',
    icon: '👷',
    title: 'Workers assigned',
    detail: 'Assigned settlers commute during work hours. Idle settlers eat food but produce nothing — check the Village tab for who is working.',
    action: { label: 'Village tab', id: 'open_village' },
  },
  visitors_arrived: {
    id: 'visitors_arrived',
    icon: '🧳',
    title: 'Travelers camped nearby',
    detail: 'Visitor groups appear on the map as camp markers. Click a camp (or a traveler) to open the inspector — talk to their leader and see what they offer.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  visitor_traders: {
    id: 'visitor_traders',
    icon: '🛒',
    title: 'Traders arrived',
    detail: 'Talk to the caravan master once per visit for bonus gold. Trade food and wood while they stay, and collect free gifts each day they remain camped.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  visitor_pilgrims: {
    id: 'visitor_pilgrims',
    icon: '🕯️',
    title: 'Pilgrims arrived',
    detail: 'Pilgrims raise village reputation each day and bless your village if you speak with their elder. High reputation unlocks trade routes.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  visitor_scholars: {
    id: 'visitor_scholars',
    icon: '📚',
    title: 'Scholars arrived',
    detail: 'Scholars boost active research while camped. Talk to the head scholar for a large research jump or bonus gold if nothing is researching.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  visitor_hunters: {
    id: 'visitor_hunters',
    icon: '🏹',
    title: 'Hunters arrived',
    detail: 'Wilderness hunters may poach local deer. Talk to the hunt captain to reduce poaching. They also trade provisions like traders.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  visitor_nomads: {
    id: 'visitor_nomads',
    icon: '🐎',
    title: 'Nomads arrived',
    detail: 'Nomads bring daily wood gifts and share stories. Speak with the clan head for extra timber. They can trade while camped.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  visitor_refugees: {
    id: 'visitor_refugees',
    icon: '🧳',
    title: 'Refugees arrived',
    detail: 'Families ask to join your village. Welcome all, screen applicants, or turn them away — each choice costs food and affects reputation.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  visitor_performers: {
    id: 'visitor_performers',
    icon: '🎭',
    title: 'Performers arrived',
    detail: 'Traveling players lift spirits and can start a short festival. Toast the troupe leader for extra reputation and revelry.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  rivals_arrived: {
    id: 'rivals_arrived',
    icon: '🏕️',
    title: 'Rival settlement founded',
    detail: 'Another group claimed land nearby. Click their camp to send gifts, sign peace, trade pacts, or prepare for raids. Relationship matters.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  diplomacy_event: {
    id: 'diplomacy_event',
    icon: '🤝',
    title: 'Diplomacy needed',
    detail: 'A rival demands your response. Click the alert banner or their camp in the inspector to choose pay, negotiate, refuse, or other options.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  raid_incoming: {
    id: 'raid_incoming',
    icon: '⚔️',
    title: 'Raid incoming',
    detail: 'A rival marches on your village. Open the Frontier tab or click the alert to defend, barricade, or pay them off before they arrive.',
    action: { label: 'Frontier tab', id: 'open_frontier' },
  },
  first_winter: {
    id: 'first_winter',
    icon: '❄️',
    title: 'Winter has come',
    detail: 'Settlers burn wood for heating each winter day. Stockpile wood before day 270 and keep food high — growth slows and energy drain rises.',
    action: { label: 'Nature tab', id: 'open_nature' },
  },
  research_started: {
    id: 'research_started',
    icon: '🔬',
    title: 'Research started',
    detail: 'Progress accumulates over time. Educated graduates speed research. Staff a School so children attend and mature faster. Completed tech unlocks new buildings and upgrades.',
    action: { label: 'Research tab', id: 'open_research' },
  },
  research_complete: {
    id: 'research_complete',
    icon: '✨',
    title: 'Research complete',
    detail: 'New buildings and bonuses are unlocked. Press B to browse the build catalog — locked items show which tech they need.',
    action: { label: 'Research tab', id: 'open_research' },
  },
  trade_route_ready: {
    id: 'trade_route_ready',
    icon: '⭐',
    title: 'Trade route available',
    detail: 'Your reputation is high enough to open a new trade route. Progress → Trade to establish it for steady gold and resources.',
    action: { label: 'Trade routes', id: 'open_trade' },
  },
  trade_route_opened: {
    id: 'trade_route_opened',
    icon: '🛤️',
    title: 'Trade route established',
    detail: 'Active routes send a merchant walking to the partner settlement and back — goods exchange on arrival. Keep reputation up to unlock distant routes.',
    action: { label: 'Trade routes', id: 'open_trade' },
  },
  moon_howler_curse: {
    id: 'moon_howler_curse',
    icon: '🌝',
    title: 'Moon Howler curse',
    detail: 'A settler carries the curse — human most nights, dangerous every 14 days on full moons. Staff a Church; on full-moon nights (20:00–06:00) the priest leaves home to hunt the Moon Howler and may break the curse while it is still in 🌝 form — Barracks guards nearby can protect the priest.',
  },
  moon_howler_hunt: {
    id: 'moon_howler_hunt',
    icon: '🐺',
    title: 'Moon Howler hunting',
    detail: 'On full-moon nights cursed settlers hunt your people. Barracks guards, walls, and spears help. Check Nature tab for ecosystem balance.',
    action: { label: 'Nature tab', id: 'open_nature' },
  },
  low_food: {
    id: 'low_food',
    icon: '🍖',
    title: 'Food running low',
    detail: 'Assign workers to farms, hunt deer and rabbits sustainably, or trade with visitors. Starvation and exhaustion follow empty stores.',
    action: { label: 'Place farm', id: 'build_farm' },
  },
  ecosystem_low: {
    id: 'ecosystem_low',
    icon: '🌿',
    title: 'Ecosystem under stress',
    detail: 'Town footprint, industry, and wildlife counts all move ecosystem health. Open Nature tab for the breakdown — growing villages rarely stay pristine; balance hunting with expansion.',
    action: { label: 'Nature tab', id: 'open_nature' },
  },
  valley_strained: {
    id: 'valley_strained',
    icon: '⚠️',
    title: 'Valley strained — be careful',
    detail: 'Nature shows a valley stage: Stable → Strained → Damaged → Collapse. Fix grazing, hunting, or predators while the problem is still light. Ignoring it long enough makes consequences extreme.',
    action: { label: 'Nature tab', id: 'open_nature' },
  },
  first_birth: {
    id: 'first_birth',
    icon: '👶',
    title: 'A child was born',
    detail: 'Families grow when settlers are housed, fed, and paired. Children become adults over time and expand your workforce.',
    action: { label: 'Village tab', id: 'open_village' },
  },
  first_marriage: {
    id: 'first_marriage',
    icon: '💍',
    title: 'New marriage',
    detail: 'Couples share homes and may expect children. Courtship happens near workplaces and festivals — check the Log for village drama.',
    action: { label: 'Log tab', id: 'open_log' },
  },
  festival_started: {
    id: 'festival_started',
    icon: '🎉',
    title: 'Festival in the village',
    detail: 'Revelry boosts courtship and reputation for a few days. Performers or your own events can start festivals.',
    action: { label: 'Village tab', id: 'open_village' },
  },
  leadership_election: {
    id: 'leadership_election',
    icon: '👑',
    title: 'Leadership election',
    detail: `The first male pioneer leads until Year ${ELECTION_INTERVAL_YEARS}. After that, merit elections every ${ELECTION_INTERVAL_YEARS} years with a ceremony. The sitting head always runs when eligible; economy, scandals, and village health give a modest record edge or penalty — but a high-merit challenger can still win. See Village → Leadership.`,
    action: { label: 'Leadership', id: 'open_village' },
  },
  first_challenge_done: {
    id: 'first_challenge_done',
    icon: '🎯',
    title: 'Challenge completed',
    detail: 'Challenges in Progress → Goals reward resources for milestones. They guide early priorities without forcing a single storyline.',
    action: { label: 'Goals', id: 'open_goals' },
  },
};

const VISITOR_TOPIC: Record<VisitorKind, ContextualTutorialId> = {
  traders: 'visitor_traders',
  pilgrims: 'visitor_pilgrims',
  scholars: 'visitor_scholars',
  hunters: 'visitor_hunters',
  nomads: 'visitor_nomads',
  refugees: 'visitor_refugees',
  performers: 'visitor_performers',
};

function hasSeen(state: WorldState, id: ContextualTutorialId): boolean {
  return (state.tutorialSeen ?? []).includes(id);
}

function staffedBuildings(state: WorldState): number {
  return state.buildings.filter((b) => b.completed && b.occupants.length > 0).length;
}

/**
 * Every first-time tutorial whose mechanic is **already true in this world**, derived from the current
 * state alone.
 *
 * This is the single definition of "this has happened": `seedTutorialSeenForExistingState` seeds a
 * loaded save from it so tips do not replay, and `detectContextualTutorials` reads the same derivation
 * for live play, so the two can never disagree about what counts as a first time.
 *
 * It must stay a pure function of the current world. The game loop mutates one `WorldState` in place
 * (`GameLoop.frame` calls `gameTick(this.world)`, the worker host hands back its single `worldRef`), so
 * any "since the previous tick" comparison is between an object and itself and is always false — that
 * is the defect that made no contextual tip ever appear
 * (`BUG_REPORTS/2026-09-17-contextual-tips-never-fire.md`).
 */
function derivedSeenIds(state: WorldState): Set<string> {
  const seen = new Set<string>();

  if (state.buildings.some((b) => b.completed)) seen.add('first_building_done');
  if (staffedBuildings(state) > 0) seen.add('first_worker_assigned');
  if (state.visitorGroups.length > 0) {
    seen.add('visitors_arrived');
    for (const g of state.visitorGroups) seen.add(VISITOR_TOPIC[g.kind]);
  }
  if (state.rivalSettlements.length > 0) seen.add('rivals_arrived');
  if ((state.pendingDiplomacyEvents?.length ?? 0) > 0) seen.add('diplomacy_event');
  if ((state.pendingRaidEvents?.length ?? 0) > 0) seen.add('raid_incoming');
  if (state.season === Season.Winter) seen.add('first_winter');

  if (state.activeResearch) seen.add('research_started');
  if (state.researchNodes.some((n) => n.researched)) seen.add('research_complete');
  if (state.tradeRoutes.some((r) => r.active)) seen.add('trade_route_opened');
  if (state.tradeRoutes.some((r) => !r.active && state.villageReputation >= r.reputationRequired)) {
    seen.add('trade_route_ready');
  }
  if (state.entities.some((e) => e.moonHowlerCursed)) seen.add('moon_howler_curse');
  if (state.entities.some((e) => e.type === EntityType.Werewolf && e.alive && e.moonHowlerCursed)) {
    seen.add('moon_howler_hunt');
  }
  if (isFoodCritical(state)) seen.add('low_food');
  if (state.ecosystemHealth < 30) seen.add('ecosystem_low');
  if ((state.valleyStage ?? 'stable') !== 'stable') seen.add('valley_strained');
  const hasRecordedBirth = state.yearlyStats.some((ys) => ys.births.humans > 0);
  const hasBornChild = state.entities.some(
    (e) => e.alive && isPlayerHuman(e) && e.isJuvenile && (e.motherId != null || (e.generation ?? 0) > 1),
  );
  if (hasRecordedBirth || hasBornChild) seen.add('first_birth');
  if (state.entities.some((e) => e.alive && isPlayerHuman(e) && e.relationshipStatus === 'married')) {
    seen.add('first_marriage');
  }
  if (state.festival?.active) seen.add('festival_started');
  if (state.challenges.some((c) => c.completed)) seen.add('first_challenge_done');
  if (state.villageLeaderId != null && state.lastElectionYear > 0) seen.add('leadership_election');

  return seen;
}

/** Seeds a loaded save with every mechanic already true, so a load never replays tips. */
export function seedTutorialSeenForExistingState(state: WorldState): string[] {
  return [...new Set([...(state.tutorialSeen ?? []), ...derivedSeenIds(state)])];
}

/** Detect first-time mechanics that are true right now. Takes the live world, never a previous one. */
export function detectContextualTutorials(world: WorldState): ContextualTutorialTip[] {
  const derived = derivedSeenIds(world);
  const tips: ContextualTutorialTip[] = [];
  const queue = (id: ContextualTutorialId) => {
    if (!hasSeen(world, id)) tips.push(CONTEXTUAL_TUTORIALS[id]);
  };

  // A placed (even unfinished) house counts — the player already acted, don't nag.
  const hasHouse = world.buildings.some(
    (b) => b.type === BuildingType.House && b.faction !== 'rival',
  );
  // Warn from late afternoon on day one (hour >= 16) until first house. Deliberately not part of
  // `derivedSeenIds`: it is a day-one nudge about something that has *not* happened, not a mechanic
  // that is already true, so a loaded save must not be seeded with it.
  const hour = getHourOfDay(world.tick);
  if (world.tick < TICKS_PER_DAY && hour >= Math.max(0, NIGHT_START - 4) && !hasHouse) {
    queue('shelter_night');
  }

  for (const id of derived) queue(id as ContextualTutorialId);

  return tips;
}

export function markTutorialsSeen(state: WorldState, ids: ContextualTutorialId[]): WorldState {
  const merged = new Set([...(state.tutorialSeen ?? []), ...ids]);
  return {
    ...state,
    tutorialSeen: [...merged],
  };
}