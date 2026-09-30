import type { Building, Entity, WorldState } from './gameTypes';
import { commuteHumanToBuilding, venueGatherPosition } from './simulation/humanMovement';
import { faceVelocity, setVelocityToward, steerEntityToward } from './simulation/movementSteering';
import { PER_TICK_RATE_SCALE, getChildCustodian, hasResidenceAssignment, personDayRoll, prefersHomeTonight } from './dayCycle';
import { isOnWorkScheduleShift } from './workSchedule';
import { pickSocialImpulse } from './socialLife';
import { isPlayerHuman } from './playerHuman';
import { sayHumanChatPhrase } from './humanChat';

/** 0.72 = per-child, per-day chance that a free child heads off to play with another child. */
const KID_PLAY_CHANCE = 0.72;

export function tickHumanChildLeisure(args: {
  state: WorldState;
  entity: Entity;
  speed: number;
  hourOfDay: number;
  onSchedule: boolean;
  allHumans: Entity[];
  updatedBuildings: Building[];
  buildingById: Map<number, Building>;
  livingHumanAt: (id: number | null | undefined) => Entity | undefined;
  suppressIdleInitial: boolean;
}): boolean {
  if (args.onSchedule || !args.entity.isJuvenile || !isPlayerHuman(args.entity)) return args.suppressIdleInitial;
  const { state, entity, speed, hourOfDay, allHumans, updatedBuildings, buildingById, livingHumanAt } = args;
  const playmates = allHumans.filter((h) => h.alive && h.isJuvenile && h.id !== entity.id && isPlayerHuman(h));
  const impulse = pickSocialImpulse(entity, state, updatedBuildings, [], playmates);

  // Kids play is decided HERE, because `pickSocialImpulse` no longer offers a `kid_play` motive —
  // its removal left this caller testing for a motive nothing produces, so **no child could ever
  // play**. Deciding it on the child's own free time is also what makes a weekend or an off-shift
  // the hours they are meant to be out playing: while it lived inside `pickSocialImpulse` it was
  // that function's LAST branch, below `sunday_service` (Sun 09:00–13:00), `civic_petition`,
  // `hospital_visit`, `birthday` and `market_errand`, so an adult errand pre-empted play on exactly
  // the days a child was free.
  //
  // Sickness, grief and harsh weather still outrank play — those are the only `stayHome` motives a
  // juvenile has any business obeying.
  if (!impulse.stayHome) {
    const mate = playmates.length > 0 && personDayRoll(entity.id, state.tick, 718) < KID_PLAY_CHANCE
      ? playmates[(entity.id + Math.floor(state.tick / 12)) % playmates.length]
      : undefined;
    if (mate?.alive) {
      const pdist = Math.hypot(mate.x - entity.x, mate.y - entity.y) || 1;
      if (pdist > 16) {
        setVelocityToward(entity, mate.x, mate.y, speed, 0.7);
      } else {
        entity.vx = Math.sin(state.tick * 0.2 + entity.id) * speed * 0.45;
        entity.vy = Math.cos(state.tick * 0.18 + mate.id) * speed * 0.45;
        if (seededRandomForRun(`chat-kid:${entity.id}:${state.tick}`) < 0.06 * PER_TICK_RATE_SCALE) {
          const bubble = personDayRoll(entity.id, state.tick, 719) < 0.5 ? 'Tag!' : 'Wait for me!';
          sayHumanChatPhrase(entity, bubble, 40);
        }
      }
      faceVelocity(entity);
      return true;
    }
  }
  const mother = entity.motherId != null ? livingHumanAt(entity.motherId) : undefined;
  const father = entity.fatherId != null ? livingHumanAt(entity.fatherId) : undefined;
  const freeParent = [mother, father].find((parent) => parent?.alive && isPlayerHuman(parent) && !prefersHomeTonight(parent.id, state.tick, hourOfDay) && !isOnWorkScheduleShift(state, hourOfDay)) ?? [mother, father].find((parent) => parent?.alive);
  const follow = freeParent ?? getChildCustodian(entity, allHumans);
  if (follow?.alive && personDayRoll(entity.id, state.tick, 601) > 0.22) {
    const distance = Math.hypot(follow.x - entity.x, follow.y - entity.y) || 1;
    if (distance > 22) {
      steerEntityToward(entity, follow.x, follow.y, speed, 0.55);
    } else if (distance > 8) {
      setVelocityToward(entity, follow.x, follow.y, speed, 0.18);
    }
    return true;
  }
  if (hasResidenceAssignment(entity)) {
    const residence = buildingById.get(entity.residenceBuildingId!);
    if (residence?.completed) {
      commuteHumanToBuilding(entity, residence, speed, true);
      return true;
    }
  }
  return args.suppressIdleInitial;
}

import type { TickContext } from './simulation/simulationTypes';
import { forEachAdaptiveInRadius, socialAdaptiveOptions, SOCIAL_STAGGER, SOCIAL_FRIENDSHIP_RADIUS } from './adaptiveSpatialQuery';
import { seededRandomForRun } from './simRng';
import { crowdGatherPosition, homeStandPosition } from './simulation/humanMovement';
import { pickBeautySpot } from './beautyGrid';

/**
 * Where an idle settler should be when nothing else claims them.
 *
 * Owner, 2026-09-30, looking at a clump of dozens of settlers chatting mid-village with **no election and
 * no festival** running: *"they again in a circle"* — and then the fix in their own words: *"they should
 * goto a tree or to the tavern etc or spending at home various options"*.
 *
 * They were right about what was missing. Two idle rules sent every unoccupied settler to the **map
 * centre** (`width * 0.5`, `height * 0.5`) inside a 35-slot lattice of offsets — the partner-seeking
 * drift and the idle-leisure wander in `humanTick` — so a village with nothing on still piled its whole
 * idle population into one chatting blob in the middle of the map. This gives each settler a real
 * destination, chosen deterministically per person per day, with their own standing place at it:
 *
 *  - **home** — "spending at home" (a third, when they have a residence);
 *  - **a venue** — the nearest tavern, market, town hall or church, where `venueGatherPosition` spreads
 *    the crowd across the frontage;
 *  - **somewhere pretty** — a tree or meadow off the beauty grid, where `crowdGatherPosition` spreads the
 *    settlers who chose the same view.
 *
 * No RNG: `personDayRoll` is the sim's per-person, per-day stream, so one settler makes the same choice
 * all day and different settlers make different ones.
 */
export function idleDestination(
  state: WorldState,
  entity: Entity,
  venues: readonly Building[],
  buildingById: ReadonlyMap<number, Building>,
): { x: number; y: number } {
  const roll = personDayRoll(entity.id, state.tick, 812);

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

export function tickAdultLeisureMotive(args: {
  state: WorldState;
  entity: Entity;
  speed: number;
  allHumans: Entity[];
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
  const nearbyAdults: Entity[] = [];
  if ((state.tick + entity.id) % SOCIAL_STAGGER === 0) {
    forEachAdaptiveInRadius(humanSocialGrid, allHumans, entity.x, entity.y, SOCIAL_FRIENDSHIP_RADIUS, (h) => {
      if (h.alive && isPlayerHuman(h) && !h.isJuvenile) nearbyAdults.push(h);
    }, socialAdaptiveOptions('social', allHumans.length, width, height));
  }
  const spouseEarly = entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined;
  if (spouseEarly?.alive && !nearbyAdults.some((h) => h.id === spouseEarly.id)) nearbyAdults.push(spouseEarly);
  const impulse = pickSocialImpulse(entity, state, updatedBuildings, nearbyAdults, []);
  let suppressIdle = args.suppressIdleInitial;
  if (impulse.motive !== 'none') {
    if (impulse.bubble && seededRandomForRun(`chat-bubble:${entity.id}:${state.tick}`) < 0.08 * PER_TICK_RATE_SCALE) sayHumanChatPhrase(entity, impulse.bubble, 55);
    if (impulse.stayHome && hasResidenceAssignment(entity)) {
      const home = buildingById.get(entity.residenceBuildingId!);
      if (home?.completed) {
        commuteHumanToBuilding(entity, home, speed * (impulse.motive === 'sick_day' ? 0.7 : 0.9), true, 2.2);
        if (impulse.motive === 'sick_day') entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.25 * PER_TICK_RATE_SCALE);
        suppressIdle = true;
      }
    } else if (impulse.company?.alive && impulse.building) {
      const b = impulse.building; const cx = b.x + b.width / 2; const cy = b.y + b.height * 0.92;
      const dist = Math.hypot((impulse.company.x + cx) / 2 - entity.x, (impulse.company.y + cy) / 2 - entity.y) || 1;
      if (dist > 16) { steerEntityToward(entity, (impulse.company.x + cx) / 2, (impulse.company.y + cy) / 2, speed, 0.48); } else settlerPairChat(entity, impulse.company, 'home', 0.1);
      suppressIdle = true;
    } else if (impulse.company?.alive) {
      const c = impulse.company; const dist = Math.hypot(c.x - entity.x, c.y - entity.y) || 1;
      if (dist > 16) { steerEntityToward(entity, c.x, c.y, speed, 0.5); }
      else if (impulse.motive === 'comfort_neighbor') { settlerPairChat(entity, c, 'social', 0.12); c.energy = Math.min(c.maxEnergy, c.energy + 0.15 * PER_TICK_RATE_SCALE); }
      else if (impulse.motive === 'care_pregnant') settlerPairChat(entity, c, 'home', 0.12);
      suppressIdle = true;
    } else if (impulse.building) {
      const b = impulse.building;
      /**
       * One place per settler at the venue, and the walk goes to *that same* place.
       *
       * Owner, 2026-09-30: *"they again in a circle"*, with no event running — this branch was sending the
       * whole village's leisure crowd to a single coordinate (`b.x + b.width / 2`, `b.y + b.height * 0.92`,
       * each stopping within 20 px of it). `venueGatherPosition` spreads them across the venue's front
       * (`humanMovement` owns stand positions), and the arrival test now measures the point the settler is
       * actually walking to, so the check and the walk cannot disagree — the failure mode the handover
       * recorded for the home/work pair.
       */
      const spot = venueGatherPosition(b, entity.id);
      const arrived = Math.hypot(entity.x - spot.x, entity.y - spot.y) < 20;
      if (!arrived) steerEntityToward(entity, spot.x, spot.y, speed * 0.5);
      else if (impulse.motive === 'sunday_service' || impulse.motive === 'grief' || impulse.motive === 'day_off') { entity.vx *= 0.2; entity.vy *= 0.2; if (seededRandomForRun(`chat-social:${entity.id}:${state.tick}`) < 0.05 * PER_TICK_RATE_SCALE) settlerChat(entity, 'social', 0.1); }
      else if (impulse.motive === 'market_errand' || impulse.motive === 'birthday') { entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.2 * PER_TICK_RATE_SCALE); settlerChat(entity, 'social', 0.1); }
      suppressIdle = true;
    }
  }
  return { suppressIdle, spouseEarly };
}