import type { WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import {
  canLaunchRaidOnRival,
  canProvokeRival,
  formatCampDistance,
  formatRaidDeadline,
  getCampDistancePixels,
  getCombatPreview,
  getOutgoingRaidActionLabel,
  getOutgoingRaidFoodCostForRival,
  getRivalRaidStrength,
} from './frontierCombat';
import { countCompletedDefenseBuildings, getBarracksGuardCount } from './defenseStructures';
import { computeMilitiaBreakdown, getMilitiaArmamentLabel } from './militiaBalance';
import { isRivalAtPeace } from './rivalPeace';
import { getRivalProfileLabel } from './rivalProfiles';
import { getRivalPresenceSummary } from './rivalPresence';
import { formatRivalPopulationLabel } from './rivalDisplay';

/** Input counts are supplied by the world-event owner; this projection only reads them. */
export interface FrontierPanelCounts {
  pendingRaidCount: number;
  pendingOutgoingRaidCount: number;
  pendingDiplomacyCount: number;
}

/**
 * The Frontier panel's single read-only view projection.
 * Simulation owners retain all combat, economy, diplomacy, and population rules.
 * React only renders these prepared values and dispatches explicit user commands.
 */
export function projectFrontierPanel(state: WorldState, counts: FrontierPanelCounts) {
  const pendingRaids = state.pendingRaidEvents ?? [];
  const pendingDiplomacy = state.pendingDiplomacyEvents ?? [];
  const livingIds = new Set(state.entities.filter((person) => person.alive).map((person) => person.id));
  const militia = computeMilitiaBreakdown(state, state.entities);
  const guards = getBarracksGuardCount(state, state.buildings);
  const barracksCount = countCompletedDefenseBuildings(state.buildings, BuildingType.Barracks);
  const wallSegments = countCompletedDefenseBuildings(state.buildings, [BuildingType.Wall, BuildingType.WallGate]);
  const firstPendingRaid = pendingRaids[0];
  const previewRival = firstPendingRaid
    ? state.rivalSettlements.find((r) => r.id === firstPendingRaid.rivalId)
    : undefined;

  const combatPreview = firstPendingRaid
    ? getCombatPreview(state, {
      attackerStrength: firstPendingRaid.attackerStrength
        ?? (previewRival ? getRivalRaidStrength(previewRival) : undefined),
      rival: previewRival,
      incomingPayoffFood: firstPendingRaid.lootFood,
    })
    : null;

  const battleReports = (state.raidBattleReports ?? []).slice(-5).reverse().map((report) => ({
    ...report,
    sideLabel: report.side === 'defense' ? 'Defending against' : 'Raiding',
    leadershipMeritLabel: `${report.leadershipMerit > 0 ? '+' : ''}${report.leadershipMerit}`,
    unlistedEnemyLosses: report.enemyDeaths - report.enemyFallen.length,
    showRecoveryAdvice: report.side === 'defense' && report.outcome !== 'decisive',
  }));

  const rivals = state.rivalSettlements.map((rival) => {
    const raid = pendingRaids.find((event) => event.rivalId === rival.id);
    const diplomacy = pendingDiplomacy.some((event) => event.rivalId === rival.id);
    const presence = getRivalPresenceSummary(state, rival);
    const profile = presence.profile;
    const raidFoodCost = getOutgoingRaidFoodCostForRival(state, rival);
    const warBands = (state.pendingOutgoingRaidEvents ?? [])
      .filter((army) => army.rivalId === rival.id)
      .map((army) => ({
        id: army.id,
        phaseLabel: army.phase === 'returning' ? 'Returning'
          : army.phase === 'fighting' ? 'Battle underway'
            : army.phase === 'engaging' ? 'Arrived' : 'Marching',
        marchingSoldiers: army.soldierIds?.filter((id) => livingIds.has(id)).length ?? 0,
        canRecall: army.phase !== 'returning' && army.phase !== 'fighting',
      }));
    return {
      id: rival.id,
      name: rival.name,
      relationship: rival.relationship,
      populationLabel: formatRivalPopulationLabel(rival),
      distanceLabel: formatCampDistance(getCampDistancePixels(state, state.buildings, rival)),
      raidFoodCost,
      isAtPeace: isRivalAtPeace(rival),
      peaceTreatyDays: rival.peaceTreatyDays,
      profileLabel: getRivalProfileLabel(profile),
      stanceLabel: presence.stanceLabel,
      valleyMemoryLabel: rival.diplomacyMemory
        ? `Valley memory: trust ${rival.diplomacyMemory.trust} · fear ${rival.diplomacyMemory.fear} · grievance ${rival.diplomacyMemory.grievance}`
        : null,
      statusLabel: presence.modeLabel,
      ledgerLabel: `Ledger: ${profile.ledger.food} food · ${profile.ledger.wood} wood · ${profile.ledger.gold} gold · morale ${profile.ledger.morale}% · recovery ${profile.ledger.recovery}%`,
      latestContact: presence.latestContact,
      historyLabel: presence.history.length > 1 ? presence.history.slice(1, 3).join(' · ') : null,
      pendingLabel: [
        raid ? `⚔️ Raid — ${formatRaidDeadline(raid, state.tick)}` : null,
        diplomacy ? '📜 Diplomacy pending' : null,
      ].filter(Boolean).join(' · '),
      warBands,
      raidEligibility: canLaunchRaidOnRival(state, rival),
      provokeEligibility: canProvokeRival(state, rival),
      outgoingRaidAction: getOutgoingRaidActionLabel(state, rival.id),
    };
  });

  return {
    isEmpty: state.visitorGroups.length === 0 && rivals.length === 0
      && counts.pendingRaidCount === 0 && counts.pendingOutgoingRaidCount === 0
      && counts.pendingDiplomacyCount === 0 && battleReports.length === 0,
    hasAlerts: counts.pendingRaidCount > 0 || counts.pendingOutgoingRaidCount > 0 || counts.pendingDiplomacyCount > 0,
    ...counts,
    militia,
    guards,
    barracksCount,
    wallSegments,
    guardsColorClass: guards > 0 ? 'text-violet-300' : 'text-amber-400',
    barracksSuffix: barracksCount > 0 ? ` / ${barracksCount} barracks` : '',
    armament: getMilitiaArmamentLabel(state) ?? 'Unarmed adults',
    battleReports,
    combatPreview,
    visitors: state.visitorGroups.map((group) => ({
      id: group.id,
      name: group.name,
      description: `${group.kind} · ${group.daysLeft}d · click for trade & leader`,
      x: group.campX,
      y: group.campY,
    })),
    rivals,
  };
}

