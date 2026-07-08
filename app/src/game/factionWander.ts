import type { WorldState, Entity, Building } from './gameTypes';
import { getPlayerCampCenter } from './frontierCombat';
import { TICKS_PER_DAY } from './dayCycle';

interface WanderState {
  targetX: number;
  targetY: number;
  idleUntilTick: number;
}

const wanderByEntity = new Map<number, WanderState>();

function pickWanderTarget(
  state: WorldState,
  entity: Entity,
  campX: number,
  campY: number,
  buildings: Building[],
): { x: number; y: number } {
  const visitorGroup = entity.faction === 'visitor'
    ? state.visitorGroups.find((g) => g.id === entity.groupId)
    : null;

  if (visitorGroup?.kind === 'traders' && Math.random() < 0.24) {
    const village = getPlayerCampCenter(state, buildings);
    const blend = 0.3 + Math.random() * 0.5;
    return {
      x: campX + (village.x - campX) * blend + (Math.random() - 0.5) * 36,
      y: campY + (village.y - campY) * blend + (Math.random() - 0.5) * 36,
    };
  }

  if (visitorGroup?.kind === 'performers') {
    const angle = Math.random() * Math.PI * 2;
    const radius = 6 + Math.random() * 20;
    return {
      x: campX + Math.cos(angle) * radius,
      y: campY + Math.sin(angle) * radius,
    };
  }

  const angle = Math.random() * Math.PI * 2;
  const radius = 10 + Math.random() * (visitorGroup ? 48 : 38);
  return {
    x: campX + Math.cos(angle) * radius,
    y: campY + Math.sin(angle) * radius,
  };
}

function ensureWanderState(
  state: WorldState,
  entity: Entity,
  campX: number,
  campY: number,
  buildings: Building[],
): WanderState {
  let wander = wanderByEntity.get(entity.id);
  if (!wander) {
    const target = pickWanderTarget(state, entity, campX, campY, buildings);
    wander = {
      targetX: target.x,
      targetY: target.y,
      idleUntilTick: state.tick + Math.floor(Math.random() * TICKS_PER_DAY * 0.15),
    };
    wanderByEntity.set(entity.id, wander);
  }
  return wander;
}

export function tickFactionCampWander(
  state: WorldState,
  entity: Entity,
  campX: number,
  campY: number,
  buildings: Building[],
  moveSpeed: number,
): void {
  const wander = ensureWanderState(state, entity, campX, campY, buildings);

  if (state.tick < wander.idleUntilTick) {
    entity.vx = 0;
    entity.vy = 0;
    return;
  }

  const dx = wander.targetX - entity.x;
  const dy = wander.targetY - entity.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 10) {
    const next = pickWanderTarget(state, entity, campX, campY, buildings);
    wander.targetX = next.x;
    wander.targetY = next.y;
    wander.idleUntilTick = state.tick + Math.floor(TICKS_PER_DAY * (0.08 + Math.random() * 0.35));
    entity.vx = 0;
    entity.vy = 0;
    return;
  }

  entity.vx = (dx / dist) * moveSpeed;
  entity.vy = (dy / dist) * moveSpeed;
  entity.x += entity.vx;
  entity.y += entity.vy;
  entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
}

export function clearFactionWanderState(entityId: number): void {
  wanderByEntity.delete(entityId);
}

/** Reset all wander AI — call on new game, load, or session reset. */
export function clearAllFactionWanderStates(): void {
  wanderByEntity.clear();
}

/** Drop wander AI for entities that are no longer alive. */
export function pruneFactionWanderStates(livingEntityIds: Iterable<number>): void {
  const living = new Set(livingEntityIds);
  for (const id of wanderByEntity.keys()) {
    if (!living.has(id)) wanderByEntity.delete(id);
  }
}