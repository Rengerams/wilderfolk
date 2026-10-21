import type { Building, Entity, RivalSettlement, WorldState, RaidChoice, RaidEvent, RaidLootBundle, OutgoingRaidEvent, OutgoingRaidRivalResponse } from './gameTypes';
import { EntityType, JobType, PATH_CELL } from './gameTypes';
import { TICKS_PER_DAY, killHuman } from './dayCycle';
import { ensureEntityByIdMap } from './entityIndex';
import { hasIronSpears, hasIronSwords, hasStoneSpears } from './combat';
import { formatCitizenName, formatDeathLog } from './citizenId';
import { logDeath, logEvent } from './eventLog';
import { playerHumanCount } from './playerHuman';
import { isRivalAtPeace } from './rivalPeace';
import { gainSkill } from './skills';
import {
  canBeMustered,
  computeMilitiaBreakdown,
  getMilitiaArmamentLabel,
} from './militiaBalance';
import { getPlayerCampCenter, getPlayerCampCenterFromBuildings, getPlayerSettlerCenter } from './villageAnchor';
import { normalizeRivalProfile } from './rivalProfiles';

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
import { addBigNews, addFloatingText } from './simEffects';
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
/** Population both raid gates require before a war-band can march on a camp. */
const MIN_RAID_POPULATION = 8;

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

/** Adults the raid numbers are tuned for — the village size a camp's own war-band is a match for. */
export const RAID_GROWTH_BASE_ADULTS = 8;

/** Ceiling on one raid's prize, in the same units as `getRaidGrowthScale` — the prize rides the raid. */
export const RAID_LOOT_MAX_SCALE = 3.5;

/**
 * Raid pressure as a multiple of the camp's own war-band: a village of `RAID_GROWTH_BASE_ADULTS` is
 * raided at the camp's raw strength, and every further band of adults scales the raid with it.
 *
 * Linear is deliberate and pinned by `tests/frontierCombat.raidGold.test.ts`: militia strength grows
 * with the same adults, so the ratio — and therefore `resolveDefenseRatio`'s tier — stays flat and
 * growth never turns a raid into a walkover. Escalation comes from the camp's own growth instead.
 */
export function getRaidGrowthScale(adultCount: number): number {
  const adults = Number.isFinite(adultCount) ? Math.max(0, adultCount) : 0;
  return Math.max(1, adults / RAID_GROWTH_BASE_ADULTS);
}

/** How much of the growth multiple a raid can carry off as loot — bounded by `RAID_LOOT_MAX_SCALE`. */
export function getRaidLootScale(growthScale: number): number {
  const scale = Number.isFinite(growthScale) ? Math.max(1, growthScale) : 1;
  return Math.min(RAID_LOOT_MAX_SCALE, scale);
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
  if (state.humanPopulation < MIN_RAID_POPULATION) return `Need ${MIN_RAID_POPULATION}+ population (have ${state.humanPopulation})`;
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
  if ((state.pendingRaidVictories ?? []).some((pending) => pending.rivalId === rival.id)) {
    return { ok: false, foodCost, blockReason: 'Decide this settlement’s fate after the previous victory' };
  }
  if (isRivalAtPeace(rival)) return { ok: false, foodCost, blockReason: 'At peace' };
  if (rival.relationship === 'friendly') return { ok: false, foodCost, blockReason: 'Friendly relations' };
  if (!hasMilitiaWeapons(state)) {
    return { ok: false, foodCost, blockReason: 'Need weapons (stone/iron spears or swords)' };
  }
  if (state.humanPopulation < MIN_RAID_POPULATION) {
    return { ok: false, foodCost, blockReason: `Need ${MIN_RAID_POPULATION}+ population` };
  }
  if (state.resources.food < foodCost) {
    return { ok: false, foodCost, blockReason: `Need ${foodCost}🍖 march provisions` };
  }
  if ((state.pendingOutgoingRaidEvents ?? []).some((e) => e.rivalId === rival.id)) {
    return { ok: false, foodCost, blockReason: 'War-band already marching on this camp' };
  }
  return { ok: true, foodCost };
}

/** One deliberate act of hostility — cheap in goods, dear in standing. */
const PROVOKE_REPUTATION_COST = 6;
/** The camp answers a provocation on its own timer, not the next raid roll. */
const PROVOKE_RAID_COOLDOWN_DAYS = 12;

/** The player's own door out of a friendly stand-off — the only relations change they initiate. */
export function canProvokeRival(
  state: WorldState,
  rival: RivalSettlement,
): { ok: boolean; blockReason?: string } {
  if (!state.rivalSettlements.some((r) => r.id === rival.id)) return { ok: false, blockReason: 'No such rival' };
  if (rival.relationship === 'tense') return { ok: false, blockReason: 'Relations already tense' };
  return { ok: true };
}

export function provokeRival(originalState: WorldState, rivalId: string): WorldState {
  const state = structuredClone(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;

  const eligibility = canProvokeRival(state, rival);
  if (!eligibility.ok) {
    addFloatingText(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot provoke', '#f97316');
    return state;
  }

  rival.relationship = 'tense';
  rival.raidCooldownDays = Math.max(rival.raidCooldownDays, PROVOKE_RAID_COOLDOWN_DAYS);
  rival.daysUntilAction = Math.max(rival.daysUntilAction, PROVOKE_RAID_COOLDOWN_DAYS);
  addReputation(state, -PROVOKE_REPUTATION_COST);
  addFloatingText(state, rival.campX, rival.campY - 20, '⚠️ Hostility declared', '#f87171');
  addBigNews(
    state,
    '⚔️ Hostility declared',
    `${state.villageName} sent ${rival.name} a war challenge — they will answer it.`,
    'negative',
  );
  logEvent(
    state,
    'combat',
    `Declared hostility toward ${rival.name} — relations turn tense, reputation -${PROVOKE_REPUTATION_COST}`,
    rival.name,
    'outgoing_raid',
    'challenge',
  );
  return state;
}

/** A camp takes stock of its stores on this cadence, whatever its action timer says. */
export const RIVAL_GROWTH_INTERVAL_DAYS = 9;
/** A camp this size has outgrown the room the valley leaves it. */
const RIVAL_CAMP_MAX_POPULATION = 12;
/** Stores a camp must hold per head, and the morale/recovery below which nobody joins it. */
const RIVAL_GROWTH_FOOD_PER_HEAD = 10;
const RIVAL_GROWTH_MIN_MORALE = 55;
const RIVAL_GROWTH_MIN_RECOVERY = 40;

/** What a camp spends from its stores to settle another family. */
export function getRivalGrowthFoodCost(): number {
  return RIVAL_GROWTH_FOOD_PER_HEAD * 2;
}

/** Whether this camp's own stores can support another settler — the gate the growth roll asks. */
export function canRivalCampGrow(rival: RivalSettlement): boolean {
  if (rival.population >= RIVAL_CAMP_MAX_POPULATION) return false;
  const profile = normalizeRivalProfile(rival);
  const needed = RIVAL_GROWTH_FOOD_PER_HEAD * Math.max(1, rival.population);
  return profile.ledger.food >= needed
    && profile.ledger.morale >= RIVAL_GROWTH_MIN_MORALE
    && profile.ledger.recovery >= RIVAL_GROWTH_MIN_RECOVERY;
}

/** Which day of the cadence this camp takes stock on — staggered so camps do not all roll together. */
export function isRivalGrowthDay(rivalIndex: number, colonyDay: number): boolean {
  return (colonyDay + rivalIndex * 3) % RIVAL_GROWTH_INTERVAL_DAYS === 0;
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

function flashMilitia(entities: Entity[], ticks = 22) {
  for (const e of entities) {
    if (canBeMustered(e)) {
      e.combatTicks = Math.max(e.combatTicks ?? 0, ticks);
      e.flash = 10;
    }
  }
}

function persistBattleAftermath(
  before: WorldState,
  after: WorldState,
  raidId: string,
  rivalId: string,
  rivalName: string,
  side: 'defense' | 'offense',
  outcome: string,
  forceRatio: number,
  enemyDeaths = 0,
  enemyFallen: string[] = [],
): void {
  if ((after.raidBattleReports ?? []).some((report) => report.raidId === raidId)) return;
  const beforeAlive = new Map(before.entities.filter((entity) => entity.alive && !entity.faction && entity.type === EntityType.Human).map((entity) => [entity.id, formatCitizenName(entity)]));
  const fallen = after.entities.filter((entity) => beforeAlive.has(entity.id) && !entity.alive).map((entity) => beforeAlive.get(entity.id)!);
  const previousBuildings = new Map(before.buildings.filter((building) => !building.faction).map((building) => [building.id, building.health]));
  const damagedBuildings = after.buildings.filter((building) => !building.faction && (previousBuildings.get(building.id) ?? building.health) > building.health).length;
  const suppliesLost = {
    food: Math.max(0, before.resources.food - after.resources.food),
    gold: Math.max(0, before.resources.gold - after.resources.gold),
    wood: Math.max(0, before.resources.wood - after.resources.wood),
    stone: Math.max(0, before.resources.stone - after.resources.stone),
  };
  const leaderId = before.villageLeaderId;
  const notableDefense = side === 'defense' && (outcome === 'decisive' || outcome === 'narrow') && forceRatio >= 0.45;
  let leadershipMerit = 0;
  if (side === 'defense') {
    if (notableDefense) leadershipMerit = forceRatio < 0.75 ? 60 : outcome === 'narrow' ? 20 : 40;
    else if (outcome === 'defeat') leadershipMerit = -25;
  } else if (outcome === 'success' && forceRatio <= 4) {
    leadershipMerit = forceRatio <= 1.5 ? 30 : forceRatio <= 2.5 ? 25 : 15;
  } else if (outcome === 'fail' && fallen.length > 0) {
    leadershipMerit = -20;
  }
  const leader = leaderId == null ? undefined : after.entities.find((entity) => entity.id === leaderId);
  if (leader && leadershipMerit !== 0) {
    leader.battleLeadershipMerit = Math.max(-100, Math.min(100, (leader.battleLeadershipMerit ?? 0) + leadershipMerit));
    logEvent(after, 'combat', `${formatCitizenName(leader)} ${leadershipMerit > 0 ? 'earned' : 'lost'} ${Math.abs(leadershipMerit)} leadership merit after ${outcome} against ${rivalName}`, formatCitizenName(leader), side === 'defense' ? 'defense' : 'outgoing_raid', 'resolved');
  }
  after.raidBattleReports = [...(after.raidBattleReports ?? []).slice(-39), {
    raidId, rivalId, rivalName, side, outcome, resolvedAtTick: after.tick, leaderId,
    leadershipMerit: leader && leadershipMerit !== 0 ? leadershipMerit : 0,
    playerFallen: fallen, enemyFallen, playerDeaths: fallen.length, enemyDeaths,
    damagedBuildings, suppliesLost,
  }];
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

  const earnedMerit =
    tier === 'decisive_win' || tier === 'narrow_win' ? 15
      : tier === 'outgoing_success' ? 25
        : 0;
  for (const fighter of participants) {
    gainSkill(state, fighter.id, JobType.Soldier, baseXp);
    if (earnedMerit > 0) {
      fighter.battleLeadershipMerit = Math.min(100, Math.max(0, fighter.battleLeadershipMerit ?? 0) + earnedMerit);
    }
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
      addFloatingText(state, leader.x, leader.y - 24, `👑 +${repBonus} rep`, '#fbbf24');
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
    killHuman(victim, state.buildings, entityById, state.tick, state);
    logDeath(
      state,
      formatDeathLog(victim, deathReason),
      formatCitizenName(victim),
      { x: victim.x, y: victim.y },
    );
    logEvent(state, 'combat', `Village fighter killed: ${formatCitizenName(victim)} — ${deathReason}`, rivalName, mode === 'raiding' ? 'outgoing_raid' : 'defense', 'casualties');
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
    'casualties',
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

/** Scales a raid's prize by the same growth multiple as the war-band carrying it off. */
function multiplyRaidLoot(loot: RaidLootBundle, factor: number): RaidLootBundle {
  const f = Math.max(0, factor);
  return {
    food: Math.round(loot.food * f),
    wood: Math.round(loot.wood * f),
    stone: Math.round(loot.stone * f),
    gold: Math.round(loot.gold * f),
  };
}

/** A raid must cost a colony something even when the war-band is small: share of stores it can take. */
const RAID_LOOT_MIN_STORE_SHARE = 0.005;
/** Gold carries no storage cap, so its floor is a share of the purse rather than a food-scaled one. */
const RAID_LOOT_MIN_GOLD_SHARE = 0.02;

/**
 * Raises a rolled prize to that floor. Applied to the take, never to the queued event: clamping to
 * stores there would shrink a large camp's war-band to whatever the colony happened to be holding.
 */
export function raiseRaidLootToFloor(loot: RaidLootBundle, state: WorldState): RaidLootBundle {
  const food = Math.min(state.resources.food, Math.max(loot.food, Math.round(state.resources.food * RAID_LOOT_MIN_STORE_SHARE)));
  const wood = Math.min(state.resources.wood, Math.max(loot.wood, Math.round(state.resources.wood * RAID_LOOT_MIN_STORE_SHARE)));
  const stone = Math.min(state.resources.stone, Math.max(loot.stone, Math.round(state.resources.stone * RAID_LOOT_MIN_STORE_SHARE)));
  const gold = Math.min(state.resources.gold, Math.max(loot.gold, Math.round(state.resources.gold * RAID_LOOT_MIN_GOLD_SHARE)));
  return { food, wood, stone, gold };
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
  const target = scaleRaidLoot(raiseRaidLootToFloor(loot, state), fraction);
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

/**
 * What a war-band carries home. The camp's stores and people set the base, and `lootScale` carries the
 * same strength multiple the fight did — a 5-person camp has little worth taking, a grown one does.
 */
export function rollOutgoingRaidSpoils(
  rival: RivalSettlement,
  tier: 'success' | 'meager',
  lootScale: number,
): RaidLootBundle {
  const pop = Math.max(1, rival.population);
  const stores = Math.max(0, normalizeRivalProfile(rival).ledger.food);
  const wealth = 1 + Math.min(1, stores / 200) + Math.min(1, pop / 12);
  const rich = tier === 'success'
    ? {
      food: (28 + Math.floor(getSimRng('frontierCombat')() * 22)) * wealth,
      wood: (22 + Math.floor(getSimRng('frontierCombat')() * 28) + pop * 3) * wealth,
      stone: (12 + Math.floor(getSimRng('frontierCombat')() * 18) + pop) * wealth,
      gold: (14 + Math.floor(getSimRng('frontierCombat')() * 18)) * wealth,
    }
    : {
      food: (12 + Math.floor(getSimRng('frontierCombat')() * 12)) * wealth,
      wood: (8 + Math.floor(getSimRng('frontierCombat')() * 14) + pop) * wealth,
      stone: (4 + Math.floor(getSimRng('frontierCombat')() * 8)) * wealth,
      gold: (6 + Math.floor(getSimRng('frontierCombat')() * 10)) * wealth,
    };
  const scale = getRaidLootScale(lootScale);
  return {
    food: Math.max(1, Math.round(rich.food * scale)),
    wood: Math.max(1, Math.round(rich.wood * scale)),
    stone: Math.max(1, Math.round(rich.stone * scale)),
    gold: Math.max(1, Math.round(rich.gold * scale)),
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
  if (playerHumanCount(allAlive) < 5) return;

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

  // The war-band and its prize grow with the colony they are aimed at, so a raid stays as real a
  // threat — and as real a loss — to a grown village as it was to a young one.
  const growth = getRaidGrowthScale(computeMilitiaBreakdown(state, allAlive).adultCount);
  const attackerStrength = Math.round(getRivalRaidStrength(rival) * growth);
  const loot = multiplyRaidLoot(rollIncomingRaidLoot(rival), growth);
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
  logEvent(state, 'combat', `${rival.name} launched a raid on the village`, rival.name, 'incoming_raid', 'dispatched');
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, 5);
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
    addFloatingText(state, camp.x, camp.y - 25, formatLootParts(taken, '-') || 'Raid!', '#f87171');
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
      'resolved',
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
        'cancelled',
      );
    }
  };

  if (choiceId === 'payoff') {
    const eligibility = getRaidChoiceEligibility(state, event, choiceId, allAlive);
    if (!eligibility.ok) {
      addFloatingText(state, camp.x, camp.y - 20, eligibility.blockReason ?? `Need ${event.lootFood}🍖`, '#f97316');
      return state;
    }
    spendFood(state, 'tribute', event.lootFood);
    if (rival) {
      rival.relationship = rival.relationship === 'tense' ? 'competitive' : rival.relationship;
      rival.raidCooldownDays = 14;
    }
    addFloatingText(state, camp.x, camp.y - 20, 'Paid off', '#eab308');
    logEvent(state, 'combat', `Paid ${event.lootFood} food to end ${event.rivalName}'s raid`, event.rivalName, 'defense', 'resolved');
    remove();
    return state;
  }

  if (choiceId === 'barricade') {
    const eligibility = getRaidChoiceEligibility(state, event, choiceId, allAlive);
    if (!eligibility.ok) {
      addFloatingText(state, camp.x, camp.y - 20, eligibility.blockReason ?? 'Cannot barricade', '#f97316');
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
        'resolved',
      );
      addFloatingText(state, camp.x, camp.y - 20, formatLootParts(taken, '-') || 'Raided', '#f87171');
      applyRaidCasualties(
        state,
        allAlive,
        outcome === 'defeat' ? 'heavy' : 'moderate',
        event.rivalName,
      );
    } else {
      addReputation(state, 2);
      if (rival) rival.relationship = rival.relationship === 'tense' ? 'competitive' : rival.relationship;
      addFloatingText(state, camp.x, camp.y - 20, 'Held!', '#22c55e');
      logEvent(state, 'combat', `Barricade repelled ${event.rivalName}'s raid`, event.rivalName, 'repelled', 'resolved');
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
      addFloatingText(state, camp.x, camp.y - 20, eligibility.blockReason ?? 'Cannot defend', '#f97316');
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
        addFloatingText(state, camp.x, camp.y - 20, 'Victory!', '#22c55e');
        logEvent(state, 'combat', `Militia routed ${event.rivalName}'s war-band`, event.rivalName, 'repelled', 'resolved');
        applyRaidCasualties(state, allAlive, 'victory', event.rivalName);
        break;
      case 'narrow': {
        const taken = applyRaidLootTaken(state, raidLoot, 0.3);
        damageRandomPlayerBuilding(state, 6);
        addReputation(state, 1);
        if (rival) rival.raidCooldownDays = 20;
        addFloatingText(state, camp.x, camp.y - 20, formatLootParts(taken, '-') || 'Costly win', '#fbbf24');
        const lootNote = formatLootParts(taken);
        logEvent(
          state,
          'combat',
          `Militia drove back ${event.rivalName}${lootNote ? ` — lost ${lootNote}` : ' with minor damage'}`,
          event.rivalName,
          'defense',
          'resolved',
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
          'resolved',
        );
        addFloatingText(state, camp.x, camp.y - 20, formatLootParts(taken, '-') || 'Looted', '#f87171');
        break;
      }
      case 'defeat': {
        const taken = applyRaidLootTaken(state, raidLoot, 1);
        damageRandomPlayerBuilding(state, 18);
        addReputation(state, -6);
        if (rival) rival.relationship = 'tense';
        applyRaidCasualties(state, allAlive, 'heavy', event.rivalName);
        addFloatingText(state, camp.x, camp.y - 20, formatLootParts(taken, '-') || 'Raided!', '#f87171');
        const lootNote = formatLootParts(taken);
        logEvent(
          state,
          'combat',
          `${event.rivalName} overran the militia${lootNote ? ` — lost ${lootNote}` : ''}`,
          event.rivalName,
          'incoming_raid',
          'resolved',
        );
        break;
      }
    }
    persistBattleAftermath(originalState, state, event.id, event.rivalId, event.rivalName, 'defense', outcome, defenderStrength / Math.max(1, event.attackerStrength));
    remove();
    return state;
  }

  return state;
}

/**
 * An assault can permanently reduce a rival's manpower. An overwhelmingly superior
 * force may destroy the settlement outright; remove its physical presence and
 * queued events as well, otherwise it could keep raiding after being destroyed.
 */
function applyRivalBattleLosses(state: WorldState, rival: RivalSettlement, strengthRatio: number): void {
  // Combat can rout a settlement, but only a later explicit player decision can raze it.
  const lossFraction = strengthRatio >= 4 ? 0.85 : strengthRatio >= 2 ? 0.6 : 0.25;
  const losses = Math.min(Math.max(0, rival.population - 1), Math.max(1, Math.ceil(rival.population * lossFraction)));
  rival.population -= losses;
  // Rivals can have a larger simulated population than their visible character roster.
  // Kill only living members, record named deaths when available, and count any
  // remaining losses as off-map casualties instead of inventing character names.
  const livingRivals = state.entities.filter((entity) => entity.alive && rival.entityIds.includes(entity.id));
  const victims = livingRivals.slice(0, losses);
  const casualties = new Set(victims.map((entity) => entity.id));
  for (const victim of victims) {
    victim.alive = false;
    logDeath(
      state,
      formatDeathLog(victim, `fell defending ${rival.name} against our war-band`),
      formatCitizenName(victim),
      { x: victim.x, y: victim.y },
      'enemy',
    );
    logEvent(state, 'combat', `Enemy killed: ${formatCitizenName(victim)} — defending ${rival.name}`, rival.name, 'outgoing_raid', 'casualties');
  }
  rival.entityIds = rival.entityIds.filter((id) => !casualties.has(id));
  const offMapDeaths = losses - victims.length;
  logEvent(
    state,
    'combat',
    `${rival.name} lost ${losses} inhabitants defending their settlement (${victims.length} named casualties${offMapDeaths > 0 ? `, ${offMapDeaths} off-map` : ''}); ${rival.population} survive`,
    rival.name,
    'outgoing_raid',
    'casualties',
  );
  // The defeated camp survives with its structures and remaining people. Destruction is
  // handled only by a confirmed post-victory decision, never by a strength ratio.
}

function resolveOutgoingRaidCombat(
  state: WorldState,
  rival: RivalSettlement,
  event: Pick<OutgoingRaidEvent, 'id' | 'isCounterRaid' | 'attackerStrength' | 'defenderStrength' | 'rivalId'>,
): void {
  const outcome = resolveCounterRaidRatio(event.attackerStrength, event.defenderStrength);
  const verb = event.isCounterRaid ? 'Counter-raid' : 'Raid';
  // The strength you brought over their defense is what decides how much there is to carry home.
  const lootScale = Math.sqrt(event.attackerStrength / Math.max(event.defenderStrength, 1));
  const warBand = getRaidParticipants(state, state.entities, 'outgoing');
  rewardRaidParticipants(state, warBand, counterRaidToReward(outcome), rival.name);

  flashMilitia(state.entities, 20);
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, outcome === 'fail' ? 8 : 4);

  if (outcome === 'success') {
    const gained = grantRaidSpoils(state, rollOutgoingRaidSpoils(rival, 'success', lootScale));
    rival.relationship = 'tense';
    rival.raidCooldownDays = 10;
    applyRaidCasualties(state, state.entities, 'victory', rival.name, 'raiding');
    addFloatingText(state, rival.campX, rival.campY - 20, formatLootParts(gained, '+') || 'Spoils!', '#22c55e');
    const lootNote = formatLootParts(gained);
    logEvent(
      state,
      'combat',
      `${verb} on ${rival.name} succeeded${lootNote ? ` — seized ${lootNote}` : ' — seized supplies'}`,
      rival.name,
      'outgoing_raid',
      'resolved',
    );
    addReputation(state, -5);
    const defendersBefore = rival.population;
    const livingEnemyBefore = state.entities.filter((person) => person.alive && rival.entityIds.includes(person.id));
    applyRivalBattleLosses(state, rival, event.attackerStrength / Math.max(1, event.defenderStrength));
    const enemyDeaths = defendersBefore - rival.population;
    const playerDeaths = warBand.filter((fighter) => !fighter.alive).length;
    // Record a distinct, persistent post-victory decision. Battle deaths are already
    // applied exactly once; reopening the dialog must never run combat again.
    if (!(state.pendingRaidVictories ?? []).some((pending) => pending.raidId === event.id)) {
      state.pendingRaidVictories = [...(state.pendingRaidVictories ?? []), {
        raidId: event.id,
        rivalId: rival.id,
        rivalName: rival.name,
        playerDead: playerDeaths,
        enemyDead: enemyDeaths,
        enemySurvivors: rival.population,
        playerCasualties: warBand.filter((person) => !person.alive).map((person) => formatCitizenName(person)),
        enemyCasualties: livingEnemyBefore.filter((person) => !person.alive).map((person) => formatCitizenName(person)),
      }];
    }
    addBigNews(state, '⚖️ Rival settlement surrendered', `Decide whether to spare, demand terms from, or raze ${rival.name}. ${rival.population} people remain.`, 'positive');
    const victoryTitle = '🏆 War-band returns victorious';
    const victoryMessage = `${verb} against ${rival.name}: ${enemyDeaths} enemy dead, ${playerDeaths} of our people lost. ${rival.population} rival inhabitants remain. ${lootNote ? `Spoils: ${lootNote}.` : 'No supplies recovered.'}`;
    addBigNews(state, victoryTitle, victoryMessage, 'positive');
    logEvent(state, 'combat', `Village victory celebrations — ${victoryMessage}`, rival.name, 'outgoing_raid', 'resolved');
  } else if (outcome === 'meager') {
    const gained = grantRaidSpoils(state, rollOutgoingRaidSpoils(rival, 'meager', lootScale));
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
      'resolved',
    );
    addFloatingText(state, rival.campX, rival.campY - 20, formatLootParts(gained, '+') || 'Meager', '#fbbf24');
    const playerDeaths = warBand.filter((fighter) => !fighter.alive).length;
    logEvent(state, 'combat', `The war-band returned from ${rival.name} with limited success: ${playerDeaths} of our people died. No victory celebration was held.`, rival.name, 'outgoing_raid', 'resolved');
  } else {
    spendFood(state, 'raid', 15);
    addReputation(state, -8);
    rival.relationship = 'tense';
    applyRaidCasualties(state, state.entities, 'heavy', rival.name, 'raiding');
    addFloatingText(state, rival.campX, rival.campY - 20, 'War-band broken!', '#f87171');
    logEvent(state, 'combat', `${verb} on ${rival.name} failed — war-band fought back`, rival.name, 'outgoing_raid', 'resolved');
    const playerDeaths = warBand.filter((fighter) => !fighter.alive).length;
    addBigNews(state, '⚔️ War-band defeated', `${verb} on ${rival.name} failed; ${playerDeaths} of our people were killed. The village mourns its losses.`, 'negative');
    logEvent(state, 'combat', `Village mourns after failed ${verb.toLowerCase()} on ${rival.name}: ${playerDeaths} dead.`, rival.name, 'outgoing_raid', 'resolved');
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
      'cancelled',
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
        'cancelled',
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
    addFloatingText(state, rival.campX, rival.campY - 20, formatLootParts(gained, '+') || 'Tribute!', '#eab308');
    logEvent(
      state,
      'combat',
      `${verb} on ${rival.name} — accepted tribute${lootNote ? ` (${lootNote})` : ''}, no bloodshed`,
      rival.name,
      'outgoing_raid',
      'resolved',
    );
    remove();
    return state;
  }

  if (choiceId === 'decline_payoff' || choiceId === 'fight') {
    if (choiceId === 'decline_payoff' && event.rivalResponse !== 'payoff_offer') return state;
    if (choiceId === 'fight' && event.rivalResponse !== 'fight') return state;
    remove();
    resolveOutgoingRaidCombat(state, rival, event);
    const outcome = resolveCounterRaidRatio(event.attackerStrength, event.defenderStrength);
    const pending = state.pendingRaidVictories?.find((victory) => victory.raidId === event.id);
    persistBattleAftermath(originalState, state, event.id, event.rivalId, event.rivalName, 'offense', outcome, event.attackerStrength / Math.max(1, event.defenderStrength), pending?.enemyDead ?? 0, pending?.enemyCasualties ?? []);
    return state;
  }

  return state;
}

export function launchRaidOnRival(originalState: WorldState, rivalId: string): WorldState {
  const state = structuredClone(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;

  const eligibility = canLaunchRaidOnRival(state, rival);
  if (!eligibility.ok) {
    addFloatingText(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot march on this camp', '#f97316');
    return state;
  }
  const raidFoodCost = eligibility.foodCost;

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
        'cancelled',
      );
    }
  }

  spendFood(state, 'raid', raidFoodCost);
  const attackerStrength = getMilitiaStrength(state, state.entities);
  const rivalDefense = getRivalDefenseStrength(rival);
  // The rival may offer tribute, but the player always gets to reject it and attack.
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
      ? `Your ${verb.toLowerCase()} reached ${distanceLabel} away. ${rival.name} offers tribute to avoid the attack. Accept or attack anyway.`
      : `Your ${verb.toLowerCase()} reached ${distanceLabel} away. ${rival.name} refuses to negotiate and prepares to fight.`,
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
    'dispatched',
  );
  rival.daysUntilAction = 30;
  return state;
}

/** Apply the settlement fate once; war casualties and initial loot are never replayed. */
export function resolveRaidVictory(originalState: WorldState, raidId: string, choice: string): WorldState {
  if (!['mercy', 'tribute', 'raze'].includes(choice)) return originalState;
  const pending = originalState.pendingRaidVictories?.find((entry) => entry.raidId === raidId);
  if (!pending) return originalState;
  const state = structuredClone(originalState);
  const rival = state.rivalSettlements.find((entry) => entry.id === pending.rivalId);
  state.pendingRaidVictories = (state.pendingRaidVictories ?? []).filter((entry) => entry.raidId !== raidId);
  if (!rival) return state;
  if (choice === 'mercy') {
    rival.relationship = 'neutral';
    rival.peaceTreatyDays = Math.max(rival.peaceTreatyDays, 30);
    rival.raidCooldownDays = Math.max(rival.raidCooldownDays, 30);
    addReputation(state, 12);
    logEvent(state, 'combat', `Spared ${rival.name} after victory — ${rival.population} survivors, 30-day truce, +12 reputation`, rival.name, 'outgoing_raid', 'resolved');
  } else if (choice === 'tribute') {
    // A one-off settlement of terms, not an invented recurring tribute agreement.
    const offer = rollRivalPayoffOffer(rival, Math.max(1, pending.enemyDead + pending.enemySurvivors), Math.max(1, pending.enemySurvivors));
    const gained = grantRaidSpoils(state, offer);
    rival.raidCooldownDays = Math.max(rival.raidCooldownDays, 21);
    rival.peaceTreatyDays = Math.max(rival.peaceTreatyDays, 21);
    addReputation(state, -3);
    logEvent(state, 'combat', `Terms imposed on ${rival.name} — one-time tribute ${formatLootParts(gained)}; 21-day truce`, rival.name, 'outgoing_raid', 'resolved');
  } else {
    const structureIds = new Set(rival.buildingIds);
    const personIds = new Set(rival.entityIds);
    for (const person of state.entities) {
      if (personIds.has(person.id)) person.alive = false;
    }
    state.buildings = state.buildings.filter((building) => !structureIds.has(building.id));
    state.pendingRaidEvents = (state.pendingRaidEvents ?? []).filter((entry) => entry.rivalId !== rival.id);
    state.pendingOutgoingRaidEvents = (state.pendingOutgoingRaidEvents ?? []).filter((entry) => entry.rivalId !== rival.id);
    state.pendingDiplomacyEvents = (state.pendingDiplomacyEvents ?? []).filter((entry) => entry.rivalId !== rival.id);
    state.rivalSettlements = state.rivalSettlements.filter((entry) => entry.id !== rival.id);
    addReputation(state, -30);
    logEvent(state, 'combat', `Razed ${rival.name} after its surrender — ${pending.enemySurvivors} surviving inhabitants lost their settlement; -30 reputation`, rival.name, 'outgoing_raid', 'resolved');
  }
  return state;
}
