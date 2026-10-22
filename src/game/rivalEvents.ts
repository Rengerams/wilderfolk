import type { Building, Entity, GameEventLog, RivalSettlement, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { getColonyDay } from './dayCycle';
import { canRivalCampGrow, getRivalGrowthFoodCost, isRivalGrowthDay, maybeQueueRaid } from './frontierCombat';
import { isRivalAtPeace } from './rivalPeace';
import { applyRivalDailyAction, ensureRivalProfile, selectRivalDailyAction } from './rivalProfiles';
import { getSimRng } from './simRng';
import { addCappedResource } from './resourceUtils';
import { addReputation } from './simHelpers';
import { adjustPollutionLevel } from './dailyEcology';

export interface RivalEventCallbacks {
  pushNews: (state: WorldState, title: string, message: string, type: 'positive' | 'negative' | 'neutral') => void;
  pushFloat: (state: WorldState, x: number, y: number, text: string, color: string) => void;
  logEvent: (state: WorldState, type: GameEventLog['type'], message: string, subject?: string) => void;
  tickPendingDiplomacyEvents: (state: WorldState) => void;
  queueDiplomacyEvent: (state: WorldState, rival: RivalSettlement) => void;
  killWildGameForPoach: (state: WorldState, animal: Entity) => void;
}

function buildAliveDeerList(allAlive: Entity[]): Entity[] {
  return allAlive.filter((entity) => (
    entity.alive && entity.type === EntityType.Deer && entity.tamedBy == null
  ));
}

function makeNextAliveDeer(deerList: Entity[]): () => Entity | undefined {
  let index = 0;
  return () => {
    while (index < deerList.length) {
      const deer = deerList[index];
      if (deer?.alive) return deer;
      index++;
    }
    return undefined;
  };
}

/**
 * Legacy village camp structures, removed in place; returns the ids that left the map.
 *
 * The deleted camp producer was the only writer of `faction: 'rival'`, so every such building is one.
 */
export function retireLegacyCampStructures(buildings: Building[]): Set<number> {
  const retired = new Set<number>();
  for (let index = buildings.length - 1; index >= 0; index--) {
    const building = buildings[index];
    if (building.faction !== 'rival') continue;
    retired.add(building.id);
    buildings.splice(index, 1);
  }
  return retired;
}

export function tickRivalSettlements(
  state: WorldState,
  allAlive: Entity[],
  callbacks: RivalEventCallbacks,
): void {
  // Called once per day by tickDailyWorldEvents at 18:00. The former midnight-only
  // isNewCalendarDayTick guard prevented peace treaties, raid cooldowns and rival
  // growth from advancing at all during normal gameplay.


  callbacks.tickPendingDiplomacyEvents(state);
  // Retire legacy village camp structures wherever they sit, not only where a rival row still lists
  // them; strategic population and raid records stay authoritative.
  const retiredStructures = retireLegacyCampStructures(state.buildings);
  for (const entity of allAlive) {
    if (entity.residenceBuildingId != null && retiredStructures.has(entity.residenceBuildingId)) {
      entity.residenceBuildingId = undefined;
    }
    if (entity.workerBuildingId != null && retiredStructures.has(entity.workerBuildingId)) {
      entity.workerBuildingId = undefined;
    }
  }
  for (const rival of state.rivalSettlements) {
    const entityIds = new Set(rival.entityIds);
    for (const entity of allAlive) {
      if (entityIds.has(entity.id) && entity.faction === 'rival' && entity.groupId === rival.id) {
        entity.alive = false;
      }
    }
    rival.buildingIds = [];
    rival.entityIds = [];
  }
  const nextDeer = makeNextAliveDeer(buildAliveDeerList(allAlive));
  let tenseRepDrainToday = 0;
  const maxTenseRepDrainPerDay = 2;

  for (const rival of state.rivalSettlements) {
    ensureRivalProfile(rival);
    if (rival.raidCooldownDays > 0) rival.raidCooldownDays--;
    if (rival.peaceTreatyDays > 0) {
      rival.peaceTreatyDays--;
      if (rival.peaceTreatyDays === 0) {
        callbacks.logEvent(state, 'event', `Peace treaty with ${rival.name} expired`, rival.name);
      }
    }

    // Raids roll every day: `raidCooldownDays` and the chance roll are the cadence, so this must not
    // sit under the action-timer gate below (which is reached once per 45–90 days).
    if (!isRivalAtPeace(rival)) maybeQueueRaid(state, rival, allAlive);

    // Growth rolls on its own cadence: the action-timer gate below is reached once per 45-90 days,
    // so a camp that only grew there stayed at its founding size for years.
    if (
      state.year > rival.foundedYear + 1
      && isRivalGrowthDay(state.rivalSettlements.indexOf(rival), getColonyDay(state))
      && canRivalCampGrow(rival)
      && getSimRng('rivalEvents')() < 0.45
    ) {
      const profile = ensureRivalProfile(rival);
      profile.ledger.food = Math.max(0, profile.ledger.food - getRivalGrowthFoodCost());
      rival.population++;
      callbacks.logEvent(state, 'event', `${rival.name} grew — ${rival.population} souls at the camp`, rival.name);
    }

    rival.daysUntilAction--;
    if (rival.daysUntilAction > 0) continue;
    rival.daysUntilAction = 45 + Math.floor(getSimRng('rivalEvents')() * 45);

    const profile = ensureRivalProfile(rival);
    const action = selectRivalDailyAction(profile, rival.relationship);
    const outcome = applyRivalDailyAction(profile, action);
    profile.lastAction = outcome.changed ? action : 'none';
    profile.lastActionDay = getColonyDay(state);
    if (outcome.changed) {
      callbacks.logEvent(state, 'event', `${rival.name} ${outcome.summary}`, rival.name);
    }

    if (getSimRng('rivalEvents')() < 0.35) callbacks.queueDiplomacyEvent(state, rival);

    if (rival.relationship === 'friendly' && getSimRng('rivalEvents')() < 0.6) {
      const gold = 12 + Math.floor(getSimRng('rivalEvents')() * 18);
      // Gift through the resource owner — the clamp used to delete the surplus of an over-cap purse
      // while the float and the chronicle announced "Trade +Ng".
      addCappedResource(state, 'gold', gold);
      callbacks.pushFloat(state, rival.campX, rival.campY - 20, `Trade +${gold}g`, '#22d3ee');
      callbacks.logEvent(state, 'trade', `${rival.name} sent a trade gift (+${gold} gold)`, rival.name);
    } else if (rival.relationship === 'competitive') {
      const deer = nextDeer();
      if (deer && getSimRng('rivalEvents')() < 0.5) {
        callbacks.killWildGameForPoach(state, deer);
        callbacks.pushFloat(state, deer.x, deer.y - 15, `${rival.name} hunted`, '#fb923c');
        callbacks.logEvent(state, 'event', `${rival.name} hunters took game from the shared wilds`, rival.name);
      }
      // Queued, not written: `pollutionLevel` is derived and `tickEcosystemMetrics` recomputes it
      // later in this same daily tick, so a direct `+=` here was erased before anyone could read it
      adjustPollutionLevel(state, 0.5);
    } else if (
      rival.relationship === 'tense'
      && tenseRepDrainToday < maxTenseRepDrainPerDay
      && getSimRng('rivalEvents')() < 0.4
    ) {
      addReputation(state, -2);
      tenseRepDrainToday++;
      callbacks.pushNews(state, '⚡ Border Tension', `${rival.name} grumbles about your expansion. Reputation -2.`, 'negative');
    } else if (rival.relationship === 'neutral' && getSimRng('rivalEvents')() < 0.3) {
      callbacks.logEvent(state, 'event', `${rival.name} scouts were seen mapping the river bend`, rival.name);
    }
  }
}
