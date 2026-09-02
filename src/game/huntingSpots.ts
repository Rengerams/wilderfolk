import type { Building, Entity, EntityType, WorldState } from './gameTypes';
import { EntityType as EntityTypeEnum } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import { addHuntVisual } from './huntvisuals';
import { addResource } from './economy';
import { recordFoodProduced } from './economyLedger';
import { logEvent } from './eventLog';
import { rewardProductionSkills } from './skills';
import { getMultiplier } from './simHelpers';
import { getValleyHuntYieldMultiplier } from './ecologyStage';
import { killHuman } from './dayCycle';
import {
  addBigNews,
  addFloatingText,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';
import {
  clearHuntersTargetingPrey,
  markWildlifeDead,
  syncEntityGrids,
} from './simulation/simulationEntities';

export type HuntingSpotPrey = 'auto' | 'deer' | 'rabbit' | 'wolf' | 'fox';

export interface HuntingSpotPreyOption {
  readonly id: HuntingSpotPrey;
  readonly label: string;
  readonly emoji: string;
  readonly hint: string;
}

const DEFAULT_HUNTING_SPOT_PREY: HuntingSpotPrey = 'auto';

export const HUNTING_SPOT_PREY_OPTIONS: readonly HuntingSpotPreyOption[] = [
  { id: 'auto', label: 'Auto', emoji: '🎯', hint: 'Nearest deer, wolf, fox, or rabbit' },
  { id: 'deer', label: 'Deer', emoji: '🦌', hint: 'Biggest venison carcass — maximum meat' },
  { id: 'wolf', label: 'Wolf', emoji: '🐺', hint: 'Dangerous predator — wolves fight back!' },
  { id: 'fox', label: 'Fox', emoji: '🦊', hint: 'Medium game — quick and agile' },
  { id: 'rabbit', label: 'Rabbit', emoji: '🐰', hint: 'Small game — fast and safe to catch' },
] as const;

const PREY_OPTIONS_MAP: Readonly<Record<HuntingSpotPrey, HuntingSpotPreyOption>> = {
  auto: HUNTING_SPOT_PREY_OPTIONS[0],
  deer: HUNTING_SPOT_PREY_OPTIONS[1],
  wolf: HUNTING_SPOT_PREY_OPTIONS[2],
  fox: HUNTING_SPOT_PREY_OPTIONS[3],
  rabbit: HUNTING_SPOT_PREY_OPTIONS[4],
};

export function getHuntingSpotPreyOption(prey: HuntingSpotPrey = 'auto'): HuntingSpotPreyOption {
  return PREY_OPTIONS_MAP[prey] ?? PREY_OPTIONS_MAP.auto;
}

export function isValidHuntingSpotPrey(value: unknown): value is HuntingSpotPrey {
  return typeof value === 'string' && value in PREY_OPTIONS_MAP;
}

/** Carcass yield multipliers scaled realistically by animal size. */
const CARCASS_MULTIPLIER: Record<EntityType, number> = {
  [EntityTypeEnum.Deer]: 1.60,      // 🦌 Large herbivore (~29 meat baseline)
  [EntityTypeEnum.Wolf]: 1.20,      // 🐺 Large predator (~22 meat baseline)
  [EntityTypeEnum.Fox]: 0.80,       // 🦊 Medium game (~14 meat baseline)
  [EntityTypeEnum.Rabbit]: 0.45,    // 🐰 Small prey (~8 meat baseline)
  [EntityTypeEnum.Human]: 0.0,
  [EntityTypeEnum.Werewolf]: 1.20,
  [EntityTypeEnum.Wildkin]: 0.90,
  [EntityTypeEnum.Tree]: 0.0,
  [EntityTypeEnum.Grass]: 0.0,
};

/** Finds the closest valid prey target within range matching the building's prey preference. */
export function findHuntingTarget(
  building: Building,
  byType: Record<EntityType, Entity[]>,
  searchRadius = 320,
): Entity | null {
  const bx = building.x + building.width / 2;
  const by = building.y + building.height / 2;
  const preyTarget = building.huntingSpotPrey ?? 'auto';

  const targetTypes: EntityType[] = [];
  if (preyTarget === 'auto' || preyTarget === 'deer') targetTypes.push(EntityTypeEnum.Deer);
  if (preyTarget === 'auto' || preyTarget === 'wolf') targetTypes.push(EntityTypeEnum.Wolf);
  if (preyTarget === 'auto' || preyTarget === 'fox') targetTypes.push(EntityTypeEnum.Fox);
  if (preyTarget === 'auto' || preyTarget === 'rabbit') targetTypes.push(EntityTypeEnum.Rabbit);

  let bestTarget: Entity | null = null;
  let bestScore = Infinity;

  for (let t = 0; t < targetTypes.length; t++) {
    const pool = byType[targetTypes[t]] ?? [];
    for (let p = 0; p < pool.length; p++) {
      const e = pool[p];
      if (!e.alive || e.tamedBy != null) continue;
      const dist = Math.hypot(e.x - bx, e.y - by);
      if (dist >= searchRadius) continue;
      
      // Predators are given a distance penalty in auto-mode so hunters prefer deer/rabbits unless close
      const score = (e.type === EntityTypeEnum.Wolf || e.type === EntityTypeEnum.Fox) ? dist + 120 : dist;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = e;
      }
    }
  }

  return bestTarget;
}

/** Processes a hunting shift: settler aims arrow, rolls combat/harvest, and handles wolf danger. */

function findBestPrey(
  byType: Record<EntityType, Entity[]>,
  bx: number,
  by: number,
  searchRadius: number,
  preyTarget: HuntingSpotPrey,
  extraPredatorPenalty: number = 120,
): Entity | null {
  const targetTypes: EntityType[] = [];
  if (preyTarget === 'auto' || preyTarget === 'deer') targetTypes.push(EntityTypeEnum.Deer);
  if (preyTarget === 'auto' || preyTarget === 'rabbit') targetTypes.push(EntityTypeEnum.Rabbit);
  if (preyTarget === 'auto' || preyTarget === 'wolf') targetTypes.push(EntityTypeEnum.Wolf);
  if (preyTarget === 'auto' || preyTarget === 'fox') targetTypes.push(EntityTypeEnum.Fox);

  let bestTarget: Entity | null = null;
  let bestScore = Infinity;

  for (let t = 0; t < targetTypes.length; t++) {
    const pool = byType[targetTypes[t]] ?? [];
    for (let p = 0; p < pool.length; p++) {
      const e = pool[p];
      if (!e.alive || e.tamedBy != null) continue;
      const dist = Math.hypot(e.x - bx, e.y - by);
      if (dist >= searchRadius) continue;
      const isPredator = e.type === EntityTypeEnum.Wolf || e.type === EntityTypeEnum.Fox;
      const score = isPredator ? dist + extraPredatorPenalty : dist;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = e;
      }
    }
  }

  return bestTarget;
}
function tickHuntingSpotProduction(
  state: WorldState,
  ctx: TickContext,
  building: Building,
  workers: number,
  totalMult: number,
  globalEff: number,
): void {
  const { entityById, byType, updatedBuildings } = ctx;

  // Find an active living hunter settler assigned to this station
  const hunterWorker = building.occupants
    .map((id) => entityById.get(id))
    .find((e) => e && e.alive);

  if (!hunterWorker) return;

  const targetPrey = findHuntingTarget(building, byType, 320);
  if (!targetPrey) return;

  const isWolf = targetPrey.type === EntityTypeEnum.Wolf;
  const foughtBack = isWolf && Math.random() < 0.40;
  const hunterDies = foughtBack && Math.random() < 0.25; // 25% lethal counter-kill on retaliation
  const success = !hunterDies && (foughtBack ? Math.random() < 0.60 : Math.random() < 0.85);

  // 🏹 Visual Arrow Flight from Settler to Prey
  addHuntVisual(state, {
    id: `hunt_${state.tick}_${hunterWorker.id}_${targetPrey.id}`,
    hunterId: hunterWorker.id,
    preyType: targetPrey.type,
    fromX: hunterWorker.x,
    fromY: hunterWorker.y,
    toX: targetPrey.x,
    toY: targetPrey.y,
    startedAtTick: state.tick,
    startedAtMs: Date.now(),
    success: !hunterDies && success,
    foughtBack,
  });

  hunterWorker.spriteAngle = Math.atan2(targetPrey.y - hunterWorker.y, targetPrey.x - hunterWorker.x);
  hunterWorker.flash = 10;
  hunterWorker.combatTicks = 20;

  // 🐺 CASE 1: Wolf Kills the Hunter
  if (hunterDies) {
    const hunterName = hunterWorker.name || 'Hunter';
    createDeathParticles(state, hunterWorker.x, hunterWorker.y, '#8a2a2a', 14);
    impulseScreenShake(state, 4.5);
    
    killHuman(hunterWorker, updatedBuildings, entityById, state.tick);
    
    addFloatingText(state, hunterWorker.x, hunterWorker.y - 14, 'Slain by Wolf! 💀', '#ef4444');
    addBigNews(
      state,
      '🐺 Tragedy on the Hunt',
      `${hunterName} was mauled to death while hunting a wild wolf.`,
      'negative',
    );
    logEvent(
      state,
      'death',
      `${hunterName} was killed by a wild wolf at the Hunting Spot.`,
      hunterName,
      'defense',
    );
    return;
  }

  // 🐺 CASE 2: Wolf Wounds Hunter
  if (foughtBack) {
    hunterWorker.energy = Math.max(10, hunterWorker.energy - 45);
    createDeathParticles(state, hunterWorker.x, hunterWorker.y, '#f87171', 6);
    impulseScreenShake(state, 2.5);
    addFloatingText(state, hunterWorker.x, hunterWorker.y - 12, 'Wounded in melee! 🐺', '#f87171');
    logEvent(state, 'combat', `${hunterWorker.name || 'Hunter'} fought off an attacking wolf in close quarters.`);
  }

  // 🥩 CASE 3: Successful Harvest
  if (success) {
    const huntMult = getMultiplier(state, 'hunt_yield');
    const valleyHunt = getValleyHuntYieldMultiplier(state);
    const carcass = CARCASS_MULTIPLIER[targetPrey.type] ?? 1.0;

    const amount = Math.floor(
      (12 + workers * 6) * carcass * totalMult * huntMult * globalEff * valleyHunt,
    );

    if (amount <= 0 || addResource(state, 'food', amount) <= 0) {
      addFloatingText(
        state,
        hunterWorker.x,
        hunterWorker.y - 12,
        'Stores full!',
        '#94a3b8',
        'brief',
      );
    } else {
      recordFoodProduced(state, 'hunting', amount);
      const preyId = targetPrey.id;
      targetPrey.energy = 0;
      
      markWildlifeDead(ctx, targetPrey, undefined, state.tick);
      clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
      syncEntityGrids(ctx, targetPrey);
      createDeathParticles(state, targetPrey.x, targetPrey.y, '#8a2a2a', 8);

      rewardProductionSkills(state, building, 0.25, entityById);
      addFloatingText(state, targetPrey.x, targetPrey.y - 12, `+${amount} meat`, '#ef4444', 'brief');
      
      const preyLabel = getHuntingSpotPreyOption(targetPrey.type as HuntingSpotPrey).label.toLowerCase();
      logEvent(state, 'event', `${hunterWorker.name || 'Hunter'} bagged a ${preyLabel} (+${amount} meat)`);
    }
  } else if (!foughtBack) {
    addFloatingText(state, targetPrey.x, targetPrey.y - 12, 'Missed shot!', '#94a3b8', 'brief');
  }
}
