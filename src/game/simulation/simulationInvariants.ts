/**
 * Simulation governance invariants — the hard "always true" state contract from
 * SIMULATION_AUTHORITY.md §5, implemented as a read-only collector (§10).
 *
 * Unlike `simInvariants.ts` (runtime sanity: NaN positions, negative resources,
 * orphaned bonds), this module checks the *ownership* invariants:
 *
 *   - a living human appears in at most one workplace/crew occupants list
 *   - `homeBuildingId` ↔ workplace occupants agree in both directions
 *   - `residenceBuildingId` ↔ residence occupants agree in both directions
 *   - no stale references to demolished/missing buildings or entities
 *   - pregnancy state has a valid `pregnancyDueProgress` (and non-pregnant
 *     humans carry no pregnancy parent/progress state)
 *   - at most one living cursed Moon Howler
    *   - the elected leader is an acting village head retaining the leader
   *     occupation and residing in the Leader's House when a completed manor exists

 *
 * IMPORTANT — occupants is role-overloaded (buildings.ts):
 *   - workplaces (completed BUILDING_JOB_TYPES): workers via `homeBuildingId`
 *   - residences (completed House/Mansion/LeaderHouse): residents via
 *     `residenceBuildingId` (synced by dayCycle.syncResidenceOccupants)
 *   - construction crews (incomplete buildings): builders, no `homeBuildingId`
 *   - prison (completed): guards via `homeBuildingId` + prisoners via
 *     `prisonBuildingId`
 *   - no-occupant buildings (roads, walls, wells, barns, decor): must be empty
 *
 * A settler legitimately appears in TWO occupants lists at once (one residence +
 * one workplace), so duplicate detection is per-role, never global.
 *
 * This module only detects and reports. The owning transition performs repairs.
 * It never mutates state — safe to run after worker command results and after
 * daily transitions in development mode and tests.
 */
import type { Building, Entity, WorldState } from '../gameTypes';
import { BuildingType, EntityType, BUILDING_JOB_TYPES, LEADER_OCCUPATION } from '../gameTypes';
import { isActingVillageHead } from '../villageLeadership';
import { BUILDING_CONFIGS } from '../buildings';
import { isResidenceBuildingType } from '../dayCycle';

type BuildingRole = 'prison' | 'residence' | 'workplace' | 'crew' | 'none';

/** Classify a building's occupants role for invariant checking. */
export function buildingOccupantRole(building: Building): BuildingRole {
  if (building.completed && building.type === BuildingType.Prison) return 'prison';
  if (building.completed && isResidenceBuildingType(building.type)) return 'residence';
  if (building.completed && BUILDING_JOB_TYPES[building.type] != null) return 'workplace';
  if (!building.completed && (BUILDING_CONFIGS[building.type]?.maxOccupants ?? 0) > 0) return 'crew';
  return 'none';
}

/** A cursed werewolf in full-moon form is still a settler for assignment checks. */
function isSettlerEntity(entity: Entity): boolean {
  if (!entity.alive) return false;
  if (entity.type === EntityType.Human) return true;
  return entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
}

export function collectSimulationInvariantErrors(state: WorldState): string[] {
  const errors: string[] = [];
  const buildingById = new Map<number, Building>();
  for (const building of state.buildings) buildingById.set(building.id, building);

  const entityById = new Map<number, Entity>();
  for (const entity of state.entities) entityById.set(entity.id, entity);

  // Per-role occupant tracking — a human may hold one workplace AND one
  // residence at the same time, but never two of the same role.
  const workplaceByHuman = new Map<number, number>();
  const crewByHuman = new Map<number, number>();
  const residenceByHuman = new Map<number, number>();

  for (const building of state.buildings) {
    const role = buildingOccupantRole(building);
    for (const occupantId of building.occupants) {
      const occupant = entityById.get(occupantId);
      if (!occupant) {
        errors.push(
          `building #${building.id} (${building.type}) occupants references missing entity ${occupantId}`,
        );
        continue;
      }
      if (!occupant.alive) {
        errors.push(
          `building #${building.id} (${building.type}) occupants references dead entity ${occupantId}`,
        );
        continue;
      }

      switch (role) {
        case 'workplace': {
          if (occupant.homeBuildingId !== building.id) {
            errors.push(
              `human ${occupantId} listed in workplace #${building.id} (${building.type}) occupants but homeBuildingId is ${occupant.homeBuildingId ?? 'unset'}`,
            );
          }
          const existing = workplaceByHuman.get(occupantId);
          if (existing != null && existing !== building.id) {
            errors.push(
              `human ${occupantId} assigned to multiple workplaces (#${existing} and #${building.id})`,
            );
          } else {
            workplaceByHuman.set(occupantId, building.id);
          }
          break;
        }
        case 'crew': {
          if (occupant.homeBuildingId != null) {
            errors.push(
              `human ${occupantId} on construction crew #${building.id} but also holds workplace #${occupant.homeBuildingId}`,
            );
          }
          const existing = crewByHuman.get(occupantId);
          if (existing != null && existing !== building.id) {
            errors.push(
              `human ${occupantId} on multiple construction crews (#${existing} and #${building.id})`,
            );
          } else {
            crewByHuman.set(occupantId, building.id);
          }
          break;
        }
        case 'residence': {
          if (occupant.residenceBuildingId !== building.id) {
            errors.push(
              `human ${occupantId} listed in residence #${building.id} occupants but residenceBuildingId is ${occupant.residenceBuildingId ?? 'unset'}`,
            );
          }
          const existing = residenceByHuman.get(occupantId);
          if (existing != null && existing !== building.id) {
            errors.push(
              `human ${occupantId} assigned to multiple residences (#${existing} and #${building.id})`,
            );
          } else {
            residenceByHuman.set(occupantId, building.id);
          }
          break;
        }
        case 'prison': {
          const isPrisoner = occupant.prisonBuildingId === building.id;
          const isGuard = occupant.homeBuildingId === building.id;
          if (!isPrisoner && !isGuard) {
            errors.push(
              `human ${occupantId} in prison #${building.id} is neither prisoner (prisonBuildingId) nor guard (homeBuildingId)`,
            );
          }
          break;
        }
        case 'none': {
          errors.push(
            `building #${building.id} (${building.type}) should have no occupants but lists ${occupantId}`,
          );
          break;
        }
      }
    }
  }

  // Reverse per-entity checks: every assignment field must point at a real
  // building and be reflected in that building's occupants.
  for (const entity of state.entities) {
    if (!isSettlerEntity(entity)) continue;
    const id = entity.id;

    if (entity.homeBuildingId != null) {
      const site = buildingById.get(entity.homeBuildingId);
      if (!site) {
        errors.push(
          `human ${id} homeBuildingId ${entity.homeBuildingId} references demolished or missing building`,
        );
      } else if (!site.completed || BUILDING_JOB_TYPES[site.type] == null) {
        errors.push(
          `human ${id} homeBuildingId ${entity.homeBuildingId} is not a completed workplace (${site.type})`,
        );
      } else if (!site.occupants.includes(id)) {
        errors.push(
          `human ${id} homeBuildingId ${entity.homeBuildingId} missing from that workplace's occupants`,
        );
      }
    }

    if (entity.residenceBuildingId != null) {
      const home = buildingById.get(entity.residenceBuildingId);
      if (!home) {
        errors.push(
          `human ${id} residenceBuildingId ${entity.residenceBuildingId} references demolished or missing building`,
        );
      } else if (!isResidenceBuildingType(home.type)) {
        errors.push(
          `human ${id} residenceBuildingId ${entity.residenceBuildingId} is not a residence (${home.type})`,
        );
      } else if (!home.occupants.includes(id)) {
        errors.push(
          `human ${id} residenceBuildingId ${entity.residenceBuildingId} missing from that residence's occupants`,
        );
      }
    }

    if (entity.prisonBuildingId != null) {
      const prison = buildingById.get(entity.prisonBuildingId);
      if (!prison) {
        errors.push(
          `human ${id} prisonBuildingId ${entity.prisonBuildingId} references demolished or missing building`,
        );
      } else if (prison.type !== BuildingType.Prison) {
        errors.push(
          `human ${id} prisonBuildingId ${entity.prisonBuildingId} is not a Prison (${prison.type})`,
        );
      } else if (!prison.occupants.includes(id)) {
        errors.push(
          `human ${id} prisonBuildingId ${entity.prisonBuildingId} missing from that prison's occupants`,
        );
      }
    }

    // Youth-love invariants — daily reconciliation repairs stale links; this collector only reports them.
    if (entity.youthLovePartnerId != null) {
      const sweetheart = entityById.get(entity.youthLovePartnerId);
      if (!sweetheart || !isSettlerEntity(sweetheart)) {
        errors.push(`human ${id} youthLovePartnerId ${entity.youthLovePartnerId} references a missing or invalid settler`);
      } else if (sweetheart.youthLovePartnerId !== id) {
        errors.push(`human ${id} youth-love link with ${sweetheart.id} is not mutual`);
      }
      if (entity.partnerId != null) {
        errors.push(`human ${id} has both a youth-love partner and an adult partner`);
      }
    }

    // Pregnancy invariants (humanLifecycle clears these fields at birth).
    if (entity.pregnant) {
      const due = entity.pregnancyDueProgress;
      if (due == null || !Number.isFinite(due) || due <= 0) {
        errors.push(`human ${id} is pregnant without a valid pregnancyDueProgress`);
      }
    } else {
      if (entity.pregnancyDueProgress != null) {
        errors.push(`human ${id} is not pregnant but retains pregnancyDueProgress`);
      }
      if (entity.pregnantById != null) {
        errors.push(`human ${id} is not pregnant but retains pregnantById`);
      }
    }
  }

  // Moon Howler invariant — at most one living cursed entity.
  const livingHowlers = state.entities.filter((e) => e.alive && e.moonHowlerCursed);
  if (livingHowlers.length > 1) {
    errors.push(
      `multiple living Moon Howlers: ${livingHowlers.length} (${livingHowlers.map((h) => h.id).join(', ')})`,
    );
  }

  // Leader residency invariants.
  if (state.villageLeaderId != null) {
    const leader = state.entities.find((e) => e.id === state.villageLeaderId);
    if (!leader || !isActingVillageHead(leader, state)) {
      errors.push(
        `villageLeaderId ${state.villageLeaderId} does not reference a living acting village head`,
      );
    } else {
      if (leader.occupation !== LEADER_OCCUPATION) {
        errors.push(`leader ${leader.id} does not hold the "${LEADER_OCCUPATION}" occupation`);
      }
      const manor = state.buildings.find(
        (b) => b.type === BuildingType.LeaderHouse && b.completed && b.faction !== 'rival',
      );
      if (manor && leader.prisonBuildingId == null && leader.residenceBuildingId !== manor.id) {
        errors.push(`leader ${leader.id} not residing in the Leader's House (#${manor.id})`);
      }
    }
  }

  return errors;
}

/**
 * Development assertion wrapper — throws on the first violation with the full
 * error list. Keep the collector available to tests and diagnostics; only call
 * the assertion from development harnesses (never repair state here).
 */
export function assertSimulationInvariants(state: WorldState): void {
  const errors = collectSimulationInvariantErrors(state);
  if (errors.length > 0) {
    throw new Error(`Simulation invariants violated (${errors.length}):\n${errors.join('\n')}`);
  }
}
