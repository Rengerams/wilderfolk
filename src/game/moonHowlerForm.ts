/**
 * Moon Howler **form state** — the human form snapshot, the restore that puts a cursed settler back
 * into it, and the predicates that keep a cursed settler counted as the settler they were.
 *
 * The split exists to keep the dependency direction honest. `humanLifecycleCleanup.ts` (the death
 * primitive) and `simulationInvariants.ts` need the form rules, while `moonHowler.ts` owns the
 * Moon Howler *policy* (curse, full-moon cycle, exorcism) and is the side that calls `killHuman`.
 * Importing the policy from the primitive closes a runtime import cycle
 * (`humanLifecycleCleanup → moonHowler → … → humanLifecycleCleanup`), so the form rules live below
 * both: policy and primitive both depend on this module, and neither depends on the other through it.
 *
 * See `BUG_REPORTS/2026-09-16-runtime-import-cycles-in-the-game-module-graph.md`.
 */
import { BUILDING_CONFIGS, BuildingType, EntityType, JobType, LEADER_OCCUPATION } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import { countWorkersAtBuilding } from './workforce';
import { countResidentsInBuilding, getResidenceCapacity } from './residencyOccupancy';
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
  return Math.max(1, BUILDING_CONFIGS[BuildingType.Prison].maxOccupants - 1);
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
  const staleLeaderOccupation =
    savedOccupation === LEADER_OCCUPATION
    && opts?.villageLeaderId != null
    && opts.villageLeaderId !== were.id;
  const restoredOccupation = staleLeaderOccupation ? 'settler' : (savedOccupation ?? 'settler');

  were.type = EntityType.Human;
  were.maxEnergy = saved?.maxEnergy ?? cfg.maxEnergy;
  were.energy = Math.min(were.maxEnergy, saved?.energy ?? cfg.maxEnergy * 0.55);
  were.speed = saved?.speed ?? cfg.speed;
  were.size = saved?.size ?? cfg.size;
  were.relationshipStatus = saved?.relationshipStatus;
  were.partnerId = saved?.partnerId;
  were.affairPartnerId = saved?.affairPartnerId;
  were.affairProgress = saved?.affairProgress ?? 0;
  were.courtshipProgress = saved?.courtshipProgress ?? 0;
  were.youthLovePartnerId = saved?.youthLovePartnerId;
  were.youthLoveProgress = saved?.youthLoveProgress;
  were.youthLoveStartedDay = saved?.youthLoveStartedDay;
  were.pregnant = saved?.pregnant;
  were.pregnantById = saved?.pregnantById;
  were.pregnancyProgress = saved?.pregnancyProgress;
  were.huntTargetId = saved?.huntTargetId;
  were.combatTicks = saved?.combatTicks ?? 0;
  were.moonHowlerSaved = undefined;
  were.flash = 8;

  were.job = JobType.Settler;
  were.occupation = restoredOccupation === LEADER_OCCUPATION ? LEADER_OCCUPATION : 'settler';
  were.homeBuildingId = undefined;
  were.residenceBuildingId = undefined;
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
    were.homeBuildingId = saved.homeBuildingId;
    were.residenceBuildingId = saved.residenceBuildingId;
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

  if (saved.homeBuildingId != null) {
    const jobSite = buildings.find((b) => b.id === saved.homeBuildingId && b.completed && b.faction !== 'rival');
    if (jobSite) {
      const maxOcc = BUILDING_CONFIGS[jobSite.type]?.maxOccupants ?? 0;
      const workers = countWorkersAtBuilding(humans, jobSite.id);
      if (workers < maxOcc) {
        were.homeBuildingId = jobSite.id;
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
      if (residents < cap) {
        were.residenceBuildingId = home.id;
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
