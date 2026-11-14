import { moveResident } from './housingPipeline';
import { unindexEntityFromState } from './entityIndex';
import type { Building, Entity, GameEventLog, RivalSettlement, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { getColonyDay } from './dayCycle';
import { canRivalCampGrow, getRivalGrowthFoodCost, isRivalGrowthDay, maybeQueueRaid } from './frontierCombat';
import { isRivalAtPeace } from './rivalPeace';
import { applyRivalDailyAction, ensureRivalProfile, selectRivalDailyAction } from './rivalProfiles';
import { getSimRng } from './simRng';
import { clearWorkerAssignment } from './workforce';
import { addCappedResource } from './resourceUtils';
import { addReputation } from './simHelpers';
import { adjustPollutionLevel } from './dailyEcology';
import { maybeFoundRivalSettlement } from './rivalSettlements';
import type { TickContext } from './simulation/simulationTypes';

/** Reputation all tense camps together may drain per day, however many roll. */
const MAX_TENSE_REP_DRAIN_PER_DAY = 2;

export interface RivalEventCallbacks {
  pushNews: (state: WorldState, title: string, message: string, type: 'positive' | 'negative' | 'neutral') => void;
  pushFloat: (state: WorldState, x: number, y: number, text: string, color: string) => void;
  logEvent: (state: WorldState, type: GameEventLog['type'], message: string, subject?: string) => void;
  tickPendingDiplomacyEvents: (state: WorldState) => void;
  queueDiplomacyEvent: (state: WorldState, rival: RivalSettlement) => void;
  killWildGameForPoach: (state: WorldState, animal: Entity, ctx?: TickContext) => void;
}


/** Hands out the deer alive at pulse start, stepping past any a poach killed meanwhile. */
export function makeNextAliveDeer(allAlive: Entity[]): () => Entity | undefined {
  const deer = allAlive.filter((entity) => (
    entity.alive && entity.type === EntityType.Deer && entity.tamedBy == null
  ));
  let index = 0;
  return () => {
    while (index < deer.length) {
      const next = deer[index];
      if (next?.alive) return next;
      index++;
    }
    return undefined;
  };
}

/** Retires every rival-faction camp building in place; returns the ids that left the map. */
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

/** Drops residence, workplace and prison pointers into structures the retirement removed. */
function releaseRetiredStructureReferences(
  entity: Entity,
  retired: Set<number>,
  buildings: Building[],
): void {
  if (entity.workerBuildingId != null && retired.has(entity.workerBuildingId)) {
    clearWorkerAssignment(entity, buildings);
  }
  if (entity.residenceBuildingId != null && retired.has(entity.residenceBuildingId)) {
    moveResident(entity, undefined, 'demolition', { buildings });
  }
  if (entity.prisonBuildingId != null && retired.has(entity.prisonBuildingId)) {
    entity.prisonBuildingId = undefined;
    entity.prisonerUntilTick = undefined;
    entity.prisonSentenceCrime = undefined;
  }
}

/**
 * Retire a rival-faction entity that leaves the map alive: a departure, never a death, so it gets no
 * grave, death log or death tally — only the shared departure marker and removal from the live index.
 */
function departRivalEntity(state: WorldState, entity: Entity): void {
  entity.alive = false;
  entity.departedAlive = true;
  unindexEntityFromState(state, entity.id);
}

/** Drops every legacy rival-faction entity; rival settlements are strategic records, not on-map people. */
export function pruneOrphanRivalEntities(state: WorldState): number {
  let pruned = 0;
  for (const entity of state.entities ?? []) {
    if (!entity.alive || entity.faction !== 'rival') continue;
    departRivalEntity(state, entity);
    pruned++;
  }
  if (pruned > 0) state.entities = state.entities.filter((entity) => !(entity.departedAlive && entity.faction === 'rival'));
  return pruned;
}

export function tickRivalSettlements(
  state: WorldState,
  allAlive: Entity[],
  callbacks: RivalEventCallbacks,
): void {
  // Runs once a day from `tickDailyWorldEvents`, in the 18:00 world-events phase.
  callbacks.tickPendingDiplomacyEvents(state);
  maybeFoundRivalSettlement(state, allAlive);
  pruneOrphanRivalEntities(state);

  // Camp structures never stand on the player's map; older saves may still carry them.
  const retiredStructures = retireLegacyCampStructures(state.buildings);
  for (const entity of allAlive) {
    releaseRetiredStructureReferences(entity, retiredStructures, state.buildings);
  }
  const nextDeer = makeNextAliveDeer(allAlive);
  let tenseRepDrainToday = 0;

  for (const rival of state.rivalSettlements) {
    const profile = ensureRivalProfile(rival);
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

    // Growth rolls on its own cadence, not through the 45–90-day action-timer gate below.
    if (
      state.year > rival.foundedYear + 1
      && isRivalGrowthDay(rival.id, getColonyDay(state))
      && canRivalCampGrow(rival)
      && getSimRng('rivalEvents')() < 0.45
    ) {
      profile.ledger.food = Math.max(0, profile.ledger.food - getRivalGrowthFoodCost());
      rival.population++;
      callbacks.logEvent(state, 'event', `${rival.name} grew — ${rival.population} souls at the camp`, rival.name);
    }

    rival.daysUntilAction--;
    if (rival.daysUntilAction > 0) continue;
    rival.daysUntilAction = 45 + Math.floor(getSimRng('rivalEvents')() * 45);

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
      // Gift through the resource owner so storage caps apply.
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
      && tenseRepDrainToday < MAX_TENSE_REP_DRAIN_PER_DAY
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
