/**
 * Citizen-first overview numbers for the full-screen People screen.
 * Presentation-only aggregation — does not mutate simulation state.
 *
 * The labour counters (`total`/`adults`/`children`/`working`/`idle`/`imprisoned`) and the housing
 * numbers come from their owner, `uiSimSummary.computeVillageStats`, which the top-bar HUD reads
 * too. Only the social counters — pregnancy, marriages, affairs, grief — are gathered here, so a
 * change to what counts as "working" cannot make the HUD and this screen disagree
 * (`LIVE-FINDINGS-STATUS.md`, A7). Homelessness is the residence owner's rule
 * (`residencyOccupancy.countHomelessSettlers`): the local count here used to drop a child without a
 * bed and count a jailed settler as homeless.
 */
import { Season, type WorldState, type Entity } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { summarizeFoodLedger } from './economyLedger';
import { isFoodAlertAmount } from './resourceUtils';
import { computeVillageStats } from './uiSimSummary';
import { countHomelessSettlers } from './residencyOccupancy';
import { isMarriedOrExpecting } from './civilStatus';
import { AFFAIR_ESTABLISHED_LOG_PHRASE } from './simulation/humanRelationships';

export type VillageMood =
  | 'thriving'
  | 'stable'
  | 'strained'
  | 'hungry'
  | 'scandal'
  | 'cold';

/** Minimum idle adults before idleness alone reads as a problem, and the share of adults it scales with. */
const MIN_IDLE_ADULTS = 2;
const IDLE_ADULT_SHARE = 0.35;

/**
 * The "many adults are idle" rule — one definition.
 *
 * The overview screen's Work card used to compute `idle > max(2, adults × 0.35)` itself, so retuning
 * the threshold here left the card green while the header mood read "Under pressure — Many adults are
 * idle without work." on the same screen.
 */
export function hasManyAdultsIdle(stats: { idle: number; adults: number }): boolean {
  return stats.idle > Math.max(MIN_IDLE_ADULTS, stats.adults * IDLE_ADULT_SHARE);
}

export interface CitizenOverviewStats {
  total: number;
  adults: number;
  children: number;
  working: number;
  idle: number;
  imprisoned: number;
  pregnant: number;
  married: number;
  affairs: number;
  /** Affairs established so far in the current colony year — see `computeCitizenOverview`. */
  affairsThisYear: number;
  /**
   * Mutual youth-love (sweetheart) pairs aged 12–17, counted once per pair. Youth love is a real
   * simulation state (`humanRelationships.advanceYouthLove`) that used to have no counter anywhere
   * outside the opt-in console diagnostics, so a save could hold sweethearts while the People screen
   * could only ever show nothing. Same `id < partnerId` convention as `activeYouthLovePairs`.
   */
  youthLove: number;
  grieving: number;
  homeless: number;
  beds: number;
  openBeds: number;
  food: number;
  foodNetToday: number;
  reputation: number;
  canHeat: boolean;
  isWinter: boolean;
  mood: VillageMood;
  moodLabel: string;
  moodDetail: string;
}

function deriveMood(stats: Omit<CitizenOverviewStats, 'mood' | 'moodLabel' | 'moodDetail'>): {
  mood: VillageMood;
  moodLabel: string;
  moodDetail: string;
} {
  if (stats.isWinter && !stats.canHeat) {
    return {
      mood: 'cold',
      moodLabel: 'Freezing',
      moodDetail: 'Winter heat failed — people are cold.',
    };
  }
  if (isFoodAlertAmount(stats.food, stats.total)) {
    return {
      mood: 'hungry',
      moodLabel: 'Hungry',
      moodDetail: 'Food stores look dangerously low.',
    };
  }
  if (stats.affairs > 0 || stats.imprisoned > 0) {
    return {
      mood: 'scandal',
      moodLabel: 'Trouble at home',
      moodDetail:
        stats.imprisoned > 0
          ? `${stats.imprisoned} jailed · secrets and gossip are stirring.`
          : `${stats.affairs} secret affair${stats.affairs === 1 ? '' : 's'} active.`,
    };
  }
  if (stats.openBeds <= 0 || stats.homeless > 0 || hasManyAdultsIdle(stats)) {
    return {
      mood: 'strained',
      moodLabel: 'Under pressure',
      moodDetail:
        stats.openBeds <= 0 || stats.homeless > 0
          ? 'Housing is tight.'
          : 'Many adults are idle without work.',
    };
  }
  if (stats.foodNetToday >= 0 && stats.working >= stats.idle && stats.reputation >= 20) {
    return {
      mood: 'thriving',
      moodLabel: 'Thriving',
      moodDetail: 'People are housed, fed, and mostly busy.',
    };
  }
  return {
    mood: 'stable',
    moodLabel: 'Stable',
    moodDetail: 'The village is holding together.',
  };
}

export function computeCitizenOverview(world: WorldState): CitizenOverviewStats {
  const village = computeVillageStats(world);
  const tick = world.tick;

  let pregnant = 0;
  let married = 0;
  let affairs = 0;
  let youthLove = 0;
  let grieving = 0;

  for (const e of world.entities as Entity[]) {
    if (!e.alive || !isPlayerHuman(e)) continue;

    if (e.pregnant) pregnant++;
    if (isMarriedOrExpecting(e)) married++;
    if (e.affairPartnerId != null && e.id < e.affairPartnerId) affairs++;
    // A youth-love link is a mutual bond, but count one half only — the same convention `affairs`
    // above and the diagnostics flush's `activeYouthLovePairs` use. Counting both halves would
    // report a single sweetheart pair as two.
    if (e.youthLovePartnerId != null && e.id < e.youthLovePartnerId) youthLove++;
    if ((e.griefUntilTick ?? 0) > tick) grieving++;
  }

  const homeless = countHomelessSettlers(world);

  // Affairs *established this year*, from the log the Chronicle already reads. The live count above
  // is a snapshot of a deliberately short-lived state — measured on the engine gate (`test:full-year`,
  // 360 days, 70 settlers) the instantaneous count averages **0.2 per day** and is non-zero on only
  // **35 of 360** days in a year that established **93** affairs — so a snapshot alone reads zero
  // almost always and the feature looked absent from play. The phrase is the affair owner's constant,
  // not a copy of it. The cap holds a year comfortably at this scale: the same run logged 230
  // scandal lines, against a `EVENT_LOG_MAX_ENTRIES` of 6 000.
  const affairsThisYear = world.eventLog.reduce(
    (count, entry) => (
      entry.year === world.year && entry.message.includes(AFFAIR_ESTABLISHED_LOG_PHRASE)
        ? count + 1
        : count
    ),
    0,
  );

  // Today's balance is the ledger owner's, not a second sum of the same map. `summarizeFoodLedger`
  // reads the totals the ledger maintains (with the stale-save fallback it documents), so the People
  // screen's "Today ±N" and the dashboard's "Net change" cannot report two balances for one day
  const foodNetToday = summarizeFoodLedger(world).net;

  const base = {
    total: village.total,
    adults: village.adults,
    children: village.children,
    working: village.working,
    idle: village.idle,
    imprisoned: village.imprisoned,
    pregnant,
    married,
    affairs,
    affairsThisYear,
    youthLove,
    grieving,
    homeless,
    beds: village.beds,
    openBeds: village.openBeds,
    food: Math.floor(world.resources.food),
    foodNetToday,
    reputation: world.villageReputation,
    canHeat: world.villageCanHeat !== false,
    isWinter: world.season === Season.Winter,
  };

  const mood = deriveMood(base);
  return { ...base, ...mood };
}