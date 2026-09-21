import type { Building, Entity, WorldState } from './gameTypes';
import { commuteHumanToBuilding } from './simulation/humanMovement';
import { faceVelocity, setVelocityToward, steerEntityToward } from './simulation/movementSteering';
import { PER_TICK_RATE_SCALE, getChildCustodian, hasResidenceAssignment, personDayRoll, prefersHomeTonight } from './dayCycle';
import { isOnWorkScheduleShift } from './workSchedule';
import { pickSocialImpulse } from './socialLife';
import { isPlayerHuman } from './playerHuman';
import { sayHumanChatPhrase } from './humanChat';

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
  const kidImpulse = pickSocialImpulse(entity, state, updatedBuildings, [], playmates);
  if (kidImpulse.motive === 'kid_play' && kidImpulse.company?.alive) {
    const play = kidImpulse.company;
    const pdist = Math.hypot(play.x - entity.x, play.y - entity.y) || 1;
    if (pdist > 16) {
      setVelocityToward(entity, play.x, play.y, speed, 0.7);
    } else {
      entity.vx = Math.sin(state.tick * 0.2 + entity.id) * speed * 0.45;
      entity.vy = Math.cos(state.tick * 0.18 + play.id) * speed * 0.45;
      if (
        kidImpulse.bubble
        && seededRandomForRun(`chat-kid:${entity.id}:${state.tick}`) < 0.06 * PER_TICK_RATE_SCALE
      ) {
        sayHumanChatPhrase(entity, kidImpulse.bubble, 40);
      }
    }
    faceVelocity(entity);
    return true;
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
      const b = impulse.building; const arrived = Math.hypot(entity.x - (b.x + b.width / 2), entity.y - (b.y + b.height * 0.92)) < 20;
      if (!arrived) commuteHumanToBuilding(entity, b, speed * 0.5, false, 2.8);
      else if (impulse.motive === 'sunday_service' || impulse.motive === 'grief') { entity.vx *= 0.2; entity.vy *= 0.2; if (seededRandomForRun(`chat-social:${entity.id}:${state.tick}`) < 0.05 * PER_TICK_RATE_SCALE) settlerChat(entity, 'social', 0.1); }
      else if (impulse.motive === 'market_errand' || impulse.motive === 'birthday') { entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.2 * PER_TICK_RATE_SCALE); settlerChat(entity, 'social', 0.1); }
      suppressIdle = true;
    }
  }
  return { suppressIdle, spouseEarly };
}