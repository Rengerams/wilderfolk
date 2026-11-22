/** Inspector-only movement projection. Reads caravan and pathfinding owners; never steers or writes. */
import type { Building, Entity, WorldState } from './gameTypes';
import { getBuildingConfig } from './buildingConfig';
import { isPlayerHuman } from './playerHuman';
import { findHumanWorkplace } from './workforce';
import { getHourOfDay } from './dayCycleClock';
import { isOnWorkScheduleShift } from './workSchedule';
import { getHumanActivityProjection, isAtActivityTarget } from './humanStatus';
import type { HumanActivityTarget } from './humanStatus';
import { pickSocialImpulse } from './socialLife';
import { socialImpulseNearbyAdults } from './humanLeisureBehavior';
import { getRouteObstruction } from './pathfinding';
import { getCaravanMoveTarget } from './tradeCaravans';
import type { ExplanationLine } from './explanationLines';



export type SettlerRouteStopKind = 'home' | 'workplace' | 'venue';

/** One named stop on a settler's day route. Names come from `BUILDING_CONFIGS`, never from the view. */
export interface SettlerRouteStop {
  kind: SettlerRouteStopKind;
  label: string;
  buildingId: number;
}

export type HumanMovementStatus =
  /** No leg in progress — nothing for the path owner to report. */
  | 'none'
  /** The straight line is walkable. */
  | 'clear'
  /** The line is blocked but the walk is routed around it. */
  | 'rerouting'
  /** The route search ran out of budget without a conclusive answer. */
  | 'pending'
  /** The line is blocked and no route exists. */
  | 'blocked';

/** Shared wording, one read-only presentation of the pathfinder verdict. */
const PATH_STATUS_LINES: Record<Exclude<HumanMovementStatus, 'none'>, Pick<ExplanationLine, 'value' | 'tone'>> = {
  clear: { value: 'Clear — nothing blocks this leg.', tone: 'good' },
  rerouting: { value: 'Rerouting — the direct line is blocked, so they walk around.', tone: 'warn' },
  pending: { value: 'Checking route — the search budget was exhausted; reachability is unresolved.', tone: 'warn' },
  blocked: { value: 'Blocked — no walkable route found; movement is stopped.', tone: 'warn' },
};

/** Read-only movement answer for the selected settler (`Roadmap_V0_6.4.1.MD` line 27). */
export interface HumanMovementExplanation {
  /** The day's stops in the order the simulation takes them: home → workplace → venue → home. */
  stops: SettlerRouteStop[];
  /** Index in {@link stops} of the stop being walked to, or `null` when no leg is in progress. */
  legIndex: number | null;
  /** `"House → Lumber Mill"` for the current leg, or `null` when there is none. */
  legLabel: string | null;
  status: HumanMovementStatus;
  lines: ExplanationLine[];
}

/** Index of the last stop matching `predicate`, or -1. */
function lastStopIndex(stops: SettlerRouteStop[], predicate: (stop: SettlerRouteStop) => boolean): number {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (predicate(stops[i]!)) return i;
  }
  return -1;
}

/**
 * The stop the activity owner is sending this settler to, or `null` when none of the day's
 * stops is that destination. Standing at it is not a leg — that test is the owner's.
 */
function resolveLegIndex(
  settler: Entity,
  stops: SettlerRouteStop[],
  target: HumanActivityTarget | null,
): number | null {
  if (!target || isAtActivityTarget(settler, target)) return null;
  if (target.kind === 'home') {
    const index = lastStopIndex(stops, (stop) => stop.kind === 'home');
    return index > 0 ? index : null;
  }
  if (target.buildingId != null) {
    const index = stops.findIndex((stop) => stop.kind !== 'home' && stop.buildingId === target.buildingId);
    if (index > 0) return index;
  }
  if (target.kind === 'nearby-building') {
    const index = stops.findIndex((stop) => stop.kind === 'venue');
    if (index > 0) return index;
  }
  return null;
}

/**
 * The free-time venue the social owner names for this settler, if any: only outside the
 * work shift, and never for a child.
 */
function settlerVenue(state: WorldState, settler: Entity): Building | undefined {
  if (settler.isJuvenile) return undefined;
  if (isOnWorkScheduleShift(state, getHourOfDay(state.tick))) return undefined;
  const nearbyAdults = socialImpulseNearbyAdults({
    state,
    entity: settler,
    allHumans: state.entities,
    humanSocialGrid: undefined,
    width: state.width,
    height: state.height,
    livingHumanAt: (id) => (id == null ? undefined : state.entities.find((entity) => entity.id === id)),
  });
  return pickSocialImpulse(settler, state, state.buildings, nearbyAdults, []).building;
}

/**
 * Read-only movement explanation for one settler: the day's named stops in order, the leg
 * they are on, and the path owner's blocked/rerouting state. Nothing here writes state.
 */
export function explainHumanMovement(state: WorldState, settlerId: number): HumanMovementExplanation {
  const subject = state.entities.find((e) => e.id === settlerId && e.alive);
  if (subject?.faction === 'trade_caravan') {
    const route = state.tradeRoutes.find((r) => r.id === subject.groupId && r.active);
    const target = getCaravanMoveTarget(state, subject);
    const leg = route?.caravanLeg ?? 'outbound';
    const waiting = leg === 'at_partner' || (route?.caravanWaitTicks ?? 0) > 0;
    const status: HumanMovementStatus = target && !waiting
      ? getRouteObstruction(state.worldMap, state.buildings, subject, target)
      : 'none';
    const legLabel = !route ? null : leg === 'outbound'
      ? `Village → ${route.targetName}`
      : leg === 'inbound' ? `${route.targetName} → Village` : `At ${route.targetName}`;
    const lines: ExplanationLine[] = [
      { label: 'Trade route', value: route?.targetName ?? 'No active route for this merchant.', tone: route ? 'neutral' : 'warn' },
    ];
    if (legLabel) lines.push({ label: 'Journey', value: legLabel, tone: 'neutral' });
    if (!target) {
      lines.push({ label: 'Path', value: 'No active route or destination — caravan cannot move.', tone: 'warn' });
    } else if (waiting) {
      lines.push({ label: 'Movement', value: leg === 'at_partner'
        ? 'Waiting at the trade partner to unload.' : 'Waiting for home storage before unloading.', tone: 'neutral' });
    } else {
      lines.push({ label: 'Destination',
        value: `${leg === 'inbound' ? 'Village' : route?.targetName ?? 'Partner'} (${Math.round(target.x)}, ${Math.round(target.y)})`, tone: 'neutral' });
      lines.push({ label: 'Path', ...PATH_STATUS_LINES[status as Exclude<HumanMovementStatus, 'none'>] });
    }
    return { stops: [], legIndex: null, legLabel, status, lines };
  }
  const settler = subject && isPlayerHuman(subject) ? subject : undefined;
  if (!settler) {
    return {
      stops: [],
      legIndex: null,
      legLabel: null,
      status: 'none',
      lines: [{ label: 'Movement', value: 'Settler not found or no longer alive.', tone: 'warn' }],
    };
  }

  const residence = settler.residenceBuildingId != null
    ? state.buildings.find((building) => building.id === settler.residenceBuildingId) ?? null
    : null;
  const homeStop: SettlerRouteStop | null = residence
    ? { kind: 'home', label: buildingLabel(residence), buildingId: residence.id }
    : null;
  const workplace = findHumanWorkplace(settler, state.buildings);
  const venue = settlerVenue(state, settler);

  const stops: SettlerRouteStop[] = [];
  if (homeStop) stops.push(homeStop);
  if (workplace) stops.push({ kind: 'workplace', label: buildingLabel(workplace), buildingId: workplace.id });
  if (venue) stops.push({ kind: 'venue', label: buildingLabel(venue), buildingId: venue.id });
  // The walk home closes the day — only worth a stop once there is somewhere to walk back from.
  if (homeStop && stops.length > 1) stops.push(homeStop);

  const activity = getHumanActivityProjection(state, settler);
  const legIndex = resolveLegIndex(settler, stops, activity.target);
  const legLabel = legIndex != null && legIndex > 0
    ? `${stops[legIndex - 1]!.label} → ${stops[legIndex]!.label}`
    : null;

  const lines: ExplanationLine[] = [];
  lines.push({
    label: 'Route today',
    value: stops.length === 0
      ? 'No home or workplace assigned yet.'
      : stops.length === 1
        ? `${stops[0]!.label} — no other stop assigned.`
        : stops.map((stop) => stop.label).join(' → '),
    tone: 'neutral',
  });

  let status: HumanMovementStatus = 'none';
  if (legIndex != null && legLabel != null && activity.target) {
    const obstruction = getRouteObstruction(state.worldMap, state.buildings, settler, activity.target);
    status = obstruction;
    lines.push({ label: 'Current leg', value: legLabel, tone: 'neutral' });
    lines.push({ label: 'Path', ...PATH_STATUS_LINES[obstruction] });;
  }

  return { stops, legIndex, legLabel, status, lines };
}
