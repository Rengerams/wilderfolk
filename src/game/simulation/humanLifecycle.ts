/**
 * Human lifecycle — pregnancy progress and birth.
 * Extracted verbatim from humanTick.ts (humanTick-split plan, Task 4) — behavior unchanged.
 * The caller (tickHumans) keeps the pregnancy gate; this runs the progress + birth body.
 */
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

export interface BirthContext {
  livingHumanAt: (id: number | null | undefined) => Entity | undefined;
}

/**
 * Advance pregnancy and (at term) run the full birth: wildkin births, stillborn
 * (1 in 1000), bastard detection, trait inheritance, family/bond bookkeeping.
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
  if (entity.pregnancyProgress >= (entity.pregnancyDueProgress ?? PREGNANCY_TICKS)) {
    const angle = Math.random() * Math.PI * 2;
    const nx = Math.min(width, Math.max(0, entity.x + Math.cos(angle) * 10));
    const ny = Math.min(height, Math.max(0, entity.y + Math.sin(angle) * 10));
    const nearDeer = byType[EntityType.Deer].some(
      (d) => d.alive && Math.hypot(d.x - entity.x, d.y - entity.y) < 80,
    );
    const wildkinBirth = nearDeer && Math.random() < 0.03;
    const biologicalFatherIdAtBirth = entity.pregnantById ?? entity.partnerId;

    // Soft birth cost — was flat -50 and could kill low-energy mothers as "childbirth"
    entity.energy = Math.max(entity.maxEnergy * 0.18, entity.energy - 45);
    // Birth completed (pregnancy reached term) — a separate counter from new
    // conceptions: never infer births from pregnanciesStartedThisInterval.
    recordRelationshipDiagnostic('birthsCompletedThisInterval');
    entity.pregnant = false;
    entity.pregnancyProgress = 0;
    entity.pregnancyDueProgress = undefined;
    entity.pregnantById = undefined;
    entity.relationshipStatus = entity.partnerId != null ? 'married' : 'single';
    entity.reproductionCooldown = REPRODUCTION_COOLDOWN_TICKS;

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
    } else {
      // 1 in 1000 births are stillborn — nature is real, but rarely cruel.
      if (Math.random() < 0.001) {
        entity.griefUntilTick = Math.max(entity.griefUntilTick ?? 0, state.tick + ticksForDays(3));
        addFloatingText(state, entity.x, entity.y - 20, 'Stillborn…', '#9ca3af');
        addNotification(state, 'Stillborn', `${entity.name || 'A settler'}'s baby did not survive birth.`, 'warning');
        logEvent(state, 'death', `${entity.name || 'A settler'} lost the baby — stillborn.`, entity.name);
      } else {
        const biologicalFatherId = biologicalFatherIdAtBirth;
        const husband = entity.partnerId != null
          ? livingHumanAt(entity.partnerId)
          : undefined;
        const biologicalFather = biologicalFatherId != null
          ? livingHumanAt(biologicalFatherId)
          : undefined;
        const { surname: babySurname, isBastard } = resolveChildSurname(
          entity,
          entity.partnerId,
          biologicalFatherId,
          husband,
          biologicalFather,
        );
        const babyGen = (entity.generation ?? 0) + 1;
        const childGender = Math.random() > 0.5 ? 'male' : 'female';
        // DNA-like inheritance: each parent trait has a chance to pass down;
        // any slot left unfilled is rolled fresh by createEntity.
        const inheritedTraits = inheritSettlerTraits(entity, biologicalFather);
        const child = createEntity(EntityType.Human, nx, ny, state.nextEntityId++, 80, true, {
          gender: childGender,
          fatherId: biologicalFatherId,
          motherId: entity.id,
          generation: babyGen,
          surname: babySurname,
          isBastard,
          spriteVariant: entity.spriteVariant ?? pickHumanVariant(entity.id, childGender),
          inheritedTraits,
        });
        child.name = getRandomName(child.gender === 'male' ? 'male' : 'female');
        child.residenceBuildingId = entity.residenceBuildingId;
        setHumanBirthFromAge(child, 0, getColonyDay(state));
        pushNewEntity(state, ctx, child);
        entity.childrenIds ??= [];
        entity.childrenIds.push(child.id);
        if (biologicalFather?.alive) {
          biologicalFather.flash = 10;
          biologicalFather.childrenIds ??= [];
          biologicalFather.childrenIds.push(child.id);
          if (biologicalFather.relationshipStatus === 'expecting') {
            biologicalFather.relationshipStatus = biologicalFather.partnerId != null ? 'married' : 'single';
          }
        }
        if (husband?.alive && !isBastard) {
          husband.flash = 10;
          husband.childrenIds ??= [];
          if (!husband.childrenIds.includes(child.id)) husband.childrenIds.push(child.id);
          if (husband.relationshipStatus === 'expecting') husband.relationshipStatus = 'married';
        }
        rebuildChildrenIds(allLivingHumans(state, newEntities, entityById));
        createDeathParticles(state, entity.x, entity.y - 10, isBastard ? '#a855f7' : '#ffb6c1', 12, 'heart');
        const childLabel = `${child.name}${babySurname ? ` ${babySurname}` : ''}`;
        if (isBastard) {
          addFloatingText(state, entity.x, entity.y - 20, `${childLabel} born (bastard)`, '#c084fc');
          const fatherName = biologicalFather ? humanDisplayName(biologicalFather) : 'an unknown father';
          const bastardDetail = husband && biologicalFather && husband.id !== biologicalFather.id
            ? `${childLabel} — ${humanDisplayName(husband)} is not the father (${fatherName})`
            : `${childLabel} — born outside wedlock (father: ${fatherName})`;
          addBigNews(state, '⚜ Bastard Born', bastardDetail, 'negative');
          addNotification(state, 'Bastard Born', bastardDetail, 'warning');
          logEvent(state, 'birth', `${childLabel} was born a bastard`, child.name);
          if (husband && biologicalFather && husband.id !== biologicalFather.id) {
            state.villageReputation = Math.max(
              0,
              state.villageReputation + dampScandalReputationLoss(-3, updatedBuildings),
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
    }
  }
}
