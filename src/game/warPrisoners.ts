import type { Entity, RivalSettlement, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType, EntityType, JobType } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycleClock';
import { prisonPrisonerCapacity } from './prisonShifts';
import { getSimRng } from './simRng';
import { addReputation } from './simHelpers';
import { formatCitizenName } from './citizenId';
import { logDeath, logEvent } from './eventLog';
import { killHuman } from './dayCycle';
import { ensureEntityByIdMap, unindexEntityFromState } from './entityIndex';
import { clearWorkerAssignment } from './workforce';
import { moveResident, assignMissingResidences } from './residencyReconciliation';
import { applyLeaderHousePhase } from './leaderHouse';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { rememberRivalDisposition } from './raidAftermath';
import { getOpenPlayerBeds } from './populationGrowth';

const RECRUIT_COOLDOWN_DAYS = 7;
const RECRUIT_BASE_CHANCE = 0.2;
const RECRUIT_ATTEMPT_PENALTY = 0.05;
const RECRUIT_MAX_CHANCE = 0.6;
const CAPTURE_HISTORY_LIMIT = 200;
const TRUST_RECRUIT_SCALE = 200;
const RELEASE_REPUTATION = 3;
const EXECUTION_REPUTATION = -20;
const MAX_CUSTODY_OPINION_MERIT = 5;
const CUSTODY_LEADERSHIP_LIMIT = 100;

/** Only surviving, identifiable adult combatants can occupy a real prison cell. */
export function captureRaidPrisoners(state: WorldState, rival: RivalSettlement, raidId: string, escorts: number): void {
  let availableEscorts = escorts;
  const candidates = state.entities.filter((person) => person.alive && person.faction === 'rival'
    && person.type === EntityType.Human && person.job === JobType.Soldier && !person.isJuvenile
    && person.age >= HUMAN_ADULT_MIN_AGE && rival.entityIds.includes(person.id) && !person.warCaptive);
  for (const person of candidates) {
    if (availableEscorts <= 0 || rival.population <= 1) break;
    const prison = state.buildings.find((building) => building.type === BuildingType.Prison && building.completed
      && building.faction !== 'rival' && state.entities.filter((entry) => entry.alive
        && entry.prisonBuildingId === building.id).length < prisonPrisonerCapacity(BUILDING_CONFIGS[building.type].maxOccupants));
    if (!prison) break;
    clearWorkerAssignment(person, state.buildings);
    moveResident(person, undefined, 'departure', { buildings: state.buildings });
    person.prisonBuildingId = prison.id;
    person.warCaptive = { raidId, originRivalId: rival.id, capturedAtTick: state.tick,
      recruitAfterTick: state.tick + RECRUIT_COOLDOWN_DAYS * TICKS_PER_DAY, attempts: 0 };
    if (!prison.occupants.includes(person.id)) prison.occupants.push(person.id);
    rival.entityIds = rival.entityIds.filter((id) => id !== person.id);
    rival.population--;
    recordWarPrisonerOutcome(state, person, 'captured');
    availableEscorts--;
  }
}

/** A single identity-linked custody record is updated rather than replaying captures or rewards. */
function recordWarPrisonerOutcome(state: WorldState, person: Entity,
  status: NonNullable<WorldState['raidPrisonerHistory']>[number]['status']): void {
  const custody = person.warCaptive;
  if (!custody) return;
  const previous = (state.raidPrisonerHistory ?? []).filter((entry) => entry.entityId !== person.id);
  state.raidPrisonerHistory = [...previous.slice(-(CAPTURE_HISTORY_LIMIT - 1)), {
    entityId: person.id, name: formatCitizenName(person), raidId: custody.raidId,
    originRivalId: custody.originRivalId, status, tick: state.tick,
  }];
  logEvent(state, 'prison', `${formatCitizenName(person)} — enemy combatant ${status}`, formatCitizenName(person));
}

/** A released or escaped captive leaves alive; departure is never recorded as a death. */
export function departWarPrisoner(state: WorldState, person: Entity, status: 'released' | 'escaped'): void {
  if (!person.warCaptive) return;
  recordWarPrisonerOutcome(state, person, status);
  const home = state.rivalSettlements.find((rival) => rival.id === person.warCaptive!.originRivalId);
  if (home) home.population++;
  for (const building of state.buildings) building.occupants = building.occupants.filter((id) => id !== person.id);
  person.prisonBuildingId = undefined;
  person.prisonerUntilTick = undefined;
  person.departedAlive = true;
  unindexEntityFromState(state, person.id);
  state.entities = state.entities.filter((entry) => entry.id !== person.id);
}

/** Villagers' existing traits shape political reactions without awarding another military victory. */
function applyCaptiveCommunityReaction(state: WorldState, choice: 'release' | 'execution'): void {
  const villagers = state.entities.filter((person) => person.alive && isPlayerHuman(person));
  const empathetic = villagers.filter((person) => person.traits?.some((trait) => trait === 'nurturing' || trait === 'chivalrous')).length;
  const fierce = villagers.filter((person) => person.traits?.includes('fierce')).length;
  const opinion = choice === 'execution' ? -Math.max(1, Math.round(MAX_CUSTODY_OPINION_MERIT * empathetic / Math.max(1, villagers.length)))
    : empathetic > fierce ? 1 : 0;
  const leader = villagers.find((person) => person.id === state.villageLeaderId);
  if (leader && opinion !== 0) leader.battleLeadershipMerit = Math.max(-CUSTODY_LEADERSHIP_LIMIT,
    Math.min(CUSTODY_LEADERSHIP_LIMIT, (leader.battleLeadershipMerit ?? 0) + opinion));
  logEvent(state, 'prison', `Community reaction to ${choice}: ${empathetic} compassionate voices, ${fierce} fierce voices; leadership standing ${opinion > 0 ? '+' : ''}${opinion}.`);
}

/** Worker-authoritative prisoner decisions preserve identity and require willing, adult recruitment. */
export function resolveWarPrisoner(original: WorldState, entityId: number, choice: string): WorldState {
  const current = original.entities.find((person) => person.id === entityId && person.alive
    && person.warCaptive && person.prisonBuildingId != null);
  if (!current || !['keep', 'release', 'recruit', 'execute_confirmed'].includes(choice)) return original;
  if (choice === 'keep') return original;
  if (choice === 'recruit' && (original.tick < current.warCaptive!.recruitAfterTick
    || playerHumanCount(original.entities) >= original.maxHumanPopulation || getOpenPlayerBeds(original) <= 0)) return original;
  const state = structuredClone(original);
  const person = state.entities.find((entry) => entry.id === entityId)!;
  const rival = state.rivalSettlements.find((entry) => entry.id === person.warCaptive!.originRivalId);
  if (choice === 'release') {
    departWarPrisoner(state, person, 'released');
    addReputation(state, RELEASE_REPUTATION);
    applyCaptiveCommunityReaction(state, 'release');
    if (rival) rememberRivalDisposition(state, rival, 'release');
  } else if (choice === 'execute_confirmed') {
    recordWarPrisonerOutcome(state, person, 'executed');
    killHuman(person, state.buildings, ensureEntityByIdMap(state), state.tick, state);
    logDeath(state, `${formatCitizenName(person)} executed after capture`, formatCitizenName(person),
      { x: person.x, y: person.y }, 'enemy');
    addReputation(state, EXECUTION_REPUTATION);
    applyCaptiveCommunityReaction(state, 'execution');
    if (rival) rememberRivalDisposition(state, rival, 'execution');
    for (const building of state.buildings) building.occupants = building.occupants.filter((id) => id !== person.id);
  } else {
    const custody = person.warCaptive!;
    const chance = Math.max(0, Math.min(RECRUIT_MAX_CHANCE, RECRUIT_BASE_CHANCE
      + (rival?.diplomacyMemory?.trust ?? 0) / TRUST_RECRUIT_SCALE - custody.attempts * RECRUIT_ATTEMPT_PENALTY));
    custody.attempts++;
    custody.recruitAfterTick = state.tick + RECRUIT_COOLDOWN_DAYS * TICKS_PER_DAY;
    if (getSimRng('warPrisoners')() >= chance) {
      logEvent(state, 'prison', `${formatCitizenName(person)} declined the offer to join; another offer must wait.`, formatCitizenName(person));
      return state;
    }
    recordWarPrisonerOutcome(state, person, 'recruited');
    if (rival) rememberRivalDisposition(state, rival, 'recruitment');
    for (const building of state.buildings) building.occupants = building.occupants.filter((id) => id !== person.id);
    person.prisonBuildingId = undefined;
    person.prisonerUntilTick = undefined;
    person.prisonSentenceCrime = undefined;
    person.faction = undefined;
    person.groupId = undefined;
    person.job = JobType.Settler;
    person.occupation = undefined;
    person.warCaptive = undefined;
    assignMissingResidences(state.entities.filter(isPlayerHuman), state.buildings, state.entities, undefined, state.genealogyRegistry,
      (ledger) => applyLeaderHousePhase(state, ledger));
  }
  return state;
}
