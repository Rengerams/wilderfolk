import type { Entity, WorldState } from './gameTypes';
import { formatCitizenName } from './citizenId';
import { logEvent } from './eventLog';
import { unindexEntityFromState } from './entityIndex';

const CAPTURE_HISTORY_LIMIT = 200;

/** A single identity-linked custody record is updated rather than replaying captures or rewards. */
export function recordWarPrisonerOutcome(state: WorldState, person: Entity,
  status: NonNullable<WorldState['raidPrisonerHistory']>[number]['status']): void {
  const custody = person.warCaptive;
  if (!custody) return;
  const previous = (state.raidPrisonerHistory ?? []).filter((entry) => entry.entityId !== person.id);
  state.raidPrisonerHistory = [...previous.slice(-(CAPTURE_HISTORY_LIMIT - 1)), {
    entityId: person.id, name: formatCitizenName(person), raidId: custody.raidId,
    originRivalId: custody.originRivalId, status, tick: state.tick,
  }];
  logEvent(state, 'prison', `${formatCitizenName(person)} — enemy combatant ${status}`, formatCitizenName(person));
}

/** A released or escaped captive leaves alive; departure is never recorded as a death. */
export function departWarPrisoner(state: WorldState, person: Entity, status: 'released' | 'escaped'): void {
  if (!person.warCaptive) return;
  recordWarPrisonerOutcome(state, person, status);
  const home = state.rivalSettlements.find((rival) => rival.id === person.warCaptive!.originRivalId);
  if (home) home.population++;
  for (const building of state.buildings) building.occupants = building.occupants.filter((id) => id !== person.id);
  person.prisonBuildingId = undefined;
  person.prisonerUntilTick = undefined;
  person.departedAlive = true;
  unindexEntityFromState(state, person.id);
  state.entities = state.entities.filter((entry) => entry.id !== person.id);
}

