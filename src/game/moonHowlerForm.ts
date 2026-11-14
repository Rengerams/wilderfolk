import { normalizeHumanNeeds, rebaseHumanNeedsClockAfterFormRestore } from './simulation/humanPhysiology';
import { moveResident } from './housingPipeline';
/**
 * Moon Howler form state — the snapshot, the restore and the predicates that keep a cursed settler
 * counted as a settler. Policy lives in `moonHowler.ts`; this module sits below it to avoid a cycle.
 */
import { BUILDING_CONFIGS, BuildingType, EntityType, JobType, LEADER_OCCUPATION } from './gameTypes';
import { prisonPrisonerCapacity } from './prisonShifts';
import type { Building, Entity } from './gameTypes';
import { countWorkersAtBuilding, detachWorkplaceReference } from './workforce';
import { countResidentsInBuilding, getResidenceCapacity } from './housingModel';
import { getSimRng } from './simRng';

/** Human-form body metrics restored when a werewolf reverts (policy lives in `moonHowler.ts`). */
export const HUMAN_FORM = { maxEnergy: 500, speed: 2.25, size: 10 };

function countPrisonersAtBuilding(humans: Entity[], prisonId: number, excludeId?: number): number {
  return humans.filter(
    (e) =>
      e.alive
      && e.type === EntityType.Human
      && e.prisonBuildingId === prisonId
      && e.id !== excludeId,
  ).length;
}

function prisonPrisonerCap(): number {
  return prisonPrisonerCapacity(BUILDING_CONFIGS[BuildingType.Prison].maxOccupants);
}

export function isSettlerRelationshipEntity(entity: Entity | undefined): entity is Entity {
  if (!entity?.alive) return false;
  if (entity.type === EntityType.Human) return true;
  return entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
}

export interface RevertToHumanFormOptions {
  buildings?: Building[];
  humans?: Entity[];
  tick?: number;
  villageLeaderId?: number | null;
}

export function revertToHumanForm(were: Entity, opts?: RevertToHumanFormOptions): void {
  const cfg = HUMAN_FORM;
  const saved = were.moonHowlerSaved;
  const buildings = opts?.buildings;
  const humans = opts?.humans;
  const tick = opts?.tick;
  const savedOccupation = saved?.occupation;
  // `null` is how `villageLeadership` spells "office vacant", so an explicitly vacant office must not
  // hand the `village_leader` label back; an absent option (undefined) still means "caller cannot say".
  const holderId = opts?.villageLeaderId;
  const staleLeaderOccupation =
    savedOccupation === LEADER_OCCUPATION
    && (holderId === null || (holderId != null && holderId !== were.id));
  const restoredOccupation = staleLeaderOccupation ? 'settler' : (savedOccupation ?? 'settler');

  were.type = EntityType.Human;
  were.maxEnergy = saved?.maxEnergy ?? cfg.maxEnergy;
  were.energy = Math.min(were.maxEnergy, saved?.energy ?? cfg.maxEnergy * 0.55);
  were.needs = saved?.needs ? { ...saved.needs } : undefined;
  normalizeHumanNeeds(were);
  rebaseHumanNeedsClockAfterFormRestore(were, tick);
  were.energy = were.maxEnergy * were.needs!.stamina / 100;
  were.speed = saved?.speed ?? cfg.speed;
  were.size = saved?.size ?? cfg.size;
  were.relationshipStatus = saved?.relationshipStatus;
  were.partnerId = saved?.partnerId;
  were.affairPartnerId = saved?.affairPartnerId;
  were.affairProgress = saved?.affairProgress ?? 0;
  were.courtshipPartnerId = saved?.courtshipPartnerId;
  were.courtshipProgress = saved?.courtshipProgress ?? 0;
  were.youthLovePartnerId = saved?.youthLovePartnerId;
  were.youthLoveProgress = saved?.youthLoveProgress;
  were.youthLoveStartedDay = saved?.youthLoveStartedDay;
  were.pregnant = saved?.pregnant;
  were.pregnantById = saved?.pregnantById;
  were.pregnancyFromYouthLove = saved?.pregnancyFromYouthLove;
  were.pregnancyProgress = saved?.pregnancyProgress;
  // Restored with the other two pregnancy fields: `pregnancyDueProgress` is the field the invariant
  // check pairs with `pregnant`, and it was declared in the saved form without ever being restored
  were.pregnancyDueProgress = saved?.pregnancyDueProgress;
  were.huntTargetId = saved?.huntTargetId;
  were.combatTicks = saved?.combatTicks ?? 0;
  were.moonHowlerSaved = undefined;
  were.flash = 8;

  were.job = JobType.Settler;
  were.occupation = restoredOccupation === LEADER_OCCUPATION ? LEADER_OCCUPATION : 'settler';
  detachWorkplaceReference(were);
  moveResident(were, undefined, 'moon-form', { buildings });
  were.prisonBuildingId = undefined;
  were.prisonerUntilTick = undefined;
  were.prisonSentenceCrime = undefined;

  if (!were.alive || !saved) return;

  if (!buildings || !humans) {
    const sentenceActive =
      saved.prisonBuildingId != null
      && saved.prisonerUntilTick != null
      && (tick == null || tick < saved.prisonerUntilTick);
    if (sentenceActive) {
      were.prisonBuildingId = saved.prisonBuildingId;
      were.prisonerUntilTick = saved.prisonerUntilTick;
      were.prisonSentenceCrime = saved.prisonSentenceCrime;
      return;
    }
    were.job = saved.job ?? JobType.Settler;
    were.occupation = restoredOccupation;
    were.workerBuildingId = saved.workerBuildingId;
    // Without the building roster there is no bed-cap context; let the housing pass seat them
    // rather than restoring a possibly-retaken bed through the writer.
    if (!buildings) {
      were.residenceBuildingId = undefined;
      return;
    }
    moveResident(were, saved.residenceBuildingId, 'moon-form', { buildings });
    return;
  }

  const sentenceActive =
    saved.prisonBuildingId != null
    && saved.prisonerUntilTick != null
    && (tick == null || tick < saved.prisonerUntilTick);

  if (sentenceActive) {
    const prison = buildings.find(
      (b) => b.id === saved.prisonBuildingId && b.completed && b.type === BuildingType.Prison,
    );
    if (prison) {
      const cap = prisonPrisonerCap();
      const held = countPrisonersAtBuilding(humans, prison.id, were.id);
      if (held < cap) {
        were.prisonBuildingId = prison.id;
        were.prisonerUntilTick = saved.prisonerUntilTick;
        were.prisonSentenceCrime = saved.prisonSentenceCrime;
        if (!prison.occupants.includes(were.id)) prison.occupants.push(were.id);
        were.x = prison.x + (getSimRng('moonHowler')() - 0.5) * 12;
        were.y = prison.y + (getSimRng('moonHowler')() - 0.5) * 8;
        were.vx = 0;
        were.vy = 0;
        return;
      }
    }
  }

  if (saved.workerBuildingId != null) {
    const jobSite = buildings.find((b) => b.id === saved.workerBuildingId && b.completed && b.faction !== 'rival');
    if (jobSite) {
      const maxOcc = BUILDING_CONFIGS[jobSite.type]?.maxOccupants ?? 0;
      const workers = countWorkersAtBuilding(humans, jobSite.id);
      if (workers < maxOcc) {
        were.workerBuildingId = jobSite.id;
        were.job = saved.job ?? JobType.Settler;
        were.occupation = restoredOccupation;
        if (!jobSite.occupants.includes(were.id)) jobSite.occupants.push(were.id);
      }
    }
  }

  if (saved.residenceBuildingId != null) {
    const home = buildings.find(
      (b) => b.id === saved.residenceBuildingId && b.completed && b.faction !== 'rival',
    );
    if (home) {
      const cap = getResidenceCapacity(home);
      const residents = countResidentsInBuilding(humans, home.id);
      const isLeaderManor = home.type === BuildingType.LeaderHouse && were.id === opts?.villageLeaderId;
      if (isLeaderManor || residents < cap) {
        moveResident(were, home.id, 'moon-form', { buildings });
        if (!home.occupants.includes(were.id)) home.occupants.push(were.id);
      }
    }
  }
}

/**
 * Death path: a cursed settler that dies in werewolf form is put back into human form first, so the
 * death is recorded against the settler rather than the monster.
 */
export function finalizeMoonHowlerDeath(entity: Entity): void {
  if (!entity.moonHowlerCursed || entity.type !== EntityType.Werewolf) return;
  revertToHumanForm(entity);
}
