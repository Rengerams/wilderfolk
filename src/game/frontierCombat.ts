import type { Building, Entity, RivalSettlement, WorldState, RaidChoice, RaidEvent, RaidLootBundle, OutgoingRaidEvent, OutgoingRaidRivalResponse } from './gameTypes';
import { EntityType, JobType, PATH_CELL } from './gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR, getAbsoluteCalendarDay, killHuman } from './dayCycle';
import { awardRaidSurvivalMark } from './personalMarks';
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
import { unindexEntityFromState } from './entityIndex';
import { applyWarCommunityReaction, captureRaidPrisoners } from './warPrisoners';
import { isSettlementDestroyed, beginRaidRecovery, rememberRivalDisposition } from './raidAftermath';
import { normalizeRivalProfile } from './rivalProfiles';
export { getPlayerCampCenter, getPlayerCampCenterFromBuildings, getPlayerSettlerCenter };
import { BARRICADE_RAID_COST, formatResourceCostNeed, canAffordResourceCost } from './resourceCost';
import { getSimRng, hashSalt } from './simRng';
import { addCappedResource } from './resourceUtils';
import { spendFood } from './economyLedger';
import { addBigNews, addFloatingText } from './simEffects';
import { addReputation, getReputationBand } from './simHelpers';
export type { RaidChoice, RaidEvent, RaidLootBundle, OutgoingRaidEvent, OutgoingRaidRivalResponse } from './gameTypes';
export const RAID_BATTLE_HOURS = 6;
const RAID_MERIT_REPEAT_COOLDOWN_DAYS = 30;
const RIVAL_RAZE_INTENT_CHANCE = 0.15;
const RIVAL_MEMORY_RAID_CHANCE_FLOOR = 0.25;
const RIVAL_MEMORY_RAID_SCALE = 200;
const RAID_RESPONSE_MIN_DAYS = 2;
const RAID_RESPONSE_MAX_DAYS = 6;
/** Legacy fixed window for saves/events missing `expiresAtTick`. */
function getRaidExpireTicksLegacy(): number {
  return 3 * TICKS_PER_DAY;
}
const RAID_FOOD_MIN = 40;
/** Home-turf bonus when you attack a rival camp (harder than meeting them at your gate). */
const OUTGOING_RAID_DEFENSE_MULT = 1.25;
/** Population both raid gates require before a war-band can march on a camp. */
const MIN_RAID_POPULATION = 8;

export function hasMilitiaWeapons(state: WorldState): boolean {
  return hasIronSwords(state) || hasIronSpears(state) || hasStoneSpears(state);
}

/** Elapsed share of a raid battle, for the raid UI; both sides share the same clock. */
export function getBattleProgressPercent(
  event: { phase?: OutgoingRaidEvent['phase'] | RaidEvent['phase']; battleStartedAtTick?: number },
  tick: number,
): number {
  if (event.phase === 'returning') return 100;
  if (event.phase === 'marching' || event.phase === 'engaging' || event.battleStartedAtTick == null) return 0;
  const elapsed = Math.max(0, tick - event.battleStartedAtTick);
  return Math.min(100, Math.round(elapsed / (RAID_BATTLE_HOURS * TICKS_PER_HOUR) * 100));
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

export function getRaidExpiresAtTick(evt: Pick<RaidEvent, 'expiresAtTick' | 'createdAtTick'>): number {
  if (evt.expiresAtTick != null) return evt.expiresAtTick;
  if (evt.createdAtTick == null) return Number.NaN;
  return evt.createdAtTick + getRaidExpireTicksLegacy();
}

export function getRaidTicksRemaining(evt: Pick<RaidEvent, 'expiresAtTick' | 'createdAtTick'>, currentTick: number): number {
  return Math.max(0, getRaidExpiresAtTick(evt) - currentTick);
}

export function getRaidDaysRemaining(evt: Pick<RaidEvent, 'expiresAtTick' | 'createdAtTick'>, currentTick: number): number {
  return Math.max(0, Math.ceil(getRaidTicksRemaining(evt, currentTick) / TICKS_PER_DAY));
}

export function formatRaidDeadline(evt: Pick<RaidEvent, 'expiresAtTick' | 'createdAtTick'>, currentTick: number): string {
  // An unknown deadline must not read as "arriving now": `Math.max(0, NaN)` is NaN, and the old
  // `days <= 0` test let `NaN` fall through to `NaN days left`.
  if (!Number.isFinite(getRaidExpiresAtTick(evt))) return 'deadline unknown';
  const days = getRaidDaysRemaining(evt, currentTick);
  if (days <= 0) return 'arriving now';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/** Food is packed for the outward and return march: deployed soldiers cannot resupply at home en
 * route. One ration per soldier per game day, plus a fixed pack cost for wagons and travel losses.
 */
export function getOutgoingRaidFoodCost(distancePixels: number, soldierCount = 0): number {
  const tiles = getCampDistanceTiles(distancePixels);
  const marchDays = getIncomingRaidResponseDays(tiles); // at least two days each way
  const transportFood = Math.max(RAID_FOOD_MIN, 30 + Math.ceil(tiles / 2));
  return transportFood + Math.max(0, soldierCount) * marchDays * 2;
}

/** Remove in-flight raid events when a truce is signed. */
export function cancelPendingRaidsForRival(state: WorldState, rivalId: string): boolean {
  const before = state.pendingRaidEvents?.length ?? 0;
  for (const event of state.pendingRaidEvents ?? []) {
    if (event.rivalId === rivalId) releaseRaidSoldiers(state, event.id);
  }
  state.pendingRaidEvents = (state.pendingRaidEvents ?? []).filter((e) => e.rivalId !== rivalId);
  return (state.pendingRaidEvents?.length ?? 0) < before;
}

/** Recall a player war-band when peace is signed. */
export function cancelPendingOutgoingRaidsForRival(state: WorldState, rivalId: string): boolean {
  const before = state.pendingOutgoingRaidEvents?.length ?? 0;
  for (const event of state.pendingOutgoingRaidEvents ?? []) {
    if (event.rivalId === rivalId) releaseRaidSoldiers(state, event.id);
  }
  state.pendingOutgoingRaidEvents = (state.pendingOutgoingRaidEvents ?? []).filter((e) => e.rivalId !== rivalId);
  return (state.pendingOutgoingRaidEvents?.length ?? 0) < before;
}

/** Founding raid cooldown: a new camp watches the frontier for 45–74 days before its first war-band. */
export function rollFoundingRaidCooldownDays(roll: number): number {
  return 45 + Math.floor(roll * 30);
}

/** A truce calls off both war-bands at a rival and keeps that camp quiet for the treaty's length. */
export function applyTruceToRival(state: WorldState, rivalId: string, truceDays: number): void {
  const rival = state.rivalSettlements.find((candidate) => candidate.id === rivalId);
  if (!rival) return;
  rival.atWarWithPlayer = false;
  rival.raidCooldownDays = Math.max(rival.raidCooldownDays, truceDays);
  if (cancelPendingRaidsForRival(state, rivalId)) {
    logEvent(state, 'event', `Raid called off — truce with ${rival.name}`, rival.name);
  }
  if (cancelPendingOutgoingRaidsForRival(state, rivalId)) {
    logEvent(state, 'event', `War-band recalled — truce with ${rival.name}`, rival.name);
  }
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
  return getOutgoingRaidFoodCost(
    getCampDistancePixels(state, state.buildings, rival),
    getRaidParticipants(state, state.entities, 'outgoing').length,
  );
}

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
  if (getRaidParticipants(state, state.entities, 'outgoing').length === 0) return { ok: false, foodCost, blockReason: 'No available soldiers' };
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
  if (rival.atWarWithPlayer) return { ok: false, blockReason: 'Already at war' };
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
  const brokeTreaty = isRivalAtPeace(rival);
  rival.atWarWithPlayer = true;
  rival.peaceTreatyDays = 0;
  rival.raidCooldownDays = Math.max(rival.raidCooldownDays, PROVOKE_RAID_COOLDOWN_DAYS);
  rival.daysUntilAction = Math.max(rival.daysUntilAction, PROVOKE_RAID_COOLDOWN_DAYS);
  addReputation(state, -PROVOKE_REPUTATION_COST);
  addFloatingText(state, rival.campX, rival.campY - 20, '⚠️ Hostility declared', '#f87171');
  addBigNews(
    state,
    brokeTreaty ? '⚔️ Treaty broken' : '⚔️ War declared',
    brokeTreaty
      ? `${state.villageName} broke its peace treaty with ${rival.name} — they will answer it.`
      : `${state.villageName} sent ${rival.name} a war challenge — they will answer it.`,
    'negative',
  );
  logEvent(
    state,
    'combat',
    brokeTreaty
      ? `Broke the peace treaty with ${rival.name} — relations turn tense, reputation -${PROVOKE_REPUTATION_COST}`
      : `Declared war on ${rival.name} — relations turn tense, reputation -${PROVOKE_REPUTATION_COST}`,
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

/** Which day of the cadence this camp takes stock on — staggered by stable identity, not list order. */
export function isRivalGrowthDay(rivalId: string, colonyDay: number): boolean {
  return (colonyDay + (hashSalt(rivalId) % RIVAL_GROWTH_INTERVAL_DAYS)) % RIVAL_GROWTH_INTERVAL_DAYS === 0;
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
    outgoingRaidFoodCost = getOutgoingRaidFoodCostForRival(state, options.rival);
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

/** A leader killed during the battle is memorialized instead of crediting a replacement. */
function battleReportLeader(state: WorldState, initialLeaderId: number | null | undefined): number | null {
  const initial = initialLeaderId == null ? undefined : state.entities.find((person) => person.id === initialLeaderId);
  return initialLeaderId != null && (!initial || !initial.alive) ? initialLeaderId : state.villageLeaderId;
}

function persistBattleAftermath(
  before: Pick<WorldState, 'entities' | 'buildings' | 'resources' | 'villageLeaderId'>,
  after: WorldState,
  raidId: string,
  rivalId: string,
  rivalName: string,
  side: 'defense' | 'offense',
  outcome: string,
  forceRatio: number,
  enemyDeaths = 0,
  enemyFallen: string[] = [],
  confirmedPlayerFallen: string[] = [],
): void {
  if ((after.scoredRaidIds ?? []).includes(raidId)) return;
  (after.scoredRaidIds ??= []).push(raidId);
  const beforeAlive = new Map(before.entities.filter((entity) => entity.alive && !entity.faction && entity.type === EntityType.Human).map((entity) => [entity.id, formatCitizenName(entity)]));
  const fallen = [...new Set([...confirmedPlayerFallen, ...after.entities.filter((entity) => beforeAlive.has(entity.id) && !entity.alive).map((entity) => beforeAlive.get(entity.id)!)])];
  const previousBuildings = new Map(before.buildings.filter((building) => !building.faction).map((building) => [building.id, building.health]));
  const currentBuildings = new Map(after.buildings.map((home) => [home.id, home]));
  const damagedBuildings = [...previousBuildings].filter(([id, health]) => {
    const current = currentBuildings.get(id);
    return !current || current.health < health;
  }).length;
  const suppliesLost = {
    food: Math.max(0, before.resources.food - after.resources.food),
    gold: Math.max(0, before.resources.gold - after.resources.gold),
    wood: Math.max(0, before.resources.wood - after.resources.wood),
    stone: Math.max(0, before.resources.stone - after.resources.stone),
  };
  const leaderId = before.villageLeaderId;
  const notableDefense = side === 'defense' && (outcome === 'decisive' || outcome === 'narrow') && forceRatio <= 2.5;
  let leadershipMerit = 0;
  if (side === 'defense') {
    if (notableDefense) leadershipMerit = outcome === 'narrow' ? 20 : forceRatio <= 1.5 ? 60 : 40;
    else if (outcome === 'defeat' || outcome === 'unanswered') leadershipMerit = -25;
  } else if (outcome === 'success' && forceRatio <= 4) {
    leadershipMerit = forceRatio <= 1.5 ? 30 : forceRatio <= 2.5 ? 25 : 15;
  } else if (outcome === 'fail' && fallen.length > 0) {
    leadershipMerit = -20;
  }
  const leader = leaderId == null ? undefined : after.entities.find((entity) => entity.id === leaderId);
  const lastAward = leader?.battleLeadershipAwards?.[rivalId];
  if (leadershipMerit > 0 && lastAward != null
    && after.tick - lastAward < RAID_MERIT_REPEAT_COOLDOWN_DAYS * TICKS_PER_DAY) leadershipMerit = 0;
  if (leader && leadershipMerit !== 0) {
    if (leadershipMerit > 0) (leader.battleLeadershipAwards ??= {})[rivalId] = after.tick;
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

  for (const fighter of participants) {
    gainSkill(state, fighter.id, JobType.Soldier, baseXp);
    if (fighter.id === leaderId) {
      leaderInFight = true;
      gainSkill(state, fighter.id, JobType.Soldier, RAID_LEADER_GUARD_XP_BONUS);
    }
  }

  const repBonus = leaderInFight ? (RAID_LEADER_REP_BONUS[tier] ?? 0) : 0;
  if (repBonus > 0 && isRaidVictoryTier(tier)) {
    // The applied delta, not the requested one: `addReputation` clamps at the ceiling, so a victory on
    // a full bar grants 0 and the "reputation rises" banner must not fire.
    const granted = addReputation(state, repBonus);
    const leader = participants.find((p) => p.id === leaderId);
    if (leader) {
      logEvent(
        state,
        'event',
        `${formatCitizenName(leader)} led the raid against ${rivalName} — village reputation +${granted}`,
        formatCitizenName(leader),
      );
      if (granted > 0) addFloatingText(state, leader.x, leader.y - 24, `👑 +${granted} rep`, '#fbbf24');
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

/** Cap attacker deaths by the actual resistance they face, not by the size of
 * their own army. Overwhelming victories may have no casualties at all. */
export function getOutgoingRaidCasualtyLimit(attackerStrength: number, defenderStrength: number, defenderPopulation: number, soldierCount: number): number {
  if (soldierCount <= 0 || defenderPopulation <= 0 || defenderStrength <= 0) return 0;
  const ratio = attackerStrength / Math.max(1, defenderStrength);
  if (ratio >= 12) return 1;
  if (ratio >= 6) return Math.min(2, Math.ceil(defenderPopulation / 5));
  if (ratio >= 3) return Math.min(Math.ceil(soldierCount * 0.025), Math.ceil(defenderPopulation / 3));
  return Math.min(soldierCount, Math.max(1, Math.ceil(defenderPopulation * 0.35)));
}

function applyRaidCasualties(
  state: WorldState,
  entities: Entity[],
  tier: RaidCasualtyTier,
  rivalName: string,
  mode: 'defending' | 'raiding' = 'defending',
  selectedIds?: ReadonlySet<number>,
  casualtyLimit?: number,
): number {
  const pool = entities.filter((e) => selectedIds ? selectedIds.has(e.id) && e.alive && e.prisonBuildingId == null : canBeMustered(e));
  if (pool.length === 0) return 0;

  const [minK, maxK] = getRaidCasualtyBounds(tier, pool.length);
  const adjustedMin = casualtyLimit == null ? minK : 0;
  const adjustedMax = casualtyLimit == null ? maxK : Math.min(maxK, Math.max(0, casualtyLimit));
  const killCount = Math.min(pool.length,
    adjustedMin + Math.floor(getSimRng('frontierCombat')() * (adjustedMax - adjustedMin + 1)));

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
    // `spendFood` returns what was actually taken and records the loss against the raid sink.
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
    const capped = clampRaidGoldGain(state.resources.gold, spoils.gold);
    gained.gold = addCappedResource(state, 'gold', capped);
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
  if (state.raidRecovery && state.tick < state.raidRecovery.protectedUntilTick) return;
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
  const memory = rival.diplomacyMemory;
  if (memory) chance *= Math.max(RIVAL_MEMORY_RAID_CHANCE_FLOOR, 1 + memory.grievance / RIVAL_MEMORY_RAID_SCALE - memory.fear / RIVAL_MEMORY_RAID_SCALE);
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
    intent: rival.atWarWithPlayer && getSimRng('frontierCombat')() < RIVAL_RAZE_INTENT_CHANCE ? 'raze' : 'plunder',
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

  if (event.intent === 'raze') event.description += ' Their declared aim is to raze the village if its last defenses fail.';
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
  if (isSettlementDestroyed(state) || !state.pendingRaidEvents?.length) return;

  for (const event of [...state.pendingRaidEvents]) {
    if (event.phase !== 'fighting') continue;
    const elapsed = state.tick - (event.battleStartedAtTick ?? state.tick);
    const battleTicks = RAID_BATTLE_HOURS * TICKS_PER_HOUR;
    const outlook = resolveDefenseRatio(event.defenseStrength ?? 0, event.attackerStrength);
    event.battleMilestones ??= [];
    for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
      if (elapsed < battleTicks * fraction || event.battleMilestones.includes(fraction)) continue;
      event.battleMilestones.push(fraction);
      const holding = outlook === 'decisive' || outlook === 'narrow';
      const message = outlook === 'defeat'
        ? `The raiders gain ground at the ${Math.round(fraction * 6)}-hour mark; the village line is buckling.`
        : outlook === 'stalemate'
          ? `The ${Math.round(fraction * 6)}-hour mark passes — the line bends, but it does not break.`
          : holding
            ? `The ${Math.round(fraction * 6)}-hour mark passes — the village line is holding.`
            : `The ${Math.round(fraction * 6)}-hour mark passes — the fight hangs in the balance.`;
      logEvent(state, 'combat', message, event.rivalName, 'defense', 'dispatched');
    }
    if (elapsed >= battleTicks / 2) {
      const outcome = resolveDefenseRatio(event.defenseStrength ?? 0, event.attackerStrength);
      resolveIncomingRaidCasualties(state, event, state.entities,
        outcome === 'decisive' ? 'victory' : outcome === 'narrow' ? 'costly' : outcome === 'stalemate' ? 'moderate' : 'heavy');
    }
    if (elapsed < RAID_BATTLE_HOURS * TICKS_PER_HOUR) continue;
    event.phase = 'resolving';
    const before = { entities: state.entities.map((person) => ({ ...person })),
      buildings: state.buildings.map((home) => ({ ...home })), resources: { ...state.resources }, villageLeaderId: state.villageLeaderId };
    resolveIncomingRaidInPlace(state, event.id, event.defenseChoice ?? 'defend', before);
    if (isSettlementDestroyed(state)) return;
  }
  allAlive = state.entities.filter((person) => person.alive);
  const expired: RaidEvent[] = [];
  state.pendingRaidEvents = state.pendingRaidEvents.filter((evt) => {
    if (evt.phase === 'fighting' || state.tick < getRaidExpiresAtTick(evt)) return true;
    expired.push(evt);
    return false;
  });

  for (const evt of expired) {
    if (isSettlementDestroyed(state)) break;
    const battleBefore = {
      entities: state.entities.map((entity) => ({ ...entity })),
      buildings: state.buildings.map((building) => ({ ...building })),
      resources: { ...state.resources },
      villageLeaderId: state.villageLeaderId,
    };
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
    beginRaidRecovery(state, evt, 'unanswered', getBarricadeStrength(state, allAlive), battleBefore);
    persistBattleAftermath(battleBefore, state, evt.id, evt.rivalId, evt.rivalName, 'defense', 'unanswered', 0);
  }
}

export function getRaidChoiceEligibility(
  state: WorldState,
  event: RaidEvent,
  choiceId: string,
  allAlive: Entity[] = state.entities.filter((entity) => entity.alive),
): { ok: boolean; blockReason?: string } {
  if (event.phase) return { ok: false, blockReason: 'Battle already underway' };
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

/** The command starts a timed defense; only the combat owner later applies its result. */
export function queueRaidDefense(original: WorldState, eventId: string, choice: string): WorldState {
  if (choice === 'payoff') return respondToRaidEvent(original, eventId, choice);
  const event = original.pendingRaidEvents?.find((entry) => entry.id === eventId);
  if (!event || event.phase || !['defend', 'barricade'].includes(choice)
    || !getRaidChoiceEligibility(original, event, choice, original.entities).ok) return original;
  const state = structuredClone(original);
  const battle = state.pendingRaidEvents.find((entry) => entry.id === eventId)!;
  battle.phase = 'fighting';
  battle.defenseChoice = choice as 'defend' | 'barricade';
  battle.defenseStrength = choice === 'barricade' ? getBarricadeStrength(state, state.entities) : getMilitiaStrength(state, state.entities);
  battle.battleStartedAtTick = state.tick;
  battle.leaderIdAtBattleStart = state.villageLeaderId;
  battle.soldierIds = getRaidParticipants(state, state.entities, choice === 'barricade' ? 'barricade' : 'militia').map((person) => person.id);
  for (const person of state.entities) if (battle.soldierIds.includes(person.id)) person.raidDeploymentId = battle.id;
  if (choice === 'barricade') {
    state.resources.wood -= BARRICADE_RAID_COST.wood ?? 0;
    state.resources.stone -= BARRICADE_RAID_COST.stone ?? 0;
    battle.barricadePaid = true;
  }
  battle.choices = [];
  logEvent(state, 'combat', `Defense of the village against ${battle.rivalName} begins; ${RAID_BATTLE_HOURS} game hours of fighting.`, battle.rivalName, 'defense', 'dispatched');
  return state;
}

/** A saved milestone applies named defender losses once, including across reload and replay. */
function resolveIncomingRaidCasualties(state: WorldState, event: RaidEvent, entities: Entity[], tier: RaidCasualtyTier): void {
  if (event.battleCasualtiesApplied) return;
  const selected = event.soldierIds == null ? undefined : new Set(event.soldierIds);
  const before = entities.filter((person) => person.alive && (selected ? selected.has(person.id) : canBeMustered(person)));
  applyRaidCasualties(state, entities, tier, event.rivalName, 'defending', selected);
  event.battleCasualtiesApplied = true;
  event.battlePlayerCasualties = before.filter((person) => !person.alive).map(formatCitizenName);
  // Surviving is the achievement: a clean win leaves luck, a mauling that was survived leaves a scar.
  const survivalDay = getAbsoluteCalendarDay(state.tick);
  for (const person of before) {
    if (person.alive) awardRaidSurvivalMark(person, tier, survivalDay);
  }
}

export function respondToRaidEvent(originalState: WorldState, eventId: string, choiceId: string): WorldState {
  return resolveIncomingRaidInPlace(structuredClone(originalState), eventId, choiceId, originalState);
}

/** The hourly simulation mutates its existing world, preserving runtime cache classes and event identity. */
function resolveIncomingRaidInPlace(state: WorldState, eventId: string, choiceId: string,
  originalState: Pick<WorldState, 'entities' | 'buildings' | 'resources' | 'villageLeaderId'>): WorldState {
  const idx = state.pendingRaidEvents?.findIndex((e) => e.id === eventId) ?? -1;
  if (idx < 0) return state;

  const event = state.pendingRaidEvents[idx];
  if (event.phase === 'fighting') return state;
  const rival = state.rivalSettlements.find((r) => r.id === event.rivalId);
  const allAlive = state.entities.filter((e) => e.alive);
  const camp = getPlayerCampCenter(state, state.buildings);
  const defenderStrength = event.defenseStrength ?? getMilitiaStrength(state, allAlive);
  const remove = () => {
    releaseRaidSoldiers(state, event.id);
    const report = state.raidBattleReports?.find((entry) => entry.raidId === event.id);
    if (report && event.battlePlayerCasualties?.length) {
      report.playerFallen = [...new Set([...report.playerFallen, ...event.battlePlayerCasualties])];
      report.playerDeaths = report.playerFallen.length;
    }
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
    if (!eligibility.ok && event.phase !== 'resolving') {
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
    if (!eligibility.ok && event.phase !== 'resolving') {
      addFloatingText(state, camp.x, camp.y - 20, eligibility.blockReason ?? 'Cannot barricade', '#f97316');
      return state;
    }
    if (!event.barricadePaid) {
      state.resources.wood -= BARRICADE_RAID_COST.wood ?? 0;
      state.resources.stone -= BARRICADE_RAID_COST.stone ?? 0;
    }
    const effectiveDef = event.defenseStrength ?? getBarricadeStrength(state, allAlive);
    const outcome = resolveDefenseRatio(effectiveDef, event.attackerStrength);
    const raidLoot = raidEventLoot(event);
    const barricadeFighters = event.soldierIds ? allAlive.filter((person) => person.alive && event.soldierIds!.includes(person.id)) : getRaidParticipants(state, allAlive, 'barricade');
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
      resolveIncomingRaidCasualties(
        state,
        event,
        allAlive,
        outcome === 'defeat' ? 'heavy' : 'moderate',
      );
    } else {
      addReputation(state, 2);
      if (rival) rival.relationship = rival.relationship === 'tense' ? 'competitive' : rival.relationship;
      addFloatingText(state, camp.x, camp.y - 20, 'Held!', '#22c55e');
      logEvent(state, 'combat', `Barricade repelled ${event.rivalName}'s raid`, event.rivalName, 'repelled', 'resolved');
      resolveIncomingRaidCasualties(state, event, allAlive, 'victory');
    }
    flashMilitia(allAlive, 14);
    if (rival) rival.raidCooldownDays = 18;
    const enemyLosses = recordIncomingRivalLosses(state, event, outcome, effectiveDef);
    beginRaidRecovery(state, event, outcome, effectiveDef, originalState);
    persistBattleAftermath({ ...originalState, villageLeaderId: battleReportLeader(state, event.leaderIdAtBattleStart ?? originalState.villageLeaderId) }, state, event.id, event.rivalId, event.rivalName, 'defense', outcome, effectiveDef / Math.max(1, event.attackerStrength), enemyLosses.deaths, enemyLosses.fallen, event.battlePlayerCasualties);
    remove();
    return state;
  }

  if (choiceId === 'defend') {
    const eligibility = getRaidChoiceEligibility(state, event, choiceId, allAlive);
    if (!eligibility.ok && event.phase !== 'resolving') {
      addFloatingText(state, camp.x, camp.y - 20, eligibility.blockReason ?? 'Cannot defend', '#f97316');
      return state;
    }

    const outcome = resolveDefenseRatio(defenderStrength, event.attackerStrength);
    const raidLoot = raidEventLoot(event);
    const militiaFighters = event.soldierIds ? allAlive.filter((person) => person.alive && event.soldierIds!.includes(person.id)) : getRaidParticipants(state, allAlive, 'militia');
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
        resolveIncomingRaidCasualties(state, event, allAlive, 'victory');
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
        resolveIncomingRaidCasualties(state, event, allAlive, 'costly');
        break;
      }
      case 'stalemate': {
        const taken = applyRaidLootTaken(state, raidLoot, 0.7);
        damageRandomPlayerBuilding(state, 10);
        addReputation(state, -3);
        if (rival) rival.relationship = 'tense';
        resolveIncomingRaidCasualties(state, event, allAlive, 'moderate');
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
        resolveIncomingRaidCasualties(state, event, allAlive, 'heavy');
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
    const enemyLosses = recordIncomingRivalLosses(state, event, outcome, defenderStrength);
    beginRaidRecovery(state, event, outcome, defenderStrength, originalState);
    persistBattleAftermath({ ...originalState, villageLeaderId: battleReportLeader(state, event.leaderIdAtBattleStart ?? originalState.villageLeaderId) }, state, event.id, event.rivalId, event.rivalName, 'defense', outcome, defenderStrength / Math.max(1, event.attackerStrength), enemyLosses.deaths, enemyLosses.fallen, event.battlePlayerCasualties);
    remove();
    return state;
  }

  return state;
}

/**
 * An assault can permanently reduce a rival's manpower, and an overwhelmingly superior force may
 * destroy the settlement outright — removing its presence and queued events too.
 */
function recordIncomingRivalLosses(state: WorldState, event: RaidEvent, outcome: RaidOutcomeTier,
  strength: number): { deaths: number; fallen: string[] } {
  const rival = state.rivalSettlements.find((entry) => entry.id === event.rivalId);
  if (!rival || outcome === 'defeat') return { deaths: 0, fallen: [] };
  const population = rival.population;
  const fighters = state.entities.filter((person) => person.alive && rival.entityIds.includes(person.id));
  applyRivalBattleLosses(state, rival, strength / Math.max(1, event.attackerStrength), 'incoming_raid');
  const losses = { deaths: population - rival.population, fallen: fighters.filter((person) => !person.alive).map(formatCitizenName) };
  if (outcome === 'decisive' || outcome === 'narrow') captureRaidPrisoners(state, rival, event.id,
    state.entities.filter((person) => person.alive && !person.faction && person.type === EntityType.Human && event.soldierIds?.includes(person.id)).length);
  return losses;
}

function applyRivalBattleLosses(state: WorldState, rival: RivalSettlement, strengthRatio: number, kind: 'incoming_raid' | 'outgoing_raid' = 'outgoing_raid'): void {
  // Combat can rout a settlement, but only a later explicit player decision can raze it.
  const lossFraction = strengthRatio >= 4 ? 0.85 : strengthRatio >= 2 ? 0.6 : 0.25;
  const losses = Math.min(Math.max(0, rival.population - 1), Math.max(1, Math.ceil(rival.population * lossFraction)));
  rival.population -= losses;
  // Rivals can have a larger simulated population than their visible character roster: kill living
  // members and count remaining losses as off-map casualties instead of inventing names.
  const livingRivals = state.entities.filter((entity) => entity.alive && !entity.warCaptive && !entity.isJuvenile
    && entity.job === JobType.Soldier && rival.entityIds.includes(entity.id));
  const victims = livingRivals.slice(0, losses);
  const casualties = new Set(victims.map((entity) => entity.id));
  for (const victim of victims) {
    killHuman(victim, state.buildings, ensureEntityByIdMap(state), state.tick, state);
    logDeath(
      state,
      formatDeathLog(victim, kind === 'incoming_raid' ? `fell attacking ${state.villageName}` : `fell defending ${rival.name} against our war-band`),
      formatCitizenName(victim),
      { x: victim.x, y: victim.y },
      'enemy',
    );
    logEvent(state, 'combat', `Enemy killed: ${formatCitizenName(victim)} — ${kind === 'incoming_raid' ? 'attacking the village' : `defending ${rival.name}`}`, rival.name, kind, 'casualties');
  }
  rival.entityIds = rival.entityIds.filter((id) => !casualties.has(id));
  const offMapDeaths = losses - victims.length;
  logEvent(
    state,
    'combat',
    `${rival.name} lost ${losses} combatants ${kind === 'incoming_raid' ? 'attacking the village' : 'defending their settlement'} (${victims.length} named casualties${offMapDeaths > 0 ? `, ${offMapDeaths} off-map` : ''}); ${rival.population} survive`,
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
  event: OutgoingRaidEvent,
): void {
  const outcome = resolveCounterRaidRatio(event.attackerStrength, event.defenderStrength);
  const verb = event.isCounterRaid ? 'Counter-raid' : 'Raid';
  // The strength you brought over their defense is what decides how much there is to carry home.
  const lootScale = Math.sqrt(event.attackerStrength / Math.max(event.defenderStrength, 1));
  const warBand = raidArmy(state, event);
  const selectedIds = new Set(event.soldierIds ?? []);
  const allRaidSoldiers = state.entities.filter((person) => selectedIds.has(person.id) && person.raidDeploymentId === event.id);
  rewardRaidParticipants(state, warBand, counterRaidToReward(outcome), rival.name);

  const confirmedCasualties = new Set(event.battlePlayerCasualties ?? []);

  flashMilitia(state.entities, 20);
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, outcome === 'fail' ? 8 : 4);

  if (outcome === 'success') {
    const gained = grantRaidSpoils(state, rollOutgoingRaidSpoils(rival, 'success', lootScale));
    rival.relationship = 'tense';
    rival.raidCooldownDays = 10;
    if (!event.battleCasualtiesApplied) applyRaidCasualties(state, state.entities, 'victory', rival.name, 'raiding', new Set(warBand.map((soldier) => soldier.id)));
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
    captureRaidPrisoners(state, rival, event.id, warBand.filter((person) => person.alive).length);
    const playerCasualties = [...new Set([...confirmedCasualties, ...allRaidSoldiers.filter((fighter) => !fighter.alive).map(formatCitizenName)])];
    const playerDeaths = playerCasualties.length;
    // Record a distinct, persistent post-victory decision. Battle deaths are already
    // applied exactly once; reopening the dialog must never run combat again.
    if (!(state.pendingRaidVictories ?? []).some((pending) => pending.raidId === event.id)) {
      state.pendingRaidVictories = [...(state.pendingRaidVictories ?? []), {
        raidId: event.id,
        rivalId: rival.id,
        rivalName: rival.name,
        playerDead: playerDeaths,
        credibleThreat: event.attackerStrength <= event.defenderStrength * 4,
        brokeTreaty: event.brokeTreaty === true,
        enemyDead: enemyDeaths,
        enemySurvivors: rival.population,
        playerCasualties,
        enemyCasualties: livingEnemyBefore.filter((person) => !person.alive).map((person) => formatCitizenName(person)),
      }];
    }
    addBigNews(state, '⚖️ Rival settlement surrendered', `Decide whether to spare, demand terms from, or exterminate ${rival.name}. ${rival.population} people remain.`, 'positive');
    const victoryTitle = '🏆 War-band returns victorious';
    const victoryMessage = `${verb} against ${rival.name}: ${enemyDeaths} enemy dead, ${playerDeaths} of our people lost. ${rival.population} rival inhabitants remain. ${lootNote ? `Spoils: ${lootNote}.` : 'No supplies recovered.'}`;
    addBigNews(state, victoryTitle, victoryMessage, 'positive');
    logEvent(state, 'combat', `Village victory celebrations — ${victoryMessage}`, rival.name, 'outgoing_raid', 'resolved');
  } else if (outcome === 'meager') {
    const gained = grantRaidSpoils(state, rollOutgoingRaidSpoils(rival, 'meager', lootScale));
    rival.relationship = 'tense';
    rival.raidCooldownDays = 14;
    addReputation(state, -4);
    if (!event.battleCasualtiesApplied) applyRaidCasualties(state, state.entities, 'costly', rival.name, 'raiding', new Set(warBand.map((soldier) => soldier.id)));
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
    const playerCasualties = [...new Set([...confirmedCasualties, ...allRaidSoldiers.filter((fighter) => !fighter.alive).map(formatCitizenName)])];
    const playerDeaths = playerCasualties.length;
    logEvent(state, 'combat', `The war-band returned from ${rival.name} with limited success: ${playerDeaths} of our people died. No victory celebration was held.`, rival.name, 'outgoing_raid', 'resolved');
  } else {
    spendFood(state, 'raid', 15);
    addReputation(state, -8);
    rival.relationship = 'tense';
    if (!event.battleCasualtiesApplied) applyRaidCasualties(state, state.entities, 'heavy', rival.name, 'raiding', new Set(warBand.map((soldier) => soldier.id)));
    addFloatingText(state, rival.campX, rival.campY - 20, 'War-band broken!', '#f87171');
    logEvent(state, 'combat', `${verb} on ${rival.name} failed — war-band fought back`, rival.name, 'outgoing_raid', 'resolved');
    const playerCasualties = [...new Set([...confirmedCasualties, ...allRaidSoldiers.filter((fighter) => !fighter.alive).map(formatCitizenName)])];
    const playerDeaths = playerCasualties.length;
    addBigNews(state, '⚔️ War-band defeated', `${verb} on ${rival.name} failed; ${playerDeaths} of our people were killed. The village mourns its losses.`, 'negative');
    logEvent(state, 'combat', `Village mourns after failed ${verb.toLowerCase()} on ${rival.name}: ${playerDeaths} dead.`, rival.name, 'outgoing_raid', 'resolved');
    maybeQueueRaid(state, rival, state.entities.filter((e) => e.alive));
    rival.raidCooldownDays = Math.max(rival.raidCooldownDays, 7);
  }

  rival.daysUntilAction = 30;
}

function releaseRaidSoldiers(state: WorldState, raidId: string): void {
  for (const soldier of state.entities) {
    if (soldier.raidDeploymentId === raidId) soldier.raidDeploymentId = undefined;
  }
}

function raidArmy(state: WorldState, event: OutgoingRaidEvent): Entity[] {
  if (!event.soldierIds) return getRaidParticipants(state, state.entities, 'outgoing');
  const selected = new Set(event.soldierIds);
  return state.entities.filter((person) => selected.has(person.id) && person.alive && person.raidDeploymentId === event.id);
}

/** A short, automatic battle narrative; no tactical battlefield or per-tick troop AI. */
function beginTextRaidBattle(state: WorldState, event: OutgoingRaidEvent): void {
  if (event.phase === 'fighting') return;
  event.phase = 'fighting';
  event.battleStartedAtTick = state.tick;
  event.leaderIdAtBattleStart = state.villageLeaderId;
  event.battleChronicle = [`Our soldiers engage the defenders of ${event.rivalName}.`];
  event.title = `Battle at ${event.rivalName}`;
  logEvent(state, 'combat', event.battleChronicle[0], event.rivalName, 'outgoing_raid', 'dispatched');
}

/** Resolve actual soldier losses at the mid-battle milestone. This is persisted
 * on the raid event, so reloads and later ticks cannot kill the same quota twice. */
function resolveLiveRaidCasualties(state: WorldState, event: OutgoingRaidEvent): void {
  if (event.battleCasualtiesApplied) return;
  const tier = resolveCounterRaidRatio(event.attackerStrength, event.defenderStrength);
  const severity: RaidCasualtyTier = tier === 'success' ? 'victory' : tier === 'meager' ? 'costly' : 'heavy';
  const soldierIds = new Set(event.soldierIds ?? []);
  const previouslyAlive = state.entities.filter((person) =>
    soldierIds.has(person.id) && person.raidDeploymentId === event.id && person.alive);
  // Flag before applying so the casualty event can never be repeated.
  event.battleCasualtiesApplied = true;
  const rival = state.rivalSettlements.find((camp) => camp.id === event.rivalId);
  const limit = getOutgoingRaidCasualtyLimit(event.attackerStrength, event.defenderStrength,
    rival?.population ?? 0, previouslyAlive.length);
  applyRaidCasualties(state, state.entities, severity, event.rivalName, 'raiding', soldierIds, limit);
  const killed = previouslyAlive.filter((person) => !person.alive).map((person) => formatCitizenName(person));
  event.battlePlayerCasualties = killed;
  const commentary = killed.length
    ? `Fallen in the fighting at ${event.rivalName}: ${killed.join(', ')}.`
    : `Our troops hold their positions at ${event.rivalName}; no village deaths confirmed.`;
  event.battleChronicle = [...(event.battleChronicle ?? []), commentary];
  logEvent(state, 'combat', commentary, event.rivalName, 'outgoing_raid', killed.length ? 'casualties' : 'dispatched');
}

function finishTextRaidBattle(state: WorldState, event: OutgoingRaidEvent): void {
  const rival = state.rivalSettlements.find((r) => r.id === event.rivalId);
  if (rival) {
    const initial = event.soldierIds?.length ?? raidArmy(state, event).length;
    const enemyBefore = rival.population;
    const beforeBattle = { entities: state.entities.map((person) => ({ ...person })),
      buildings: state.buildings.map((home) => ({ ...home })), resources: { ...state.resources }, villageLeaderId: state.villageLeaderId };
    beforeBattle.villageLeaderId = battleReportLeader(state, event.leaderIdAtBattleStart);
    resolveOutgoingRaidCombat(state, rival, event);
    const survivors = raidArmy(state, event).length;
    const narrative = `Battle ended: ${Math.max(0, initial - survivors)} of our soldiers lost, ${Math.max(0, enemyBefore - rival.population)} defenders lost. ${survivors} soldiers are returning home.`;
    event.battleChronicle = [...(event.battleChronicle ?? []), narrative];
    logEvent(state, 'combat', narrative, rival.name, 'outgoing_raid', 'casualties');
    const outcome = resolveCounterRaidRatio(event.attackerStrength, event.defenderStrength);
    const pending = state.pendingRaidVictories?.find((victory) => victory.raidId === event.id);
    persistBattleAftermath(beforeBattle, state, event.id, event.rivalId, event.rivalName, 'offense', outcome, event.attackerStrength / Math.max(1, event.defenderStrength), pending?.enemyDead ?? 0, pending?.enemyCasualties ?? [], event.battlePlayerCasualties);
    const report = state.raidBattleReports?.find((item) => item.raidId === event.id);
    if (report && event.battlePlayerCasualties?.length) {
      report.playerFallen = [...new Set([...report.playerFallen, ...event.battlePlayerCasualties])];
      report.playerDeaths = report.playerFallen.length;
    }
  }
  event.phase = 'returning';
  event.returnStartedAtTick = state.tick;
  event.returnStartProgress = 1;
  event.returnAtTick = state.tick + Math.max(1, (event.arrivalAtTick ?? event.expiresAtTick) - (event.launchedAtTick ?? event.createdAtTick));
  event.expiresAtTick = event.returnAtTick;
  event.choices = [];
}

export function tickPendingOutgoingRaidEvents(state: WorldState): void {
  if (!state.pendingOutgoingRaidEvents?.length) return;
  const remaining: OutgoingRaidEvent[] = [];
  for (const evt of state.pendingOutgoingRaidEvents) {
    const event = evt;
    if (event.phase === 'returning') {
      if (state.tick >= (event.returnAtTick ?? event.expiresAtTick)) {
        releaseRaidSoldiers(state, event.id);
        logEvent(state, 'combat', `War-band returned from ${event.rivalName}`, event.rivalName, 'outgoing_raid', 'resolved');
      } else remaining.push(event);
      continue;
    }
    if (event.phase === 'marching') {
      if (state.tick >= (event.arrivalAtTick ?? event.expiresAtTick)) {
        event.phase = 'engaging';
        event.expiresAtTick = state.tick + 3 * TICKS_PER_DAY;
        event.battleChronicle = [`Our soldiers reached ${event.rivalName}.`];
        if (event.rivalResponse === 'fight') beginTextRaidBattle(state, event);
        addBigNews(state, '⚔️ War-band arrived', `Your soldiers reached ${event.rivalName}. Choose the battle outcome in the raid banner.`, 'negative');
        logEvent(state, 'combat', `War-band arrived at ${event.rivalName}`, event.rivalName, 'outgoing_raid', 'dispatched');
      }
      remaining.push(event);
      continue;
    }
    if (event.phase === 'fighting') {
      const elapsed = state.tick - (event.battleStartedAtTick ?? state.tick);
      if (elapsed >= TICKS_PER_HOUR * RAID_BATTLE_HOURS) {
        resolveLiveRaidCasualties(state, event);
        finishTextRaidBattle(state, event);
      } else {
        if (elapsed >= TICKS_PER_HOUR * RAID_BATTLE_HOURS / 2 && !event.battleCasualtiesApplied) resolveLiveRaidCasualties(state, event);
        // Commentary milestones are derived from the real muster and recorded combat
        // strengths. No casualties are claimed until killHuman actually records them.
        const phases = [
          { at: Math.ceil(TICKS_PER_HOUR * RAID_BATTLE_HOURS / 4), count: 2,
            text: `Our ${raidArmy(state, event).length} soldiers have met ${event.rivalName}'s defenders. The first assault is underway.` },
          { at: TICKS_PER_HOUR * RAID_BATTLE_HOURS / 2, count: 3,
            text: `Fighting continues at ${event.rivalName}. ${raidArmy(state, event).length} of our soldiers still hold the line; confirmed casualties are recorded separately.` },
          { at: Math.ceil(TICKS_PER_HOUR * RAID_BATTLE_HOURS * 3 / 4), count: 4,
            text: `The battle approaches its decisive stage. The enemy defense was assessed at ${Math.round(event.defenderStrength)} strength against our ${Math.round(event.attackerStrength)} at departure.` },
        ];
        for (const phase of phases) {
          if (elapsed < phase.at || (event.battleChronicle?.length ?? 0) >= phase.count) continue;
          event.battleChronicle = [...(event.battleChronicle ?? []), phase.text];
          logEvent(state, 'combat', phase.text, event.rivalName, 'outgoing_raid', 'dispatched');
        }
      }
      remaining.push(event);
      continue;
    }
    if (state.tick >= getRaidExpiresAtTick(evt)) {
      releaseRaidSoldiers(state, event.id);
      addBigNews(state, '🏹 March recalled', `${event.rivalName} — your war-band stood down (provisions spent).`, 'neutral');
      logEvent(state, 'combat', `War-band returned from ${event.rivalName} without battle`, event.rivalName, 'outgoing_raid', 'cancelled');
    } else remaining.push(event);
  }
  state.pendingOutgoingRaidEvents = remaining;
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
    releaseRaidSoldiers(state, event.id);
    state.pendingOutgoingRaidEvents = state.pendingOutgoingRaidEvents!.filter((e) => e.id !== eventId);
    return state;
  }

  if (choiceId === 'recall') {
    if (event.phase === 'returning' || event.phase === 'fighting') return state;
    const outbound = Math.max(1, (event.arrivalAtTick ?? event.expiresAtTick) - (event.launchedAtTick ?? event.createdAtTick));
    const travelled = Math.max(1, Math.min(outbound, state.tick - (event.launchedAtTick ?? event.createdAtTick)));
    event.phase = 'returning';
    event.returnStartedAtTick = state.tick;
    event.returnStartProgress = travelled / outbound;
    event.returnAtTick = state.tick + travelled;
    event.expiresAtTick = event.returnAtTick;
    logEvent(state, 'combat', `Recall ordered for the war-band marching on ${event.rivalName}`, event.rivalName, 'outgoing_raid', 'cancelled');
    return state;
  }
  if (event.phase === 'returning' || event.phase === 'marching' || event.phase === 'fighting') return state;
  const verb = event.isCounterRaid ? 'Counter-raid' : 'Raid';
  const remove = () => {
    if (!event.phase) {
      state.pendingOutgoingRaidEvents = state.pendingOutgoingRaidEvents!.filter((entry) => entry.id !== eventId);
      return;
    }
    event.phase = 'returning';
    event.returnAtTick = state.tick + Math.max(1, (event.arrivalAtTick ?? event.expiresAtTick) - (event.launchedAtTick ?? event.createdAtTick));
    event.expiresAtTick = event.returnAtTick;
    event.choices = [];
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
      raidArmy(state, event),
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
    if (event.phase === 'engaging') {
      beginTextRaidBattle(state, event);
      return state;
    }
    remove();
    resolveOutgoingRaidCombat(state, rival, event);
    const outcome = resolveCounterRaidRatio(event.attackerStrength, event.defenderStrength);
    const pending = state.pendingRaidVictories?.find((victory) => victory.raidId === event.id);
    persistBattleAftermath({ ...originalState, villageLeaderId: battleReportLeader(state, event.leaderIdAtBattleStart ?? originalState.villageLeaderId) }, state, event.id, event.rivalId, event.rivalName, 'offense', outcome, event.attackerStrength / Math.max(1, event.defenderStrength), pending?.enemyDead ?? 0, pending?.enemyCasualties ?? [], event.battlePlayerCasualties);
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
  const attackedAtPeace = isRivalAtPeace(rival);
  const attackedFriendly = rival.relationship === 'friendly';
  const brokeTreaty = attackedAtPeace || attackedFriendly;
  if (brokeTreaty) {
    rival.relationship = 'tense';
    rival.atWarWithPlayer = true;
    rival.peaceTreatyDays = 0;
    addReputation(state, -PROVOKE_REPUTATION_COST);
    addBigNews(
      state,
      attackedAtPeace ? '⚔️ Treaty broken' : '⚔️ Peaceful neighbour attacked',
      attackedAtPeace
        ? `${state.villageName} launched a raid on ${rival.name} despite the peace treaty.`
        : `${state.villageName} launched an unprovoked raid on friendly ${rival.name}.`,
      'negative',
    );
    logEvent(
      state,
      'combat',
      attackedAtPeace
        ? `Broke the peace treaty with ${rival.name} by marching on their camp — reputation -${PROVOKE_REPUTATION_COST}`
        : `Attacked friendly ${rival.name} without provocation — reputation -${PROVOKE_REPUTATION_COST}`,
      rival.name,
      'outgoing_raid',
      'dispatched',
    );
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

  const soldierIds = getRaidParticipants(state, state.entities, 'outgoing').map((person) => person.id);
  const event: OutgoingRaidEvent = {
    phase: 'marching',
    brokeTreaty,
    soldierIds,
    launchedAtTick: state.tick,
    arrivalAtTick: state.tick + responseDays * TICKS_PER_DAY,
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

  for (const soldier of state.entities) {
    if (soldierIds.includes(soldier.id)) soldier.raidDeploymentId = event.id;
  }
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
  const witnesses = state.rivalSettlements.filter((neighbor) =>
    neighbor.id !== rival.id && Math.hypot(neighbor.campX - rival.campX, neighbor.campY - rival.campY) <= 750);
  rememberRivalDisposition(state, rival, choice as 'mercy' | 'tribute' | 'raze');
  // One bounded civic response per credible encounter, not predetermined good/evil points.
  const eligibleForCivicResponse = pending.credibleThreat !== false && (rival.lastDispositionRewardTick == null
    || state.tick - rival.lastDispositionRewardTick >= RAID_MERIT_REPEAT_COOLDOWN_DAYS * TICKS_PER_DAY);
  if (eligibleForCivicResponse) {
    applyWarCommunityReaction(state, choice as 'mercy' | 'tribute' | 'raze', rival.id,
      { brokeTreaty: pending.brokeTreaty === true });
    rival.lastDispositionRewardTick = state.tick;
  }
  const report = state.raidBattleReports?.find((entry) => entry.raidId === pending.raidId);
  if (report) report.disposition = choice as 'mercy' | 'tribute' | 'raze';
  if (choice === 'mercy') {
    for (const neighbor of witnesses) {
      if (neighbor.relationship === 'tense') neighbor.relationship = 'competitive';
      else if (neighbor.relationship === 'competitive') neighbor.relationship = 'neutral';
    }
    rival.relationship = 'neutral';
    rival.atWarWithPlayer = false;
    rival.peaceTreatyDays = Math.max(rival.peaceTreatyDays, 30);
    applyTruceToRival(state, rival.id, 30);
    rival.raidCooldownDays = Math.max(rival.raidCooldownDays, 30);
    logEvent(state, 'combat', `Spared ${rival.name} after victory — ${rival.population} survivors, 30-day truce.`, rival.name, 'outgoing_raid', 'resolved');
  } else if (choice === 'tribute') {
    // A one-off settlement of terms, not an invented recurring tribute agreement.
    const offer = rollRivalPayoffOffer(rival, Math.max(1, pending.enemyDead + pending.enemySurvivors), Math.max(1, pending.enemySurvivors));
    const gained = grantRaidSpoils(state, offer);
    rival.raidCooldownDays = Math.max(rival.raidCooldownDays, 21);
    rival.peaceTreatyDays = Math.max(rival.peaceTreatyDays, 21);
    applyTruceToRival(state, rival.id, 21);
    logEvent(state, 'combat', `Terms imposed on ${rival.name} — one-time tribute ${formatLootParts(gained)}; 21-day truce`, rival.name, 'outgoing_raid', 'resolved');
  } else {
    for (const neighbor of witnesses) {
      if (neighbor.relationship === 'friendly') neighbor.relationship = 'neutral';
      else if (neighbor.relationship === 'neutral') neighbor.relationship = 'competitive';
      else if (neighbor.relationship === 'competitive') neighbor.relationship = 'tense';
      // Witnesses remember the razing: hostile neighbours prepare sooner, wary ones hold off, both
      // through persistent rival timers.
      if (neighbor.relationship === 'tense') {
        neighbor.daysUntilAction = Math.min(neighbor.daysUntilAction, 10);
      } else {
        neighbor.raidCooldownDays = Math.max(neighbor.raidCooldownDays, 20);
      }
    }
    const personIds = new Set(rival.entityIds);
    // A camp's roster can be empty in a new save; its linked people are still removed with it.
    for (const person of state.entities) {
      if (person.faction === 'rival' && person.groupId === rival.id && !person.warCaptive) personIds.add(person.id);
    }
    const killed = Math.max(0, rival.population);
    for (const person of state.entities) if (personIds.has(person.id)) {
      person.alive = false;
      person.departedAlive = false;
      unindexEntityFromState(state, person.id);
    }
    state.entities = state.entities.filter((person) => !personIds.has(person.id));
    rival.population = 0;
    if (report) {
      report.refugees = 0;
      report.enemyDeaths += pending.enemySurvivors;
    }
    cancelPendingRaidsForRival(state, rival.id);
    cancelPendingOutgoingRaidsForRival(state, rival.id);
    state.pendingDiplomacyEvents = (state.pendingDiplomacyEvents ?? []).filter((entry) => entry.rivalId !== rival.id);
    state.rivalSettlements = state.rivalSettlements.filter((entry) => entry.id !== rival.id);
    state.pendingRaidVictories = state.pendingRaidVictories?.filter((entry) => entry.rivalId !== rival.id);
    logEvent(state, 'combat', `Exterminated ${rival.name} after its surrender — all ${killed} surviving inhabitants were killed; no one was released. ${witnesses.length} neighboring settlements witnessed the destruction.`, rival.name, 'outgoing_raid', 'resolved');
  }
  return state;
}
