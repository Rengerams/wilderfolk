import type { RaidEvent, RivalSettlement, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycleClock';
import { isPlayerHuman } from './playerHuman';
import { isResidenceBuilding } from './housingModel';
import { demolishBuildingsInPlace } from './buildingMaintenanceActions';
import { JobType } from './gameTypes';
import { logEvent } from './eventLog';
import { evaluateAptitudeInfluence } from './personality/traitEvaluation';
import { addReputation } from './simHelpers';

const RECOVERY_PROTECTION_DAYS = 7;
const RECOVERY_FOOD_DAYS = 3;
const RECOVERY_MIN_FOOD = 40;
const OVERWHELMING_BREACH_RATIO = 6;
const DEVASTATION_BUILDING_DAMAGE = 80;
const DIPLOMACY_MEMORY_LIMIT = 100;
const WITNESS_DISTANCE = 750;
const MAX_CUSTODY_OPINION_MERIT = 5;
const CUSTODY_LEADERSHIP_LIMIT = 100;
/** A villager whose civic score clears this band adds a real restraint or severity voice. */
const CIVIC_VOICE_THRESHOLD = 0.04;
const DIPLOMACY_MEMORY_EFFECTS = {
  mercy: { trust: 10, fear: 0, grievance: -10 }, tribute: { trust: -5, fear: 5, grievance: 10 },
  raze: { trust: -25, fear: 25, grievance: 25 }, release: { trust: 5, fear: 0, grievance: -5 },
  execution: { trust: -20, fear: 15, grievance: 20 }, recruitment: { trust: 5, fear: 0, grievance: 5 },
} as const;

/** Terminal settlement status is independent of pause or playback controls. */
export function isSettlementDestroyed(state: Pick<WorldState, 'raidRecovery'>): boolean {
  return state.raidRecovery?.status === 'destroyed';
}

/** Preserve a surviving colony; extinction additionally requires hostile intent and a failed last defense. */
export function beginRaidRecovery(state: WorldState, event: RaidEvent, outcome: string,
  defenseStrength: number, before: Pick<WorldState, 'buildings' | 'resources'>): void {
  if (isSettlementDestroyed(state) || !['defeat', 'stalemate', 'unanswered'].includes(outcome)) return;
  const lastDefense = state.entities.some((person) => person.alive && isPlayerHuman(person)
    && person.job === JobType.Soldier && person.prisonBuildingId == null
    && (!person.raidDeploymentId || person.raidDeploymentId === event.id));
  if (event.intent === 'raze' && outcome !== 'stalemate' && !lastDefense
    && event.attackerStrength >= Math.max(1, defenseStrength) * OVERWHELMING_BREACH_RATIO) {
    const ruinedIds: number[] = [];
    for (const home of state.buildings) {
      if (!home.completed || home.faction === 'rival') continue;
      home.health = Math.max(0, home.health - DEVASTATION_BUILDING_DAMAGE);
      if (home.health === 0) ruinedIds.push(home.id);
    }
    demolishBuildingsInPlace(state, ruinedIds, 'raid');
    logEvent(state, 'combat', 'The remaining defenses were breached; the razing force devastated unprotected infrastructure.', event.rivalName, 'defense', 'resolved');
  }
  const people = state.entities.filter((person) => person.alive && isPlayerHuman(person));
  const shelter = state.buildings.some((home) => isResidenceBuilding(home) && home.faction !== 'rival' && home.health > 0);
  const defenses = state.buildings.some((home) => home.completed && home.faction !== 'rival' && home.health > 0
    && ([BuildingType.Wall, BuildingType.WallGate, BuildingType.Watchtower, BuildingType.Barracks] as BuildingType[]).includes(home.type));
  const destroyed = event.intent === 'raze' && outcome !== 'stalemate'
    && event.attackerStrength >= Math.max(1, defenseStrength) * OVERWHELMING_BREACH_RATIO
    && !lastDefense && !defenses && (!shelter || people.length === 0);
  const previous = state.raidRecovery;
  const currentBuildings = new Map(state.buildings.map((home) => [home.id, home]));
  const repairs = new Map((previous?.repairs ?? []).filter((repair) => currentBuildings.has(repair.buildingId))
    .map((repair) => [repair.buildingId, repair.health]));
  for (const home of before.buildings) {
    const current = currentBuildings.get(home.id);
    if (home.faction !== 'rival' && current && current.health < home.health) {
      repairs.set(home.id, Math.max(repairs.get(home.id) ?? 0, home.health));
    }
  }
  state.raidRecovery = {
    status: destroyed ? 'destroyed' : 'recovering', raidId: event.id, rivalName: event.rivalName,
    startedAtTick: previous?.startedAtTick ?? state.tick,
    protectedUntilTick: Math.max(previous?.protectedUntilTick ?? 0, state.tick + RECOVERY_PROTECTION_DAYS * TICKS_PER_DAY),
    reason: destroyed ? 'The razing force broke the last resistance; no functional settlement remains.'
      : 'Repair battle damage, rebuild food reserves and restore defenses.',
    repairs: [...repairs].map(([buildingId, health]) => ({ buildingId, health })),
    foodTarget: Math.max(previous?.foodTarget ?? 0,
      Math.min(before.resources.food, Math.max(RECOVERY_MIN_FOOD, people.length * RECOVERY_FOOD_DAYS))),
  };
  if (destroyed) {
    state.paused = true;
    state.humanPopulation = people.length;
  }
  logEvent(state, 'combat', destroyed ? 'The settlement has fallen. The final save and Chronicle remain available.'
    : 'The village survived and entered recovery; new raids are held off briefly.', event.rivalName, 'defense', 'resolved');
}

/** Recovery ends from actual repairs and supplies, never from reopening a report. */
export function tickRaidRecovery(state: WorldState): void {
  const recovery = state.raidRecovery;
  if (!recovery || recovery.status === 'destroyed') return;
  if (state.tick < recovery.protectedUntilTick || state.resources.food < recovery.foodTarget) return;
  const buildings = new Map(state.buildings.map((home) => [home.id, home]));
  if (recovery.repairs.some((repair) => {
    const home = buildings.get(repair.buildingId);
    return home != null && home.health < repair.health;
  })) return;
  delete state.raidRecovery;
  logEvent(state, 'combat', 'The village recovered its battle damage and food reserves.', recovery.rivalName, 'defense', 'resolved');
}

/** Only nearby witnesses learn a disposition; trust, fear and grievance remain distinct bounded memories. */
export function rememberRivalDisposition(state: WorldState, target: RivalSettlement,
  choice: keyof typeof DIPLOMACY_MEMORY_EFFECTS): void {
  const effect = DIPLOMACY_MEMORY_EFFECTS[choice];
  for (const rival of state.rivalSettlements) {
    if (rival.id !== target.id && Math.hypot(rival.campX - target.campX, rival.campY - target.campY) > WITNESS_DISTANCE) continue;
    const memory = rival.diplomacyMemory ??= { trust: 0, fear: 0, grievance: 0 };
    memory.trust = Math.max(-DIPLOMACY_MEMORY_LIMIT, Math.min(DIPLOMACY_MEMORY_LIMIT,
      memory.trust + effect.trust));
    memory.fear = Math.min(DIPLOMACY_MEMORY_LIMIT, memory.fear + effect.fear);
    memory.grievance = Math.max(0, Math.min(DIPLOMACY_MEMORY_LIMIT,
      memory.grievance + effect.grievance));
  }
}

/**
 * Warfare decisions are political, not a fixed morality score: villagers respond to their own traits
 * and recent threats. Called once by the authoritative settled-raid transition.
 */
export function applyWarCommunityReaction(state: WorldState,
  choice: 'release' | 'execution' | 'mercy' | 'tribute' | 'raze', rivalId: string,
  context?: { brokeTreaty?: boolean }): void {
  const villagers = state.entities.filter((person) => person.alive && isPlayerHuman(person));
  let empathetic = 0;
  let fierce = 0;
  for (const villager of villagers) {
    const civic = evaluateAptitudeInfluence(villager, 'communityReaction').factor;
    if (civic >= 1 + CIVIC_VOICE_THRESHOLD) empathetic++;
    else if (civic <= 1 - CIVIC_VOICE_THRESHOLD) fierce++;
  }
  const activeWar = state.rivalSettlements.some((rival) => rival.id === rivalId && rival.atWarWithPlayer);
  const recentAttack = state.raidBattleReports?.some((report) => report.rivalId === rivalId && report.side === 'defense'
    && report.resolvedAtTick <= state.tick && report.resolvedAtTick >= state.tick - 30 * TICKS_PER_DAY) ?? false;
  const underThreat = activeWar || recentAttack;
  const threatVoices = underThreat ? Math.ceil(villagers.length / 4) : 0;
  // A war started by breaking a peace treaty lacks the public's "they threatened us" support.
  const brokenPactVoices = context?.brokeTreaty ? Math.ceil(villagers.length / 3) : 0;
  const coercive = choice === 'execution' || choice === 'tribute' || choice === 'raze';
  const sentiment = coercive
    ? fierce + threatVoices - empathetic - brokenPactVoices
    : empathetic - fierce - threatVoices + brokenPactVoices;
  const intensity = choice === 'tribute' ? 0.5 : 1;
  const opinion = sentiment === 0 ? 0 : Math.sign(sentiment) * Math.min(MAX_CUSTODY_OPINION_MERIT,
    Math.max(1, Math.round(MAX_CUSTODY_OPINION_MERIT * intensity * Math.abs(sentiment) / Math.max(1, villagers.length))));
  const leader = villagers.find((person) => person.id === state.villageLeaderId);
  if (leader && opinion !== 0) leader.battleLeadershipMerit = Math.max(-CUSTODY_LEADERSHIP_LIMIT,
    Math.min(CUSTODY_LEADERSHIP_LIMIT, (leader.battleLeadershipMerit ?? 0) + opinion));
  if (opinion !== 0) addReputation(state, opinion);
  logEvent(state, choice === 'release' || choice === 'execution' ? 'prison' : 'combat',
    `Community reaction to ${choice}: ${empathetic} favor restraint, ${fierce} favor severity; ${underThreat ? 'recent attack or active war' : 'no recent attack or active war'}${context?.brokeTreaty ? '; the war began by breaking a peace treaty' : ''}; leadership standing ${opinion > 0 ? '+' : ''}${opinion}.`);
}
