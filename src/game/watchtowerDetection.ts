/**
 * Watchtower early raid detection — completed watchtowers reveal marching rival
 * war-bands within a fixed radius, before patrols would normally spot them.
 */
import type { Entity, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { isRaidMarchingForRival } from './frontierCombat';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';

export const WATCHTOWER_DETECTION_RADIUS = 260;

/** Daily bounded scan — completed towers only, marching rival bands only. */
export function detectRaidersFromWatchtowers(state: WorldState, humans: readonly Entity[]): void {
  // Player-owned towers only: a rival camp's own watchtower must not hand the player early
  // warning about rival raiders (or log that "A Watchtower spotted" them).
  const towers = state.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Watchtower && b.faction !== 'rival',
  );
  if (towers.length === 0) return;

  const detected = new Set<string>();
  for (const tower of towers) {
    const tx = tower.x + tower.width / 2;
    const ty = tower.y + tower.height / 2;
    for (const rival of humans) {
      if (!rival.alive || rival.faction !== 'rival' || !rival.groupId) continue;
      if (!isRaidMarchingForRival(state, rival.groupId)) continue;
      if (Math.hypot(rival.x - tx, rival.y - ty) > WATCHTOWER_DETECTION_RADIUS) continue;
      detected.add(rival.groupId);
    }
  }

  for (const groupId of detected) {
    let newlyDetected = false;
    let spotX = 0;
    let spotY = 0;
    for (const rival of humans) {
      if (!rival.alive || rival.faction !== 'rival' || rival.groupId !== groupId) continue;
      if (rival.hiddenFromPlayer) newlyDetected = true;
      rival.hiddenFromPlayer = false;
      rival.detectedByPatrol = true;
      spotX = rival.x;
      spotY = rival.y;
    }
    if (newlyDetected) {
      logEvent(state, 'event', `A Watchtower spotted hostile raiders from ${groupId}`, groupId);
      addFloatingText(state, spotX, spotY - 18, 'Enemy spotted', '#f97316');
    }
  }
}
