import type { GameState, VictoryPath, VictoryProgress } from './gameTypes';
import { EntityType } from './gameTypes';

/** Victory paths shown and achievable in v1 — must match App.tsx Goals tab. */
export const ACTIVE_VICTORY_PATHS: readonly VictoryPath[] = [
  'eco_utopia', 'great_city', 'trade_empire', 'harmony',
];

/** Reserved for future victory paths not yet in the Goals tab. */
export const COMING_SOON_VICTORY_PATHS: readonly VictoryPath[] = [];

/** Numeric targets for victory progress — keep descriptions in sync. */
export const VICTORY_TARGETS = {
  eco_utopia: { population: 250, ecoYears: 20 },
  trade_empire: { routes: 5, gold: 10_000 },
  great_city: { population: 400, buildings: 60 },
  /** Untamed wolves only — taming is not harmony. */
  harmony: { wildWolves: 8, wildkin: 15 },
} as const;

export const VICTORY_DEFINITIONS: Record<VictoryPath, { label: string; description: string; emoji: string }> = {
  eco_utopia: {
    label: 'Eco-Utopia',
    description: `Reach ${VICTORY_TARGETS.eco_utopia.population} humans and maintain 80%+ ecosystem health for ${VICTORY_TARGETS.eco_utopia.ecoYears} years`,
    emoji: '🌿',
  },
  trade_empire: {
    label: 'Trade Empire',
    description: `Establish ${VICTORY_TARGETS.trade_empire.routes} active trade routes and accumulate ${VICTORY_TARGETS.trade_empire.gold.toLocaleString()} gold`,
    emoji: '💰',
  },
  great_city: {
    label: 'Great City',
    description: `Grow to ${VICTORY_TARGETS.great_city.population} humans with ${VICTORY_TARGETS.great_city.buildings} completed buildings`,
    emoji: '🏰',
  },
  harmony: {
    label: 'Harmony',
    description: `Share the valley with ${VICTORY_TARGETS.harmony.wildWolves} untamed wolves and ${VICTORY_TARGETS.harmony.wildkin} wildkin — coexistence, not taming`,
    emoji: '🐺',
  },
};

export function createInitialVictories(): VictoryProgress[] {
  return (Object.keys(VICTORY_DEFINITIONS) as VictoryPath[]).map((path) => ({
    path,
    label: VICTORY_DEFINITIONS[path].label,
    description: VICTORY_DEFINITIONS[path].description,
    progress: 0,
    achieved: false,
  }));
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeVictoryProgress(state: GameState): VictoryProgress[] {
  const humans = state.humanPopulation;
  const buildings = state.buildings.filter((b) => b.completed && b.faction !== 'rival').length;
  const activeRoutes = state.tradeRoutes.filter((r) => r.active).length;
  const gold = state.resources.gold;
  const wildWolves = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Wolf && e.tamedBy == null,
  ).length;
  const wildkin = state.entities.filter((e) => e.alive && e.type === EntityType.Wildkin).length;

  return state.victories.map((v) => {
    if (v.achieved) return v;

    let progress = 0;
    switch (v.path) {
      case 'eco_utopia':
        progress = clampPct(
          (Math.min(humans, VICTORY_TARGETS.eco_utopia.population) / VICTORY_TARGETS.eco_utopia.population) * 50 +
            (Math.min(state.ecoHealthYearsAbove80, VICTORY_TARGETS.eco_utopia.ecoYears) / VICTORY_TARGETS.eco_utopia.ecoYears) * 50
        );
        break;
      case 'trade_empire':
        progress = clampPct(
          (Math.min(activeRoutes, VICTORY_TARGETS.trade_empire.routes) / VICTORY_TARGETS.trade_empire.routes) * 50 +
            (Math.min(gold, VICTORY_TARGETS.trade_empire.gold) / VICTORY_TARGETS.trade_empire.gold) * 50
        );
        break;
      case 'great_city':
        progress = clampPct(
          (Math.min(humans, VICTORY_TARGETS.great_city.population) / VICTORY_TARGETS.great_city.population) * 50 +
            (Math.min(buildings, VICTORY_TARGETS.great_city.buildings) / VICTORY_TARGETS.great_city.buildings) * 50
        );
        break;
      case 'harmony':
        progress = clampPct(
          (Math.min(wildWolves, VICTORY_TARGETS.harmony.wildWolves) / VICTORY_TARGETS.harmony.wildWolves) * 50 +
            (Math.min(wildkin, VICTORY_TARGETS.harmony.wildkin) / VICTORY_TARGETS.harmony.wildkin) * 50
        );
        break;
    }

    const def = VICTORY_DEFINITIONS[v.path];
    return { ...v, label: def.label, description: def.description, progress };
  });
}

export function checkVictoryAchievements(state: GameState): {
  victories: VictoryProgress[];
  victoryAchieved: VictoryPath | null;
  newlyAchieved: VictoryPath | null;
} {
  const victories = computeVictoryProgress(state);
  let newlyAchieved: VictoryPath | null = null;
  let victoryAchieved = state.victoryAchieved;

  for (const v of victories) {
    if (!ACTIVE_VICTORY_PATHS.includes(v.path)) continue;
    if (v.achieved || v.progress < 100) continue;
    v.achieved = true;
    if (!victoryAchieved) {
      victoryAchieved = v.path;
      newlyAchieved = v.path;
    }
  }

  return { victories, victoryAchieved, newlyAchieved };
}