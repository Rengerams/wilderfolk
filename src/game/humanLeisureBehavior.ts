import type { Building, Entity, WorldState } from './gameTypes';
import { EntityType, PATH_CELL } from './gameTypes';
import { enterHumanBuilding, commuteHumanToBuilding, venueGatherPosition, crowdGatherPosition, homeStandPosition, steerHumanToward, clearHumanWalkTarget } from './simulation/humanMovement';
import { faceVelocity } from './simulation/movementSteering';
import { PER_TICK_RATE_SCALE, TICKS_PER_HOUR } from './dayCycle';
import { deterministicCos, deterministicSin } from './simTrig';
import { getBuildingCenter } from './buildingGeometry';
import { getChildCustodian, hasResidenceAssignment } from './housingModel';
import { getWorkSchedule, isOnWorkScheduleShift } from './workSchedule';
import { getHourOfDay, getAbsoluteCalendarDay } from './dayCycleClock';
import { BuildingType } from './buildings';
import { pickSocialImpulse, isSocialStaggerTick, type SocialBuildingPicker } from './socialLife';
import { isPlayerHuman } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { adjustHumanStaminaFromEnergy } from './simulation/humanPhysiology';
import { requestDialogue } from './dialogueTrees';
import { isDialogueBusy } from './humanChat';
import { prefersHomeTonightFor } from './humanSchedule';
import type { TickContext } from './simulation/simulationTypes';
import { findClosestAdaptiveInRadius, forEachAdaptiveInRadius, socialAdaptiveOptions, SOCIAL_FRIENDSHIP_RADIUS } from './adaptiveSpatialQuery';
import { seededRandomForRun, personDayRoll, getSimRng, PERSON_DAY_ROLL_SALTS } from './simRng';
import { beautyAt, pickBeautySpot } from './beautyGrid';
import { addFloatingText } from './simEffects';
import { getCurrentPathGrid, getNavigationQuote, hasUnreachableWalkTarget, isGroundWalkableAt, lineCrossesBlocked, nearestWalkableWorldPoint } from './pathfinding';
import { fract } from './simulation/humanNeeds';
import { findClosestEntityInRadius } from './simQueries';
import { hasAffairPartner, canPursueSecretAffair, isAtMaritalHome } from './simulation/humanRelationships';
import { relationshipScore } from './relationships';

/** One daily play roll, not a new companion every clock hour. */
const KID_PLAY_CHANCE = 0.72;
/** Bound the candidate scan in large colonies. */
export const CHILD_PLAYMATE_CANDIDATE_LIMIT = 32;
/** Including the child: a pair, trio or four-child play circle. */
export const CHILD_PLAY_GROUP_MAX = 4;

/** 80 in-game hours: one free-time activity holds for several days, not one tick. */
const LEISURE_SLOT_TICKS = 80 * TICKS_PER_HOUR;

/**
 * Sine replacement in [-1, 1]. `Math.sin`/`Math.cos` are only implementation-approximated, so a
 * velocity derived from them can differ by an ulp between engines and drift a saved coordinate.
 */
function deterministicWave(phase: number): number {
  const t = phase - Math.floor(phase);
  return t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
}

function leisureSlotFor(tick: number, entityId: number): number {
  return Math.floor(tick / LEISURE_SLOT_TICKS + entityId * 3);
}

/**
 * The 12-way free-time activity for one settler in one leisure slot. Every branch is a run-seeded
 * stateless draw, so `setSimSeed` changes free time and a rollback cannot inherit a cached choice.
 */
export function leisureKindFor(entityId: number, tick: number, weekend: boolean): number {
  const leisureSlot = leisureSlotFor(tick, entityId);
  // The kind itself is the seeded draw; id/day arithmetic would only shift one fixed layout.
  let leisureKind = Math.floor(seededRandomForRun(`leisure-kind:${entityId}:${leisureSlot}`) * 12);
  const quietBias = personDayRoll(entityId, tick, 202) < 0.35;
  if (quietBias && personDayRoll(entityId, tick, 403 + leisureSlot) < 0.45) {
    leisureKind = leisureKind < 6 ? 10 + (leisureKind % 2) : leisureKind;
  }
  if (
    weekend
    && personDayRoll(entityId, tick, PERSON_DAY_ROLL_SALTS.leisureWeekendKind) > 0.55
    && leisureKind >= 8
  ) {
    leisureKind = Math.floor(seededRandomForRun(`leisure-weekend:${entityId}:${leisureSlot}`) * 7);
  }
  return leisureKind;
}

/** More likely to revisit real friends, without making newcomers impossible. */
function childPlayCompanionWeight(child: Entity, candidate: Entity): number {
  const bond = Math.max(
    relationshipScore(child, candidate.id, 'friend'),
    relationshipScore(candidate, child.id, 'friend'),
  );
  const dispute = Math.max(
    relationshipScore(child, candidate.id, 'feud'),
    relationshipScore(candidate, child.id, 'feud'),
  );
  const schoolFriend = child.childhoodFriendsIds?.includes(candidate.id)
    || candidate.childhoodFriendsIds?.includes(child.id);
  return Math.max(0.2, 1
    + Math.min(6, Math.max(0, bond) / 10)
    + (schoolFriend ? 4 : 0)
    + (Math.abs(child.age - candidate.age) <= 5 ? 1 : 0)
    - Math.min(5, Math.max(0, dispute) / 10));
}

/** Pick a new reachable outdoor play stop for an entire small friend circle. */
function chooseChildPlaySite(
  state: WorldState,
  group: readonly Entity[],
  day: number,
  phase: number,
  previous: Entity['childPlaySite'],
): { x: number; y: number } | null {
  const grid = getCurrentPathGrid();
  const ids = group.map((child) => child.id).sort((a, b) => a - b);
  const midX = group.reduce((sum, child) => sum + child.x, 0) / group.length;
  const midY = group.reduce((sum, child) => sum + child.y, 0) / group.length;
  // Only on phase changes: 12 candidate checks at most, never a new scan every tick.
  for (let attempt = 0; attempt < 12; attempt++) {
    const key = `child-play-site:${ids.join('-')}:${day}:${phase}:${attempt}`;
    const angle = seededRandomForRun(`${key}:angle`) * Math.PI * 2;
    const radius = 42 + seededRandomForRun(`${key}:radius`) * 36;
    const x = (Math.floor((midX + deterministicCos(angle) * radius) / PATH_CELL) + 0.5) * PATH_CELL;
    const y = (Math.floor((midY + deterministicSin(angle) * radius) / PATH_CELL) + 0.5) * PATH_CELL;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    if (previous && Math.hypot(x - previous.x, y - previous.y) < 28) continue;
    if (!isGroundWalkableAt(x, y, grid)) continue;
    // Prefer a clear direct leg, but accept a bounded route around walls or
    // through bridges. A pending quote is not proof of reachability.
    if (grid && group.some((member) => {
      if (!isGroundWalkableAt(member.x, member.y, grid)) return true;
      if (!lineCrossesBlocked(grid, member.x, member.y, x, y)) return false;
      const quote = getNavigationQuote(grid,
        { x: Math.floor(member.x / PATH_CELL), y: Math.floor(member.y / PATH_CELL) },
        { x: Math.floor(x / PATH_CELL), y: Math.floor(y / PATH_CELL) },
        { maxNodes: 600 });
      return quote.status !== 'priced' || quote.tiles.length > 24;
    })) continue;
    return { x, y };
  }
  return null;
}

export function tickHumanChildLeisure(args: {
  state: WorldState;
  entity: Entity;
  speed: number;
  hourOfDay: number;
  onSchedule: boolean;
  allHumans: Entity[];
  entityById?: ReadonlyMap<number, Entity>;
  pickSocialBuilding?: SocialBuildingPicker;
  updatedBuildings: Building[];
  buildingById: Map<number, Building>;
  humanSocialGrid: TickContext['humanSocialGrid'];
  width: number;
  height: number;
  livingHumanAt: (id: number | null | undefined) => Entity | undefined;
  suppressIdleInitial: boolean;
}): boolean {
  if (args.entity.age >= HUMAN_ADULT_MIN_AGE || !isPlayerHuman(args.entity)) return args.suppressIdleInitial;
  const { state, entity, speed, hourOfDay, allHumans, updatedBuildings, buildingById, humanSocialGrid, width, height, livingHumanAt } = args;
  entity.childLeisureActivity = undefined;
  entity.childLeisureTargetId = undefined;
  if (args.onSchedule || args.suppressIdleInitial) return args.suppressIdleInitial;

  const day = getAbsoluteCalendarDay(state.tick);
  const byId = (id: number): Entity | undefined =>
    args.entityById?.get(id) ?? allHumans.find((human) => human.id === id);
  const assignedMate = entity.childPlaymateId == null
    ? undefined : byId(entity.childPlaymateId);
  const mateUnavailable = entity.childPlaymateId != null
    && (!assignedMate?.alive || assignedMate.age >= HUMAN_ADULT_MIN_AGE || !isPlayerHuman(assignedMate));

  // Repair a reserved circle in place when its primary companion becomes unavailable.
  // Other surviving members remain reserved for today, so a fresh neighborhood scan
  // (which excludes assigned children) would wrongly dissolve the entire circle.
  if (mateUnavailable && entity.childPlaymateDay === day) {
    const survivors = (entity.childPlayGroupIds ?? [])
      .map((id) => byId(id))
      .filter((member): member is Entity =>
        !!member?.alive && member.age < HUMAN_ADULT_MIN_AGE && isPlayerHuman(member)
        && member.childPlaymateDay === day
        && !!member.childPlayGroupIds?.includes(entity.id));
    if (survivors.length >= 2 && survivors.some((member) => member.id === entity.id)) {
      const ids = survivors.map((member) => member.id).sort((a, b) => a - b);
      for (const member of survivors) {
        if (!ids.includes(member.childPlaymateId ?? -1)) {
          member.childPlaymateId = ids.find((id) => id !== member.id);
        }
        member.childPlayGroupIds = [...ids];
        // The old destination was chosen for a different roster; all survivors
        // must agree on a new site, even if some still had a living companion.
        member.childPlaySite = undefined;
        member.childPlaySiteAttempt = undefined;
      }
    }
  }
  const currentMate = entity.childPlaymateId == null ? undefined : byId(entity.childPlaymateId);
  const needsReplacement = entity.childPlaymateId != null
    && (!currentMate?.alive || currentMate.age >= HUMAN_ADULT_MIN_AGE || !isPlayerHuman(currentMate));

  if (entity.childPlaymateDay !== day || needsReplacement) {
    entity.childPlaymateDay = day;
    entity.childPlaymateId = undefined;
    entity.childPlayGroupIds = undefined;
    entity.childPlaySite = undefined;
    entity.childPlaySiteAttempt = undefined;
    if (personDayRoll(entity.id, state.tick, 718) < KID_PLAY_CHANCE) {
      const nearby: Entity[] = [];
      const grid = getCurrentPathGrid();
      forEachAdaptiveInRadius(
        humanSocialGrid,
        allHumans,
        entity.x,
        entity.y,
        SOCIAL_FRIENDSHIP_RADIUS,
        (human) => {
          if (human.id !== entity.id && human.alive && human.age < HUMAN_ADULT_MIN_AGE
            && isPlayerHuman(human) && human.childPlaymateDay !== day
            && (!grid || !lineCrossesBlocked(grid, entity.x, entity.y, human.x, human.y))) {
            nearby.push(human);
            if (nearby.length >= CHILD_PLAYMATE_CANDIDATE_LIMIT) return false;
          }
        },
        socialAdaptiveOptions('social', allHumans.length, width, height),
      );
      const chosen: Entity[] = [];
      const targetCount = 1 + Math.floor(
        seededRandomForRun(`child-play-circle-size:${entity.id}:${day}`) * (CHILD_PLAY_GROUP_MAX - 1),
      );
      for (let slot = 0; slot < targetCount && nearby.length > 0; slot++) {
        const weights = nearby.map((candidate) => childPlayCompanionWeight(entity, candidate));
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let choice = seededRandomForRun(`child-play-circle-member:${entity.id}:${day}:${slot}`) * total;
        let index = nearby.length - 1;
        for (let i = 0; i < nearby.length; i++) {
          choice -= weights[i];
          if (choice < 0) { index = i; break; }
        }
        chosen.push(nearby.splice(index, 1)[0]!);
      }
      if (chosen.length > 0) {
        const roster = [entity, ...chosen];
        const groupIds = roster.map((member) => member.id).sort((a, b) => a - b);
        for (const member of roster) {
          member.childPlaymateDay = day;
          member.childPlaymateId = member.id === entity.id ? chosen[0]!.id : entity.id;
          member.childPlayGroupIds = [...groupIds];
          member.childPlaySite = undefined;
          member.childPlaySiteAttempt = undefined;
        }
      }
    }
  }
  const mate = entity.childPlaymateId == null ? undefined : byId(entity.childPlaymateId);
  const group = (entity.childPlayGroupIds ?? [entity.id, mate?.id].filter((id): id is number => id != null))
    .map((id) => byId(id))
    .filter((human): human is Entity =>
      !!human?.alive && human.age < HUMAN_ADULT_MIN_AGE && isPlayerHuman(human));
  const impulse = pickSocialImpulse(entity, state, updatedBuildings, [], [], args.pickSocialBuilding);

  if (!impulse.stayHome) {
    // The radius gates initial membership, not an outing already assigned to a
    // group: walking to a shared stop can temporarily separate companions.
    const reservedGroup = entity.childPlayGroupIds?.includes(entity.id)
      && entity.childPlayGroupIds.includes(mate?.id ?? -1);
    if (mate?.alive && group.length >= 2
      && (reservedGroup || Math.hypot(mate.x - entity.x, mate.y - entity.y) <= SOCIAL_FRIENDSHIP_RADIUS)) {
      const phase = Math.floor(hourOfDay / 3);
      const cachedSite = entity.childPlaySite;
      if (!cachedSite || cachedSite.day !== day || cachedSite.phase !== phase
        || cachedSite.mateId !== mate.id || !Number.isFinite(cachedSite.x)
        || !Number.isFinite(cachedSite.y) || !isGroundWalkableAt(cachedSite.x, cachedSite.y)) {
        // One stop shared by all participants, including children processed later this tick.
        const shared = group.find((member) =>
          member.childPlaySite?.day === day && member.childPlaySite.phase === phase
          && Number.isFinite(member.childPlaySite.x) && Number.isFinite(member.childPlaySite.y)
          && isGroundWalkableAt(member.childPlaySite.x, member.childPlaySite.y))?.childPlaySite;
        // A rejected search is a decision for this phase too. Without this
        // marker every eligible tick repeats 12 blocked-ground probes per child.
        const attempted = group.some((member) =>
          member.childPlaySiteAttempt?.day === day && member.childPlaySiteAttempt.phase === phase);
        if (shared || !attempted) {
          const point = shared ?? chooseChildPlaySite(state, group, day, phase, cachedSite);
          for (const member of group) {
            if (member.childPlaymateId == null) continue;
            member.childPlaySite = point
              ? { day, phase, mateId: member.childPlaymateId, x: point.x, y: point.y }
              : undefined;
            member.childPlaySiteAttempt = { day, phase };
          }
        }
      }
      const site = entity.childPlaySite;
      // Failed site searches must not turn a reserved group into a moving-target chase.
      const destinationX = site?.x ?? entity.x;
      const destinationY = site?.y ?? entity.y;
      const distance = Math.hypot(destinationX - entity.x, destinationY - entity.y);
      if (site && distance > 14) {
        steerHumanToward(entity, destinationX, destinationY, speed, 0.7,
          `child_play_${entity.id}_${mate.id}`);
      } else {
        // Stop the previous route as well as velocity: off-screen walk resumption
        // must not pull a child away from its arrived or unavailable destination.
        clearHumanWalkTarget(entity);
        entity.vx = 0;
        entity.vy = 0;
        if (seededRandomForRun(`chat-kid:${entity.id}:${state.tick}`) < 0.06 * PER_TICK_RATE_SCALE) {
          requestDialogue({
            eventKey: 'child.play', speaker: entity, tick: state.tick,
            selectionRoll: personDayRoll(entity.id, state.tick, 719),
            durationHours: 4 / TICKS_PER_HOUR,
          });
        }
      }
      faceVelocity(entity);
      entity.childLeisureActivity = 'playing';
      entity.childLeisureTargetId = mate.id;
      return true;
    }
  }
  const mother = entity.motherId != null ? livingHumanAt(entity.motherId) : undefined;
  const father = entity.fatherId != null ? livingHumanAt(entity.fatherId) : undefined;
  const freeParent = [mother, father].find((parent) => parent?.alive && isPlayerHuman(parent) && !prefersHomeTonightFor(getWorkSchedule(state), parent.id, state.tick, hourOfDay) && !isOnWorkScheduleShift(state, hourOfDay)) ?? [mother, father].find((parent) => parent?.alive);
  const follow = freeParent ?? getChildCustodian(entity, allHumans, args.entityById);
  if (follow?.alive && personDayRoll(entity.id, state.tick, 601) > 0.22) {
    const distance = Math.hypot(follow.x - entity.x, follow.y - entity.y) || 1;
    if (distance > 22) {
      steerHumanToward(entity, follow.x, follow.y, speed, 0.55, `child_follow_${entity.id}_${follow.id}`);
    } else if (distance > 14) {
      steerHumanToward(entity, follow.x, follow.y, speed, 0.18, `child_follow_${entity.id}_${follow.id}`);
    } else {
      clearHumanWalkTarget(entity);
      entity.vx = 0;
      entity.vy = 0;
    }
    entity.childLeisureActivity = 'following';
    entity.childLeisureTargetId = follow.id;
    return true;
  }
  if (hasResidenceAssignment(entity)) {
    const residence = buildingById.get(entity.residenceBuildingId!);
    if (residence?.completed) {
      if (commuteHumanToBuilding(entity, residence, speed)) enterHumanBuilding(entity, residence);
      entity.childLeisureActivity = 'home';
      return true;
    }
  }
  return args.suppressIdleInitial;
}


export function idleDestination(
  state: WorldState,
  entity: Entity,
  venues: readonly Building[],
  buildingById: ReadonlyMap<number, Building>,
): { x: number; y: number } {
  // Its own salt: sharing the scarce-hunt dialogue's 812 made the two decisions coincide exactly.
  const roll = personDayRoll(entity.id, state.tick, PERSON_DAY_ROLL_SALTS.leisureIdleDestination);

  if (roll < 0.34 && hasResidenceAssignment(entity)) {
    const home = buildingById.get(entity.residenceBuildingId!);
    if (home?.completed) return homeStandPosition(home, entity.id);
  }

  if (roll < 0.67 && venues.length > 0) {
    // The nearest of the tick's own venue list — a handful of buildings, not the whole array.
    let best = venues[0];
    let bestDist = Infinity;
    for (const b of venues) {
      const dist = Math.hypot(b.x - entity.x, b.y - entity.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }
    return venueGatherPosition(best, entity.id);
  }

  // "Go to a tree": the prettiest ground near them, spread so neighbours do not overlap.
  const pretty = pickBeautySpot(state.beautyGrid ?? null, entity.x, entity.y, 6);
  return crowdGatherPosition(pretty.x, pretty.y, entity.id);
}

/**
 * The exact nearby-adult input `pickSocialImpulse` sees: the staggered grid scan plus the spouse,
 * who may stand outside the scan radius. The movement inspector reads this owner too.
 */
export function socialImpulseNearbyAdults(args: {
  state: WorldState;
  entity: Entity;
  allHumans: readonly Entity[];
  humanSocialGrid: TickContext['humanSocialGrid'];
  width: number;
  height: number;
  livingHumanAt: (id: number | null | undefined) => Entity | undefined;
}): Entity[] {
  const { state, entity, allHumans, humanSocialGrid, width, height, livingHumanAt } = args;
  const nearbyAdults: Entity[] = [];
  if (isSocialStaggerTick(entity, state.tick)) {
    forEachAdaptiveInRadius(humanSocialGrid, allHumans, entity.x, entity.y, SOCIAL_FRIENDSHIP_RADIUS, (h) => {
      if (h.alive && isPlayerHuman(h) && h.age >= HUMAN_ADULT_MIN_AGE) nearbyAdults.push(h);
    }, socialAdaptiveOptions('social', allHumans.length, width, height));
  }
  const spouse = entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined;
  if (spouse?.alive && !nearbyAdults.some((h) => h.id === spouse.id)) nearbyAdults.push(spouse);
  return nearbyAdults;
}

function tickAdultLeisureMotive(args: {
  state: WorldState;
  entity: Entity;
  speed: number;
  allHumans: Entity[];
  pickSocialBuilding?: SocialBuildingPicker;
  updatedBuildings: Building[];
  buildingById: Map<number, Building>;
  humanSocialGrid: TickContext['humanSocialGrid'];
  width: number;
  height: number;
  livingHumanAt: (id: number | null | undefined) => Entity | undefined;
  settlerChat: (entity: Entity, context: 'social' | 'home', chance: number) => void;
  settlerPairChat: (entityA: Entity, entityB: Entity, context: 'social' | 'home', chance: number) => void;
  suppressIdleInitial: boolean;
}): { suppressIdle: boolean; spouseEarly?: Entity } {
  const { state, entity, speed, allHumans, updatedBuildings, buildingById, humanSocialGrid, width, height, livingHumanAt, settlerChat, settlerPairChat } = args;
  // Mourning is leisure, never a reason to leave a paid shift.
  // Deterministically offer rare visits to a grave of a parent, spouse or child.
  if (!isOnWorkScheduleShift(state, getHourOfDay(state.tick)) && state.graveRecords?.length) {
    const day = getAbsoluteCalendarDay(state.tick);
    if (day % 17 === entity.id % 17 && personDayRoll(entity.id, state.tick, 1621) < 0.22) {
      const relative = state.graveRecords.find((grave) =>
        grave.faction === 'player' && grave.deceasedId != null &&
        (grave.deceasedId === entity.motherId || grave.deceasedId === entity.fatherId ||
         grave.deceasedId === entity.partnerId || (entity.childrenIds ?? []).includes(grave.deceasedId))
      );
      const yard = relative ? buildingById.get(relative.graveyardId ?? -1) : undefined;
      if (yard?.completed && yard.type === BuildingType.Graveyard) {
        const spot = venueGatherPosition(yard, entity.id);
        if (Math.hypot(entity.x - spot.x, entity.y - spot.y) > 18) {
          steerHumanToward(entity, spot.x, spot.y, speed, 0.5, `leisure_grief_${entity.id}_${yard.id}`);
        } else {
          entity.vx *= 0.2;
          entity.vy *= 0.2;
        }
        return { suppressIdle: true };
      }
    }
  }
  const nearbyAdults = socialImpulseNearbyAdults({
    state, entity, allHumans, humanSocialGrid, width, height, livingHumanAt,
  });
  const spouseEarly = entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined;
  const impulse = pickSocialImpulse(entity, state, updatedBuildings, nearbyAdults, [], args.pickSocialBuilding);
  let suppressIdle = args.suppressIdleInitial;
  if (impulse.motive !== 'none') {
    if (impulse.dialogueEvent && seededRandomForRun(`chat-bubble:${entity.id}:${state.tick}`) < 0.08 * PER_TICK_RATE_SCALE && !isDialogueBusy(entity)) {
      requestDialogue({
        eventKey: impulse.dialogueEvent, speaker: entity, tick: state.tick,
        selectionRoll: impulse.dialogueRoll,
        durationHours: 4 / TICKS_PER_HOUR,
      });
    }
    if (impulse.stayHome && hasResidenceAssignment(entity)) {
      const home = buildingById.get(entity.residenceBuildingId!);
      if (home?.completed) {
        if (commuteHumanToBuilding(entity, home, speed * (impulse.motive === 'sick_day' ? 0.7 : 0.9), 1)) enterHumanBuilding(entity, home);
        if (impulse.motive === 'sick_day') adjustHumanStaminaFromEnergy(entity, 0.25 * PER_TICK_RATE_SCALE);
        suppressIdle = true;
      }
    } else if (impulse.company?.alive && impulse.building) {
      const meeting = venueGatherPosition(impulse.building, entity.id);
      const targetX = meeting.x;
      const targetY = meeting.y;
      const dist = Math.hypot(targetX - entity.x, targetY - entity.y) || 1;
      if (dist > 16) {
        steerHumanToward(
          entity,
          targetX,
          targetY,
          speed,
          0.48,
          `leisure_company_${impulse.building.id}_${entity.id}`,
        );
      } else {
        clearHumanWalkTarget(entity);
        entity.vx = 0;
        entity.vy = 0;
        if (Math.hypot(impulse.company.x - entity.x, impulse.company.y - entity.y) <= 24) {
          settlerPairChat(entity, impulse.company, 'home', 0.1);
        }
      }
      suppressIdle = true;
    } else if (impulse.company?.alive) {
      const c = impulse.company; const dist = Math.hypot(c.x - entity.x, c.y - entity.y) || 1;
      if (dist > 16) {
        steerHumanToward(entity, c.x, c.y, speed, 0.5, `leisure_person_${entity.id}_${c.id}`);
      }
      else if (impulse.motive === 'comfort_neighbor') { settlerPairChat(entity, c, 'social', 0.12); if (isPlayerHuman(c)) adjustHumanStaminaFromEnergy(c, 0.15 * PER_TICK_RATE_SCALE); }
      else if (impulse.motive === 'care_pregnant') settlerPairChat(entity, c, 'home', 0.12);
      suppressIdle = true;
    } else if (impulse.building) {
      const b = impulse.building;
  
      const spot = venueGatherPosition(b, entity.id);
      const arrived = Math.hypot(entity.x - spot.x, entity.y - spot.y) < 20;
      if (arrived) {
        clearHumanWalkTarget(entity);
        entity.vx = 0;
        entity.vy = 0;
        enterHumanBuilding(entity, b);
      }
      if (!arrived) steerHumanToward(entity, spot.x, spot.y, speed * 0.5, 1, `leisure_venue_${b.id}_${entity.id}`);
      else if (impulse.motive === 'sunday_service' || impulse.motive === 'grief' || impulse.motive === 'day_off') { entity.vx *= 0.2; entity.vy *= 0.2; if (seededRandomForRun(`chat-social:${entity.id}:${state.tick}`) < 0.05 * PER_TICK_RATE_SCALE) settlerChat(entity, 'social', 0.1); }
      else if (impulse.motive === 'market_errand' || impulse.motive === 'birthday') { adjustHumanStaminaFromEnergy(entity, 0.2 * PER_TICK_RATE_SCALE); settlerChat(entity, 'social', 0.1); }
      suppressIdle = true;
    }
  }
  return { suppressIdle, spouseEarly };
}
/**
 * Single owner of free-time selection, adult social motives, and child leisure.
 * Only sets velocity/indoor intent; humanTick performs exactly one movement integration.
 */
export function tickHumanLeisure(args: {
  state: WorldState;
  entity: Entity;
  speed: number;
  hourOfDay: number;
  onSchedule: boolean;
  allowFreeRoam: boolean;
  inSpotlightGathering: boolean;
  allHumans: Entity[];
  entityById: Map<number, Entity>;
  pickSocialBuilding?: SocialBuildingPicker;
  updatedBuildings: Building[];
  buildingById: Map<number, Building>;
  humanSocialGrid: TickContext['humanSocialGrid'];
  width: number;
  height: number;
  livingHumanAt: (id: number | null | undefined) => Entity | undefined;
  suppressIdleInitial: boolean;
  settlerChat: (entity: Entity, context: 'social' | 'home' | 'child', chance: number, partner?: Entity | null) => void;
  settlerPairChat: (entityA: Entity, entityB: Entity, context: 'social' | 'home', chance: number) => void;
  completedPoolOf: (types: readonly BuildingType[]) => Building[];
  workersByWorkplace: ReadonlyMap<number, Entity[]>;
  workerIndexById: ReadonlyMap<number, number>;
  workplace: Building | undefined;
  workSchedule: ReturnType<typeof getWorkSchedule>;
  idleVenues: readonly Building[];
  treeGrid: TickContext['treeGrid'];
  trees: readonly Entity[];
  weekend: boolean;
}): boolean {
  const {
    state, entity, speed, hourOfDay, onSchedule, allowFreeRoam, inSpotlightGathering,
    allHumans, entityById, pickSocialBuilding, updatedBuildings, buildingById, humanSocialGrid,
    width, height, livingHumanAt, settlerChat, settlerPairChat, completedPoolOf,
    workersByWorkplace, workerIndexById, workplace, workSchedule, idleVenues,
    treeGrid, trees, weekend,
  } = args;
  let suppressIdle = args.suppressIdleInitial;

  const fair = state.inventionFair;
  if (fair?.stage === 'demonstration' && allowFreeRoam && !onSchedule && !inSpotlightGathering &&
      !suppressIdle && isPlayerHuman(entity) && entity.age >= HUMAN_ADULT_MIN_AGE &&
      hourOfDay >= 7 && hourOfDay < 21 && !entity.raidDeploymentId && entity.prisonBuildingId == null) {
    const stand = fair.spectatorSlots.find((slot) => slot.humanId === entity.id);
    if (stand) {
      entity.indoorBuildingId = undefined;
      if (Math.hypot(stand.x - entity.x, stand.y - entity.y) > 12) {
        steerHumanToward(entity, stand.x, stand.y, speed, 0.7, `invention_fair_${entity.id}`);
      } else {
        entity.vx = 0;
        entity.vy = 0;
      }
      return true;
    }
  }

    // Free time & leisure
    if (
      !inSpotlightGathering && tickHumanChildLeisure({
        state,
        entity,
        speed: speed,
        hourOfDay,
        onSchedule,
        allHumans,
        entityById,
        pickSocialBuilding,
        updatedBuildings,
        buildingById,
        humanSocialGrid,
        width,
        height,
        livingHumanAt,
        suppressIdleInitial: suppressIdle,
      })
    ) {
      suppressIdle = true;
    } else if (allowFreeRoam && !suppressIdle && isPlayerHuman(entity) && entity.age >= HUMAN_ADULT_MIN_AGE) {
      const tick = state.tick;
      const absDay = getAbsoluteCalendarDay(tick);
      const leisureSlot = leisureSlotFor(tick, entity.id);
      const leisureKind = leisureKindFor(entity.id, tick, weekend);
      const phase = entity.id * 0x9e3779b9 + leisureSlot * 0x85ebca6b + absDay;
      let idleVx = 0;
      let idleVy = 0;
      let routedIdleWalk = false;

      const steerTo = (tx: number, ty: number, speedMult: number, arrive = 14, destination?: Building): boolean => {
        routedIdleWalk = false;
        idleVx = 0;
        idleVy = 0;
        // Random and social targets may fall inside a completed footprint. Use standable ground
        // before routing so an unreachable target cannot hold the settler against a wall.
        const safe = state.worldMap && !isGroundWalkableAt(tx, ty)
          ? nearestWalkableWorldPoint(state.worldMap, state.buildings, tx, ty)
          : null;
        const walkX = safe?.x ?? tx;
        const walkY = safe?.y ?? ty;
        const grid = getCurrentPathGrid();
        if (!Number.isFinite(walkX) || !Number.isFinite(walkY)
          || walkX < 0 || walkY < 0 || walkX >= width || walkY >= height
          || !isGroundWalkableAt(walkX, walkY, grid)) {
          clearHumanWalkTarget(entity);
          entity.vx = 0;
          entity.vy = 0;
          routedIdleWalk = true;
          return false;
        }
        const fallback = (): false => {
          clearHumanWalkTarget(entity);
          entity.vx = 0;
          entity.vy = 0;
          routedIdleWalk = true;
          // Rest at home if available; do not claim arrival at the original venue.
          const home = entity.residenceBuildingId == null ? undefined : buildingById.get(entity.residenceBuildingId);
          if (home?.completed && home.id !== destination?.id) {
            if (commuteHumanToBuilding(entity, home, speed * 0.4)) enterHumanBuilding(entity, home);
          }
          return false;
        };
        const rejected = entity.leisureRejectedTarget;
        if (rejected && tick < rejected.untilTick && tick >= rejected.untilTick - TICKS_PER_HOUR
          && Math.floor(rejected.x / PATH_CELL) === Math.floor(walkX / PATH_CELL)
          && Math.floor(rejected.y / PATH_CELL) === Math.floor(walkY / PATH_CELL)) {
          return fallback();
        }
        const dist = Math.hypot(walkX - entity.x, walkY - entity.y);
        // Being close across a wall or river does not count as arrival.
        if (dist <= arrive && (!grid || !lineCrossesBlocked(grid, entity.x, entity.y, walkX, walkY))) {
          clearHumanWalkTarget(entity);
          entity.vx = 0;
          entity.vy = 0;
          if (destination) enterHumanBuilding(entity, destination);
          routedIdleWalk = true;
          return true;
        }
        // Use the shared walk owner for direct and routed movement, including
        // off-screen resumption; do not blend stale velocity into a new route.
        const routeKey = `idle_${destination?.id ?? 'roam'}_${entity.id}`;
        steerHumanToward(entity, walkX, walkY, Math.min(speed * speedMult, dist), 1, routeKey);
        if (hasUnreachableWalkTarget(entity, walkX, walkY, routeKey)) {
          entity.leisureRejectedTarget = { x: walkX, y: walkY, untilTick: tick + TICKS_PER_HOUR };
          return fallback();
        }
        routedIdleWalk = true;
        return false;
      };

      const pickCompleted = (types: BuildingType[], selectionId = entity.id, selectionSlot = leisureSlot): Building | undefined => {
        const pool = completedPoolOf(types);
        if (pool.length === 0) return undefined;
        return pool[(selectionId + selectionSlot) % pool.length];
      };

      const adultLeisure = tickAdultLeisureMotive({
        state,
        entity,
        speed: speed,
        allHumans,
        pickSocialBuilding,
        updatedBuildings,
        buildingById,
        humanSocialGrid,
        width,
        height,
        livingHumanAt,
        settlerChat,
        settlerPairChat,
        suppressIdleInitial: suppressIdle,
      });
      suppressIdle = adultLeisure.suppressIdle;
      const spouseEarly = adultLeisure.spouseEarly;

      if (!suppressIdle) {
        const spouse = spouseEarly ?? (entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined);
        const kids = (entity.childrenIds ?? [])
          .map((id) => livingHumanAt(id))
          .filter((k): k is Entity => !!k?.alive && k.age < HUMAN_ADULT_MIN_AGE);
        const workplaceWorkers =
          entity.workerBuildingId != null
            ? workersByWorkplace.get(entity.workerBuildingId) ?? []
            : [];
        const selfIndex = workerIndexById.get(entity.id);
        const coworkerCount = workplaceWorkers.length - (selfIndex == null ? 0 : 1);
        const targetPeerIndex = coworkerCount > 0
          ? (leisureSlot + entity.id) % coworkerCount
          : -1;
        const coworkerIndex =
          targetPeerIndex >= 0 && selfIndex != null && selfIndex <= targetPeerIndex
            ? targetPeerIndex + 1
            : targetPeerIndex;
        const coworker = coworkerIndex >= 0 ? workplaceWorkers[coworkerIndex] : undefined;

        const sneaking =
          hasAffairPartner(entity, entityById) &&
          canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick, workSchedule) &&
          !isAtMaritalHome(entity, entityById, buildingById);

        const bondRoll = personDayRoll(entity.id, tick, 510 + leisureSlot);
        let company: Entity | null = null;
        let companyKind: 'partner' | 'kid' | 'coworker' | null = null;
        if (!sneaking) {
          if (spouse?.alive && bondRoll < 0.4) {
            company = spouse;
            companyKind = 'partner';
          } else if (kids.length > 0 && bondRoll < 0.62) {
            company = kids[(entity.id + leisureSlot) % kids.length]!;
            companyKind = 'kid';
          } else if (coworker && bondRoll < 0.82) {
            company = coworker;
            companyKind = 'coworker';
          }
        }

        const hangWithCompany = company != null && personDayRoll(entity.id, tick, 520 + leisureSlot) < 0.78;
        if (hangWithCompany && company) {
          // Select a meeting place before approaching company. Otherwise a settler
          // who starts walking away toward a venue immediately switches back to
          // chasing the companion as soon as the pair exceeds the talk radius.
          const pairId = Math.min(entity.id, company.id);
          const pairSlot = leisureSlotFor(tick, pairId);
          const shared = (pairId * 31 + pairSlot * 17) % 6;
          const shop = () => pickCompleted([BuildingType.Market, BuildingType.Store], pairId, pairSlot);
          const venue = shared <= 1 ? pickCompleted([BuildingType.Tavern], pairId, pairSlot) ?? shop()
            : shared === 2 ? shop()
            : shared === 3 ? pickCompleted([BuildingType.Well], pairId, pairSlot)
            : shared === 4 ? pickCompleted([BuildingType.TownHall], pairId, pairSlot)
            : undefined;
          const distance = Math.hypot(company.x - entity.x, company.y - entity.y);
          const arrive = companyKind === 'kid' ? 14 : 18;
          const socialGrid = getCurrentPathGrid();
          if (venue) {
            const spot = venueGatherPosition(venue, entity.id);
            steerTo(spot.x, spot.y, 0.45, 18, venue);
          } else if (distance > arrive || (socialGrid && lineCrossesBlocked(socialGrid, entity.x, entity.y, company.x, company.y))) {
            steerTo(company.x, company.y, 0.48, arrive);
          } else {
            clearHumanWalkTarget(entity);
            entity.vx = 0;
            entity.vy = 0;
            routedIdleWalk = true;
            const beautyGrid = state.beautyGrid ?? null;
            if (beautyAt(beautyGrid, entity.x, entity.y) >= 3
              && seededRandomForRun(`leisure-garden:${entity.id}:${tick}`) < 0.04 * PER_TICK_RATE_SCALE) {
              adjustHumanStaminaFromEnergy(entity, 0.4 * PER_TICK_RATE_SCALE);
              addFloatingText(state, entity.x, entity.y - 26, '💐', '#f9a8d4', 'brief');
            }
          }
          if (distance <= arrive && (!socialGrid || !lineCrossesBlocked(socialGrid, entity.x, entity.y, company.x, company.y))) {
            if (companyKind === 'partner') {
              settlerPairChat(entity, company, 'home', 0.08);
            } else if (companyKind === 'kid') {
              settlerChat(entity, 'child', 0.06, company);
            } else if (companyKind === 'coworker') {
              settlerPairChat(entity, company, 'social', 0.07);
            }
          }

          suppressIdle = true;
        } else if (leisureKind <= 2) {
          const tavern = pickCompleted([BuildingType.Tavern]);
          if (tavern) {
            const spot = venueGatherPosition(tavern, entity.id);
            const arrived = steerTo(spot.x, spot.y, 0.5, 18, tavern);
            if (arrived) {
              adjustHumanStaminaFromEnergy(entity, 0.45 * PER_TICK_RATE_SCALE);
              settlerChat(entity, 'social', 0.14 * PER_TICK_RATE_SCALE);
              if (getSimRng('humanTick')() < 0.04 * PER_TICK_RATE_SCALE) {
                addFloatingText(state, entity.x, entity.y - 14, '🍺', '#fbbf24');
              }
            }
          } else {
            const shop = pickCompleted([BuildingType.Market, BuildingType.Store]);
            if (shop) {
              const spot = venueGatherPosition(shop, entity.id);
              steerTo(spot.x, spot.y, 0.48, 16, shop);
            } else {
              steerTo(width * 0.5, height * 0.55, 0.4);
            }
          }
        } else if (leisureKind === 3) {
          const well = pickCompleted([BuildingType.Well]);
          if (well) {
            const wellCentre = getBuildingCenter(well);
            const spot = crowdGatherPosition(wellCentre.x, wellCentre.y, entity.id);
            const arrived = steerTo(spot.x, spot.y, 0.45, 12);
            if (arrived) {
              adjustHumanStaminaFromEnergy(entity, 0.35 * PER_TICK_RATE_SCALE);
            }
          } else {
            steerTo(
              fract(phase * 0.41) * width * 0.5 + width * 0.25,
              fract(phase * 0.73) * height * 0.5 + height * 0.25,
              0.4,
            );
          }
        } else if (leisureKind === 4) {
          const church = pickCompleted([BuildingType.Church]);
          if (church) {
            const spot = venueGatherPosition(church, entity.id);
            steerTo(spot.x, spot.y, 0.42, 18, church);
          } else {
            steerTo(width * 0.45, height * 0.45, 0.38);
          }
        } else if (leisureKind === 5) {
          const hall = pickCompleted([BuildingType.TownHall]);
          if (hall) {
            const spot = venueGatherPosition(hall, entity.id);
            steerTo(spot.x, spot.y, 0.44, 20, hall);
          } else {
            steerTo(width * 0.5, height * 0.5, 0.4);
          }
        } else if (leisureKind === 6) {
          let friend: Entity | null = spouse?.alive ? spouse : null;
          if (!friend && coworker && personDayRoll(entity.id, tick, 530) < 0.55) {
            friend = coworker;
          }
          if (!friend) {
            const eligible = (h: Entity | undefined): h is Entity =>
              !!h?.alive && h.id !== entity.id && isPlayerHuman(h)
              && h.age >= HUMAN_ADULT_MIN_AGE && h.id !== entity.affairPartnerId;
            const cached = entity.leisureFriendSearch;
            const candidate = cached?.friendId == null ? undefined : livingHumanAt(cached.friendId);
            const current = cached != null && cached.day === absDay && cached.tick <= tick;
            if (current && eligible(candidate)) {
              friend = candidate;
            } else if (!cached || !current || (cached.friendId != null && !eligible(candidate))
              || tick - cached.tick >= TICKS_PER_HOUR) {
              friend = findClosestAdaptiveInRadius(
                humanSocialGrid, allHumans, entity.x, entity.y,
                SOCIAL_FRIENDSHIP_RADIUS, eligible,
                socialAdaptiveOptions('social', allHumans.length, width, height),
              ) ?? null;
              entity.leisureFriendSearch = { day: absDay, tick, friendId: friend?.id ?? null };
            }
          }
          if (friend) {
            const sdist = Math.hypot(friend.x - entity.x, friend.y - entity.y);
            const grid = getCurrentPathGrid();
            if (sdist > 22 || (grid && lineCrossesBlocked(grid, entity.x, entity.y, friend.x, friend.y))) {
              steerTo(friend.x, friend.y, 0.42, 22);
            } else {
              clearHumanWalkTarget(entity);
              entity.vx = 0;
              entity.vy = 0;
              routedIdleWalk = true;
              if (friend.id === entity.partnerId) settlerPairChat(entity, friend, 'home', 0.1);
              else settlerPairChat(entity, friend, 'social', 0.08);
            }
          } else {
            // As above: a destination, not the map centre.
            const idleDest = idleDestination(state, entity, idleVenues, buildingById);
            steerTo(idleDest.x, idleDest.y, 0.4);
          }
        } else if (leisureKind === 7) {
          let gx = width * 0.5;
          let gy = height * 0.5;
          if (state.festival?.active) {
            const hall = pickCompleted([BuildingType.TownHall]);
            if (hall) {
              const hallCentre = getBuildingCenter(hall);
              gx = hallCentre.x;
              gy = hallCentre.y + hall.height / 2 + 20;
            }
          }
          steerTo(gx + ((entity.id % 6) - 2.5) * 12, gy + ((entity.id % 5) - 2) * 10, 0.5, 22);
        } else if (leisureKind === 8) {
          const tree = findClosestEntityInRadius(
            treeGrid,
            entity.x,
            entity.y,
            120,
            (t) => t.type === EntityType.Tree && t.alive,
            'social',
            trees,
          );
          if (tree) {
            steerTo(tree.x, tree.y + 8, 0.38, 16);
          } else {
            steerTo(fract(phase * 0.27) * width * 0.55 + width * 0.2, fract(phase * 0.53) * height * 0.55 + height * 0.2, 0.35);
          }
        } else if (leisureKind === 9) {
          const edge = (entity.id + leisureSlot) % 4;
          const tx = edge === 0 ? width * 0.12 : edge === 1 ? width * 0.88 : width * (0.3 + fract(phase) * 0.4);
          const ty = edge === 2 ? height * 0.12 : edge === 3 ? height * 0.88 : height * (0.3 + fract(phase * 1.3) * 0.4);
          steerTo(tx, ty, 0.4, 20);
        } else if (leisureKind === 10) {
          const a = fract(phase * 0.6180339887);
          const b = fract(phase * 0.3819660113);
          const targetX = a * width * 0.7 + width * 0.15;
          const targetY = b * height * 0.7 + height * 0.15;
          steerTo(targetX, targetY, 0.46, 18);
        } else {
          if (hasResidenceAssignment(entity)) {
            const home = buildingById.get(entity.residenceBuildingId!);
            if (home?.completed) {
              const porch = homeStandPosition(home, entity.id);
              steerTo(porch.x, porch.y, 0.4, 12, home);
            }
          } else {
            steerTo(width * 0.5, height * 0.5, 0.38);
          }
        }

        if (routedIdleWalk) {
          suppressIdle = true;
        } else if (idleVx !== 0 || idleVy !== 0) {
          entity.vx = entity.vx * 0.5 + idleVx * 0.5;
          entity.vy = entity.vy * 0.5 + idleVy * 0.5;
          faceVelocity(entity);
          suppressIdle = true;
        }
      }
    }

  return suppressIdle;
}
