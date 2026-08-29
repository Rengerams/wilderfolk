import type { Entity, WorldState } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import { EntityType, JobType } from './gameTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { getHumanHuntRange } from './combat';
import { addResource } from './economy';
import { addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { addHuntVisual } from './huntvisuals';
import { traitMultiplier } from './settlerTraits';
import { valleyStageIndex } from './ecologyStage';
import { personDayRoll } from './dayCycle';
import { sayHumanChatPhrase } from './humanChat';
import { freeHuntFoodGain } from './simulation/humanNeeds';
import { tryTickBlueberryForaging } from './blueberryForaging';
import {
  clearHuntersTargetingPrey,
  isValidHuntPrey,
  markWildlifeDead,
  syncEntityGrids,
} from './simulation/simulationEntities';
import { findClosestInEntityGrid } from './simQueries';
import { isPlayerHuman } from './playerHuman';

const NORMAL_PREY_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  EntityType.Deer,
  EntityType.Rabbit,
]);

const FAMINE_PREY_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  EntityType.Deer,
  EntityType.Rabbit,
  EntityType.Fox,
  EntityType.Wolf,
]);

export function tickHumanHunting(
  state: WorldState,
  ctx: TickContext,
  entity: Entity,
  config: (typeof SPECIES_CONFIG)[keyof typeof SPECIES_CONFIG],
  allowFreeRoam: boolean,
  onSchedule: boolean,
  ateMeal: boolean,
  festivalGathering: boolean,
  byType: Record<EntityType, Entity[]>,
  mobileGrid: TickContext['mobileGrid'],
  entityById: Map<number, Entity>,
  suppressIdleInitial: boolean,
): boolean {
  let suppressIdle = suppressIdleInitial;

  // Free-roam hunting — player settlers only (visitors/rivals do not farm the valley).
  const isJobHunter = entity.job === JobType.Hunter;

  // Famine overrides: with no food in stores a hungry settler hunts whatever
  // nature offers, even off-schedule — hunger wins over the daily routine.
  const famine = state.resources.food <= 0;
  const freeHuntHungry = isJobHunter
    ? entity.energy < entity.maxEnergy * 0.85
    : famine
      ? entity.energy < entity.maxEnergy * 0.6
      : entity.energy < entity.maxEnergy * 0.38;

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
    !entity.isJuvenile &&
    freeHuntHungry
  ) {
    const preyTypes = famine ? FAMINE_PREY_TYPES : NORMAL_PREY_TYPES;

    // Assigned hunters range farther; everyone else is opportunistic
    const huntRange = getHumanHuntRange(
      state,
      config.huntRange * (isJobHunter ? 1.2 : 0.75) * traitMultiplier(entity, 'brave', 1.25),
    );

    const preyFallback = famine
      ? (byType[EntityType.Deer] ?? []).concat(
          byType[EntityType.Rabbit] ?? [],
          byType[EntityType.Fox] ?? [],
          byType[EntityType.Wolf] ?? [],
        )
      : (byType[EntityType.Deer] ?? []).concat(byType[EntityType.Rabbit] ?? []);

    let closestPrey: Entity | null = null;
    let closestDist = Infinity;

    const huntHit = findClosestInEntityGrid(
      mobileGrid,
      entity.x,
      entity.y,
      huntRange,
      (prey) => preyTypes.has(prey.type) && isValidHuntPrey(prey, prey.type, entity.id),
      'hunt',
      preyFallback,
    );

    if (huntHit) {
      closestPrey = huntHit.entity;
      closestDist = Math.sqrt(huntHit.distSq);
    }

    if (closestPrey?.alive && closestDist < config.size + closestPrey.size) {
      const preyId = closestPrey.id;
      markWildlifeDead(ctx, closestPrey);
      clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
      createDeathParticles(state, closestPrey.x, closestPrey.y, '#8a2a2a', 10);
      syncEntityGrids(ctx, closestPrey);

      // Arrow flight FX for free-roam hunting
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

      const energyBite =
        config.energyGain[closestPrey.type] ??
        (closestPrey.type === EntityType.Deer ? 350 : 150);
      entity.energy = Math.min(entity.maxEnergy, entity.energy + energyBite);
      entity.flash = 10;
      entity.combatTicks = 16;
      entity.huntTargetId = undefined;

      const foodGain = freeHuntFoodGain(closestPrey.type, state);
      addResource(state, 'food', foodGain);

      const preyLabel =
        closestPrey.type === EntityType.Deer
          ? 'Deer'
          : closestPrey.type === EntityType.Fox
            ? 'Fox'
            : closestPrey.type === EntityType.Wolf
              ? 'Wolf'
              : 'Rabbit';

      addFloatingText(
        state,
        closestPrey.x,
        closestPrey.y - 14,
        `Hunted ${preyLabel}! +${foodGain}`,
        '#f97316',
      );

      entity.vx = 0;
      entity.vy = 0;
      impulseScreenShake(state, 2);
    } else if (closestPrey?.alive) {
      entity.huntTargetId = closestPrey.id;
      const dx = closestPrey.x - entity.x;
      const dy = closestPrey.y - entity.y;
      const dist = Math.hypot(dx, dy) || 1.0;

      // Hunters pursue faster; casual foragers jog; brave settlers push harder
      const chaseMult = (isJobHunter ? 0.72 : 0.5) * traitMultiplier(entity, 'brave', 1.2);
      entity.vx = (dx / dist) * config.speed * chaseMult;
      entity.vy = (dy / dist) * config.speed * chaseMult;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      suppressIdle = true;

      // Strained+ valley: occasional chatter so yield dips don't read as pure RNG
      if (
        valleyStageIndex(state.valleyStage ?? 'stable') >= 1 &&
        isJobHunter &&
        personDayRoll(entity.id, state.tick, 811) < 0.012
      ) {
        sayHumanChatPhrase(entity, "Game's getting scarce…", 48);
      }
    } else {
      entity.huntTargetId = undefined;
      if (
        valleyStageIndex(state.valleyStage ?? 'stable') >= 1 &&
        isJobHunter &&
        personDayRoll(entity.id, state.tick, 812) < 0.02
      ) {
        sayHumanChatPhrase(entity, 'Thin trails today…', 40);
      }
    }
  } else if (
    !allowFreeRoam ||
    ateMeal ||
    !isPlayerHuman(entity) ||
    entity.isJuvenile ||
    !freeHuntHungry
  ) {
    entity.huntTargetId = undefined;
  }

  return suppressIdle;
}