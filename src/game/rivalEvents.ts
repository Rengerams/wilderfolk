import { unindexEntityFromState } from './entityIndex';
import type { Entity, GameEventLog, RivalSettlement, WorldState } from './gameTypes';
import { getColonyDay } from './dayCycle';
import { maybeQueueRaid } from './frontierCombat';
import { isRivalAtPeace } from './rivalPeace';
import { applyRivalDailyAction, canRivalCampGrow, ensureRivalProfile, getRivalGrowthFoodCost, isRivalGrowthDay, selectRivalDailyAction } from './rivalProfiles';
import { getSimRng } from './simRng';
import { addCappedResource } from './resourceUtils';
import { addReputation } from './simHelpers';
import { maybeFoundRivalSettlement } from './rivalSettlements';

/** Reputation all tense camps together may drain per day, however many roll. */
const MAX_TENSE_REP_DRAIN_PER_DAY = 2;

export interface RivalEventCallbacks {
  pushNews: (state: WorldState, title: string, message: string, type: 'positive' | 'negative' | 'neutral') => void;
  logEvent: (state: WorldState, type: GameEventLog['type'], message: string, subject?: string) => void;
  tickPendingDiplomacyEvents: (state: WorldState) => void;
  queueDiplomacyEvent: (state: WorldState, rival: RivalSettlement) => void;
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

/**
 * Load-only migration: drops every legacy rival-faction entity. Rival settlements are strategic
 * records, never on-map people, so no current build spawns one; 0.6.5.0/0.6.5.1 saves still can.
 */
export function pruneOrphanRivalEntities(state: WorldState): number {
  let pruned = 0;
  for (const entity of state.entities ?? []) {
    if (entity.faction !== 'rival') continue;
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
      callbacks.logEvent(state, 'trade', `${rival.name} sent a trade gift (+${gold} gold)`, rival.name);
    } else if (
      rival.relationship === 'tense'
      && tenseRepDrainToday < MAX_TENSE_REP_DRAIN_PER_DAY
      && getSimRng('rivalEvents')() < 0.4
    ) {
      const drain = Math.min(2, MAX_TENSE_REP_DRAIN_PER_DAY - tenseRepDrainToday);
      addReputation(state, -drain);
      tenseRepDrainToday += drain;
      callbacks.pushNews(state, '⚡ Border Tension', `${rival.name} grumbles about your expansion. Reputation -${drain}.`, 'negative');
    } else if (rival.relationship === 'neutral' && getSimRng('rivalEvents')() < 0.3) {
      callbacks.logEvent(state, 'event', `${rival.name} scouts were seen mapping the river bend`, rival.name);
    }
  }
}
