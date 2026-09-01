import type { Entity, WorldState } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import { EntityType, JobType } from './gameTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { getHumanHuntRange } from './combat';
import { addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { addHuntVisual } from './huntvisuals';
import { traitMultiplier } from './settlerTraits';
import { valleyStageIndex } from './ecologyStage';
import { personDayRoll } from './dayCycle';
import { startHumanChat } from './humanChat';
import { tryTickBlueberryForaging } from './blueberryForaging';
import {
  clearHuntersTargetingPrey,
  isValidHuntPrey,
  markWildlifeDead,
  syncEntityGrids,
} from './simulation/simulationEntities';
import { findClosestInEntityGrid } from './simQueries';
import { isPlayerHuman } from './playerHuman';

/** All wildlife species that can be hunted for food when hunger strikes. */
const HUNTABLE_PREY_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  EntityType.Deer,
  EntityType.Rabbit,
  EntityType.Fox,
  EntityType.Wolf,
]);

/** Energy restored to a starving settler eating their wild catch on the spot. */
const WILD_HUNT_ENERGY: Partial<Record<EntityType, number>> = {
  [EntityType.Deer]: 400,  // 🦌 Huge venison feast
  [EntityType.Wolf]: 280,  // 🐺 Large predator meat
  [EntityType.Fox]: 180,   // 🦊 Medium game meal
  [EntityType.Rabbit]: 90, // 🐰 Quick snack
};

export function tickHumanHunting(
  state: WorldState,
  ctx: TickContext,
  entity: Entity,
  config: (typeof SPECIES_CONFIG)[keyof typeof SPECIES_CONFIG],
  allowFreeRoam: boolean,
  onSchedule: boolean,
  ateMeal: boolean,
  festivalGathering: boolean,
  byType: Partial<Record<EntityType, Entity[]>>,
  mobileGrid: TickContext['mobileGrid'],
  entityById: Map<number, Entity>,
  suppressIdleInitial: boolean,
): boolean {
  let suppressIdle = suppressIdleInitial;

  const isJobHunter = entity.job === JobType.Hunter;
  const famine = state.resources.food <= 0;

  // All settlers (adults and children) hunt when hungry (<40% energy or during famine)
  const freeHuntHungry = entity.energy < entity.maxEnergy * 0.4 || famine;

  const blueberryForaging =
    !isJobHunter &&
    tryTickBlueberryForaging(state, ctx, entity, {
      freeTime: allowFreeRoam && !onSchedule,
      ateMeal,
      festivalGathering,
      famine,
      speed: config.speed,
    });

  if (
    !blueberryForaging &&
    !festivalGathering &&
    (allowFreeRoam || famine) &&
    isPlayerHuman(entity) &&
    !ateMeal &&
    freeHuntHungry
  ) {
    // Professional hunters have longer range; children and untrained settlers have standard range
    const huntRange = getHumanHuntRange(
      state,
      config.huntRange * (isJobHunter ? 1.2 : 0.75) * traitMultiplier(entity, 'brave', 1.25),
    );

    const preyFallback = (byType[EntityType.Deer] ?? []).concat(
      byType[EntityType.Rabbit] ?? [],
      byType[EntityType.Fox] ?? [],
      byType[EntityType.Wolf] ?? [],
    );

    let closestPrey: Entity | null = null;
    let closestDist = Infinity;

    const huntHit = findClosestInEntityGrid(
      mobileGrid,
      entity.x,
      entity.y,
      huntRange,
      (prey) => HUNTABLE_PREY_TYPES.has(prey.type) && isValidHuntPrey(prey, prey.type, entity.id),
      'hunt',
      preyFallback,
    );

    if (huntHit) {
      closestPrey = huntHit.entity;
      closestDist = Math.sqrt(huntHit.distSq);
    }

    // --- Catch and harvest the prey in the wild ---
    if (closestPrey?.alive && closestDist < config.size + closestPrey.size) {
      const preyId = closestPrey.id;
      markWildlifeDead(ctx, closestPrey);
      clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
      createDeathParticles(state, closestPrey.x, closestPrey.y, '#8a2a2a', 10);
      syncEntityGrids(ctx, closestPrey);

      // Arrow/slingshot flight FX
      addHuntVisual(state, {
        id: `freehunt_${state.tick}_${entity.id}_${preyId}`,
        hunterId: entity.id,
        preyType: closestPrey.type,
        fromX: entity.x,
        fromY: entity.y,
        toX: closestPrey.x,
        toY: closestPrey.y,
        startedAtTick: state.tick,
        startedAtMs: Date.now(),
        success: true,
        foughtBack: false,
      });

      // ⚡ Restores personal stamina on the spot
      const energyGain =
        config.energyGain[closestPrey.type] ??
        WILD_HUNT_ENERGY[closestPrey.type] ??
        100;

      entity.energy = Math.min(entity.maxEnergy, entity.energy + energyGain);
      entity.flash = 10;
      entity.combatTicks = 16;
      entity.huntTargetId = undefined;

      const preyLabel =
        closestPrey.type === EntityType.Deer
          ? 'Deer'
          : closestPrey.type === EntityType.Wolf
            ? 'Wolf'
            : closestPrey.type === EntityType.Fox
              ? 'Fox'
              : 'Rabbit';

      addFloatingText(
        state,
        entity.x,
        entity.y - 14,
        `Eaten ${preyLabel}! +${energyGain} ⚡`,
        '#22c55e',
      );

      entity.vx = 0;
      entity.vy = 0;
      impulseScreenShake(state, 1.5);
    } else if (closestPrey?.alive) {
      // --- Pursue target on foot ---
      entity.huntTargetId = closestPrey.id;
      const dx = closestPrey.x - entity.x;
      const dy = closestPrey.y - entity.y;
      const dist = Math.hypot(dx, dy) || 1.0;

      const chaseMult = (isJobHunter ? 0.72 : 0.5) * traitMultiplier(entity, 'brave', 1.2);
      entity.vx = (dx / dist) * config.speed * chaseMult;
      entity.vy = (dy / dist) * config.speed * chaseMult;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      suppressIdle = true;

      // Strained valley environmental chatter
      if (
        valleyStageIndex(state.valleyStage ?? 'stable') >= 1 &&
        isJobHunter &&
        personDayRoll(entity.id, state.tick, 811) < 0.012
      ) {
        startHumanChat(entity, famine ? 'food' : 'hunt', entity.id, state.tick, 48, {
          foodLow: famine,
        });
      }
    } else {
      entity.huntTargetId = undefined;
      if (
        valleyStageIndex(state.valleyStage ?? 'stable') >= 1 &&
        isJobHunter &&
        personDayRoll(entity.id, state.tick, 812) < 0.02
      ) {
        startHumanChat(entity, famine ? 'food' : 'hunt', entity.id, state.tick, 40, {
          foodLow: famine,
        });
      }
    }
  } else if (
    !allowFreeRoam ||
    ateMeal ||
    !isPlayerHuman(entity) ||
    !freeHuntHungry
  ) {
    entity.huntTargetId = undefined;
  }

  return suppressIdle;
}