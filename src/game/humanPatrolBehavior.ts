import type { Entity, WorldState } from './gameTypes';
import { addFloatingText } from './simEffects';
import { isRaidMarchingForRival } from './frontierCombat';
import { logEvent } from './eventLog';
import { revealRivalGroup } from './watchtowerDetection';

const PATROL_DETECTION_RADIUS = 150;

/** One marching raider, paired with the war-band it belongs to. */
export interface PatrolRaider {
  readonly groupId: string;
  readonly rival: Entity;
}

/**
 * The per-tick patrol-reveal lookup: which rivals are marching, and who shares each group.
 *
 * The reveal rule reads only `state.pendingRaidEvents` (through `isRaidMarchingForRival`) and the
 * rival list, so it is a property of the tick rather than of the guard looking. `tickHumans` builds
 * this once and every barracks guard on shift reuses it; the reveal used to walk the entire human
 * list twice *per guard per tick* for ~10 hours of every day.
 * Both fields keep human-list order, so which group is revealed first is unchanged.
 */
export interface PatrolRevealIndex {
  readonly marchingRaiders: readonly PatrolRaider[];
  readonly membersByGroup: ReadonlyMap<string, readonly Entity[]>;
}

/** Collect the marching rival war-bands for this tick — call once per tick, not once per guard. */
export function buildPatrolRevealIndex(state: WorldState, humans: readonly Entity[]): PatrolRevealIndex {
  const marchingRaiders: PatrolRaider[] = [];
  const membersByGroup = new Map<string, Entity[]>();
  for (const rival of humans) {
    if (rival.faction !== 'rival' || !rival.groupId) continue;
    const groupId = rival.groupId;
    const members = membersByGroup.get(groupId);
    if (members) members.push(rival);
    else membersByGroup.set(groupId, [rival]);
    if (isRaidMarchingForRival(state, groupId)) marchingRaiders.push({ groupId, rival });
  }
  return { marchingRaiders, membersByGroup };
}

/**
 * Reveal marching rival raiders when a player soldier comes within patrol range.
 *
 * One log line per group, once: the first guard to spot a group clears `hiddenFromPlayer` and the
 * `newlyDetected` test keeps every later guard in the same tick silent.
 */
export function detectRaidersForPatrol(
  state: WorldState,
  soldier: Entity,
  index: PatrolRevealIndex,
): void {
  const detectedGroups = new Set<string>();
  for (const { groupId, rival } of index.marchingRaiders) {
    if (!rival.alive) continue;
    if (Math.hypot(rival.x - soldier.x, rival.y - soldier.y) > PATROL_DETECTION_RADIUS) continue;
    detectedGroups.add(groupId);
  }
  for (const groupId of detectedGroups) {
    // The reveal rule itself lives in `watchtowerDetection.revealRivalGroup` — this path and the
    // watchtower path both end in "clear `hiddenFromPlayer`, set `detectedByPatrol`, announce once per
    // band", so it is written once. A soldier who spots one raider reveals the
    // whole band, so no per-member gate is passed.
    const { newlyDetected } = revealRivalGroup(index.membersByGroup.get(groupId) ?? []);
    if (newlyDetected) {
      logEvent(state, 'event', `Soldier patrol spotted hostile raiders from ${groupId}`, groupId);
      addFloatingText(state, soldier.x, soldier.y - 18, 'Enemy spotted', '#f97316');
    }
  }
}
