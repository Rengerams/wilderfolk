import type { WorldState } from './gameTypes';
import { BuildingType, isCompletedPlayerBuilding } from './buildings';
import { displayYear } from './dayCycleClock';
import { isPlayerHuman } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { isRivalAtPeace } from './rivalPeace';
import { getEcosystemHealth } from './dailyEcology';

type PortraitTraitId = 'war' | 'nature' | 'trade' | 'build' | 'diplomacy';

interface PortraitTrait {
  id: PortraitTraitId;
  label: string;
  emoji: string;
  /** 0–100 rough intensity */
  score: number;
  blurb: string;
}

export interface VillagePortrait {
  /** Short title, e.g. "Warlike settlers" */
  title: string;
  emoji: string;
  /** 1–2 sentence legend */
  summary: string;
  traits: PortraitTrait[];
  /** Strongest trait id */
  primary: PortraitTraitId;
}

/** Clamp to a rounded 0–100 score. */
function clampScore(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Roads, enclosure segments and decoration do not establish a township on their own. */
const NON_TOWNSHIP_STRUCTURES: ReadonlySet<BuildingType> = new Set([
  BuildingType.Road, BuildingType.Wall, BuildingType.WallGate, BuildingType.Fence,
  BuildingType.Bridge, BuildingType.GroundReinforcement, BuildingType.Lamp,
  BuildingType.Garden, BuildingType.Statue,
]);

export function computeVillagePortrait(state: WorldState): VillagePortrait {
  const humans = state.humanPopulation;
  let settlementSites = 0;
  let preserves = 0;
  for (const site of state.buildings) {
    if (!isCompletedPlayerBuilding(site)) continue;
    if (site.type === BuildingType.WildlifePreserve) preserves++;
    if (!NON_TOWNSHIP_STRUCTURES.has(site.type)) settlementSites++;
  }

  let activeRoutes = 0;
  for (const route of state.tradeRoutes) {
    if (route.active) activeRoutes++;
  }
  const caravans = state.lifetimeStats?.tradeCaravansCompleted ?? 0;
  const tradeGold = state.lifetimeStats?.goldFromTradeRoutes ?? 0;
  const eco = getEcosystemHealth(state);

  let adults = 0;
  for (const entity of state.entities) {
    if (entity.alive && isPlayerHuman(entity) && entity.age >= HUMAN_ADULT_MIN_AGE) adults++;
  }

  let friendly = 0;
  let tense = 0;
  let atPeace = 0;
  let atWar = 0;
  let gifts = 0;
  const rivals = state.rivalSettlements ?? [];
  for (const rival of rivals) {
    if (rival.relationship === 'friendly') friendly++;
    if (rival.relationship === 'tense') tense++;
    if (rival.atWarWithPlayer) atWar++;
    if (isRivalAtPeace(rival)) atPeace++;
    gifts += Math.max(0, rival.giftsGiven ?? 0);
  }

  // The Chronicle is bounded; battle reports retain the last 40 completed engagements.
  // Do not count a pending raid a second time after it receives its battle report.
  const reports = state.raidBattleReports ?? [];
  let outgoingRaids = 0;
  for (const report of reports) {
    if (report.side === 'offense') outgoingRaids++;
  }
  let pendingRaids = 0;
  for (const raid of state.pendingOutgoingRaidEvents ?? []) {
    if (!reports.some((report) => report.raidId === raid.id)) pendingRaids++;
  }

  const warScore = clampScore(
    Math.min(65, outgoingRaids * 22) +
      Math.min(20, pendingRaids * 20) +
      Math.min(20, atWar * 12) +
      Math.min(15, tense * 5),
  );

  // Wild animals and an untouched stable valley are not conservation decisions.
  // Ecosystem health already accounts for living wildlife.
  const natureScore = clampScore(
    (Math.min(45, preserves * 18)
      + Math.min(25, Math.max(0, state.ecoHealthYearsAbove80 ?? 0) * 5)
      + Math.max(0, eco - 50) * 0.5)
    * Math.max(0, Math.min(1, eco / 65)),
  );

  const tradeScore = clampScore(
    Math.min(50, activeRoutes * 22) +
      Math.min(20, caravans * 2) +
      Math.min(15, tradeGold / 800),
  );

  const buildScore = clampScore(
    settlementSites > 0
      ? Math.min(25, humans / 4)
        + Math.min(55, settlementSites * 2.5)
        + Math.min(20, (state.lifetimeStats?.technologiesResearched ?? 0) * 3)
      : 0,
  );

  const diplomacyScore = clampScore(
    Math.min(44, atPeace * 22) +
      Math.min(30, gifts * 6) +
      Math.min(20, friendly * 10) +
      Math.min(10, Math.max(0, state.villageReputation ?? 0) * 0.12),
  );

  const traits: PortraitTrait[] = ([
    {
      id: 'war' as const,
      label: 'War & raids',
      emoji: '⚔️',
      score: warScore,
      blurb:
        warScore >= 50
          ? 'You march on camps and live by the spear — neighbors call you hard.'
          : warScore >= 25
            ? 'Your borders are contested, but fighting does not define your village.'
            : 'You have rarely spilled blood on purpose.',
    },
    {
      id: 'nature' as const,
      label: 'Nature',
      emoji: '🌿',
      score: natureScore,
      blurb:
        natureScore >= 55
          ? 'The valley still breathes with you — grass, game, and wild things remain.'
          : natureScore >= 30
            ? 'Your choices are beginning to protect the valley.'
            : eco < 40
              ? 'The land shows strain from farms, hunts, and sprawl.'
              : preserves > 0
                ? 'You have begun protecting land; its benefits are still growing.'
                : 'The valley is wild, but no land has been set aside for conservation.',
    },
    {
      id: 'trade' as const,
      label: 'Trade',
      emoji: '💰',
      score: tradeScore,
      blurb:
        tradeScore >= 50
          ? 'Caravans and gold shape your name more than walls do.'
          : tradeScore >= 25
            ? 'Some routes and deals already mark you as a trading folk.'
            : activeRoutes === 0
              ? 'No active trade routes yet — the valley remains your main market.'
              : 'Trade is beginning, but the home valley still drives most activity.',
    },
    {
      id: 'build' as const,
      label: 'Building',
      emoji: '🏰',
      score: buildScore,
      blurb:
        buildScore >= 55
          ? 'Roofs and workshops spread — a real town is rising.'
          : buildScore >= 30
            ? 'You are past a camp; streets and jobs are taking shape.'
            : 'Still a small holding; more timber and stone will change that.',
    },
    {
      id: 'diplomacy' as const,
      label: 'Diplomacy',
      emoji: '🤝',
      score: diplomacyScore,
      blurb:
        diplomacyScore >= 50
          ? 'Peace gifts and treaties matter as much as spears.'
          : diplomacyScore >= 25
            ? 'You talk when you can, and fight when you must.'
            : rivals.length === 0
              ? 'No lasting neighbors yet — the map is still mostly yours.'
              : 'Borders stay cold; few hands of friendship have been offered.',
    },
  ] satisfies PortraitTrait[]).sort((a, b) => b.score - a.score
    || (a.id === 'build' ? -1 : b.id === 'build' ? 1 : 0));

  const primary = traits[0];
  const secondary = traits[1];

  const titleMap: Record<PortraitTraitId, { title: string; emoji: string }> = {
    war: { title: 'Warlike frontier folk', emoji: '⚔️' },
    nature: { title: 'Stewards of the valley', emoji: '🌿' },
    trade: { title: 'Merchant settlers', emoji: '💰' },
    build: { title: 'Builders of a township', emoji: '🏰' },
    diplomacy: { title: 'Diplomatic neighbors', emoji: '🤝' },
  };

  let title = titleMap[primary.id].title;
  let emoji = titleMap[primary.id].emoji;

  // Flavor overrides for specific archetypes
  if (primary.id === 'war' && primary.score >= 45 && natureScore < 35 && diplomacyScore < 35) {
    title = 'Barbarians of the border';
    emoji = '🗡️';
  } else if (primary.score < 30 && humans < 12 && settlementSites < 6) {
    title = 'Young pioneers';
    emoji = '🌅';
  } else if (primary.score < 20) {
    title = 'An unwritten village';
    emoji = '🌅';
  }

  const bits: string[] = [primary.blurb];
  if (secondary && secondary.score >= 25 && secondary.id !== primary.id) {
    bits.push(`Along the way: ${secondary.blurb}`);
  }
  if (humans > 0) {
    bits.push(`${humans} people (${adults} adults) · Year ${displayYear(state.year)}.`);
  }

  return {
    title,
    emoji,
    summary: bits.join(' '),
    traits,
    primary: primary.id,
  };
}