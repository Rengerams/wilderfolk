import type { WorldState } from '../gameTypes';
import { BuildingType } from '../gameTypes';
import type { BuildingRotation } from '../buildingRotation';
import type { StripSegment } from '../stripBuild';
import type { VisitorTradeAction, RefugeeChoice } from '../groupEvents';
import type { ForgeOrderId } from '../forge';
import {
  startBuilding,
  placeStripChain,
  assignIdleWorkerToBuilding,
  removeWorkerFromBuilding,
  repairBuilding,
  upgradeBuilding,
  demolishBuilding,
  setWorkshopRecipe,
  recruitSettler,
  moveOutOfFamilyHome,
  tameEntity,
  spawnMoonHowlerDebug,
} from '../buildingActions';
import { queueForgeOrder } from '../forge';
import { notifyBuildingLocked, startResearch } from '../research';
import { establishTradeRoute } from '../economy';
import {
  sendRivalGift,
  establishRivalTradePact,
  showStrengthToRival,
  signPeaceTreaty,
  talkToVisitorLeader,
  tradeWithVisitors,
  negotiateRefugees,
  respondToDiplomacyEvent,
} from '../groupEvents';
import { respondToOutgoingRaidEvent, respondToRaidEvent, launchRaidOnRival } from '../frontierCombat';
import { hostTownFestival } from '../townHall';
import { extractSimTickDelta, type SimTickDelta } from '../simBuffers/simDelta';

export const WORKER_CMD_PROTO = 1;

/** Versioned main → worker command channel (Rule 6). */
export type WorkerCommand =
  | { proto: 1; op: 'startBuilding'; type: BuildingType; x: number; y: number; rotation: BuildingRotation }
  | { proto: 1; op: 'placeStripChain'; type: BuildingType; segments: StripSegment[]; rotation: BuildingRotation }
  | { proto: 1; op: 'assignWorker'; buildingId: number; humanId?: number }
  | { proto: 1; op: 'removeWorker'; buildingId: number; humanId: number }
  | { proto: 1; op: 'repairBuilding'; buildingId: number }
  | { proto: 1; op: 'upgradeBuilding'; buildingId: number }
  | { proto: 1; op: 'demolishBuilding'; buildingId: number }
  | { proto: 1; op: 'setWorkshopRecipe'; buildingId: number; recipeId: string }
  | { proto: 1; op: 'queueForgeOrder'; buildingId: number; orderId: ForgeOrderId }
  | { proto: 1; op: 'recruitSettler' }
  | { proto: 1; op: 'moveOutOfFamilyHome'; humanId: number }
  | { proto: 1; op: 'tameEntity'; entityId: number; humanId: number }
  | { proto: 1; op: 'notifyBuildingLocked'; type: BuildingType }
  | { proto: 1; op: 'respondToRaidEvent'; eventId: string; choiceId: string }
  | { proto: 1; op: 'respondToOutgoingRaidEvent'; eventId: string; choiceId: string }
  | { proto: 1; op: 'respondToDiplomacyEvent'; eventId: string; choiceId: string }
  | { proto: 1; op: 'talkToVisitorLeader'; groupId: string }
  | { proto: 1; op: 'tradeWithVisitors'; groupId: string; action: VisitorTradeAction }
  | { proto: 1; op: 'negotiateRefugees'; groupId: string; choice: RefugeeChoice }
  | { proto: 1; op: 'sendRivalGift'; rivalId: string }
  | { proto: 1; op: 'establishRivalTradePact'; rivalId: string }
  | { proto: 1; op: 'showStrengthToRival'; rivalId: string }
  | { proto: 1; op: 'signPeaceTreaty'; rivalId: string }
  | { proto: 1; op: 'launchRaidOnRival'; rivalId: string }
  | { proto: 1; op: 'startResearch'; researchId: string }
  | { proto: 1; op: 'establishTradeRoute'; routeId: string }
  | { proto: 1; op: 'hostTownFestival'; buildingId: number }
  | { proto: 1; op: 'spawnMoonHowlerDebug' };

const WORKER_COMMAND_OPS = new Set<WorkerCommand['op']>([
  'startBuilding',
  'placeStripChain',
  'assignWorker',
  'removeWorker',
  'repairBuilding',
  'upgradeBuilding',
  'demolishBuilding',
  'setWorkshopRecipe',
  'queueForgeOrder',
  'recruitSettler',
  'moveOutOfFamilyHome',
  'tameEntity',
  'notifyBuildingLocked',
  'respondToRaidEvent',
  'respondToOutgoingRaidEvent',
  'respondToDiplomacyEvent',
  'talkToVisitorLeader',
  'tradeWithVisitors',
  'negotiateRefugees',
  'sendRivalGift',
  'establishRivalTradePact',
  'showStrengthToRival',
  'signPeaceTreaty',
  'launchRaidOnRival',
  'startResearch',
  'establishTradeRoute',
  'hostTownFestival',
  'spawnMoonHowlerDebug',
]);

const BUILDING_TYPE_VALUES = new Set<string>(Object.values(BuildingType));
const FORGE_ORDER_IDS = new Set<string>([
  'iron_spears',
  'iron_shields',
  'guard_halberds',
  'wall_plates',
  'iron_pickaxes',
]);
const VISITOR_TRADE_ACTIONS = new Set<string>(['buy_food', 'buy_wood', 'sell_food']);
const REFUGEE_CHOICES = new Set<string>(['welcome', 'screen', 'turn_away']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isBuildingType(value: unknown): value is BuildingType {
  return typeof value === 'string' && BUILDING_TYPE_VALUES.has(value);
}

function isBuildingRotation(value: unknown): value is BuildingRotation {
  return value === 0 || value === 90;
}

function isStripSegment(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const segment = value as { x?: unknown; y?: unknown };
  return isFiniteNumber(segment.x) && isFiniteNumber(segment.y);
}

function validateWorkerCommandShape(cmd: { op: WorkerCommand['op'] } & Record<string, unknown>): boolean {
  switch (cmd.op) {
    case 'startBuilding':
      return (
        isBuildingType(cmd.type)
        && isFiniteNumber(cmd.x)
        && isFiniteNumber(cmd.y)
        && isBuildingRotation(cmd.rotation)
      );
    case 'placeStripChain':
      return (
        isBuildingType(cmd.type)
        && Array.isArray(cmd.segments)
        && cmd.segments.length > 0
        && cmd.segments.every(isStripSegment)
        && isBuildingRotation(cmd.rotation)
      );
    case 'assignWorker':
      return isFiniteNumber(cmd.buildingId) && (cmd.humanId === undefined || isFiniteNumber(cmd.humanId));
    case 'removeWorker':
      return isFiniteNumber(cmd.buildingId) && isFiniteNumber(cmd.humanId);
    case 'repairBuilding':
    case 'upgradeBuilding':
    case 'demolishBuilding':
    case 'hostTownFestival':
      return isFiniteNumber(cmd.buildingId);
    case 'setWorkshopRecipe':
      return isFiniteNumber(cmd.buildingId) && isNonEmptyString(cmd.recipeId);
    case 'queueForgeOrder':
      return isFiniteNumber(cmd.buildingId) && typeof cmd.orderId === 'string' && FORGE_ORDER_IDS.has(cmd.orderId);
    case 'recruitSettler':
    case 'spawnMoonHowlerDebug':
      return true;
    case 'moveOutOfFamilyHome':
      return isFiniteNumber(cmd.humanId);
    case 'tameEntity':
      return isFiniteNumber(cmd.entityId) && isFiniteNumber(cmd.humanId);
    case 'notifyBuildingLocked':
      return isBuildingType(cmd.type);
    case 'respondToRaidEvent':
    case 'respondToOutgoingRaidEvent':
    case 'respondToDiplomacyEvent':
      return isNonEmptyString(cmd.eventId) && isNonEmptyString(cmd.choiceId);
    case 'talkToVisitorLeader':
      return isNonEmptyString(cmd.groupId);
    case 'tradeWithVisitors':
      return isNonEmptyString(cmd.groupId) && typeof cmd.action === 'string' && VISITOR_TRADE_ACTIONS.has(cmd.action);
    case 'negotiateRefugees':
      return isNonEmptyString(cmd.groupId) && typeof cmd.choice === 'string' && REFUGEE_CHOICES.has(cmd.choice);
    case 'sendRivalGift':
    case 'establishRivalTradePact':
    case 'showStrengthToRival':
    case 'signPeaceTreaty':
    case 'launchRaidOnRival':
      return isNonEmptyString(cmd.rivalId);
    case 'startResearch':
      return isNonEmptyString(cmd.researchId);
    case 'establishTradeRoute':
      return isNonEmptyString(cmd.routeId);
    default:
      return false;
  }
}

/** Validate main → worker command shape before dispatch. */
export function isWorkerCommand(cmd: unknown): cmd is WorkerCommand {
  if (!cmd || typeof cmd !== 'object') return false;
  const c = cmd as { proto?: unknown; op?: unknown };
  if (c.proto !== WORKER_CMD_PROTO) return false;
  if (typeof c.op !== 'string' || !WORKER_COMMAND_OPS.has(c.op as WorkerCommand['op'])) {
    return false;
  }
  return validateWorkerCommandShape(c as { op: WorkerCommand['op'] } & Record<string, unknown>);
}

export function aliveIdSet(state: WorldState): Set<number> {
  const ids = new Set<number>();
  for (const entity of state.entities) {
    if (entity.alive) ids.add(entity.id);
  }
  return ids;
}

/** Apply a versioned command on the worker-authoritative world. */
export function applyWorkerCommand(world: WorldState, cmd: WorkerCommand): WorldState {
  if (!isWorkerCommand(cmd)) {
    console.warn('[WorkerCommand] Invalid command', cmd);
    return world;
  }

  switch (cmd.op) {
    case 'startBuilding':
      return startBuilding(world, cmd.type, cmd.x, cmd.y, cmd.rotation);
    case 'placeStripChain':
      return placeStripChain(world, cmd.type, cmd.segments, cmd.rotation);
    case 'assignWorker':
      return assignIdleWorkerToBuilding(world, cmd.buildingId, cmd.humanId);
    case 'removeWorker':
      return removeWorkerFromBuilding(world, cmd.buildingId, cmd.humanId);
    case 'repairBuilding':
      return repairBuilding(world, cmd.buildingId);
    case 'upgradeBuilding':
      return upgradeBuilding(world, cmd.buildingId);
    case 'demolishBuilding':
      return demolishBuilding(world, cmd.buildingId);
    case 'setWorkshopRecipe':
      return setWorkshopRecipe(world, cmd.buildingId, cmd.recipeId);
    case 'queueForgeOrder':
      return queueForgeOrder(world, cmd.buildingId, cmd.orderId);
    case 'recruitSettler':
      return recruitSettler(world);
    case 'moveOutOfFamilyHome':
      return moveOutOfFamilyHome(world, cmd.humanId);
    case 'tameEntity':
      return tameEntity(world, cmd.entityId, cmd.humanId);
    case 'notifyBuildingLocked':
      return notifyBuildingLocked(world, cmd.type);
    case 'respondToRaidEvent':
      return respondToRaidEvent(world, cmd.eventId, cmd.choiceId);
    case 'respondToOutgoingRaidEvent':
      return respondToOutgoingRaidEvent(world, cmd.eventId, cmd.choiceId);
    case 'respondToDiplomacyEvent':
      return respondToDiplomacyEvent(world, cmd.eventId, cmd.choiceId);
    case 'talkToVisitorLeader':
      return talkToVisitorLeader(world, cmd.groupId);
    case 'tradeWithVisitors':
      return tradeWithVisitors(world, cmd.groupId, cmd.action);
    case 'negotiateRefugees':
      return negotiateRefugees(world, cmd.groupId, cmd.choice);
    case 'sendRivalGift':
      return sendRivalGift(world, cmd.rivalId);
    case 'establishRivalTradePact':
      return establishRivalTradePact(world, cmd.rivalId);
    case 'showStrengthToRival':
      return showStrengthToRival(world, cmd.rivalId);
    case 'signPeaceTreaty':
      return signPeaceTreaty(world, cmd.rivalId);
    case 'launchRaidOnRival':
      return launchRaidOnRival(world, cmd.rivalId);
    case 'startResearch':
      return startResearch(world, cmd.researchId);
    case 'establishTradeRoute':
      return establishTradeRoute(world, cmd.routeId);
    case 'hostTownFestival':
      return hostTownFestival(world, cmd.buildingId);
    case 'spawnMoonHowlerDebug':
      return spawnMoonHowlerDebug(world);
    default: {
      const unknown = cmd as { op?: string };
      console.warn('[WorkerCommand] Unknown op', unknown.op ?? '?');
      return world;
    }
  }
}

export function extractCommandDelta(world: WorldState, aliveBefore: Set<number>): SimTickDelta {
  const aliveNow = world.entities.filter((e) => e.alive);
  return extractSimTickDelta(world, aliveBefore, aliveNow, {
    headless: true,
    cloneMode: 'transfer',
  });
}

/** Best-effort command delta — returns empty-ish delta if extraction fails after rollback. */
export function safeExtractCommandDelta(world: WorldState, aliveBefore: Set<number>): SimTickDelta {
  try {
    return extractCommandDelta(world, aliveBefore);
  } catch (err) {
    console.warn('[WorkerCommand] Delta extract failed after command error', err);
    const aliveNow = world.entities.filter((e) => e.alive);
    return extractSimTickDelta(world, aliveBefore, aliveNow, {
      headless: true,
      cloneMode: 'transfer',
    });
  }
}