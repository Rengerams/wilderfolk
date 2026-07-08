import { rebuildChildrenIds } from '@/game/dayCycle';
import { isPlayerHuman } from '@/game/groupEvents';
import { isSettlerRelationshipEntity } from '@/game/moonHowler';
import { getPopulationGrowthReport, getTotalBeds } from '@/game/populationGrowth';
import type { Entity, WorldState } from '@/game/gameTypes';
import { EntityType } from '@/game/gameTypes';

export function assertSimInvariants(state: WorldState): void {
  const humans = state.entities.filter((e) => e.alive && e.type === EntityType.Human);

  for (const h of humans) {
    if (Number.isNaN(h.x) || Number.isNaN(h.y)) {
      throw new Error(`human ${h.id} has NaN coordinates`);
    }
    if (h.partnerId != null && h.relationshipStatus === 'married') {
      const partner = state.entities.find((p) => p.id === h.partnerId);
      if (!isSettlerRelationshipEntity(partner)) {
        throw new Error(`human ${h.id} married partner ${h.partnerId} missing or dead`);
      }
    }
    if (h.prisonBuildingId != null && h.residenceBuildingId != null) {
      throw new Error(`prisoner ${h.id} still has residenceBuildingId`);
    }
  }

  const playerPop = humans.filter(isPlayerHuman).length;
  const report = getPopulationGrowthReport(state);
  if (playerPop > 0) {
    const beds = getTotalBeds(state);
    if (playerPop > beds && report.tone === 'good') {
      throw new Error(`overcrowded (${playerPop} pop) but growth report tone is good`);
    }
  }

  const clone = [...humans];
  rebuildChildrenIds(clone);
  for (const h of clone) {
    for (const childId of h.childrenIds) {
      const child = humans.find((c) => c.id === childId);
      if (!child?.alive) {
        throw new Error(`parent ${h.id} lists dead/missing child ${childId}`);
      }
      if (child.motherId !== h.id && child.fatherId !== h.id) {
        throw new Error(`parent ${h.id} child ${childId} parentage mismatch`);
      }
    }
  }
}

export function livingPlayerHumans(state: WorldState): Entity[] {
  return state.entities.filter((e) => e.alive && isPlayerHuman(e));
}