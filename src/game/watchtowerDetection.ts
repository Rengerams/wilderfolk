/**
 * Watchtower early raid detection — completed watchtowers reveal marching rival
 * war-bands within a fixed radius, before patrols would normally spot them.
 */
import type { Entity, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { isRaidMarchingForRival } from './frontierCombat';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';
import { getBuildingCenter } from './buildingGeometry';

export const WATCHTOWER_DETECTION_RADIUS = 260;

/** Where — and whether — a rival band just became visible to the player. */
export interface RivalReveal {
  /** True when at least one member was still `hiddenFromPlayer`: announce once per band. */
  newlyDetected: boolean;
  /** Position of the last revealed member, for the floating-text anchor. */
  spotX: number;
  spotY: number;
}

/**
 * The reveal rule — the one place "this rival band is now visible to the player" is written:
 * `hiddenFromPlayer` is cleared, `detectedByPatrol` is set, and the caller learns whether this was
 * the *first* reveal so it can log and announce exactly once per band.
 *
 * Callers pass the band's members themselves rather than a whole human list, because that is the
 * difference between the two reveal paths: `detectRaidersFromWatchtowers` below walks all humans to
 * find who is in range of a tower, while `humanPatrolBehavior` already holds a per-tick
 * groupId → members index. Both then reveal through this function, so the three-line rule exists
 * once.
 */
export function revealRivalGroup(
  members: Iterable<Entity>,
  /**
   * Optional per-member gate. Omitted reveals the whole band, which is what a soldier patrol does —
   * spotting one raider reveals the war-band. A caller that only wants the members it can actually
   * see passes a predicate instead.
   */
  canSee?: (rival: Entity) => boolean,
): RivalReveal {
  let newlyDetected = false;
  let spotX = 0;
  let spotY = 0;
  for (const rival of members) {
    if (!rival.alive || rival.faction !== 'rival') continue;
    if (canSee && !canSee(rival)) continue;
    if (rival.hiddenFromPlayer) newlyDetected = true;
    rival.hiddenFromPlayer = false;
    rival.detectedByPatrol = true;
    spotX = rival.x;
    spotY = rival.y;
  }
  return { newlyDetected, spotX, spotY };
}

/** Daily bounded scan — completed towers only, marching rival bands only. */
export function detectRaidersFromWatchtowers(state: WorldState, humans: readonly Entity[]): void {
  // Player-owned towers only: a rival camp's own watchtower must not hand the player early
  // warning about rival raiders (or log that "A Watchtower spotted" them).
  const towers = state.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Watchtower && b.faction !== 'rival',
  );
  if (towers.length === 0) return;

  // Marching bands and their members, resolved ONCE instead of once per (tower × human).
  // `isRaidMarchingForRival` is still the only test used for "is this band marching" — it is simply
  // asked once per distinct `groupId` rather than for every tower/rival pair. On a day with no raid
  // marching this loop is the whole function: the tower sweep below used to walk every living entity
  // once per tower, grass and trees included, because the caller passes `allAlive`.
  const marchingGroups = new Set<string>();
  const marchingRivals: Entity[] = [];
  for (const rival of humans) {
    if (!rival.alive || rival.faction !== 'rival' || !rival.groupId) continue;
    if (!marchingGroups.has(rival.groupId) && isRaidMarchingForRival(state, rival.groupId)) {
      marchingGroups.add(rival.groupId);
    }
    if (marchingGroups.has(rival.groupId)) marchingRivals.push(rival);
  }
  if (marchingRivals.length === 0) return;

  // Tower-major order kept exactly as it was, so `detected` — and therefore the reveal, log and
  // floating-text order below — is built in the same order as before.
  const detected = new Set<string>();
  for (const tower of towers) {
    const { x: tx, y: ty } = getBuildingCenter(tower);
    for (const rival of marchingRivals) {
      // Unreachable: `marchingRivals` only takes entities whose `groupId` passed the guard above.
      // Present for the type-narrowing, not for the runtime.
      if (!rival.groupId) continue;
      if (Math.hypot(rival.x - tx, rival.y - ty) > WATCHTOWER_DETECTION_RADIUS) continue;
      detected.add(rival.groupId);
    }
  }

  for (const groupId of detected) {
    // `marchingRivals` already satisfies every guard `revealRivalGroup` applies and every member of
    // a marching band is in it, so the revealed set is unchanged while the ~900-wide rescan per
    // detected band is gone.
    const { newlyDetected, spotX, spotY } = revealRivalGroup(
      marchingRivals,
      (rival) => rival.groupId === groupId,
    );
    if (newlyDetected) {
      logEvent(state, 'event', `A Watchtower spotted hostile raiders from ${groupId}`, groupId);
      addFloatingText(state, spotX, spotY - 18, 'Enemy spotted', '#f97316');
    }
  }
}