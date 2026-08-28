import type { Building, Entity, WorldState } from './gameTypes';
import { commuteHumanToBuilding } from './simulation/humanMovement';
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
    const pdx = play.x - entity.x;
    const pdy = play.y - entity.y;
    const pdist = Math.hypot(pdx, pdy) || 1;
    if (pdist > 16) {
      entity.vx = (pdx / pdist) * speed * 0.7;
      entity.vy = (pdy / pdist) * speed * 0.7;
    } else {
      entity.vx = Math.sin(state.tick * 0.2 + entity.id) * speed * 0.45;
      entity.vy = Math.cos(state.tick * 0.18 + play.id) * speed * 0.45;
      if (kidImpulse.bubble && Math.random() < 0.06 * PER_TICK_RATE_SCALE) sayHumanChatPhrase(entity, kidImpulse.bubble, 40);
    }
    entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    return true;
  }
  const mother = entity.motherId != null ? livingHumanAt(entity.motherId) : undefined;
  const father = entity.fatherId != null ? livingHumanAt(entity.fatherId) : undefined;
  const freeParent = [mother, father].find((parent) => parent?.alive && isPlayerHuman(parent) && !prefersHomeTonight(parent.id, state.tick, hourOfDay) && !isOnWorkScheduleShift(state, hourOfDay)) ?? [mother, father].find((parent) => parent?.alive);
  const follow = freeParent ?? getChildCustodian(entity, allHumans);
  if (follow?.alive && personDayRoll(entity.id, state.tick, 601) > 0.22) {
    const dx = follow.x - entity.x;
    const dy = follow.y - entity.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > 22) {
      entity.vx = (dx / distance) * speed * 0.55;
      entity.vy = (dy / distance) * speed * 0.55;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    } else if (distance > 8) {
      entity.vx = (dx / distance) * speed * 0.18;
      entity.vy = (dy / distance) * speed * 0.18;
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
