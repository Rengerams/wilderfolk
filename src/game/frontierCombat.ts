import type { Building, Entity, RivalSettlement, WorldState, RaidChoice, RaidEvent, RaidLootBundle, OutgoingRaidEvent, OutgoingRaidRivalResponse } from './gameTypes';
import { JobType, PATH_CELL } from './gameTypes';
import { TICKS_PER_DAY, killHuman } from './dayCycle';
import { ensureEntityByIdMap } from './entityIndex';
import { hasIronSpears, hasIronSwords, hasStoneSpears } from './combat';
import { formatCitizenName, formatDeathLog } from './citizenId';
import { logDeath, logEvent } from './eventLog';
import { isPlayerHuman } from './playerHuman';
import { isRivalAtPeace } from './rivalPeace';
import { gainSkill } from './skills';
import {
  canBeMustered,
  computeMilitiaBreakdown,
  getMilitiaArmamentLabel,
} from './militiaBalance';
import { getPlayerCampCenter, getPlayerCampCenterFromBuildings, getPlayerSettlerCenter } from './villageAnchor';

/**
 * The village anchor: completed player Town Hall, else House, else the living player settlers' mean,
 * else the map centre.
 *
 * The rule itself lives in `villageAnchor.ts`, which the renderer imports as well — the raid march
 * lines it draws must leave from the same point the simulated raid is marching to, and the two used
 * to disagree (`tests/villageAnchor.singleOwner.test.ts`). Re-exported through this module because
 * `frontierCombat` is where the simulation has always read it from, and `gameEngine.ts` is the
 * public surface that re-exports it from here.
 */
export { getPlayerCampCenter, getPlayerCampCenterFromBuildings, getPlayerSettlerCenter };

import { BARRICADE_RAID_COST, formatResourceCostNeed, canAffordResourceCost } from './resourceCost';
import { getSimRng } from './simRng';
import { addCappedResource } from './resourceUtils';
import { spendFood } from './economyLedger';
import { addBigNews } from './simEffects';
import { addReputation, getReputationBand } from './simHelpers';

export type { RaidChoice, RaidEvent, RaidLootBundle, OutgoingRaidEvent, OutgoingRaidRivalResponse } from './gameTypes';

const RAID_RESPONSE_MIN_DAYS = 2;
const RAID_RESPONSE_MAX_DAYS = 6;
/** Legacy fixed window for saves/events missing `expiresAtTick`. */
function getRaidExpireTicksLegacy(): number {
  return 3 * TICKS_PER_DAY;
}
const RAID_FOOD_MIN = 22;
const RAID_FOOD_MAX = 50;
/** Home-turf bonus when you attack a rival camp (harder than meeting them at your gate). */
const OUTGOING_RAID_DEFENSE_MULT = 1.25;

export function hasMilitiaWeapons(state: WorldState): boolean {
  return hasIronSwords(state) || hasIronSpears(state) || hasStoneSpears(state);
}

export function getCampDistancePixels(
  state: WorldState,
  buildings: Building[],
  camp: { campX: number; campY: number },
): number {
  const player = getPlayerCampCenter(state, buildings);
  return Math.hypot(camp.campX - player.x, camp.campY - player.y);
}

export function getCampDistanceTiles(distancePixels: number): number {
  return Math.round(distancePixels / PATH_CELL);
}

export function formatCampDistance(distancePixels: number): string {
  const tiles = getCampDistanceTiles(distancePixels);
  return `${tiles} tile${tiles === 1 ? '' : 's'}`;
}

/** How long the player has to respond — farther camps get a longer march window. */
export function getIncomingRaidResponseDays(distanceTiles: number): number {
  const extra = Math.floor(distanceTiles / 18);
  return Math.min(
    RAID_RESPONSE_MAX_DAYS,
    Math.max(RAID_RESPONSE_MIN_DAYS, RAID_RESPONSE_MIN_DAYS + extra),
  );
}

export function getIncomingRaidExpireTicks(distancePixels: number): number {
  return getIncomingRaidResponseDays(getCampDistanceTiles(distancePixels)) * TICKS_PER_DAY;
}

/**
 * When a raid expires. A legacy save that carries neither field yields `NaN` — a genuinely unknown
 * deadline, expressed *here* rather than by a wrapper at the call site, so both raid cards render the
 * same thing (duplication A16).
 */
export function getRaidExpiresAtTick(evt: RaidEvent): number {
  if (evt.expiresAtTick != null) return evt.expiresAtTick;
  if (evt.createdAtTick == null) return Number.NaN;
  return evt.createdAtTick + getRaidExpireTicksLegacy();
}

export function getRaidTicksRemaining(evt: RaidEvent, currentTick: number): number {
  return Math.max(0, getRaidExpiresAtTick(evt) - currentTick);
}

export function getRaidDaysRemaining(evt: RaidEvent, currentTick: number): number {
  return Math.max(0, Math.ceil(getRaidTicksRemaining(evt, currentTick) / TICKS_PER_DAY));
}

export function formatRaidDeadline(evt: RaidEvent, currentTick: number): string {
  // An unknown deadline must not read as "arriving now": `Math.max(0, NaN)` is NaN, and the old
  // `days <= 0` test let `NaN` fall through to `NaN days left`.
  if (!Number.isFinite(getRaidExpiresAtTick(evt))) return 'deadline unknown';
  const days = getRaidDaysRemaining(evt, currentTick);
  if (days <= 0) return 'arriving now';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/** March provisions for an outgoing raid — farther camps need more food packed. */
export function getOutgoingRaidFoodCost(distancePixels: number): number {
  const tiles = distancePixels / PATH_CELL;
  const cost = 18 + Math.round(tiles / 4);
  return Math.min(RAID_FOOD_MAX, Math.max(RAID_FOOD_MIN, cost));
}

/** Remove in-flight raid events when a truce is signed. */
export function cancelPendingRaidsForRival(state: WorldState, rivalId: string): boolean {
  const before = state.pendingRaidEvents?.length ?? 0;
  state.pendingRaidEvents = (state.pendingRaidEvents ?? []).filter((e) => e.rivalId !== rivalId);
  return (state.pendingRaidEvents?.length ?? 0) < before;
}

/** Recall a player war-band when peace is signed. */
export function cancelPendingOutgoingRaidsForRival(state: WorldState, rivalId: string): boolean {
  const before = state.pendingOutgoingRaidEvents?.length ?? 0;
  state.pendingOutgoingRaidEvents = (state.pendingOutgoingRaidEvents ?? []).filter((e) => e.rivalId !== rivalId);
  return (state.pendingOutgoingRaidEvents?.length ?? 0) < before;
}

/** Rival strength when they attack you (war-band on the march). */
export function getRivalRaidStrength(rival: RivalSettlement): number {
  const mood = rival.relationship === 'tense' ? 1.35 : rival.relationship === 'competitive' ? 1.15 : 0.9;
  return Math.round(rival.population * 12 * mood);
}

/** Rival strength when you attack their camp — includes home-turf defense bonus. */
export function getRivalDefenseStrength(rival: RivalSettlement): number {
  return Math.round(getRivalRaidStrength(rival) * OUTGOING_RAID_DEFENSE_MULT);
}

export type CounterRaidTier = 'success' | 'meager' | 'fail';

export function resolveCounterRaidRatio(attacker: number, defender: number): CounterRaidTier {
  const ratio = attacker / Math.max(defender, 1);
  if (ratio >= 1.35) return 'success';
  if (ratio >= 1.0) return 'meager';
  return 'fail';
}

function getCounterRaidBlockReason(
  state: WorldState,
  rival: RivalSettlement | undefined,
  hasWeapons: boolean,
  outgoingRaidFoodCost: number | null,
): string | null {
  if (!rival) return null;
  if (isRivalAtPeace(rival)) return `Peace treaty — ${rival.peaceTreatyDays} days left`;
  if (rival.relationship === 'friendly') return 'Friendly — cannot raid';
  if (!hasWeapons) return 'Need weapons (spears/swords)';
  if (state.humanPopulation < 8) return `Need 8+ population (have ${state.humanPopulation})`;
  if (outgoingRaidFoodCost != null && state.resources.food < outgoingRaidFoodCost) {
    return `Need ${outgoingRaidFoodCost}🍖 provisions (have ${state.resources.food})`;
  }
  return null;
}

export function getOutgoingRaidFoodCostForRival(state: WorldState, rival: RivalSettlement): number {
  return getOutgoingRaidFoodCost(getCampDistancePixels(state, state.buildings, rival));
}

/**
 * The village anchor: completed player Town Hall, else House, else the living player settlers' mean,
 * else the map centre.
 *
 * The rule itself lives in `villageAnchor.ts`, which the renderer imports as well — the raid march
 * lines it draws must leave from the same point the simulated raid is marching to, and the two used
 * to disagree (`tests/villageAnchor.singleOwner.test.ts`). The import at the top of this file is
 * re-exported because `frontierCombat` is where the simulation has always read the anchor from, and
 * `gameEngine.ts` is the public surface that re-exports it from here.
 */

export function isRaidMarchingForRival(state: WorldState, groupId: string): boolean {
  return (state.pendingRaidEvents ?? []).some((r) => r.rivalId === groupId);
}

/** True when that rival has an incoming war-band — your strike back is a counter-raid, not a first strike. */
export function isCounterRaidOnRival(state: WorldState, rivalId: string): boolean {
  return isRaidMarchingForRival(state, rivalId);
}

export function getOutgoingRaidActionLabel(state: WorldState, rivalId: string): {
  verb: string;
  buttonLabel: string;
  previewHeading: string;
} {
  if (isCounterRaidOnRival(state, rivalId)) {
    return {
      verb: 'Counter-raid',
      buttonLabel: 'Counter-raid their camp',
      previewHeading: 'If you counter-raid their camp:',
    };
  }
  return {
    verb: 'Raid',
    buttonLabel: 'Raid their camp',
    previewHeading: 'If you raid their camp:',
  };
}

export function countArmedMilitia(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities, { includeStructures: false }).adultCount;
}

export function getMilitiaStrength(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities, { includeStructures: false }).militiaStrength;
}

export function getBarricadeStrength(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities).barricadeStrength;
}

export type RaidOutcomeTier = 'decisive' | 'narrow' | 'stalemate' | 'defeat';

export interface CombatPreview {
  militiaCount: number;
  militiaStrength: number;
  barricadeStrength: number;
  hasSpears: boolean;
  armamentLabel: string | null;
  breakdown: string[];
  rivalStrength: number | null;
  distanceTiles: number | null;
  distanceLabel: string | null;
  outgoingRaidFoodCost: number | null;
  incomingPayoffFood: number | null;
  counterRaidRivalStrength: number | null;
  canCounterRaid: boolean;
  counterRaidBlockReason: string | null;
  defendRatio: number | null;
  barricadeRatio: number | null;
  counterRaidRatio: number | null;
  defendOutcome: RaidOutcomeTier | null;
  barricadeOutcome: RaidOutcomeTier | null;
  counterRaidOutcome: CounterRaidTier | null;
}

export const RAID_OUTCOME_LABELS: Record<RaidOutcomeTier, { label: string; hint: string; tone: 'good' | 'warn' | 'bad' }> = {
  decisive: { label: 'Likely victory', hint: 'Rep +4, relations ease — lives lost, stores kept', tone: 'good' },
  narrow: { label: 'Costly win', hint: 'Minor building damage, light store losses, rep gain', tone: 'good' },
  stalemate: { label: 'Stalemate', hint: 'Partial food/wood/stone/gold loot, damage, casualties', tone: 'warn' },
  defeat: { label: 'Likely defeat', hint: 'Full stores looted, heavy damage, many casualties', tone: 'bad' },
};

export const COUNTER_RAID_LABELS: Record<CounterRaidTier, { label: string; hint: string; tone: 'good' | 'warn' | 'bad' }> = {
  success: { label: 'Raid would succeed', hint: 'Seize food, wood, stone & gold; relations worsen', tone: 'good' },
  meager: { label: 'Meager spoils', hint: 'Some food & gold; high tension', tone: 'warn' },
  fail: { label: 'Raid would fail', hint: 'Provisions lost + 15🍖 more; casualties; they may strike back', tone: 'bad' },
};

export const RAID_PREPARATION_HINT =
  'Raids test preparation you already made — walls, forge tier, guards, and food for tribute. There is no battle screen; outcomes resolve from strength ratios.';
export const DEFENSE_RATIO_HINT = 'Ratio ≥135% decisive · ≥95% narrow · ≥65% stalemate · below = defeat';
export const MILITIA_TIER_HINT = 'Weapon/armor tiers replace lower ones (stone→iron→sword · wood→iron→scale) — do not stack.';
export const COUNTER_RAID_RATIO_HINT = 'Ratio ≥135% full spoils · ≥100% meager · below = repelled (+15🍖 extra loss)';

export function canLaunchRaidOnRival(
  state: WorldState,
  rival: RivalSettlement,
): { ok: boolean; foodCost: number; blockReason?: string } {
  const foodCost = getOutgoingRaidFoodCostForRival(state, rival);
  if (isRivalAtPeace(rival)) return { ok: false, foodCost, blockReason: 'At peace' };
  if (rival.relationship === 'friendly') return { ok: false, foodCost, blockReason: 'Friendly relations' };
  if (!hasMilitiaWeapons(state)) {
    return { ok: false, foodCost, blockReason: 'Need weapons (stone/iron spears or swords)' };
  }
  if (state.humanPopulation < 8) return { ok: false, foodCost, blockReason: 'Need 8+ population' };
  if (state.resources.food < foodCost) {
    return { ok: false, foodCost, blockReason: `Need ${foodCost}🍖 march provisions` };
  }
  if ((state.pendingOutgoingRaidEvents ?? []).some((e) => e.rivalId === rival.id)) {
    return { ok: false, foodCost, blockReason: 'War-band already marching on this camp' };
  }
  return { ok: true, foodCost };
}

export function getCombatPreview(
  state: WorldState,
  options?: { attackerStrength?: number; rival?: RivalSettlement; incomingPayoffFood?: number },
): CombatPreview {
  const entities = state.entities;
  const militiaBreakdown = computeMilitiaBreakdown(state, entities);
  const breakdown = [...militiaBreakdown.lines];
  const armament = getMilitiaArmamentLabel(state);
  if (armament) {
    breakdown.unshift(`Armament: ${armament}`);
  }
  const count = militiaBreakdown.adultCount;
  const militiaStrength = militiaBreakdown.militiaStrength;
  const barricadeStrength = militiaBreakdown.barricadeStrength;
  const hasWeapons = hasMilitiaWeapons(state);

  let rivalStrength: number | null = null;
  let distanceTiles: number | null = null;
  let distanceLabel: string | null = null;
  let outgoingRaidFoodCost: number | null = null;

  if (options?.rival) {
    const distancePx = getCampDistancePixels(state, state.buildings, options.rival);
    distanceTiles = getCampDistanceTiles(distancePx);
    distanceLabel = formatCampDistance(distancePx);
    outgoingRaidFoodCost = getOutgoingRaidFoodCost(distancePx);
    breakdown.push(`${options.rival.name} camp: ${distanceLabel} from your village`);
    breakdown.push(`Raid provisions: ${outgoingRaidFoodCost}🍖 (march rations)`);
  }

  if (options?.attackerStrength != null) {
    rivalStrength = options.attackerStrength;
  } else if (options?.rival) {
    rivalStrength = getRivalRaidStrength(options.rival);
    breakdown.push(
      `${options.rival.name} war-band: ${options.rival.population} pop × 12 × ${options.rival.relationship === 'tense' ? '1.35' : options.rival.relationship === 'competitive' ? '1.15' : '0.9'} = ${rivalStrength}`,
    );
  }

  const counterRaidRivalStrength = options?.rival ? getRivalDefenseStrength(options.rival) : null;
  if (counterRaidRivalStrength != null && options?.rival) {
    const defenseBase = options?.attackerStrength != null
      ? getRivalRaidStrength(options.rival)
      : (rivalStrength ?? getRivalRaidStrength(options.rival));
    breakdown.push(
      `${options.rival.name} camp defense: ${defenseBase} × ${OUTGOING_RAID_DEFENSE_MULT} home turf = ${counterRaidRivalStrength}`,
    );
  }

  const counterRaidBlockReason = getCounterRaidBlockReason(
    state,
    options?.rival,
    hasWeapons,
    outgoingRaidFoodCost,
  );
  const canCounterRaid = options?.rival != null && counterRaidBlockReason == null;

  const defendRatio = rivalStrength != null && rivalStrength > 0 ? militiaStrength / rivalStrength : null;
  const barricadeRatio = rivalStrength != null && rivalStrength > 0 ? barricadeStrength / rivalStrength : null;
  const counterRaidRatio = counterRaidRivalStrength != null && counterRaidRivalStrength > 0
    ? militiaStrength / counterRaidRivalStrength
    : null;

  return {
    militiaCount: count,
    militiaStrength,
    barricadeStrength,
    hasSpears: hasWeapons,
    armamentLabel: armament,
    breakdown,
    rivalStrength,
    distanceTiles,
    distanceLabel,
    outgoingRaidFoodCost,
    incomingPayoffFood: options?.incomingPayoffFood ?? null,
    counterRaidRivalStrength,
    canCounterRaid,
    counterRaidBlockReason,
    defendRatio,
    barricadeRatio,
    counterRaidRatio,
    defendOutcome: defendRatio != null ? resolveDefenseRatio(militiaStrength, rivalStrength!) : null,
    barricadeOutcome: barricadeRatio != null ? resolveDefenseRatio(barricadeStrength, rivalStrength!) : null,
    counterRaidOutcome: counterRaidRatio == null
      ? null
      : resolveCounterRaidRatio(militiaStrength, counterRaidRivalStrength!),
  };
}

function pushFloat(state: WorldState, x: number, y: number, text: string, color: string) {
  state.floatingTexts.push({
    id: state.nextFloatingTextId++,
    x, y, text, color,
    life: 28, maxLife: 28, scale: 1,
  });
}

function flashMilitia(entities: Entity[], ticks = 22) {
  for (const e of entities) {
    if (canBeMustered(e)) {
      e.combatTicks = Math.max(e.combatTicks ?? 0, ticks);
      e.flash = 10;
    }
  }
}

export type RaidParticipantMode = 'militia' | 'barricade' | 'outgoing';

/** Adults who can fight — `canBeMustered` owns that test, so a jailed settler is in neither pool. */
export function getRaidParticipants(
  state: WorldState,
  entities: Entity[],
  mode: RaidParticipantMode,
): Entity[] {
  return entities.filter((e) => {
    if (!canBeMustered(e)) return false;
    if (mode === 'barricade') return true;
    return hasMilitiaWeapons(state);
  });
}

export type RaidExperienceTier =
  | 'decisive_win'
  | 'narrow_win'
  | 'stalemate'
  | 'defeat'
  | 'outgoing_success'
  | 'outgoing_meager'
  | 'outgoing_fail'
  | 'tribute';

const RAID_GUARD_XP: Record<RaidExperienceTier, number> = {
  decisive_win: 1.1,
  narrow_win: 0.85,
  stalemate: 0.55,
  defeat: 0.4,
  outgoing_success: 1.0,
  outgoing_meager: 0.7,
  outgoing_fail: 0.45,
  tribute: 0.3,
};

const RAID_LEADER_GUARD_XP_BONUS = 0.45;

/** Extra village reputation when the sitting head led a winning raid. */
const RAID_LEADER_REP_BONUS: Partial<Record<RaidExperienceTier, number>> = {
  decisive_win: 4,
  narrow_win: 2,
  outgoing_success: 3,
  outgoing_meager: 1,
};

function isRaidVictoryTier(tier: RaidExperienceTier): boolean {
  return tier === 'decisive_win'
    || tier === 'narrow_win'
    || tier === 'outgoing_success'
    || tier === 'outgoing_meager';
}

function defenseOutcomeToReward(outcome: RaidOutcomeTier): RaidExperienceTier {
  switch (outcome) {
    case 'decisive': return 'decisive_win';
    case 'narrow': return 'narrow_win';
    case 'stalemate': return 'stalemate';
    default: return 'defeat';
  }
}

function counterRaidToReward(tier: CounterRaidTier): RaidExperienceTier {
  if (tier === 'success') return 'outgoing_success';
  if (tier === 'meager') return 'outgoing_meager';
  return 'outgoing_fail';
}

/** Grant Soldier skill XP to everyone in the fight; leader earns extra XP and rep on victories. */
function rewardRaidParticipants(
  state: WorldState,
  participants: Entity[],
  tier: RaidExperienceTier,
  rivalName: string,
): void {
  if (participants.length === 0) return;

  const baseXp = RAID_GUARD_XP[tier];
  const leaderId = state.villageLeaderId;
  let leaderInFight = false;

  for (const fighter of participants) {
    gainSkill(state, fighter.id, JobType.Soldier, baseXp);
    if (fighter.id === leaderId) {
      leaderInFight = true;
      gainSkill(state, fighter.id, JobType.Soldier, RAID_LEADER_GUARD_XP_BONUS);
    }
  }

  const repBonus = leaderInFight ? (RAID_LEADER_REP_BONUS[tier] ?? 0) : 0;
  if (repBonus > 0 && isRaidVictoryTier(tier)) {
    // The applied delta, not the requested one. `addReputation` clamps at the ceiling, so this is 0
    // for a victory that lands on a full bar — and the banner below promises "reputation rises", so it
    // must not fire when the clamp delivered nothing. The old guard (`reputation > before`) got the
    // full-bar case right but retired the announcement for *every* later victory too, because at 100
    // the delta is always 0; `reputation < MAX` would swing the other way and announce a rise the
    // clamp refused. The granted amount is the only value that answers the question asked.
    const granted = addReputation(state, repBonus);
    const leader = participants.find((p) => p.id === leaderId);
    if (leader) {
      logEvent(
        state,
        'event',
        `${formatCitizenName(leader)} led the raid against ${rivalName} — village reputation +${repBonus}`,
        formatCitizenName(leader),
      );
      pushFloat(state, leader.x, leader.y - 24, `👑 +${repBonus} rep`, '#fbbf24');
    }
    if (granted > 0) {
      addBigNews(
        state,
        '👑 Leader honored',
        `${leader ? formatCitizenName(leader) : 'The village head'} rallied the war-band — reputation rises.`,
        'positive',
      );
    }
  }
}

function damageRandomPlayerBuilding(state: WorldState, amount: number): Building | null {
  const targets = state.buildings.filter((b) => b.completed && b.faction !== 'rival');
  if (targets.length === 0) return null;
  const b = targets[Math.floor(getSimRng('frontierCombat')() * targets.length)];
  b.health = Math.max(5, b.health - amount);
  return b;
}

/** Every fight costs lives — even a routed war-band. */
export type RaidCasualtyTier = 'victory' | 'costly' | 'moderate' | 'heavy';

export function getRaidCasualtyBounds(tier: RaidCasualtyTier, adultPop: number): [number, number] {
  const pop = Math.max(1, adultPop);
  const pct: Record<RaidCasualtyTier, [number, number]> = {
    victory: [0.012, 0.022],
    costly: [0.022, 0.04],
    moderate: [0.04, 0.07],
    heavy: [0.075, 0.13],
  };
  const floor: Record<RaidCasualtyTier, [number, number]> = {
    victory: [1, 2],
    costly: [2, 4],
    moderate: [3, 6],
    heavy: [7, 12],
  };
  const [minPct, maxPct] = pct[tier];
  const [minFloor, maxFloor] = floor[tier];
  const minK = Math.min(pop, Math.max(minFloor, Math.round(pop * minPct)));
  const maxK = Math.min(pop, Math.max(maxFloor, Math.round(pop * maxPct), minK));
  return [minK, maxK];
}

function applyRaidCasualties(
  state: WorldState,
  entities: Entity[],
  tier: RaidCasualtyTier,
  rivalName: string,
  mode: 'defending' | 'raiding' = 'defending',
): number {
  const pool = entities.filter((e) => canBeMustered(e));
  if (pool.length === 0) return 0;

  const [minK, maxK] = getRaidCasualtyBounds(tier, pool.length);
  const killCount = Math.min(
    pool.length,
    minK + Math.floor(getSimRng('frontierCombat')() * (maxK - minK + 1)),
  );
  if (killCount <= 0) return 0;

  const remaining = [...pool];
  const victims: Entity[] = [];
  for (let i = 0; i < killCount && remaining.length > 0; i++) {
    const idx = Math.floor(getSimRng('frontierCombat')() * remaining.length);
    victims.push(remaining.splice(idx, 1)[0]);
  }
  const deathReason =
    mode === 'raiding' ? `fell raiding ${rivalName}` : 'fell defending the village';
  const entityById = ensureEntityByIdMap(state);
  for (const victim of victims) {
    killHuman(victim, state.buildings, entityById, state.tick);
    logDeath(
      state,
      formatDeathLog(victim, deathReason),
      formatCitizenName(victim),
      { x: victim.x, y: victim.y },
    );
  }
  const names = victims.map((v) => formatCitizenName(v)).join(', ');
  const summary =
    mode === 'raiding'
      ? `${victims.length} villager${victims.length === 1 ? '' : 's'} fell on the raid against ${rivalName} (${names})`
      : `${victims.length} villager${victims.length === 1 ? '' : 's'} fell defending against ${rivalName} (${names})`;
  logEvent(
    state,
    'combat',
    summary,
    rivalName,
    mode === 'raiding' ? 'outgoing_raid' : 'defense',
  );
  return victims.length;
}

export function resolveDefenseRatio(defender: number, attacker: number): RaidOutcomeTier {
  const ratio = defender / Math.max(attacker, 1);
  if (ratio >= 1.35) return 'decisive';
  if (ratio >= 0.95) return 'narrow';
  if (ratio >= 0.65) return 'stalemate';
  return 'defeat';
}

/** Resolve loot on older saves / sim injections missing wood & stone fields. */
export function raidEventLoot(evt: Pick<RaidEvent, 'lootFood' | 'lootGold' | 'lootWood' | 'lootStone'>): RaidLootBundle {
  return {
    food: evt.lootFood,
    gold: evt.lootGold,
    wood: evt.lootWood ?? Math.max(10, Math.floor(evt.lootFood * 0.6)),
    stone: evt.lootStone ?? Math.max(5, Math.floor(evt.lootFood * 0.28)),
  };
}

/** What a rival war-band tries to seize — scales with camp size & tension. */
export function rollIncomingRaidLoot(rival: RivalSettlement): RaidLootBundle {
  const mood = rival.relationship === 'tense' ? 1.25 : 1;
  const pop = Math.max(1, rival.population);
  return {
    food: 20 + Math.floor(getSimRng('frontierCombat')() * 28),
    wood: Math.round((15 + pop * 4 + Math.floor(getSimRng('frontierCombat')() * 22)) * mood),
    stone: Math.round((8 + pop * 2 + Math.floor(getSimRng('frontierCombat')() * 12)) * mood),
    gold: Math.round((rival.relationship === 'tense' ? 10 : 5) + getSimRng('frontierCombat')() * (rival.relationship === 'tense' ? 14 : 8)),
  };
}

function scaleRaidLoot(loot: RaidLootBundle, fraction: number): RaidLootBundle {
  const f = Math.max(0, Math.min(1, fraction));
  return {
    food: Math.floor(loot.food * f),
    wood: Math.floor(loot.wood * f),
    stone: Math.floor(loot.stone * f),
    gold: Math.floor(loot.gold * f),
  };
}

export function formatRaidLootSummary(loot: RaidLootBundle): string {
  return formatLootParts(loot);
}

function formatLootParts(loot: RaidLootBundle, prefix = ''): string {
  const parts: string[] = [];
  if (loot.food > 0) parts.push(`${prefix}${loot.food}🍖`);
  if (loot.wood > 0) parts.push(`${prefix}${loot.wood}🪵`);
  if (loot.stone > 0) parts.push(`${prefix}${loot.stone}🪨`);
  if (loot.gold > 0) parts.push(`${prefix}${loot.gold}💰`);
  return parts.join(' ');
}

/** Deduct stores when raiders get through — returns what was actually taken. */
function applyRaidLootTaken(state: WorldState, loot: RaidLootBundle, fraction = 1): RaidLootBundle {
  const target = scaleRaidLoot(loot, fraction);
  const taken: RaidLootBundle = { food: 0, wood: 0, stone: 0, gold: 0 };
  if (target.food > 0) {
    // `spendFood` returns what was actually taken, which is exactly the `min(food, target)` this used
    // to compute by hand — and it records the loss against the raid sink.
    taken.food = spendFood(state, 'raid', target.food);
  }
  if (target.wood > 0) {
    taken.wood = Math.min(state.resources.wood, target.wood);
    state.resources.wood -= taken.wood;
  }
  if (target.stone > 0) {
    taken.stone = Math.min(state.resources.stone, target.stone);
    state.resources.stone -= taken.stone;
  }
  if (target.gold > 0) {
    taken.gold = Math.min(state.resources.gold, target.gold);
    state.resources.gold -= taken.gold;
  }
  return taken;
}

/** Soft cap for raid gold spoils (storageMax.gold is effectively unlimited). */
export function clampRaidGoldGain(currentGold: number, spoilsGold: number, softCap = 9999): number {
  if (spoilsGold <= 0) return 0;
  const room = Math.max(0, softCap - currentGold);
  const perRaidMax = 80;
  return Math.min(spoilsGold, room, perRaidMax);
}

function grantRaidSpoils(state: WorldState, spoils: RaidLootBundle): RaidLootBundle {
  const gained: RaidLootBundle = { food: 0, wood: 0, stone: 0, gold: 0 };
  if (spoils.food > 0) gained.food = addCappedResource(state, 'food', spoils.food);
  if (spoils.wood > 0) gained.wood = addCappedResource(state, 'wood', spoils.wood);
  if (spoils.stone > 0) gained.stone = addCappedResource(state, 'stone', spoils.stone);
  if (spoils.gold > 0) {
    gained.gold = clampRaidGoldGain(state.resources.gold, spoils.gold);
    state.resources.gold += gained.gold;
  }
  return gained;
}

/** Tribute a rival offers to avoid your assault — less than full raid spoils. */
export function rollRivalPayoffOffer(
  rival: RivalSettlement,
  militiaStrength: number,
  rivalDefense: number,
): RaidLootBundle {
  const ratio = militiaStrength / Math.max(rivalDefense, 1);
  const scare = Math.min(1.5, Math.max(0.55, ratio));
  const base = rollIncomingRaidLoot(rival);
  const scale = 0.5 + scare * 0.22;
  return {
    food: Math.max(12, Math.floor(base.food * scale)),
    wood: Math.max(8, Math.floor(base.wood * scale * 0.75)),
    stone: Math.max(4, Math.floor(base.stone * scale * 0.65)),
    gold: Math.max(6, Math.floor(base.gold * scale * 1.05)),
  };
}

/** Rival chooses tribute or battle when your war-band reaches their camp. */
export function rollRivalOutgoingRaidResponse(
  militiaStrength: number,
  rivalDefense: number,
  rival: RivalSettlement,
  rng: () => number = getSimRng('frontierCombat'),
): OutgoingRaidRivalResponse {
  const ratio = militiaStrength / Math.max(rivalDefense, 1);
  let payoffChance = 0.2;
  if (ratio >= 1.35) payoffChance = 0.72;
  else if (ratio >= 1.15) payoffChance = 0.58;
  else if (ratio >= 1.0) payoffChance = 0.45;
  else if (ratio >= 0.85) payoffChance = 0.28;
  else payoffChance = 0.12;

  if (rival.relationship === 'tense') payoffChance *= 0.65;
  if (rival.relationship === 'neutral') payoffChance *= 1.05;
  payoffChance = Math.min(0.85, Math.max(0.08, payoffChance));

  return rng() < payoffChance ? 'payoff_offer' : 'fight';
}

function outgoingRaidChoices(
  rivalResponse: OutgoingRaidRivalResponse,
  payoff: RaidLootBundle,
  rivalName: string,
  verb: string,
): RaidChoice[] {
  if (rivalResponse === 'payoff_offer') {
    const summary = formatRaidLootSummary(payoff);
    return [
      {
        id: 'accept_payoff',
        label: `Accept their tribute (${summary})`,
        hint: `${rivalName} pays you to call off the ${verb.toLowerCase()} — no fight, no casualties.`,
      },
      {
        id: 'decline_payoff',
        label: 'Decline — attack anyway',
        hint: 'Reject their offer and press the assault.',
      },
    ];
  }
  return [
    {
      id: 'fight',
      label: 'Press the attack',
      hint: `${rivalName} refused to negotiate — battle resolves from militia strength.`,
    },
  ];
}

function rollOutgoingRaidSpoils(rival: RivalSettlement, tier: 'success' | 'meager'): RaidLootBundle {
  const pop = Math.max(1, rival.population);
  if (tier === 'success') {
    return {
      food: 28 + Math.floor(getSimRng('frontierCombat')() * 22),
      wood: 22 + Math.floor(getSimRng('frontierCombat')() * 28) + pop * 3,
      stone: 12 + Math.floor(getSimRng('frontierCombat')() * 18) + pop,
      gold: 14 + Math.floor(getSimRng('frontierCombat')() * 18),
    };
  }
  return {
    food: 12 + Math.floor(getSimRng('frontierCombat')() * 12),
    wood: 8 + Math.floor(getSimRng('frontierCombat')() * 14) + pop,
    stone: 4 + Math.floor(getSimRng('frontierCombat')() * 8),
    gold: 6 + Math.floor(getSimRng('frontierCombat')() * 10),
  };
}

function raidChoices(lootFood: number, rivalName: string): RaidChoice[] {
  return [
    {
      id: 'defend',
      label: 'Defend with militia (weapons)',
      hint: 'Spears or swords required — even victory costs lives (scales with population); defeats can devastate.',
    },
    {
      id: 'barricade',
      label: 'Barricade the village',
      hint: 'No weapons needed — holding the wall still costs lives; weaker than open battle.',
      cost: BARRICADE_RAID_COST,
    },
    {
      id: 'payoff',
      label: 'Pay them off',
      hint: `${rivalName} takes food and leaves without a fight.`,
      cost: { food: lootFood },
    },
  ];
}

export function maybeQueueRaid(state: WorldState, rival: RivalSettlement, allAlive: Entity[]): void {
  if (!state.pendingRaidEvents) state.pendingRaidEvents = [];
  if (rival.population <= 0) return;
  if (state.pendingRaidEvents.some((r) => r.rivalId === rival.id)) return;
  if ((state.pendingOutgoingRaidEvents ?? []).some((e) => e.rivalId === rival.id)) return;
  if (rival.raidCooldownDays > 0) return;
  if (isRivalAtPeace(rival)) return;
  if (rival.relationship !== 'tense' && rival.relationship !== 'competitive') return;
  if (getPlayerHumanCount(allAlive) < 5) return;

  const hasPlayerStructure = state.buildings.some((b) => b.completed && b.faction !== 'rival');
  if (!hasPlayerStructure) return;

  const rep = state.villageReputation ?? 0;
  let chance = rival.relationship === 'tense' ? 0.22 : 0.12;
  // The same reputation bands the caravans price by (`simHelpers` owns them) — a village the
  // valley dislikes gets raided harder, one it respects gets raided less.
  const reputationBand = getReputationBand(rep);
  if (reputationBand === 'harsh') chance *= 1.5;
  else if (reputationBand === 'friendly') chance *= 0.6;
  if (getSimRng('frontierCombat')() > chance) return;

  const attackerStrength = getRivalRaidStrength(rival);
  const loot = rollIncomingRaidLoot(rival);
  const marchDistancePx = getCampDistancePixels(state, state.buildings, rival);
  const marchDistanceTiles = getCampDistanceTiles(marchDistancePx);
  const responseDays = getIncomingRaidResponseDays(marchDistanceTiles);
  const expireTicks = responseDays * TICKS_PER_DAY;
  const distanceLabel = formatCampDistance(marchDistancePx);

  const event: RaidEvent = {
    id: `raid_${rival.id}_${state.tick}`,
    rivalId: rival.id,
    rivalName: rival.name,
    emoji: '⚔️',
    title: `${rival.name} is raiding!`,
    description: `War-bands march from ${distanceLabel} away. You have ${responseDays} days to defend, barricade, or pay them off.`,
    choices: raidChoices(loot.food, rival.name),
    createdAtTick: state.tick,
    expiresAtTick: state.tick + expireTicks,
    marchDistanceTiles,
    attackerStrength,
    lootFood: loot.food,
    lootGold: loot.gold,
    lootWood: loot.wood,
    lootStone: loot.stone,
  };

  state.pendingRaidEvents.push(event);
  rival.raidCooldownDays = 21;
  addBigNews(state, '⚔️ Raid incoming!', `${rival.name} war-bands approach your border. Respond in the banner or rival inspector.`, 'negative');
  logEvent(state, 'combat', `${rival.name} launched a raid on the village`, rival.name, 'incoming_raid');
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, 5);
}

function getPlayerHumanCount(allAlive: Entity[]): number {
  return allAlive.filter((e) => e.alive && isPlayerHuman(e)).length;
}

export function tickPendingRaidEvents(
  state: WorldState,
  allAlive: Entity[],
  buildings = state.buildings,
): void {
  if (!state.pendingRaidEvents?.length) return;

  const expired: RaidEvent[] = [];
  state.pendingRaidEvents = state.pendingRaidEvents.filter((evt) => {
    if (state.tick < getRaidExpiresAtTick(evt)) return true;
    expired.push(evt);
    return false;
  });

  for (const evt of expired) {
    const rival = state.rivalSettlements.find((r) => r.id === evt.rivalId);
    if (!rival) continue;
    const structureBonus = computeMilitiaBreakdown(state, allAlive).structureBonus;
    const defenseFactor = Math.max(0.3, 1 - structureBonus / 240);
    const taken = applyRaidLootTaken(state, raidEventLoot(evt), defenseFactor);
    damageRandomPlayerBuilding(state, Math.max(4, Math.round(12 * defenseFactor)));
    addReputation(state, -4);
    rival.relationship = 'tense';
    const camp = getPlayerCampCenter(state, buildings);
    pushFloat(state, camp.x, camp.y - 25, formatLootParts(taken, '-') || 'Raid!', '#f87171');
    const lootNote = formatLootParts(taken);
    const defendedNote = structureBonus > 0
      ? ` — defenses (${structureBonus} structure strength) limited the damage`
      : ' — no response in time';
    logEvent(
      state,
      'combat',
      `Raid from ${evt.rivalName} succeeded${defendedNote}${lootNote ? ` (lost ${lootNote})` : ''}`,
      evt.rivalName,
      'incoming_raid',
    );
    applyRaidCasualties(
      state,
      allAlive,
      defenseFactor < 0.55 ? 'moderate' : 'heavy',
      evt.rivalName,
    );
  }
}

export function getRaidChoiceEligibility(
  state: WorldState,
  event: RaidEvent,
  choiceId: string,
  allAlive: Entity[] = state.entities.filter((entity) => entity.alive),
): { ok: boolean; blockReason?: string } {
  if (choiceId === 'payoff') {
    if (state.resources.food < event.lootFood) {
      return { ok: false, blockReason: `Need ${event.lootFood}🍖` };
    }
    return { ok: true };
  }

  if (choiceId === 'barricade') {
    if (!canAffordResourceCost(state.resources, BARRICADE_RAID_COST)) {
      return { ok: false, blockReason: formatResourceCostNeed(BARRICADE_RAID_COST) };
    }
    return { ok: true };
  }

  if (choiceId === 'defend') {
    if (!hasMilitiaWeapons(state)) {
      return { ok: false, blockReason: 'Need weapons (spears or swords)' };
    }
    if (getMilitiaStrength(state, allAlive) <= 0) {
      return { ok: false, blockReason: 'No militia strength' };
    }
    return { ok: true };
  }

  return { ok: false, blockReason: 'Unknown raid answer' };
}

export function respondToRaidEvent(
  originalState: WorldState,
  eventId: string,
  choiceId: string,
): WorldState {
  const state = structuredClone(originalState);
  const idx = state.pendingRaidEvents?.findIndex((e) => e.id === eventId) ?? -1;
  if (idx < 0) return state;

  const event = state.pendingRaidEvents[idx];
  const rival = state.rivalSettlements.find((r) => r.id === event.rivalId);
  const allAlive = state.entities.filter((e) => e.alive);
  const camp = getPlayerCampCenter(state, state.buildings);
  const defenderStrength = getMilitiaStrength(state, allAlive);
  const remove = () => {
    state.pendingRaidEvents = state.pendingRaidEvents.filter((e) => e.id !== eventId);
    if (cancelPendingOutgoingRaidsForRival(state, event.rivalId)) {
      logEvent(
        state,
        'combat',
        `Your war-band broke off the march on ${event.rivalName} — home front resolved`,
        event.rivalName,
        'outgoing_raid',
      );
    }
  };

  if (choiceId === 'payoff') {
    const eligibility = getRaidChoiceEligibility(state, event, choiceId, allAlive);
    if (!eligibility.ok) {
      pushFloat(state, camp.x, camp.y - 20, eligibility.blockReason ?? `Need ${event.lootFood}🍖`, '#f97316');
      return state;
    }
    spendFood(state, 'tribute', event.lootFood);
    if (rival) {
      rival.relationship = rival.relationship === 'tense' ? 'competitive' : rival.relationship;
      rival.raidCooldownDays = 14;
    }
    pushFloat(state, camp.x, camp.y - 20, 'Paid off', '#eab308');
    logEvent(state, 'combat', `Paid ${event.lootFood} food to end ${event.rivalName}'s raid`, event.rivalName, 'defense');
    remove();
    return state;
  }

  if (choiceId === 'barricade') {
    const eligibility = getRaidChoiceEligibility(state, event, choiceId, allAlive);
    if (!eligibility.ok) {
      pushFloat(state, camp.x, camp.y - 20, eligibility.blockReason ?? 'Cannot barricade', '#f97316');
      return state;
    }
    state.resources.wood -= BARRICADE_RAID_COST.wood ?? 0;
    state.resources.stone -= BARRICADE_RAID_COST.stone ?? 0;
    const effectiveDef = getBarricadeStrength(state, allAlive);
    const outcome = resolveDefenseRatio(effectiveDef, event.attackerStrength);
    const raidLoot = raidEventLoot(event);
    const barricadeFighters = getRaidParticipants(state, allAlive, 'barricade');
    rewardRaidParticipants(
      state,
      barricadeFighters,
      defenseOutcomeToReward(outcome),
      event.rivalName,
    );
    if (outcome === 'defeat' || outcome === 'stalemate') {
      const frac = outcome === 'defeat' ? 0.85 : 0.55;
      const taken = applyRaidLootTaken(state, raidLoot, frac);
      damageRandomPlayerBuilding(state, 8);
      addReputation(state, -2);
      const lootNote = formatLootParts(taken);
      logEvent(
        state,
        'combat',
        `Barricade held poorly against ${event.rivalName}${lootNote ? ` — lost ${lootNote}` : ''}`,
        event.rivalName,
        'defense',
      );
      pushFloat(state, camp.x, camp.y - 20, formatLootParts(taken, '-') || 'Raided', '#f87171');
      applyRaidCasualties(
        state,
        allAlive,
        outcome === 'defeat' ? 'heavy' : 'moderate',
        event.rivalName,
      );
    } else {
      addReputation(state, 2);
      if (rival) rival.relationship = rival.relationship === 'tense' ? 'competitive' : rival.relationship;
      pushFloat(state, camp.x, camp.y - 20, 'Held!', '#22c55e');
      logEvent(state, 'combat', `Barricade repelled ${event.rivalName}'s raid`, event.rivalName, 'repelled');
      applyRaidCasualties(state, allAlive, 'victory', event.rivalName);
    }
    flashMilitia(allAlive, 14);
    if (rival) rival.raidCooldownDays = 18;
    remove();
    return state;
  }

  if (choiceId === 'defend') {
    const eligibility = getRaidChoiceEligibility(state, event, choiceId, allAlive);
    if (!eligibility.ok) {
      pushFloat(state, camp.x, camp.y - 20, eligibility.blockReason ?? 'Cannot defend', '#f97316');
      return state;
    }

    const outcome = resolveDefenseRatio(defenderStrength, event.attackerStrength);
    const raidLoot = raidEventLoot(event);
    const militiaFighters = getRaidParticipants(state, allAlive, 'militia');
    rewardRaidParticipants(
      state,
      militiaFighters,
      defenseOutcomeToReward(outcome),
      event.rivalName,
    );
    flashMilitia(allAlive, 24);
    state.screenShakeImpulse = Math.max(state.screenShakeImpulse, 6);

    switch (outcome) {
      case 'decisive':
        addReputation(state, 4);
        if (rival) {
          rival.relationship = rival.relationship === 'tense' ? 'competitive' : 'neutral';
          rival.raidCooldownDays = 28;
        }
        pushFloat(state, camp.x, camp.y - 20, 'Victory!', '#22c55e');
        logEvent(state, 'combat', `Militia routed ${event.rivalName}'s war-band`, event.rivalName, 'repelled');
        applyRaidCasualties(state, allAlive, 'victory', event.rivalName);
        break;
      case 'narrow': {
        const taken = applyRaidLootTaken(state, raidLoot, 0.3);
        damageRandomPlayerBuilding(state, 6);
        addReputation(state, 1);
        if (rival) rival.raidCooldownDays = 20;
        pushFloat(state, camp.x, camp.y - 20, formatLootParts(taken, '-') || 'Costly win', '#fbbf24');
        const lootNote = formatLootParts(taken);
        logEvent(
          state,
          'combat',
          `Militia drove back ${event.rivalName}${lootNote ? ` — lost ${lootNote}` : ' with minor damage'}`,
          event.rivalName,
          'defense',
        );
        applyRaidCasualties(state, allAlive, 'costly', event.rivalName);
        break;
      }
      case 'stalemate': {
        const taken = applyRaidLootTaken(state, raidLoot, 0.7);
        damageRandomPlayerBuilding(state, 10);
        addReputation(state, -3);
        if (rival) rival.relationship = 'tense';
        applyRaidCasualties(state, allAlive, 'moderate', event.rivalName);
        const lootNote = formatLootParts(taken);
        logEvent(
          state,
          'combat',
          `Stalemate with ${event.rivalName}${lootNote ? ` — lost ${lootNote}` : ' — village looted'}`,
          event.rivalName,
          'defense',
        );
        pushFloat(state, camp.x, camp.y - 20, formatLootParts(taken, '-') || 'Looted', '#f87171');
        break;
      }
      case 'defeat': {
        const taken = applyRaidLootTaken(state, raidLoot, 1);
        damageRandomPlayerBuilding(state, 18);
        addReputation(state, -6);
        if (rival) rival.relationship = 'tense';
        applyRaidCasualties(state, allAlive, 'heavy', event.rivalName);
        pushFloat(state, camp.x, camp.y - 20, formatLootParts(taken, '-') || 'Raided!', '#f87171');
        const lootNote = formatLootParts(taken);
        logEvent(
          state,
          'combat',
          `${event.rivalName} overran the militia${lootNote ? ` — lost ${lootNote}` : ''}`,
          event.rivalName,
          'incoming_raid',
        );
        break;
      }
    }
    remove();
    return state;
  }

  return state;
}

function resolveOutgoingRaidCombat(
  state: WorldState,
  rival: RivalSettlement,
  event: Pick<OutgoingRaidEvent, 'isCounterRaid' | 'attackerStrength' | 'defenderStrength' | 'rivalId'>,
): void {
  const outcome = resolveCounterRaidRatio(event.attackerStrength, event.defenderStrength);
  const verb = event.isCounterRaid ? 'Counter-raid' : 'Raid';
  const warBand = getRaidParticipants(state, state.entities, 'outgoing');
  rewardRaidParticipants(state, warBand, counterRaidToReward(outcome), rival.name);

  flashMilitia(state.entities, 20);
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, outcome === 'fail' ? 8 : 4);

  if (outcome === 'success') {
    const gained = grantRaidSpoils(state, rollOutgoingRaidSpoils(rival, 'success'));
    rival.relationship = 'tense';
    rival.raidCooldownDays = 10;
    applyRaidCasualties(state, state.entities, 'victory', rival.name, 'raiding');
    pushFloat(state, rival.campX, rival.campY - 20, formatLootParts(gained, '+') || 'Spoils!', '#22c55e');
    const lootNote = formatLootParts(gained);
    logEvent(
      state,
      'combat',
      `${verb} on ${rival.name} succeeded${lootNote ? ` — seized ${lootNote}` : ' — seized supplies'}`,
      rival.name,
      'outgoing_raid',
    );
    addReputation(state, -5);
  } else if (outcome === 'meager') {
    const gained = grantRaidSpoils(state, rollOutgoingRaidSpoils(rival, 'meager'));
    rival.relationship = 'tense';
    rival.raidCooldownDays = 14;
    addReputation(state, -4);
    applyRaidCasualties(state, state.entities, 'costly', rival.name, 'raiding');
    const lootNote = formatLootParts(gained);
    logEvent(
      state,
      'combat',
      `${verb} on ${rival.name} — meager spoils${lootNote ? ` (${lootNote})` : ''}, high tension`,
      rival.name,
      'outgoing_raid',
    );
    pushFloat(state, rival.campX, rival.campY - 20, formatLootParts(gained, '+') || 'Meager', '#fbbf24');
  } else {
    spendFood(state, 'raid', 15);
    addReputation(state, -8);
    rival.relationship = 'tense';
    applyRaidCasualties(state, state.entities, 'heavy', rival.name, 'raiding');
    pushFloat(state, rival.campX, rival.campY - 20, 'War-band broken!', '#f87171');
    logEvent(state, 'combat', `${verb} on ${rival.name} failed — war-band fought back`, rival.name, 'outgoing_raid');
    maybeQueueRaid(state, rival, state.entities.filter((e) => e.alive));
    rival.raidCooldownDays = Math.max(rival.raidCooldownDays, 7);
  }

  rival.daysUntilAction = 30;
}

export function tickPendingOutgoingRaidEvents(state: WorldState): void {
  if (!state.pendingOutgoingRaidEvents?.length) return;

  const expired: OutgoingRaidEvent[] = [];
  state.pendingOutgoingRaidEvents = state.pendingOutgoingRaidEvents.filter((evt) => {
    // The deadline is the raid owner's, not a raw field read: a save written before `expiresAtTick`
    // existed still gets the legacy window (duplication A19).
    if (state.tick < getRaidExpiresAtTick(evt)) return true;
    expired.push(evt);
    return false;
  });

  for (const evt of expired) {
    const rival = state.rivalSettlements.find((r) => r.id === evt.rivalId);
    const verb = evt.isCounterRaid ? 'Counter-raid' : 'Raid';
    logEvent(
      state,
      'combat',
      `${verb} on ${evt.rivalName} fizzled — war-band returned without fighting`,
      evt.rivalName,
      'outgoing_raid',
    );
    if (rival) {
      rival.daysUntilAction = 24;
    }
    addBigNews(state, '🏹 March recalled', `${evt.rivalName} — your war-band stood down (provisions spent).`, 'neutral');
  }
}

export function respondToOutgoingRaidEvent(
  originalState: WorldState,
  eventId: string,
  choiceId: string,
): WorldState {
  const state = structuredClone(originalState);
  const idx = state.pendingOutgoingRaidEvents?.findIndex((e) => e.id === eventId) ?? -1;
  if (idx < 0) return state;

  const event = state.pendingOutgoingRaidEvents![idx];
  const rival = state.rivalSettlements.find((r) => r.id === event.rivalId);
  if (!rival) {
    state.pendingOutgoingRaidEvents = state.pendingOutgoingRaidEvents!.filter((e) => e.id !== eventId);
    return state;
  }

  const verb = event.isCounterRaid ? 'Counter-raid' : 'Raid';
  const remove = () => {
    state.pendingOutgoingRaidEvents = state.pendingOutgoingRaidEvents!.filter((e) => e.id !== eventId);
    if (cancelPendingRaidsForRival(state, event.rivalId)) {
      logEvent(
        state,
        'combat',
        `${event.rivalName}'s war-band broke off — your campaign resolved the front`,
        event.rivalName,
        'incoming_raid',
      );
    }
  };

  if (choiceId === 'accept_payoff') {
    if (event.rivalResponse !== 'payoff_offer') return state;
    const gained = grantRaidSpoils(state, raidEventLoot(event));
    rewardRaidParticipants(
      state,
      getRaidParticipants(state, state.entities, 'outgoing'),
      'tribute',
      rival.name,
    );
    rival.relationship = 'tense';
    rival.raidCooldownDays = 12;
    rival.daysUntilAction = 28;
    addReputation(state, -2);
    const lootNote = formatLootParts(gained);
    pushFloat(state, rival.campX, rival.campY - 20, formatLootParts(gained, '+') || 'Tribute!', '#eab308');
    logEvent(
      state,
      'combat',
      `${verb} on ${rival.name} — accepted tribute${lootNote ? ` (${lootNote})` : ''}, no bloodshed`,
      rival.name,
      'outgoing_raid',
    );
    remove();
    return state;
  }

  if (choiceId === 'decline_payoff' || choiceId === 'fight') {
    if (choiceId === 'decline_payoff' && event.rivalResponse !== 'payoff_offer') return state;
    if (choiceId === 'fight' && event.rivalResponse !== 'fight') return state;
    remove();
    resolveOutgoingRaidCombat(state, rival, event);
    return state;
  }

  return state;
}

export function launchRaidOnRival(originalState: WorldState, rivalId: string): WorldState {
  const state = structuredClone(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;
  if (rival.relationship === 'friendly') return state;
  if (isRivalAtPeace(rival)) return state;
  if (!hasMilitiaWeapons(state)) return state;
  if (state.humanPopulation < 8) return state;
  const raidFoodCost = getOutgoingRaidFoodCostForRival(state, rival);
  if (state.resources.food < raidFoodCost) return state;
  if ((state.pendingOutgoingRaidEvents ?? []).some((e) => e.rivalId === rivalId)) return state;

  if (!state.pendingOutgoingRaidEvents) state.pendingOutgoingRaidEvents = [];

  const isCounterRaid = isCounterRaidOnRival(state, rivalId);
  const { verb } = isCounterRaid
    ? { verb: 'Counter-raid' }
    : getOutgoingRaidActionLabel(state, rivalId);
  if (isCounterRaid) {
    if (cancelPendingRaidsForRival(state, rivalId)) {
      logEvent(
        state,
        'combat',
        `${rival.name}'s war-band broke off — you marched out to meet them`,
        rival.name,
        'incoming_raid',
      );
    }
  }

  spendFood(state, 'raid', raidFoodCost);
  const attackerStrength = getMilitiaStrength(state, state.entities);
  const rivalDefense = getRivalDefenseStrength(rival);
  const rivalResponse = rollRivalOutgoingRaidResponse(attackerStrength, rivalDefense, rival);
  const payoffLoot = rollRivalPayoffOffer(rival, attackerStrength, rivalDefense);
  const marchDistancePx = getCampDistancePixels(state, state.buildings, rival);
  const marchDistanceTiles = getCampDistanceTiles(marchDistancePx);
  const responseDays = getIncomingRaidResponseDays(marchDistanceTiles);
  const distanceLabel = formatCampDistance(marchDistancePx);

  const event: OutgoingRaidEvent = {
    id: `outgoing_raid_${rival.id}_${state.tick}`,
    rivalId: rival.id,
    rivalName: rival.name,
    emoji: '🏹',
    title: rivalResponse === 'payoff_offer'
      ? `${rival.name} offers tribute`
      : `${rival.name} rallies their war-band`,
    description: rivalResponse === 'payoff_offer'
      ? `Your ${verb.toLowerCase()} reached ${distanceLabel} away. ${rival.name} begs you to accept tribute and withdraw.`
      : `Your ${verb.toLowerCase()} reached ${distanceLabel} away. ${rival.name} refuses to pay — they mean to fight.`,
    choices: outgoingRaidChoices(rivalResponse, payoffLoot, rival.name, verb),
    createdAtTick: state.tick,
    expiresAtTick: state.tick + responseDays * TICKS_PER_DAY,
    marchDistanceTiles,
    isCounterRaid,
    rivalResponse,
    attackerStrength,
    defenderStrength: rivalDefense,
    lootFood: payoffLoot.food,
    lootGold: payoffLoot.gold,
    lootWood: payoffLoot.wood,
    lootStone: payoffLoot.stone,
  };

  state.pendingOutgoingRaidEvents.push(event);
  flashMilitia(state.entities, 12);
  addBigNews(
    state,
    `🏹 ${verb} marching`,
    `${rival.name} — ${responseDays} days to respond in the banner or rival inspector.`,
    'negative',
  );
  logEvent(
    state,
    'combat',
    `${verb} dispatched toward ${rival.name} (${distanceLabel})`,
    rival.name,
    'outgoing_raid',
  );
  rival.daysUntilAction = 30;
  return state;
}
