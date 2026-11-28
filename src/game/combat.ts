import {
  BuildingType,
  EntityType,
  JobType,
  createInitialResearchNodes,
  type Building,
  type Entity,
  type ResearchNode,
  type WorldState,
} from './gameTypes';
import type { ForgeOrderId, VillageForgeState } from './gameTypes';
import { hasCompletedBlacksmith, isForgeOrderComplete } from './forge';
import { COMBAT_TECH } from './combatTech';
import { hasTech, resolveResearchEffect } from './simHelpers';
import { seededRandomForRun } from './simRng';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { evaluateAptitudeInfluence } from './personality/traitEvaluation';
import { readSkill } from './skills';
import type { ArmedDuty } from './workAbsence';

const EMPTY_FORGE: VillageForgeState = {
  activeOrder: null,
  progress: 0,
  completed: {},
};

type CombatContext = Pick<WorldState, 'unlockedTechs' | 'researchNodes' | 'buildings' | 'villageForge'>;

export function hasStoneSpears(state: CombatContext): boolean {
  return hasTech(state, COMBAT_TECH.stoneSpears);
}

export function hasIronSpears(state: CombatContext & { villageForge?: VillageForgeState }): boolean {
  return (
    hasTech(state, COMBAT_TECH.ironSpears) &&
    hasCompletedBlacksmith(state) &&
    isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'iron_spears')
  );
}

export function hasWoodenShields(state: CombatContext): boolean {
  return hasTech(state, COMBAT_TECH.woodenShields);
}

export function hasIronShields(state: CombatContext & { villageForge?: VillageForgeState }): boolean {
  return (
    hasTech(state, COMBAT_TECH.ironShields) &&
    hasCompletedBlacksmith(state) &&
    isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'iron_shields')
  );
}

/** Research + blacksmith + forge — iron swords available for military duty. */
export function hasIronSwords(state: CombatContext & { villageForge?: VillageForgeState }): boolean {
  return (
    hasTech(state, COMBAT_TECH.ironSwords) &&
    hasCompletedBlacksmith(state) &&
    isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'iron_swords')
  );
}

/** Research + blacksmith + forge — scale mail. */
export function hasScaleMail(state: CombatContext & { villageForge?: VillageForgeState }): boolean {
  return (
    hasTech(state, COMBAT_TECH.scaleMail) &&
    hasCompletedBlacksmith(state) &&
    isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'scale_mail')
  );
}

/** Research + forge — watchtower ballistae. */
function hasTowerBallistae(state: CombatContext & { villageForge?: VillageForgeState }): boolean {
  return (
    hasTech(state, COMBAT_TECH.bastionTowers) &&
    hasCompletedBlacksmith(state) &&
    isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'tower_ballistae')
  );
}

/**
 * Combat research readings. The combination rule lives in `simHelpers.TIERED_ADD_TARGETS`; read
 * effects through this owner so no second consumer re-introduces a summed guaranteed kill.
 */
function getHuntRangeMultiplier(state: WorldState): number {
  return resolveResearchEffect(state, 'hunt_range')?.multiplier ?? 1;
}

export function getHuntFoodMultiplier(state: WorldState): number {
  return resolveResearchEffect(state, 'hunt_food')?.multiplier ?? 1;
}

export function getHumanHuntRange(state: WorldState, baseRange: number): number {
  return baseRange * getHuntRangeMultiplier(state);
}

export function getPredatorBlockChance(state: WorldState): number {
  let chance = resolveResearchEffect(state, 'predator_block')?.add ?? 0;
  if (hasScaleMail(state)) chance = Math.max(chance, 0.72);
  else if (hasIronShields(state)) chance = Math.max(chance, 0.6);
  else if (hasWoodenShields(state)) chance = Math.max(chance, 0.35);
  return Math.min(0.85, chance);
}

export function getHumanFleeSpeedMultiplier(state: WorldState): number {
  return resolveResearchEffect(state, 'flee_speed')?.multiplier ?? 1;
}

export function getCounterAttackChance(state: WorldState): number {
  if (!hasIronSpears(state) && !hasIronSwords(state)) return 0;
  const researched = resolveResearchEffect(state, 'counter_attack');
  if (researched) return researched.add;
  return hasIronSwords(state) ? 0.55 : 0.45;
}

/**
 * One read-only encounter profile. Technology is availability, not personal equipment.
 * Physiology is a native reserve for humans and the existing metabolic reserve for predators.
 * No persistent strength or second equipment inventory is introduced.
 */
export function resolvePredatorCombatChances(
  state: WorldState, human: Entity, predator: Entity, duty: ArmedDuty,
): { counter: number; block: number } {
  if (!human.alive || human.type !== EntityType.Human || human.age < HUMAN_ADULT_MIN_AGE) {
    return { counter: 0, block: 0 };
  }
  const needs = human.needs;
  const unit = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const readiness = needs ? unit(Math.min(needs.stamina, needs.rest, needs.nutrition) / 100) : 0;
  const predatorReserve = predator.maxEnergy > 0 ? unit(predator.energy / predator.maxEnergy) : 0;
  const aptitude = evaluateAptitudeInfluence(human, 'defense').factor;
  const skill = duty === 'military' ? readSkill(human, human.job === JobType.PrisonGuard ? JobType.PrisonGuard : JobType.Soldier)
    : duty === 'hunting' ? readSkill(human, JobType.Hunter) : 0;
  const factor = readiness * aptitude * (1 + 0.15 * unit(skill / 100)) * (1 + 0.5 * (1 - predatorReserve));
  let counter = 0;
  let block = 0.05; // adult unarmed self-defence, never military gear
  if (duty === 'military') {
    // Research alone is not a forged weapon or suit of armour.
    counter = hasIronSwords(state) ? Math.min(0.55, getCounterAttackChance(state))
      : hasIronSpears(state) ? Math.min(0.45, getCounterAttackChance(state))
      : hasStoneSpears(state) ? 0.15 : 0;
    block = hasScaleMail(state) ? Math.min(0.72, getPredatorBlockChance(state))
      : hasIronShields(state) ? Math.min(0.60, getPredatorBlockChance(state))
      : hasWoodenShields(state) ? Math.min(0.35, getPredatorBlockChance(state)) : block;
  } else if (duty === 'hunting') {
    counter = hasIronSpears(state) ? 0.45 : hasStoneSpears(state) ? 0.15 : 0;
  }
  return { counter: Math.min(0.85, counter * factor), block: Math.min(0.85, block * factor) };
}

/**
 * One combat roll per entity and tick, drawn from the run-seeded `combat` stream. The salt carries
 * the caller's per-entity seed, so the value never depends on stream cursors or on entity order.
 */
function combatRoll(kind: 'predator-block' | 'counter-attack', ...keys: number[]): number {
  return seededRandomForRun(`combat:${kind}:${keys.join(':')}`);
}

/** Resolve either encounter verdict through one probability comparison, preserving both seeded identities. */
export function rollPredatorCombat(
  kind: 'predator-block' | 'counter-attack',
  state: WorldState, human: Entity, predator: Entity, duty: ArmedDuty, tick: number,
): boolean {
  const chances = resolvePredatorCombatChances(state, human, predator, duty);
  const chance = kind === 'counter-attack' ? chances.counter : chances.block;
  if (!(chance > 0)) return false;
  const keys = kind === 'counter-attack'
    ? [human.id, predator.id, tick, human.combatRollSeed ?? 0]
    : [human.id, tick, human.combatRollSeed ?? 0];
  return combatRoll(kind, ...keys) < chance;
}

export interface ArmamentStep {
  id: string;
  label: string;
  done: boolean;
  detail: string;
}

function forgeStepDetail(
  forge: VillageForgeState,
  orderId: ForgeOrderId,
  pending: string,
  ready: string,
): string {
  if (forge.activeOrder === orderId) {
    return `Forging at Blacksmith… ${Math.round(forge.progress)}%`;
  }
  if (isForgeOrderComplete(forge, orderId)) return ready;
  return pending;
}

export function getArmamentSteps(state: WorldState): ArmamentStep[] {
  const hasSmith = hasCompletedBlacksmith(state);
  const hasMining = hasTech(state, 'mining_1');
  const forge = state.villageForge ?? EMPTY_FORGE;

  return [
    {
      id: 'stone_spears',
      label: 'Stone Spears',
      done: hasStoneSpears(state),
      detail: 'Defense tab → research Stone Spears (no building needed). Buffs hunting.',
    },
    {
      id: 'wood_shields',
      label: 'Wooden Shields',
      done: hasWoodenShields(state),
      detail: 'Defense → Wooden Shields after Fortification. Blocks moon howler strikes.',
    },
    {
      id: 'blacksmith',
      label: 'Blacksmith',
      done: hasSmith,
      detail: 'Forestry → Carpentry, then build & staff a Blacksmith (Industry tab).',
    },
    {
      id: 'mining',
      label: 'Deep Mining',
      done: hasMining,
      detail: 'Mining → Deep Mining (needed before iron weapons).',
    },
    {
      id: 'iron_spears',
      label: 'Iron Spears',
      done: hasIronSpears(state),
      detail: forgeStepDetail(
        forge,
        'iron_spears',
        'Research Iron Spears, staff Blacksmith, queue forge order.',
        'Forged at the Blacksmith — village armed.',
      ),
    },
    {
      id: 'iron_shields',
      label: 'Iron Shields',
      done: hasIronShields(state),
      detail: forgeStepDetail(
        forge,
        'iron_shields',
        'Research Iron Shields, staff Blacksmith, queue forge order.',
        'Forged at the Blacksmith — shields active.',
      ),
    },
    {
      id: 'iron_pickaxes',
      label: 'Iron Pickaxes',
      done: isForgeOrderComplete(forge, 'iron_pickaxes'),
      detail: forgeStepDetail(
        forge,
        'iron_pickaxes',
        'Research Refining (Mining), staff Blacksmith, queue pickaxes.',
        'Forged — quarries produce more stone.',
      ),
    },
    {
      id: 'guard_halberds',
      label: 'Guard Halberds',
      done: isForgeOrderComplete(forge, 'guard_halberds'),
      detail: forgeStepDetail(
        forge,
        'guard_halberds',
        'Research Militia Drill, forge Iron Spears first, then queue halberds.',
        'Forged — staffed guards gain extra militia strength.',
      ),
    },
    {
      id: 'wall_plates',
      label: 'Wall Plates',
      done: isForgeOrderComplete(forge, 'wall_plates'),
      detail: forgeStepDetail(
        forge,
        'wall_plates',
        'Research Reinforced Masonry, forge Iron Shields first, then queue wall plates.',
        'Forged — wall segments grant stronger barricade bonus.',
      ),
    },
    {
      id: 'iron_swords',
      label: 'Iron Swords',
      done: hasIronSwords(state),
      detail: forgeStepDetail(
        forge,
        'iron_swords',
        'Research Iron Swords (+ Militia Drill), forge Iron Spears first, then queue swords.',
        'Forged — militia wields iron swords.',
      ),
    },
    {
      id: 'scale_mail',
      label: 'Scale Mail',
      done: hasScaleMail(state),
      detail: forgeStepDetail(
        forge,
        'scale_mail',
        'Research Scale Mail, forge Iron Shields first, then queue armor.',
        'Forged — scale mail equips the militia.',
      ),
    },
    {
      id: 'tower_ballistae',
      label: 'Tower Ballistae',
      done: hasTowerBallistae(state),
      detail: forgeStepDetail(
        forge,
        'tower_ballistae',
        'Research Bastion Towers, forge Wall Plates first, then queue ballistae.',
        'Forged — watchtowers mount ballistae.',
      ),
    },
  ];
}

export function getHumanArmamentLabel(state: WorldState): string | null {
  const weapon = hasIronSwords(state)
    ? 'Iron sword'
    : hasIronSpears(state)
      ? 'Iron spear'
      : hasStoneSpears(state)
        ? 'Stone spear'
        : null;

  const armor = hasScaleMail(state)
    ? 'scale mail'
    : hasIronShields(state)
      ? 'iron shield'
      : hasWoodenShields(state)
        ? 'wooden shield'
        : null;

  if (weapon && armor) return `${weapon} & ${armor}`;
  if (weapon) return weapon;
  if (armor) return armor.charAt(0).toUpperCase() + armor.slice(1);
  return null;
}

const STATIC_BLACKSMITH_BUILDING: readonly Building[] = [
  {
    id: 0,
    type: BuildingType.Blacksmith,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  },
];

function combatProbeState(
  unlockedTechs: readonly string[],
  hasBlacksmith: boolean,
  villageForge?: VillageForgeState,
): CombatContext {
  return {
    unlockedTechs: unlockedTechs as string[],
    researchNodes: [],
    buildings: hasBlacksmith ? (STATIC_BLACKSMITH_BUILDING as Building[]) : [],
    villageForge: villageForge ?? EMPTY_FORGE,
  };
}

export interface HumanCombatStatusFlags {
  barracksGuardKeys: Set<string>;
  hasShields: boolean;
  hasSpears: boolean;
}

/** O(buildings) precompute — status badges call this once per frame, not per human. */
export function buildHumanCombatStatusFlags(
  unlockedTechs: readonly string[],
  hasBlacksmith: boolean,
  villageForge: VillageForgeState | undefined,
  buildings: readonly Building[],
): HumanCombatStatusFlags {
  const probe = combatProbeState(unlockedTechs, hasBlacksmith, villageForge);
  const barracksGuardKeys = new Set<string>();

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (!b.completed || b.type !== BuildingType.Barracks) continue;
    for (let j = 0; j < b.occupants.length; j++) {
      barracksGuardKeys.add(`${b.occupants[j]}:${b.id}`);
    }
  }

  return {
    barracksGuardKeys,
    hasShields: hasScaleMail(probe) || hasIronShields(probe) || hasWoodenShields(probe),
    hasSpears: hasIronSwords(probe) || hasIronSpears(probe) || hasStoneSpears(probe),
  };
}

export function getHumanStatusCombatIconFromFlags(
  human: Entity,
  flags: HumanCombatStatusFlags,
): string | null {
  if (
    human.job === JobType.Soldier &&
    human.workerBuildingId != null &&
    flags.barracksGuardKeys.has(`${human.id}:${human.workerBuildingId}`)
  ) {
    return '🪖';
  }
  if (human.huntTargetId) return '🏹';
  if ((human.combatTicks ?? 0) > 0) return '⚔️';
  if (flags.hasShields) return '🛡️';
  if (flags.hasSpears) return '🏹';
  return null;
}

/**
 * The simulation's predator set, also read by the audio layer's hunt cue rather than duplicated;
 * `isPredatorType` is the predicate over it.
 */
export const PREDATOR_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  EntityType.Wolf,
  EntityType.Fox,
  EntityType.Werewolf,
]);

export function isPredatorType(type: EntityType): boolean {
  return PREDATOR_TYPES.has(type);
}

let cachedDefenseMigrationNodes: ResearchNode[] | null = null;

function getDefenseMigrationNodes(): ResearchNode[] {
  if (!cachedDefenseMigrationNodes) {
    cachedDefenseMigrationNodes = createInitialResearchNodes().filter(
      (n) => n.id === 'defense_1' || (n.id.startsWith('defense_') && n.id !== 'defense_1'),
    );
  }
  return cachedDefenseMigrationNodes;
}

/** Returns a new array; does NOT mutate the input. */
export function mergeCombatResearchNodes(nodes: readonly ResearchNode[]): ResearchNode[] {
  const result: ResearchNode[] = nodes.map((n) => structuredClone(n));
  const existing = new Set(result.map((n) => n.id));

  for (const template of getDefenseMigrationNodes()) {
    if (!existing.has(template.id)) {
      result.push(structuredClone(template));
      existing.add(template.id);
    }
  }

  for (let i = 0; i < result.length; i++) {
    const node = result[i];
    if (node.id === 'defense_1' && !node.unlocked) {
      node.unlocked = true;
    }
  }

  return result;
}
