import type { Entity, WorldState } from '../gameTypes';
import { EntityType } from '../gameTypes';
import type { TickContext } from './simulationTypes';
import {
  PREGNANCY_TICKS,
  REPRODUCTION_COOLDOWN_TICKS,
  ticksForDays,
  rebuildChildrenIds,
  setHumanBirthFromAge,
  getColonyDay,
} from '../dayCycle';
import { resolveChildSurname, getRandomName } from '../nameLoader';
import { inheritSettlerTraits } from '../settlerTraits';
import { createEntity } from '../entityFactory';
import { pushNewEntity, allLivingHumans } from './simulationEntities';
import { pickHumanVariant } from '../humanSprites';
import { addBigNews, addFloatingText, addNotification, createDeathParticles } from '../simEffects';
import { logEvent } from '../eventLog';
import { humanDisplayName } from '../citizenId';
import { dampScandalReputationLoss } from '../townHall';
import { recordRelationshipDiagnostic } from '../relationshipDiagnostics';
import { seededRandomForRun } from '../simRng';

export interface BirthContext {
  livingHumanAt: (id: number | null | undefined) => Entity | undefined;
}

export const LIFECYCLE_CONFIG = {
  WILDKIN_CHANCE: 0.03,
  DEER_PROXIMITY_RADIUS: 80,
  STILLBORN_CHANCE: 0.001,
  MATERNAL_ENERGY_COST: 45,
  MATERNAL_ENERGY_MIN_RATIO: 0.18,
  STILLBORN_GRIEF_DAYS: 3,
  SCANDAL_BASE_REP_LOSS: -3,
} as const;

function safeAddChildId(parent: Entity, childId: number): void {
  parent.childrenIds ??= [];
  if (!parent.childrenIds.includes(childId)) {
    parent.childrenIds.push(childId);
  }
}

function clearExpectingStatus(human?: Entity): void {
  if (!human || !human.alive) return;
  if (human.relationshipStatus === 'expecting') {
    human.relationshipStatus = human.partnerId != null ? 'married' : 'single';
  }
}

/**
 * Advances pregnancy progress and executes delivery upon reaching term.
 */
export function tickPregnancyAndBirth(
  state: WorldState,
  ctx: TickContext,
  entity: Entity,
  opts: BirthContext,
): void {
  const { width, height, byType, newEntities, entityById, updatedBuildings } = ctx;
  const { livingHumanAt } = opts;

  entity.pregnancyProgress = (entity.pregnancyProgress ?? 0) + 1;
  const dueProgress = entity.pregnancyDueProgress ?? PREGNANCY_TICKS;

  if (entity.pregnancyProgress < dueProgress) {
    return;
  }

  // --- Birth --

  // Seeded per mother and tick: a delivery's position, wildkin roll, stillbirth roll and
  // child's gender are all world state, so the same seed must reproduce the same child.
  const birthKey = `birth:${entity.id}:${state.tick}`;
  const angle = seededRandomForRun(`${birthKey}:angle`) * Math.PI * 2;
  const nx = Math.min(width, Math.max(0, entity.x + Math.cos(angle) * 10));
  const ny = Math.min(height, Math.max(0, entity.y + Math.sin(angle) * 10));

  const nearDeer = byType[EntityType.Deer].some(
    (d) => d.alive && Math.hypot(d.x - entity.x, d.y - entity.y) < LIFECYCLE_CONFIG.DEER_PROXIMITY_RADIUS,
  );
  const wildkinBirth = nearDeer && seededRandomForRun(`${birthKey}:wildkin`) < LIFECYCLE_CONFIG.WILDKIN_CHANCE;
  const biologicalFatherIdAtBirth = entity.pregnantById ?? entity.partnerId;

  const husband = entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined;
  const biologicalFather = biologicalFatherIdAtBirth != null ? livingHumanAt(biologicalFatherIdAtBirth) : undefined;

  //Mother recovery & status reset
  entity.energy = Math.max(
    entity.maxEnergy * LIFECYCLE_CONFIG.MATERNAL_ENERGY_MIN_RATIO,
    entity.energy - LIFECYCLE_CONFIG.MATERNAL_ENERGY_COST,
  );
  recordRelationshipDiagnostic('birthsCompletedThisInterval');
  entity.pregnant = false;
  entity.pregnancyProgress = 0;
  entity.pregnancyDueProgress = undefined;
  entity.pregnantById = undefined;
  entity.relationshipStatus = entity.partnerId != null ? 'married' : 'single';
  entity.reproductionCooldown = REPRODUCTION_COOLDOWN_TICKS;

  //Clear expectant status on partners regardless of birth outcome
  clearExpectingStatus(husband);
  clearExpectingStatus(biologicalFather);

  // --- OUTCOME BRANCH 1: WILDKIN BIRTH ---
  if (wildkinBirth) {
    const wildkin = createEntity(EntityType.Wildkin, nx, ny, state.nextEntityId++, 250);
    pushNewEntity(state, ctx, wildkin);
    addBigNews(
      state,
      '🦌 Wildkin Born!',
      `${entity.name || 'A settler'} gave birth to a gentle Wildkin — a rare gift of the forest.`,
      'neutral',
    );
    addFloatingText(state, entity.x, entity.y - 20, 'Wildkin born!', '#a3a35a');
    logEvent(state, 'birth', `${entity.name || 'A settler'} gave birth to a Wildkin`, entity.name);
    return;
  }

  // --- Outcome Branche 2
  if (seededRandomForRun(`${birthKey}:stillborn`) < LIFECYCLE_CONFIG.STILLBORN_CHANCE) {
    entity.griefUntilTick = Math.max(
      entity.griefUntilTick ?? 0,
      state.tick + ticksForDays(LIFECYCLE_CONFIG.STILLBORN_GRIEF_DAYS),
    );
    addFloatingText(state, entity.x, entity.y - 20, 'Stillborn…', '#9ca3af');
    addNotification(state, 'Stillborn', `${entity.name || 'A settler'}'s baby did not survive birth.`, 'warning');
    logEvent(state, 'death', `${entity.name || 'A settler'} lost the baby — stillborn.`, entity.name);
    return;
  }

  // --- OUTCOME BRANCH 3: HUMAN BIRTH ---
  const { surname: babySurname, isBastard } = resolveChildSurname(
    entity,
    entity.partnerId,
    biologicalFatherIdAtBirth,
    husband,
    biologicalFather,
  );

  const babyGen = (entity.generation ?? 0) + 1;
  const childGender: 'male' | 'female' = seededRandomForRun(`${birthKey}:gender`) > 0.5 ? 'male' : 'female';
  const inheritedTraits = inheritSettlerTraits(entity, biologicalFather);

  const child = createEntity(EntityType.Human, nx, ny, state.nextEntityId++, 80, true, {
    gender: childGender,
    fatherId: biologicalFatherIdAtBirth,
    motherId: entity.id,
    generation: babyGen,
    surname: babySurname,
    isBastard,
    spriteVariant: entity.spriteVariant ?? pickHumanVariant(entity.id, childGender),
    inheritedTraits,
  });

  child.name = getRandomName(childGender);
  child.residenceBuildingId = entity.residenceBuildingId;
  setHumanBirthFromAge(child, 0, getColonyDay(state));
  pushNewEntity(state, ctx, child);

  // The assign layer rebuilds residence occupants from `ctx.byType`, which cannot see a
  // same-tick newborn (pushNewEntity only fills ctx.newEntities). Register the child in the
  // live Human bucket so the residence it was born into lists it before the daily invariant
  // collector runs (SIMULATION_AUTHORITY §5: residenceBuildingId ↔ occupants agree).
  const newbornBucket = byType[EntityType.Human];
  if (newbornBucket && !newbornBucket.includes(child)) {
    newbornBucket.push(child);
  }

  // Synchronize family relationships
  safeAddChildId(entity, child.id);

  if (biologicalFather?.alive) {
    biologicalFather.flash = 10;
    safeAddChildId(biologicalFather, child.id);
  }

  if (husband?.alive && !isBastard) {
    husband.flash = 10;
    safeAddChildId(husband, child.id);
  }

  rebuildChildrenIds(allLivingHumans(state, newEntities, entityById));
  createDeathParticles(state, entity.x, entity.y - 10, isBastard ? '#a855f7' : '#ffb6c1', 12, 'heart');

  const childLabel = `${child.name}${babySurname ? ` ${babySurname}` : ''}`;

  if (isBastard) {
    addFloatingText(state, entity.x, entity.y - 20, `${childLabel} born (bastard)`, '#c084fc');
    const fatherName = biologicalFather ? humanDisplayName(biologicalFather) : 'an unknown father';
    const bastardDetail =
      husband && biologicalFather && husband.id !== biologicalFather.id
        ? `${childLabel} — ${humanDisplayName(husband)} is not the father (${fatherName})`
        : `${childLabel} — born outside wedlock (father: ${fatherName})`;

    addBigNews(state, '⚜ Bastard Born', bastardDetail, 'negative');
    addNotification(state, 'Bastard Born', bastardDetail, 'warning');
    logEvent(state, 'birth', `${childLabel} was born a bastard`, child.name);

    if (husband && biologicalFather && husband.id !== biologicalFather.id) {
      state.villageReputation = Math.max(
        0,
        state.villageReputation + dampScandalReputationLoss(LIFECYCLE_CONFIG.SCANDAL_BASE_REP_LOSS, updatedBuildings),
      );
      logEvent(
        state,
        'scandal',
        `Village gossip — ${childLabel} may not be ${humanDisplayName(husband)}'s child`,
        child.name,
      );
    }
  } else {
    addFloatingText(state, entity.x, entity.y - 20, `${childLabel} born!`, '#ff69b4');
    addNotification(state, 'New Birth', `${childLabel} was born to ${entity.name || 'mother'}!`, 'success');
    logEvent(state, 'birth', `${childLabel} was born`, child.name);
  }
}