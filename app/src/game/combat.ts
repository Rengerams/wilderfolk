import {
  BuildingType, EntityType, JobType,
  createInitialResearchNodes,
  type Building, type Entity, type ResearchNode, type WorldState,
} from './gameTypes';
import type { ForgeOrderId, VillageForgeState } from './forge';
import { isForgeOrderComplete } from './forge';
import { COMBAT_TECH } from './combatTech';

export { COMBAT_TECH } from './combatTech';

export const EMPTY_FORGE: VillageForgeState = {
  activeOrder: null,
  progress: 0,
  completed: {},
};

type CombatContext = Pick<WorldState, 'unlockedTechs' | 'researchNodes' | 'buildings' | 'villageForge'>;

function hasTech(state: CombatContext, techId: string): boolean {
  return state.unlockedTechs.includes(techId);
}

/** Returns undefined when no matching researched effect exists. */
function researchedEffect(state: CombatContext, target: string, mode: 'mult' | 'add'): number | undefined {
  let value = mode === 'mult' ? 1 : 0;
  let found = false;
  for (const node of state.researchNodes) {
    if (!node.researched) continue;
    for (const effect of node.effects) {
      if (effect.target !== target) continue;
      found = true;
      if (mode === 'mult' && effect.multiplier !== undefined) value *= effect.multiplier;
      if (mode === 'add' && effect.add !== undefined) value += effect.add;
    }
  }
  return found ? value : undefined;
}

export function hasCompletedBlacksmith(state: CombatContext): boolean {
  return state.buildings.some((b) => b.completed && b.type === BuildingType.Blacksmith);
}

export function hasStoneSpears(state: CombatContext): boolean {
  return hasTech(state, COMBAT_TECH.stoneSpears);
}

export function hasIronSpears(state: CombatContext & { villageForge?: VillageForgeState }): boolean {
  return hasTech(state, COMBAT_TECH.ironSpears)
    && hasCompletedBlacksmith(state)
    && isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'iron_spears');
}

export function hasWoodenShields(state: CombatContext): boolean {
  return hasTech(state, COMBAT_TECH.woodenShields);
}

export function hasIronShields(state: CombatContext & { villageForge?: VillageForgeState }): boolean {
  return hasTech(state, COMBAT_TECH.ironShields)
    && hasCompletedBlacksmith(state)
    && isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'iron_shields');
}

export function getHuntRangeMultiplier(state: WorldState): number {
  return researchedEffect(state, 'hunt_range', 'mult') ?? 1;
}

export function getHuntFoodMultiplier(state: WorldState): number {
  return researchedEffect(state, 'hunt_food', 'mult') ?? 1;
}

export function getHumanHuntRange(state: WorldState, baseRange: number): number {
  return baseRange * getHuntRangeMultiplier(state);
}

export function getPredatorBlockChance(state: WorldState): number {
  let chance = researchedEffect(state, 'predator_block', 'add') ?? 0;
  if (hasIronShields(state)) chance = Math.max(chance, 0.6);
  else if (hasWoodenShields(state)) chance = Math.max(chance, 0.35);
  return Math.min(0.85, chance);
}

export function getHumanFleeSpeedMultiplier(state: WorldState): number {
  return researchedEffect(state, 'flee_speed', 'mult') ?? 1;
}

export function getCounterAttackChance(state: WorldState): number {
  if (!hasIronSpears(state)) return 0;
  const add = researchedEffect(state, 'counter_attack', 'add');
  // Default 0.45 only when no explicit research effect exists; 0 is a valid explicit value.
  return add === undefined ? 0.45 : add;
}

export function rollPredatorBlock(
  state: WorldState,
  humanId: number,
  tick: number,
  combatRollSeed = 0,
): boolean {
  const chance = getPredatorBlockChance(state);
  if (chance <= 0) return false;
  const roll = (((humanId * 1103515245 + tick * 12345 + combatRollSeed) >>> 0) % 1000) / 1000;
  return roll < chance;
}

export function rollCounterAttack(
  state: WorldState,
  humanId: number,
  predatorId: number,
  tick: number,
  combatRollSeed = 0,
): boolean {
  const chance = getCounterAttackChance(state);
  if (chance <= 0) return false;
  const roll = (((humanId * 2654435761 + predatorId * 1597334677 + tick + combatRollSeed) >>> 0) % 1000) / 1000;
  return roll < chance;
}

export interface ArmamentStep {
  id: string;
  label: string;
  done: boolean;
  detail: string;
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
      detail: forgeStepDetail(forge, 'iron_spears', 'Research Iron Spears, staff Blacksmith, queue forge order.', 'Forged at the Blacksmith — village armed.'),
    },
    {
      id: 'iron_shields',
      label: 'Iron Shields',
      done: hasIronShields(state),
      detail: forgeStepDetail(forge, 'iron_shields', 'Research Iron Shields, staff Blacksmith, queue forge order.', 'Forged at the Blacksmith — shields active.'),
    },
    {
      id: 'guard_halberds',
      label: 'Guard Halberds',
      done: isForgeOrderComplete(forge, 'guard_halberds'),
      detail: forgeStepDetail(forge, 'guard_halberds', 'Research Militia Drill, forge Iron Spears first, then queue halberds.', 'Forged — staffed guards gain extra militia strength.'),
    },
    {
      id: 'wall_plates',
      label: 'Wall Plates',
      done: isForgeOrderComplete(forge, 'wall_plates'),
      detail: forgeStepDetail(forge, 'wall_plates', 'Research Reinforced Masonry, forge Iron Shields first, then queue wall plates.', 'Forged — wall segments grant stronger barricade bonus.'),
    },
    {
      id: 'iron_pickaxes',
      label: 'Iron Pickaxes',
      done: isForgeOrderComplete(forge, 'iron_pickaxes'),
      detail: forgeStepDetail(forge, 'iron_pickaxes', 'Research Refining (Mining), staff Blacksmith, queue pickaxes.', 'Forged — quarries produce more stone.'),
    },
  ];
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

export function getHumanArmamentLabel(state: WorldState): string | null {
  if (hasIronSpears(state) && hasIronShields(state)) return 'Iron spear & shield';
  if (hasIronSpears(state)) return 'Iron spear';
  if (hasIronShields(state)) return 'Iron shield';
  if (hasStoneSpears(state) && hasWoodenShields(state)) return 'Spear & wooden shield';
  if (hasStoneSpears(state)) return 'Stone spear';
  if (hasWoodenShields(state)) return 'Wooden shield';
  return null;
}

function combatProbeState(
  unlockedTechs: readonly string[],
  hasBlacksmith: boolean,
  villageForge?: VillageForgeState,
): CombatContext {
  const buildings: Building[] = hasBlacksmith
    ? [{
      id: 0, type: BuildingType.Blacksmith, x: 0, y: 0, width: 1, height: 1,
      occupants: [], level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    }]
    : [];
  return {
    unlockedTechs: [...unlockedTechs],
    researchNodes: [],
    buildings,
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
  for (const b of buildings) {
    if (!b.completed || b.type !== BuildingType.Barracks) continue;
    for (const id of b.occupants) barracksGuardKeys.add(`${id}:${b.id}`);
  }
  return {
    barracksGuardKeys,
    hasShields: hasIronShields(probe) || hasWoodenShields(probe),
    hasSpears: hasIronSpears(probe) || hasStoneSpears(probe),
  };
}

export function getHumanStatusCombatIconFromFlags(
  human: Entity,
  flags: HumanCombatStatusFlags,
): string | null {
  if (
    human.job === JobType.Guard
    && human.homeBuildingId != null
    && flags.barracksGuardKeys.has(`${human.id}:${human.homeBuildingId}`)
  ) {
    return '🪖';
  }
  if (human.huntTargetId) return '🏹';
  if ((human.combatTicks ?? 0) > 0) return '⚔️';
  if (flags.hasShields) return '🛡️';
  if (flags.hasSpears) return '🏹';
  return null;
}

export function getHumanStatusCombatIcon(
  human: Entity,
  unlockedTechs: readonly string[],
  hasBlacksmith: boolean,
  villageForge?: VillageForgeState,
  buildings?: readonly Building[],
): string | null {
  const flags = buildHumanCombatStatusFlags(
    unlockedTechs,
    hasBlacksmith,
    villageForge,
    buildings ?? [],
  );
  return getHumanStatusCombatIconFromFlags(human, flags);
}

const PREDATOR_TYPES = new Set<EntityType>([EntityType.Wolf, EntityType.Fox, EntityType.Werewolf]);

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
  const result = nodes.map((n) => ({ ...n }));
  const existing = new Set(result.map((n) => n.id));
  for (const template of getDefenseMigrationNodes()) {
    if (!existing.has(template.id)) {
      result.push({ ...template });
      existing.add(template.id);
    }
  }
  for (const node of result) {
    if (node.id === 'defense_1' && !node.unlocked) node.unlocked = true;
  }
  return result;
}