import type { WorldState } from './gameTypes';
import { BuildingType, EntityType, Season } from './gameTypes';
import type { VisitorKind } from './gameTypes';
import type { FocusHintAction } from './focusHints';
import { NIGHT_START, TICKS_PER_DAY } from './dayCycle';
import { isPlayerHuman } from './groupEvents';

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
  | 'first_birth'
  | 'first_marriage'
  | 'festival_started'
  | 'leadership_election'
  | 'first_challenge_done'
  | 'victory_progress';

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
    detail: 'Select the building on the map and press + Worker to staff it. Lumber mills, farms, and wells only produce when workers are assigned.',
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
    detail: 'A settler carries the curse — human most nights, dangerous every 14 days on full moons. Staff a Church; at dawn after the hunt the priest may break the curse while they are still in Moon Howler (🌝) form — no need to bring them to the church.',
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
    detail: 'The first male pioneer leads until Year 10. After that, merit elections every 10 years with a ceremony. The sitting head always runs when eligible; economy, scandals, and village health give a modest record edge or penalty — but a high-merit challenger can still win. See Village → Leadership.',
    action: { label: 'Leadership', id: 'open_village' },
  },
  first_challenge_done: {
    id: 'first_challenge_done',
    icon: '🎯',
    title: 'Challenge completed',
    detail: 'Challenges in Progress → Goals reward resources for milestones. They guide early priorities without forcing a single storyline.',
    action: { label: 'Goals', id: 'open_goals' },
  },
  victory_progress: {
    id: 'victory_progress',
    icon: '🏆',
    title: 'Victory path advancing',
    detail: 'Progress → Goals lists four legacies: Eco-Utopia (250 + eco), Great City (400 + 60 buildings), Trade Empire (7 walking caravan routes, 40 trips, 50k trade gold), Harmony (8 wild wolves + 15 wildkin). Expand “How each path works” for detail.',
    action: { label: 'Victory paths', id: 'open_goals' },
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

/** Mark topics already present when loading a save so tips do not replay. */
export function seedTutorialSeenForExistingState(state: WorldState): string[] {
  const seen = new Set<string>(state.tutorialSeen ?? []);

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
  if (state.resources.food < Math.max(15, state.humanPopulation * 1.5)) seen.add('low_food');
  if (state.ecosystemHealth < 30) seen.add('ecosystem_low');
  const hasRecordedBirth = state.yearlyStats.some((ys) => ys.births.humans > 0);
  const hasBornChild = state.entities.some(
    (e) => e.alive && isPlayerHuman(e) && e.isJuvenile && (e.motherId != null || e.generation > 1),
  );
  if (hasRecordedBirth || hasBornChild) seen.add('first_birth');
  if (state.entities.some((e) => e.alive && isPlayerHuman(e) && e.relationshipStatus === 'married')) {
    seen.add('first_marriage');
  }
  if (state.festival?.active) seen.add('festival_started');
  if (state.challenges.some((c) => c.completed)) seen.add('first_challenge_done');
  if (state.victories.some((v) => v.progress >= 25)) seen.add('victory_progress');
  if (state.villageLeaderId != null && state.lastElectionYear > 0) seen.add('leadership_election');

  return [...seen];
}

/** Detect first-time mechanics since the previous tick. */
export function detectContextualTutorials(
  prev: WorldState,
  curr: WorldState,
): ContextualTutorialTip[] {
  const tips: ContextualTutorialTip[] = [];
  const queue = (id: ContextualTutorialId) => {
    if (!hasSeen(curr, id)) tips.push(CONTEXTUAL_TUTORIALS[id]);
  };

  const hasHouse = curr.buildings.some((b) => b.completed && b.type === BuildingType.House);
  if (
    curr.tick < TICKS_PER_DAY
    && curr.tick >= NIGHT_START - 48
    && !hasHouse
  ) {
    queue('shelter_night');
  }

  const prevCompleted = prev.buildings.filter((b) => b.completed).length;
  const currCompleted = curr.buildings.filter((b) => b.completed).length;
  if (currCompleted > prevCompleted) queue('first_building_done');

  if (staffedBuildings(prev) === 0 && staffedBuildings(curr) > 0) {
    queue('first_worker_assigned');
  }

  if (prev.visitorGroups.length === 0 && curr.visitorGroups.length > 0) {
    queue('visitors_arrived');
  }
  for (const group of curr.visitorGroups) {
    const topic = VISITOR_TOPIC[group.kind];
    if (!prev.visitorGroups.some((g) => g.kind === group.kind)) queue(topic);
  }

  if (prev.rivalSettlements.length === 0 && curr.rivalSettlements.length > 0) {
    queue('rivals_arrived');
  }

  if ((prev.pendingDiplomacyEvents?.length ?? 0) === 0 && (curr.pendingDiplomacyEvents?.length ?? 0) > 0) {
    queue('diplomacy_event');
  }

  if ((prev.pendingRaidEvents?.length ?? 0) === 0 && (curr.pendingRaidEvents?.length ?? 0) > 0) {
    queue('raid_incoming');
  }

  if (prev.season !== Season.Winter && curr.season === Season.Winter) {
    queue('first_winter');
  }

  if (!prev.activeResearch && curr.activeResearch) queue('research_started');

  const prevResearched = prev.researchNodes.filter((n) => n.researched).length;
  const currResearched = curr.researchNodes.filter((n) => n.researched).length;
  if (currResearched > prevResearched) queue('research_complete');

  const newlyReady = curr.tradeRoutes.find(
    (r) =>
      !r.active
      && curr.villageReputation >= r.reputationRequired
      && prev.villageReputation < r.reputationRequired,
  );
  if (newlyReady) queue('trade_route_ready');

  const prevActiveRoutes = prev.tradeRoutes.filter((r) => r.active).length;
  const currActiveRoutes = curr.tradeRoutes.filter((r) => r.active).length;
  if (currActiveRoutes > prevActiveRoutes) queue('trade_route_opened');

  const prevCursed = prev.entities.some((e) => e.alive && e.moonHowlerCursed);
  const currCursed = curr.entities.some((e) => e.alive && e.moonHowlerCursed);
  if (!prevCursed && currCursed) queue('moon_howler_curse');

  const prevHuntingWere = prev.entities.some(
    (e) => e.alive && e.type === EntityType.Werewolf && e.moonHowlerCursed,
  );
  const currHuntingWere = curr.entities.some(
    (e) => e.alive && e.type === EntityType.Werewolf && e.moonHowlerCursed,
  );
  if (!prevHuntingWere && currHuntingWere) queue('moon_howler_hunt');

  const foodThreshold = (pop: number, food: number) => food < Math.max(15, pop * 1.5);
  if (
    !foodThreshold(prev.humanPopulation, prev.resources.food)
    && foodThreshold(curr.humanPopulation, curr.resources.food)
  ) {
    queue('low_food');
  }

  if (prev.ecosystemHealth >= 30 && curr.ecosystemHealth < 30) queue('ecosystem_low');

  const prevBabyIds = new Set(
    prev.entities.filter((e) => e.alive && isPlayerHuman(e) && e.isJuvenile).map((e) => e.id),
  );
  const prevBirthKeys = new Set(
    prev.eventLog.filter((e) => e.type === 'birth').map((e) => `${e.tick}|${e.message}`),
  );
  const newBirth = curr.eventLog.some(
    (e) => e.type === 'birth' && !prevBirthKeys.has(`${e.tick}|${e.message}`),
  );
  const livingNewborn = curr.entities.some(
    (e) => e.alive && isPlayerHuman(e) && e.isJuvenile && !prevBabyIds.has(e.id),
  );
  if (newBirth && livingNewborn) {
    queue('first_birth');
  }

  const prevMarried = prev.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && e.relationshipStatus === 'married',
  ).length;
  const currMarried = curr.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && e.relationshipStatus === 'married',
  ).length;
  if (currMarried > prevMarried) queue('first_marriage');

  if (!prev.festival?.active && curr.festival?.active) queue('festival_started');

  if (curr.lastElectionYear === curr.year && prev.lastElectionYear !== curr.lastElectionYear) {
    queue('leadership_election');
  }

  const prevChallengesDone = prev.challenges.filter((c) => c.completed).length;
  const currChallengesDone = curr.challenges.filter((c) => c.completed).length;
  if (currChallengesDone > prevChallengesDone) queue('first_challenge_done');

  const crossedVictory = curr.victories.find(
    (v) => v.progress >= 25 && (prev.victories.find((pv) => pv.path === v.path)?.progress ?? 0) < 25,
  );
  if (crossedVictory) queue('victory_progress');

  return tips;
}

export function markTutorialsSeen(state: WorldState, ids: ContextualTutorialId[]): WorldState {
  const merged = new Set([...(state.tutorialSeen ?? []), ...ids]);
  return {
    ...state,
    tutorialSeen: [...merged],
  };
}