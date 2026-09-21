import type { WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { countHomelessSettlers } from './residencyOccupancy';
import { isFoodCritical } from './resourceUtils';
import { getBuildingCenter } from './placementUtils';
import {
  findCompletedBlacksmith,
  formatForgeInputs,
  getForgeOrder,
  getOutstandingForgeOrder,
  isBlacksmithStaffed,
} from './forge';
import { formatRaidDeadline, formatRaidLootSummary, raidEventLoot } from './frontierCombat';

export type PriorityAlertSeverity = 'critical' | 'warning' | 'info';

export type PriorityAlertAction =
  | { type: 'tab'; tab: 'village' | 'frontier' | 'nature' | 'progress' | 'log' | 'more'; progressSub?: 'research' | 'trade' | 'goals' }
  | { type: 'build'; building: BuildingType }
  | { type: 'focus_rival'; rivalId: string; x: number; y: number; buildingId?: number }
  | { type: 'focus_visitor'; groupId: string; x: number; y: number }
  | { type: 'focus_building'; buildingId: number; x: number; y: number };

export interface PriorityAlert {
  id: string;
  severity: PriorityAlertSeverity;
  icon: string;
  title: string;
  detail: string;
  action: PriorityAlertAction;
}

const SEVERITY_RANK: Record<PriorityAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Homeless settlers at which the housing nudge escalates from `info` to `warning`. One or two
 * settlers without a bed is worth saying (they never get the home-rest saving in `humanNeeds`) but
 * must not crowd the strip's `warning` tier, which the raid/diplomacy cards use.
 */
const HOMELESS_WARNING_THRESHOLD = 3;

/** RimWorld-style priority strip — top urgent items only, click to jump. */
export function getPriorityAlerts(state: WorldState): PriorityAlert[] {
  const alerts: PriorityAlert[] = [];
  const humans = state.humanPopulation;
  const houses = state.buildings.filter(
    (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  ).length;

  for (const evt of state.pendingRaidEvents ?? []) {
    const rival = state.rivalSettlements.find((r) => r.id === evt.rivalId);
    alerts.push({
      id: `raid-${evt.id}`,
      severity: 'critical',
      icon: '⚔️',
      title: 'Raid incoming',
      detail: `${evt.rivalName} — ${formatRaidDeadline(evt, state.tick)} · ${evt.lootFood}🍖 at risk`,
      action: rival
        ? { type: 'focus_rival', rivalId: rival.id, x: rival.campX, y: rival.campY, buildingId: rival.buildingIds[0] }
        : { type: 'tab', tab: 'frontier' },
    });
  }

  for (const evt of state.pendingOutgoingRaidEvents ?? []) {
    const rival = state.rivalSettlements.find((r) => r.id === evt.rivalId);
    const deadline = formatRaidDeadline(
      { createdAtTick: evt.createdAtTick, expiresAtTick: evt.expiresAtTick } as import('./frontierCombat').RaidEvent,
      state.tick,
    );
    alerts.push({
      id: `outgoing-${evt.id}`,
      severity: 'warning',
      icon: '🏹',
      title: evt.rivalResponse === 'payoff_offer' ? 'Tribute offered' : 'Press the attack',
      detail: `${evt.rivalName} — ${deadline} · ${formatRaidLootSummary(raidEventLoot(evt))}`,
      action: rival
        ? { type: 'focus_rival', rivalId: rival.id, x: rival.campX, y: rival.campY, buildingId: rival.buildingIds[0] }
        : { type: 'tab', tab: 'frontier' },
    });
  }

  for (const evt of state.pendingDiplomacyEvents ?? []) {
    const rival = state.rivalSettlements.find((r) => r.id === evt.rivalId);
    alerts.push({
      id: `diplo-${evt.id}`,
      severity: 'warning',
      icon: '📜',
      title: 'Diplomacy needs response',
      detail: evt.title,
      action: rival
        ? { type: 'focus_rival', rivalId: rival.id, x: rival.campX, y: rival.campY, buildingId: rival.buildingIds[0] }
        : { type: 'tab', tab: 'frontier' },
    });
  }

  if (isFoodCritical(state)) {
    alerts.push({
      id: 'low-food',
      severity: state.resources.food < humans ? 'critical' : 'warning',
      icon: '🍖',
      title: 'Food running low',
      detail: `${Math.floor(state.resources.food)}🍖 stored · assign farms or hunt`,
      action: { type: 'build', building: BuildingType.Farm },
    });
  }

  if (humans > 0 && houses === 0) {
    alerts.push({
      id: 'need-shelter',
      severity: 'critical',
      icon: '🏠',
      title: 'Build shelter',
      detail: 'Settlers need a house before night',
      action: { type: 'build', building: BuildingType.House },
    });
  }

  // Homelessness *with a house standing* was invisible on the strip: the only housing alert fired when
  // there was no house at all, so a colony whose beds ran out — the normal case, because immigration
  // outruns housing by design — said nothing, even though a settler without a residence never gets the
  // home-rest energy saving (`humanNeeds`). The count is the residence owner's
  // (`residencyOccupancy.countHomelessSettlers`), which excludes prisoners on purpose — imprisonment
  // clears `residenceBuildingId`, and counting them here is the mistake the council report already made
  // (`LIVE-FINDINGS-STATUS.md`, F10). Copy mirrors the housing hint in `focusHints.ts`.
  const homeless = countHomelessSettlers(state);
  if (houses > 0 && homeless > 0) {
    alerts.push({
      id: 'housing-short',
      severity: homeless >= HOMELESS_WARNING_THRESHOLD ? 'warning' : 'info',
      icon: '🏠',
      title: 'Build more housing',
      detail: `${homeless} settler${homeless === 1 ? '' : 's'} without a bed — place another House`,
      action: { type: 'build', building: BuildingType.House },
    });
  }

  const blacksmith = findCompletedBlacksmith(state);
  const forge = state.villageForge;
  if (forge?.activeOrder && blacksmith && !isBlacksmithStaffed(state)) {
    const order = getForgeOrder(forge.activeOrder);
    alerts.push({
      id: 'forge-unstaffed',
      severity: 'warning',
      icon: '🔨',
      title: 'Forge paused',
      detail: `${order?.label ?? 'Iron gear'} at ${Math.round(forge.progress)}% — staff the Blacksmith`,
      action: {
        type: 'focus_building',
        buildingId: blacksmith.id,
        ...getBuildingCenter(blacksmith),
      },
    });
  }

  const outstandingForge = getOutstandingForgeOrder(state);
  if (outstandingForge && alerts.length < 4) {
    const order = getForgeOrder(outstandingForge);
    if (order && blacksmith) {
      alerts.push({
        id: `forge-queue-${outstandingForge}`,
        severity: 'warning',
        icon: order.emoji,
        title: `Queue ${order.label}`,
        detail: `Forge at Blacksmith · ${formatForgeInputs(order.inputs)} · ~6 staffed days`,
        action: {
          type: 'focus_building',
          buildingId: blacksmith.id,
          ...getBuildingCenter(blacksmith),
        },
      });
    } else if (order) {
      alerts.push({
        id: `forge-need-smith-${outstandingForge}`,
        severity: 'warning',
        icon: '🔨',
        title: 'Build Blacksmith',
        detail: `${order.label} researched — complete a Blacksmith, then queue the forge`,
        action: { type: 'build', building: BuildingType.Blacksmith },
      });
    }
  }

  const hasMarket = state.buildings.some(
    (b) => b.completed && b.faction !== 'rival' && b.type === BuildingType.Market,
  );
  if (!hasMarket && state.villageReputation >= 15) {
    alerts.push({
      id: 'trade-need-market',
      severity: 'info',
      icon: '🏛️',
      title: 'Market required for trade',
      detail: 'Build a Market before establishing long-range routes',
      action: { type: 'build', building: BuildingType.Market },
    });
  } else {
    const readyRoute = state.tradeRoutes.find(
      (r) => !r.active && state.villageReputation >= r.reputationRequired,
    );
    if (readyRoute) {
      alerts.push({
        id: `trade-${readyRoute.id}`,
        severity: 'info',
        icon: '🤝',
        title: `Trade route ready`,
        detail: `Establish ${readyRoute.targetName}`,
        action: { type: 'tab', tab: 'progress', progressSub: 'trade' },
      });
    }
  }

  const activeChallenge = state.challenges.find((c) => !c.completed);
  if (activeChallenge && alerts.length < 4) {
    alerts.push({
      id: `challenge-${activeChallenge.id}`,
      severity: 'info',
      icon: '🎯',
      title: activeChallenge.title,
      detail: activeChallenge.description.slice(0, 72),
      action: { type: 'tab', tab: 'progress', progressSub: 'goals' },
    });
  }

  alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return alerts.slice(0, 4);
}