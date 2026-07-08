import type { WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { ACTIVE_VICTORY_PATHS } from './victory';
import { getVillageLeader, getYearsUntilElection, formatSettlerName } from './villageLeadership';
import { hasIronSpears, hasStoneSpears } from './combat';
import { formatRaidDeadline } from './frontierCombat';
import {
  findCompletedBlacksmith,
  formatForgeInputs,
  getForgeOrder,
  getOutstandingForgeOrder,
  isBlacksmithStaffed,
} from './forge';

export type FocusHintActionId =
  | 'open_goals'
  | 'open_frontier'
  | 'open_trade'
  | 'open_research'
  | 'open_village'
  | 'open_nature'
  | 'open_log'
  | 'build_house'
  | 'build_farm'
  | 'focus_visitor'
  | 'focus_rival'
  | 'focus_blacksmith'
  | 'build_blacksmith';

export interface FocusHintAction {
  label: string;
  id: FocusHintActionId;
  visitorId?: string;
  visitorX?: number;
  visitorY?: number;
  rivalId?: string;
  rivalX?: number;
  rivalY?: number;
  rivalBuildingId?: number;
  buildingId?: number;
  buildingX?: number;
  buildingY?: number;
}

export interface FocusHint {
  icon: string;
  title: string;
  detail: string;
  /** One-click jump — RimWorld / Banished contextual guidance pattern */
  action?: FocusHintAction;
}

export function getFocusHints(state: WorldState, buildings = state.buildings): FocusHint[] {
  const hints: FocusHint[] = [];
  const humans = state.humanPopulation;
  const completedBuildings = buildings.filter((b) => b.completed).length;
  const houses = buildings.filter(
    (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  ).length;

  if (state.victoryAchieved) {
    const won = state.victories.find((v) => v.path === state.victoryAchieved);
    hints.push({
      icon: '🏆',
      title: `Victory: ${won?.label ?? 'Legacy achieved'}`,
      detail: 'You won — keep playing to shape the chronicle, or start a new map with a different path.',
    });
    return hints.slice(0, 4);
  }

  const housesNeeded = humans > 0 && houses === 0;
  if (housesNeeded) {
    hints.push({
      icon: '🏠',
      title: 'Build shelter',
      detail: 'Press B → Housing → House (or key 1), then click the map.',
      action: { label: 'Place house', id: 'build_house' },
    });
  }

  const nextChallenge = state.challenges.find((c) => !c.completed);
  if (nextChallenge) {
    hints.push({
      icon: '🎯',
      title: nextChallenge.title,
      detail: `${nextChallenge.description}${nextChallenge.rewardText ? ` · Reward: ${nextChallenge.rewardText}` : ''}`,
      action: { label: 'View challenge', id: 'open_goals' },
    });
  }

  const activeLegacies = state.victories
    .filter((v) => ACTIVE_VICTORY_PATHS.includes(v.path as (typeof ACTIVE_VICTORY_PATHS)[number]) && !v.achieved)
    .sort((a, b) => b.progress - a.progress);

  if (activeLegacies[0]) {
    const v = activeLegacies[0];
    const legacyIcon = {
      eco_utopia: '🌿',
      great_city: '🏰',
      trade_empire: '💰',
      harmony: '🐺',
    }[v.path] ?? '🎯';
    hints.push({
      icon: legacyIcon,
      title: `Win condition: ${v.label}`,
      detail: `${v.description} — ${v.progress}% complete.`,
      action: { label: 'Victory paths', id: 'open_goals' },
    });
  }

  if (state.resources.food < Math.max(20, humans * 2)) {
    hints.push({
      icon: '🍖',
      title: 'Feed the village',
      detail: 'Farms, hunting, and meal stores keep settlers alive. Low food stalls growth and risks exhaustion deaths.',
      action: { label: 'Place farm', id: 'build_farm' },
    });
  }

  const leader = getVillageLeader(state);
  const until = getYearsUntilElection(state);
  if (!leader && state.pendingElectionYear != null) {
    hints.push({
      icon: '👑',
      title: 'Leadership vacancy',
      detail: until > 0
        ? `No village head — merit election in ${until} year${until === 1 ? '' : 's'} (Year ${state.pendingElectionYear}).`
        : 'Merit election imminent — settlers will gather soon.',
      action: { label: 'Leadership', id: 'open_village' },
    });
  } else if (leader) {
    if (until === 0) {
      hints.push({
        icon: '🗳️',
        title: 'Leadership election this year',
        detail: `Year ${state.year} — ${formatSettlerName(leader)} is running again; skills decide most races, with a modest record edge from economy, scandals, and village health.`,
        action: { label: 'Leadership', id: 'open_village' },
      });
    } else if (until <= 2) {
      hints.push({
        icon: '👑',
        title: `Village head: ${formatSettlerName(leader)}`,
        detail: `Election in ${until} year${until === 1 ? '' : 's'} — merit from skills, age, Town Hall duty; sitting head gets a modest record bonus or penalty.`,
        action: { label: 'Leadership', id: 'open_village' },
      });
    }
  }

  if (state.visitorGroups.length > 0) {
    const group = state.visitorGroups[0];
    hints.push({
      icon: '🧳',
      title: `${group.name} on the map`,
      detail: `Visitors (${group.kind}) stay ${group.daysLeft} more days — click camp to talk to their leader or trade.`,
      action: {
        label: 'Show camp',
        id: 'focus_visitor',
        visitorId: group.id,
        visitorX: group.campX,
        visitorY: group.campY,
      },
    });
  }

  if (state.rivalSettlements.length > 0) {
    const rival = state.rivalSettlements[0];
    hints.push({
      icon: '🏕️',
      title: `${rival.name} — ${rival.relationship}`,
      detail: `${rival.population} rival settlers camped nearby. Gifts, peace, trade pacts, or raids from their camp.`,
      action: {
        label: 'Show rival camp',
        id: 'focus_rival',
        rivalId: rival.id,
        rivalX: rival.campX,
        rivalY: rival.campY,
        rivalBuildingId: rival.buildingIds[0],
      },
    });
  }

  if (
    humans >= 8
    && state.visitorGroups.length === 0
    && state.rivalSettlements.length === 0
    && state.year >= 5
  ) {
    hints.push({
      icon: '🗺️',
      title: 'The world will answer',
      detail: 'Pilgrims, performers, and rival camps arrive as reputation and years grow — keep building toward 25+ population.',
    });
  }

  const readyRoute = state.tradeRoutes.find(
    (r) => !r.active && state.villageReputation >= r.reputationRequired,
  );
  const nextRoute = state.tradeRoutes.find(
    (r) => !r.active && state.villageReputation < r.reputationRequired,
  );

  if (readyRoute) {
    hints.push({
      icon: '🤝',
      title: `Open trade with ${readyRoute.targetName}`,
      detail: 'Establish the route for steady gold and resources.',
      action: { label: 'Trade routes', id: 'open_trade' },
    });
  } else if (nextRoute && completedBuildings >= 5) {
    hints.push({
      icon: '⭐',
      title: `Reputation ${state.villageReputation} / ${nextRoute.reputationRequired}`,
      detail: `Raise ⭐ for ${nextRoute.targetName} — staff Town Hall & Hospital, host festivals, avoid scandals.`,
    });
  }

  if (state.activeResearch) {
    const node = state.researchNodes.find((n) => n.id === state.activeResearch);
    if (node) {
      hints.push({
        icon: '🔬',
        title: node.name,
        detail: `${Math.round(state.researchProgress)}% researched — ${node.description}`,
        action: { label: 'Research', id: 'open_research' },
      });
    }
  }

  const blacksmith = findCompletedBlacksmith(state, buildings);
  if (state.villageForge.activeOrder && blacksmith && !isBlacksmithStaffed(state, buildings)) {
    const order = getForgeOrder(state.villageForge.activeOrder);
    hints.push({
      icon: '🔨',
      title: 'Forge paused',
      detail: `${order?.label ?? 'Iron gear'} is ${Math.round(state.villageForge.progress)}% — assign a worker to the Blacksmith.`,
      action: {
        label: 'Open Blacksmith',
        id: 'focus_blacksmith',
        buildingId: blacksmith.id,
        buildingX: blacksmith.x + blacksmith.width / 2,
        buildingY: blacksmith.y + blacksmith.height / 2,
      },
    });
  }

  const outstandingForge = getOutstandingForgeOrder(state);
  if (outstandingForge) {
    const order = getForgeOrder(outstandingForge)!;
    hints.push({
      icon: order.emoji,
      title: `Forge ${order.label}`,
      detail: blacksmith
        ? `Queue at Blacksmith · ${formatForgeInputs(order.inputs)} · ~6 staffed days`
        : 'Research done — build & complete a Blacksmith (Industry), then queue the order.',
      action: blacksmith
        ? {
          label: 'Open Blacksmith',
          id: 'focus_blacksmith',
          buildingId: blacksmith.id,
          buildingX: blacksmith.x + blacksmith.width / 2,
          buildingY: blacksmith.y + blacksmith.height / 2,
        }
        : { label: 'Build Blacksmith', id: 'build_blacksmith' },
    });
  }

  if ((state.pendingOutgoingRaidEvents?.length ?? 0) > 0) {
    const march = state.pendingOutgoingRaidEvents![0];
    hints.push({
      icon: '🏹',
      title: march.rivalResponse === 'payoff_offer' ? 'Tribute on the table' : 'Attack orders',
      detail: `${march.rivalName} — accept their payoff or press the attack before the war-band stands down.`,
      action: { label: 'Frontier tab', id: 'open_frontier' },
    });
  } else if ((state.pendingRaidEvents?.length ?? 0) > 0) {
    const raid = state.pendingRaidEvents![0];
    hints.push({
      icon: '⚔️',
      title: 'Raid incoming!',
      detail: `${raid.rivalName} — ${formatRaidDeadline(raid, state.tick)}. Defend, pay ${raid.lootFood}🍖 tribute, or counter-raid their camp from the rival inspector.`,
      action: { label: 'Frontier tab', id: 'open_frontier' },
    });
  } else if (state.rivalSettlements.some((r) => r.relationship === 'tense' || r.relationship === 'competitive')) {
    const armed = hasIronSpears(state) || hasStoneSpears(state);
    hints.push({
      icon: armed ? '🛡️' : '⚠️',
      title: armed ? 'Border tension' : 'Arm the militia',
      detail: armed
        ? 'Tense rivals may raid you — defend incoming war-bands, or raid their camp first (food cost scales with distance). Counter-raid only after they attack.'
        : 'Research Stone Spears (Defense) before rivals raid your stores.',
      action: { label: armed ? 'Frontier' : 'Research spears', id: armed ? 'open_frontier' : 'open_research' },
    });
  }

  if (!state.unlockedTechs.includes('architecture_2') && completedBuildings >= 8) {
    hints.push({
      icon: '🏛️',
      title: 'Path to township',
      detail: 'Research Urban Planning → Town Hall: staff officials for taxes, trade, immigration, elections, and hosted festivals.',
      action: { label: 'Research tree', id: 'open_research' },
    });
  }

  if (hints.length < 3) {
    hints.push({
      icon: '📜',
      title: 'Living story',
      detail: 'Families, affairs, births, and moon howlers write your chronicle — Log tab or download the .txt file.',
    });
  }

  const seen = new Set<string>();
  return hints.filter((h) => {
    if (seen.has(h.title)) return false;
    seen.add(h.title);
    return true;
  }).slice(0, 4);
}