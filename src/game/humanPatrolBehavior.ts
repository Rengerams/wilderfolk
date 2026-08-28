import type { Entity, WorldState } from './gameTypes';
import { addFloatingText } from './simEffects';
import { isRaidMarchingForRival } from './frontierCombat';
import { logEvent } from './eventLog';

const PATROL_DETECTION_RADIUS = 150;

/** Reveal marching rival raiders when a player soldier comes within patrol range. */
export function detectRaidersForPatrol(state: WorldState, soldier: Entity, humans: Entity[]): void {
  const detectedGroups = new Set<string>();
  for (const rival of humans) {
    if (
      !rival.alive
      || rival.faction !== 'rival'
      || !rival.groupId
      || !isRaidMarchingForRival(state, rival.groupId)
      || Math.hypot(rival.x - soldier.x, rival.y - soldier.y) > PATROL_DETECTION_RADIUS
    ) continue;
    detectedGroups.add(rival.groupId);
  }
  for (const groupId of detectedGroups) {
    let newlyDetected = false;
    for (const rival of humans) {
      if (rival.alive && rival.faction === 'rival' && rival.groupId === groupId) {
        if (rival.hiddenFromPlayer) newlyDetected = true;
        rival.hiddenFromPlayer = false;
        rival.detectedByPatrol = true;
      }
    }
    if (newlyDetected) {
      logEvent(state, 'event', `Soldier patrol spotted hostile raiders from ${groupId}`, groupId);
      addFloatingText(state, soldier.x, soldier.y - 18, 'Enemy spotted', '#f97316');
    }
  }
}
