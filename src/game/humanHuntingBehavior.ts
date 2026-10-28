import type { Entity, WorldState } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import { EntityType, JobType } from './gameTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { getHumanHuntRange } from './combat';
import { addResource } from './economy';
import { addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { addHuntVisual } from './huntvisuals';
import { evaluateTraitInfluence } from './personality/traitEvaluation';
import type { TraitContext } from './personality/traitEffectCatalog';
import { valleyStageIndex } from './ecologyStage';
import { personDayRoll } from './dayCycle';
import { requestDialogue, dialogueHoursFromNominalTicks } from './dialogueTrees';
import { steerEntityToward } from './simulation/movementSteering';
import { freeHuntFoodGain } from './simulation/humanNeeds';
import { HUMAN_NEEDS, adjustHumanStaminaFromEnergy } from './simulation/humanPhysiology';
import { tryTickBlueberryForaging } from './blueberryForaging';
import {
  clearHuntersTargetingPrey,
  isValidHuntPrey,
  markWildlifeDead,
  syncEntityGrids,
} from './simulation/simulationEntities';
import { findClosestInEntityGrid } from './simQueries';
import { isPlayerHuman } from './playerHuman';

const HUNTER_WORK_STAMINA_THRESHOLD = 85;

/** The catalog contexts this file reads: reach for game, and closing speed on it. */
const HUNT_CONTEXT = { kind: 'danger', activity: 'hunting' } as const satisfies TraitContext;
const PURSUIT_CONTEXT = { kind: 'danger', activity: 'pursuit' } as const satisfies TraitContext;

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

  // Assigned hunters free-hunt as their job. Ordinary settlers only go out to
  // hunt when the colony has no food to feed them (famine) — a fed village
  // doesn't send settlers off to thin the wild herd for sport.
  const famine = (state.resources?.food ?? 0) <= 0;
  // Assigned hunters retain their stamina-based job cadence; emergency hunting
  // is triggered by nutrition, never by the unrelated stamina projection.
  const freeHuntHungry = isJobHunter
    ? (entity.needs?.stamina ?? entity.energy / Math.max(1, entity.maxEnergy) * 100) < HUNTER_WORK_STAMINA_THRESHOLD
    : famine && (entity.needs?.nutrition ?? 100) < HUMAN_NEEDS.EAT_ENTER_NUTRITION;

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
      config.huntRange * (isJobHunter ? 1.2 : 0.75) * evaluateTraitInfluence(entity, HUNT_CONTEXT).factor,
    );

    const deerBucket = byType[EntityType.Deer] ?? [];
    const rabbitBucket = byType[EntityType.Rabbit] ?? [];
    const foxBucket = byType[EntityType.Fox] ?? [];
    const wolfBucket = byType[EntityType.Wolf] ?? [];

    const preyFallback = famine
      ? deerBucket.concat(rabbitBucket, foxBucket, wolfBucket)
      : deerBucket.concat(rabbitBucket);

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
      if (entity.needs) {
        adjustHumanStaminaFromEnergy(entity, energyBite);
      } else {
        entity.energy = Math.min(entity.maxEnergy, entity.energy + energyBite);
      }
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
      // Hunters pursue faster; casual foragers jog; hunting-favoured settlers push harder
      const chaseMult = (isJobHunter ? 0.72 : 0.5) * evaluateTraitInfluence(entity, PURSUIT_CONTEXT).factor;
      steerEntityToward(entity, closestPrey.x, closestPrey.y, config.speed, chaseMult);
      suppressIdle = true;

      // Strained+ valley: occasional chatter so yield dips don't read as pure RNG
      if (
        valleyStageIndex(state.valleyStage ?? 'stable') >= 1 &&
        isJobHunter &&
        personDayRoll(entity.id, state.tick, 811) < 0.012
      ) {
        requestDialogue({ eventKey: 'hunting.scarce', speaker: entity, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(48), priority: 'scripted' });
      }
    } else {
      entity.huntTargetId = undefined;
      if (
        valleyStageIndex(state.valleyStage ?? 'stable') >= 1 &&
        isJobHunter &&
        personDayRoll(entity.id, state.tick, 812) < 0.02
      ) {
        requestDialogue({ eventKey: 'hunting.thinTrails', speaker: entity, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(40), priority: 'scripted' });
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