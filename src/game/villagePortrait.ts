/**
 * Soft “how you play” portrait — not a win condition.
 * Describes the village from build, nature, diplomacy, and war signals.
 */
import type { CombatLogKind, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { isRivalAtPeace } from './rivalPeace';
import { resolveCombatLogKind } from './eventLog';

export type PortraitTraitId = 'war' | 'nature' | 'trade' | 'build' | 'diplomacy';

export interface PortraitTrait {
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

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function countCombatKinds(state: WorldState, kinds: CombatLogKind[]): number {
  const want = new Set(kinds);
  let n = 0;
  for (const e of state.eventLog ?? []) {
    const kind = resolveCombatLogKind(e);
    if (kind && want.has(kind)) n += 1;
  }
  return n;
}

export function computeVillagePortrait(state: WorldState): VillagePortrait {
  const humans = state.humanPopulation;
  const buildings = state.buildings.filter((b) => b.completed && b.faction !== 'rival').length;
  const activeRoutes = state.tradeRoutes.filter((r) => r.active).length;
  const caravans = state.lifetimeStats?.tradeCaravansCompleted ?? 0;
  const tradeGold = state.lifetimeStats?.goldFromTradeRoutes ?? 0;
  const eco = state.ecosystemHealth ?? 50;
  const valley = state.valleyStage ?? 'stable';
  const wildWolves = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Wolf && e.tamedBy == null,
  ).length;
  const wildkin = state.entities.filter((e) => e.alive && e.type === EntityType.Wildkin).length;

  const rivals = state.rivalSettlements ?? [];
  const friendly = rivals.filter((r) => r.relationship === 'friendly').length;
  const tense = rivals.filter((r) => r.relationship === 'tense').length;
  const atPeace = rivals.filter((r) => isRivalAtPeace(r)).length;
  const outgoingRaids = countCombatKinds(state, ['outgoing_raid']);
  const defenses = countCombatKinds(state, ['defense', 'repelled', 'incoming_raid']);

  const warScore = clamp(
    outgoingRaids * 18
    + tense * 12
    + (defenses > 0 && outgoingRaids >= defenses ? 10 : 0)
    + (humans > 80 && tense > 0 ? 8 : 0),
  );

  const natureScore = clamp(
    (eco / 100) * 45
    + (valley === 'stable' ? 25 : valley === 'strained' ? 10 : 0)
    + Math.min(20, wildWolves * 3)
    + Math.min(15, wildkin * 1.5)
    + Math.min(15, (state.ecoHealthYearsAbove80 ?? 0) * 3),
  );

  const tradeScore = clamp(
    activeRoutes * 14
    + Math.min(30, caravans * 2)
    + Math.min(25, tradeGold / 400)
    + (state.villageReputation ?? 0) * 0.2,
  );

  const buildScore = clamp(
    Math.min(45, humans / 5)
    + Math.min(40, buildings * 1.2)
    + Math.min(15, (state.lifetimeStats?.technologiesResearched ?? 0) * 2),
  );

  const diplomacyScore = clamp(
    friendly * 22
    + atPeace * 18
    + Math.min(20, (state.villageReputation ?? 0) * 0.25)
    + (outgoingRaids === 0 && rivals.length > 0 ? 15 : 0)
    + (tense === 0 && rivals.length > 0 ? 10 : 0),
  );

  const traits: PortraitTrait[] = ([
    {
      id: 'war' as const,
      label: 'War & raids',
      emoji: '⚔️',
      score: warScore,
      blurb: warScore >= 50
        ? 'You march on camps and live by the spear — neighbors call you hard.'
        : warScore >= 25
          ? 'You have tasted frontier war, but it is not your whole story.'
          : 'You have rarely spilled blood on purpose.',
    },
    {
      id: 'nature' as const,
      label: 'Nature',
      emoji: '🌿',
      score: natureScore,
      blurb: natureScore >= 55
        ? 'The valley still breathes with you — grass, game, and wild things remain.'
        : natureScore >= 30
          ? 'You use the land, sometimes carefully, sometimes hard.'
          : 'The land shows strain from farms, hunts, and sprawl.',
    },
    {
      id: 'trade' as const,
      label: 'Trade',
      emoji: '💰',
      score: tradeScore,
      blurb: tradeScore >= 50
        ? 'Caravans and gold shape your name more than walls do.'
        : tradeScore >= 25
          ? 'Some routes and deals already mark you as a trading folk.'
          : 'Trade is thin — most wealth still comes from the home valley.',
    },
    {
      id: 'build' as const,
      label: 'Building',
      emoji: '🏰',
      score: buildScore,
      blurb: buildScore >= 55
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
      blurb: diplomacyScore >= 50
        ? 'Peace gifts and treaties matter as much as spears.'
        : diplomacyScore >= 25
          ? 'You talk when you can, and fight when you must.'
          : rivals.length === 0
            ? 'No lasting neighbors yet — the map is still mostly yours.'
            : 'Borders stay cold; few hands of friendship have been offered.',
    },
  ] satisfies PortraitTrait[]).sort((a, b) => b.score - a.score);

  const primary = traits[0]!;
  const secondary = traits[1];

  const titleMap: Record<PortraitTraitId, { title: string; emoji: string }> = {
    war: { title: 'Warlike frontier folk', emoji: '⚔️' },
    nature: { title: 'Stewards of the valley', emoji: '🌿' },
    trade: { title: 'Merchant settlers', emoji: '💰' },
    build: { title: 'Builders of a township', emoji: '🏰' },
    diplomacy: { title: 'Diplomatic neighbors', emoji: '🤝' },
  };

  // Barbarian flavor when war dominates and nature/diplomacy are weak
  let title = titleMap[primary.id].title;
  let emoji = titleMap[primary.id].emoji;
  if (primary.id === 'war' && primary.score >= 45 && natureScore < 35 && diplomacyScore < 35) {
    title = 'Barbarians of the border';
    emoji = '🗡️';
  }
  if (primary.score < 20 && humans < 12) {
    title = 'Young pioneers';
    emoji = '🌅';
  }

  const bits: string[] = [];
  bits.push(primary.blurb);
  if (secondary && secondary.score >= 25 && secondary.id !== primary.id) {
    bits.push(`Along the way: ${secondary.blurb}`);
  }
  if (humans > 0) {
    const adults = state.entities.filter((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile).length;
    bits.push(`${humans} people (${adults} adults) · Year ${state.year}.`);
  }

  const summary = bits.join(' ');

  return {
    title,
    emoji,
    summary,
    traits,
    primary: primary.id,
  };
}
