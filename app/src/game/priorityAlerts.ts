import type { WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
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

  if (state.resources.food < Math.max(15, humans * 1.5)) {
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
        x: blacksmith.x + blacksmith.width / 2,
        y: blacksmith.y + blacksmith.height / 2,
      },
    });
  }

  const outstandingForge = getOutstandingForgeOrder(state);
  if (outstandingForge && alerts.length < 4) {
    const order = getForgeOrder(outstandingForge)!;
    if (blacksmith) {
      alerts.push({
        id: `forge-queue-${outstandingForge}`,
        severity: 'warning',
        icon: order.emoji,
        title: `Queue ${order.label}`,
        detail: `Forge at Blacksmith · ${formatForgeInputs(order.inputs)} · ~6 staffed days`,
        action: {
          type: 'focus_building',
          buildingId: blacksmith.id,
          x: blacksmith.x + blacksmith.width / 2,
          y: blacksmith.y + blacksmith.height / 2,
        },
      });
    } else {
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