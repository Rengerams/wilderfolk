import type { Building, Resources, VillageForgeState, WorldState, ForgeOrderId, ForgeOrder } from './gameTypes';
import { BuildingType } from './gameTypes';
import { formatResourceCost } from './resourceCost';
import { isProductionTick, PRODUCTION_INTERVAL } from './dayCycle';
import { COMBAT_TECH } from './combatTech';
import { logEvent } from './eventLog';
import { addNotification } from './gameEngine';
import { pushTransientParticle } from './juiceEffects';

export function hasCompletedBlacksmith(state: { buildings: Building[] }): boolean {
  return state.buildings.some((b) => b.completed && b.type === BuildingType.Blacksmith);
}

function addForgeFloat(state: WorldState, x: number, y: number, text: string, color: string) {
  if (!state.floatingTexts) state.floatingTexts = [];
  state.floatingTexts.push({
    id: state.nextFloatingTextId++,
    x,
    y,
    text,
    color,
    life: 18,
    maxLife: 18,
    scale: 1,
  });
}

export const FORGE_BONUSES = {
  guardHalberdPerGuard: 6,
  wallPlatePerSegment: 4,
  wallPlateCap: 96,
  quarryYieldMult: 1.15,
} as const;

export const FORGE_ORDERS: ForgeOrder[] = [
  {
    id: 'iron_spears',
    label: 'Iron Spears',
    emoji: '⚔️',
    description: 'Forge village-wide iron spears — hunt farther, fight back vs wolves.',
    techId: COMBAT_TECH.ironSpears,
    inputs: { wood: 35, stone: 25, gold: 40 },
    progressPerTick: 34,
  },
  {
    id: 'iron_shields',
    label: 'Iron Shields',
    emoji: '🛡️',
    description: 'Forge iron shields for all settlers — heavy predator protection.',
    techId: COMBAT_TECH.ironShields,
    inputs: { wood: 40, stone: 30, gold: 45 },
    progressPerTick: 34,
  },
  {
    id: 'guard_halberds',
    label: 'Guard Halberds',
    emoji: '🪖',
    description: `+${FORGE_BONUSES.guardHalberdPerGuard} militia per staffed barracks guard (stacks with base guard bonus).`,
    techId: COMBAT_TECH.militiaDrill,
    requiresForge: ['iron_spears'],
    inputs: { wood: 45, stone: 35, gold: 55 },
    progressPerTick: 30,
  },
  {
    id: 'wall_plates',
    label: 'Reinforced Wall Plates',
    emoji: '🧱',
    description: `+${FORGE_BONUSES.wallPlatePerSegment} barricade per wall segment (max +${FORGE_BONUSES.wallPlateCap}).`,
    techId: COMBAT_TECH.reinforcedMasonry,
    requiresForge: ['iron_shields'],
    inputs: { wood: 50, stone: 60, gold: 60 },
    progressPerTick: 30,
  },
  {
    id: 'iron_pickaxes',
    label: 'Iron Pickaxes',
    emoji: '⛏️',
    description: `Quarries produce ${Math.round((FORGE_BONUSES.quarryYieldMult - 1) * 100)}% more stone while staffed.`,
    techId: 'mining_2',
    inputs: { wood: 40, stone: 45, gold: 50 },
    progressPerTick: 32,
  },
];

const FORGE_PRIORITY: ForgeOrderId[] = FORGE_ORDERS.map((o) => o.id);

export function createInitialForgeState(): VillageForgeState {
  return {
    activeOrder: null,
    progress: 0,
    completed: {},
  };
}

export function normalizeForgeState(
  forge: VillageForgeState | (VillageForgeState & { spearsReady?: boolean; shieldsReady?: boolean }) | null | undefined,
): VillageForgeState {
  if (!forge) return createInitialForgeState();
  const legacy = forge as VillageForgeState & { spearsReady?: boolean; shieldsReady?: boolean };
  const completed = { ...(forge.completed ?? {}) };
  if (legacy.spearsReady) completed.iron_spears = true;
  if (legacy.shieldsReady) completed.iron_shields = true;
  return {
    activeOrder: forge.activeOrder ?? null,
    progress: forge.progress ?? 0,
    completed,
  };
}

export function getForgeOrder(orderId?: ForgeOrderId | null): ForgeOrder | undefined {
  return FORGE_ORDERS.find((o) => o.id === orderId);
}

export function isForgeOrderComplete(
  forge: VillageForgeState | (VillageForgeState & { spearsReady?: boolean; shieldsReady?: boolean }) | null | undefined,
  orderId: ForgeOrderId,
): boolean {
  const normalized = normalizeForgeState(forge);
  return !!normalized.completed[orderId];
}

export function hasAnyForgeUpgrade(
  forge: VillageForgeState | (VillageForgeState & { spearsReady?: boolean; shieldsReady?: boolean }) | null | undefined,
): boolean {
  const normalized = normalizeForgeState(forge);
  return FORGE_ORDERS.some((order) => normalized.completed[order.id]);
}

export function getForgeQuarryMultiplier(state: WorldState): number {
  if (!state?.villageForge) return 1;
  return isForgeOrderComplete(state.villageForge, 'iron_pickaxes')
    ? FORGE_BONUSES.quarryYieldMult
    : 1;
}

export function findCompletedBlacksmith(
  state: WorldState,
  buildings: Building[] = state?.buildings ?? [],
): Building | undefined {
  return buildings.find((b) => b.completed && b.type === BuildingType.Blacksmith);
}

export function isBlacksmithStaffed(
  state: WorldState,
  buildings: Building[] = state?.buildings ?? [],
): boolean {
  return buildings.some(
    (b) => b.completed && b.type === BuildingType.Blacksmith && (b.occupants?.length ?? 0) > 0,
  );
}

/** Iron tech researched but not yet forged — and no order currently running. */
export function getOutstandingForgeOrder(state: WorldState): ForgeOrderId | null {
  if (!state?.villageForge || !state.unlockedTechs) return null;
  const forge = normalizeForgeState(state.villageForge);
  if (forge.activeOrder) return null;
  for (const orderId of FORGE_PRIORITY) {
    const order = getForgeOrder(orderId);
    if (!order) continue;
    if (!state.unlockedTechs.includes(order.techId)) continue;
    if (order.requiresForge?.some((req) => !isForgeOrderComplete(forge, req))) continue;
    if (!isForgeOrderComplete(forge, orderId)) return orderId;
  }
  return null;
}

export function formatForgeInputs(inputs: Partial<Resources>): string {
  return formatResourceCost({
    wood: inputs.wood,
    stone: inputs.stone,
    gold: inputs.gold,
  }) || '—';
}

function canAffordForgeInputs(resources: Resources | null | undefined, inputs: Partial<Resources>): boolean {
  if (!resources) return false;
  return (inputs.wood ?? 0) <= (resources.wood ?? 0)
    && (inputs.stone ?? 0) <= (resources.stone ?? 0)
    && (inputs.gold ?? 0) <= (resources.gold ?? 0);
}

function consumeForgeInputs(state: WorldState, inputs: Partial<Resources>): void {
  if (!state.resources || !canAffordForgeInputs(state.resources, inputs)) return;
  state.resources.wood = (state.resources.wood ?? 0) - (inputs.wood ?? 0);
  state.resources.stone = (state.resources.stone ?? 0) - (inputs.stone ?? 0);
  state.resources.gold = (state.resources.gold ?? 0) - (inputs.gold ?? 0);
}

export function getForgeBlockReason(state: WorldState, orderId: ForgeOrderId): string | null {
  const order = getForgeOrder(orderId);
  if (!order) return 'Unknown order';
  const forge = normalizeForgeState(state?.villageForge);
  if (!state?.unlockedTechs?.includes(order.techId)) {
    const techName = state?.researchNodes?.find((n) => n.id === order.techId)?.name ?? order.label;
    return `Research ${techName} first (Research tab)`;
  }
  if (!hasCompletedBlacksmith(state)) return 'Complete a Blacksmith first';
  if (isForgeOrderComplete(forge, orderId)) return `${order.label} already forged`;
  if (forge.activeOrder === orderId) return null;
  if (forge.activeOrder) {
    const active = getForgeOrder(forge.activeOrder);
    return `Smith is forging ${active?.label ?? 'another order'}`;
  }
  if (order.requiresForge) {
    for (const req of order.requiresForge) {
      if (!isForgeOrderComplete(forge, req)) {
        const reqOrder = getForgeOrder(req);
        return `Forge ${reqOrder?.label ?? req} first`;
      }
    }
  }
  const staffed = state?.buildings?.some(
    (b) => b.completed && b.type === BuildingType.Blacksmith && (b.occupants?.length ?? 0) > 0,
  );
  if (!staffed) return 'Staff the Blacksmith to forge';
  if (!canAffordForgeInputs(state?.resources, order.inputs)) {
    return `Need ${formatForgeInputs(order.inputs)}`;
  }
  return null;
}

export function queueForgeOrder(
  originalState: WorldState,
  buildingId: number,
  orderId: ForgeOrderId,
): WorldState {
  const block = getForgeBlockReason(originalState, orderId);
  if (block) {
    const blocked = structuredClone(originalState) as WorldState;
    if (!blocked.floatingTexts) blocked.floatingTexts = [];
    addNotification(blocked, 'Forge blocked', block, 'warning');
    return blocked;
  }
  const building = originalState.buildings?.find((b) => b.id === buildingId);
  if (!building || building.type !== BuildingType.Blacksmith || !building.completed) {
    return originalState;
  }
  const order = getForgeOrder(orderId)!;
  const state = structuredClone(originalState) as WorldState;
  if (!state.resources) state.resources = { food: 0, wood: 0, stone: 0, gold: 0 };
  state.resources = { ...state.resources };
  state.villageForge = normalizeForgeState(state.villageForge);
  if (state.villageForge.activeOrder === orderId) return originalState;
  consumeForgeInputs(state, order.inputs);
  state.villageForge.activeOrder = orderId;
  state.villageForge.progress = 0;
  logEvent(state, 'event', `Blacksmith began forging ${order.label}`, building.campLabel ?? 'Blacksmith');
  return state;
}

/** Migrate saves that had iron gear via research-only rules or legacy forge booleans. */
export function migrateVillageForgeOnLoad(state: WorldState): void {
  if (!state) return;
  if (!state.villageForge) {
    const hasSmith = hasCompletedBlacksmith(state);
    const hadSpears = state.unlockedTechs?.includes(COMBAT_TECH.ironSpears) && hasSmith;
    const hadShields = state.unlockedTechs?.includes(COMBAT_TECH.ironShields) && hasSmith;
    state.villageForge = {
      activeOrder: null,
      progress: 0,
      completed: {
        ...(hadSpears ? { iron_spears: true } : {}),
        ...(hadShields ? { iron_shields: true } : {}),
      },
    };
    return;
  }
  state.villageForge = normalizeForgeState(state.villageForge);
}

export function tickVillageForge(state: WorldState, buildings: Building[]): void {
  if (!state?.villageForge) return;
  state.villageForge = normalizeForgeState(state.villageForge);
  const forge = state.villageForge;
  if (!forge.activeOrder) return;
  const order = getForgeOrder(forge.activeOrder);
  if (!order) {
    forge.activeOrder = null;
    forge.progress = 0;
    return;
  }

  const smith = buildings?.find(
    (b) => b.completed && b.type === BuildingType.Blacksmith && (b.occupants?.length ?? 0) > 0,
  );
  if (!smith) return;

  if (!isProductionTick(state.tick, PRODUCTION_INTERVAL.workshop)) return;

  forge.progress = Math.min(100, forge.progress + order.progressPerTick);

  if (forge.progress < 100) {
    addForgeFloat(
      state,
      smith.x + (smith.width ?? 0) / 2,
      smith.y - 14,
      `🔨 ${order.label} ${Math.round(forge.progress)}%`,
      '#fb923c',
    );
    return;
  }

  forge.completed[order.id] = true;
  forge.activeOrder = null;
  forge.progress = 0;

  addNotification(
    state,
    `${order.emoji} ${order.label} ready`,
    order.description,
    'success',
  );
  addForgeFloat(
    state,
    smith.x + (smith.width ?? 0) / 2,
    smith.y - 18,
    `${order.emoji} ${order.label} forged!`,
    '#4ade80',
  );
  pushTransientParticle(state, {
    x: smith.x + Math.random() * (smith.width ?? 0),
    y: smith.y + Math.random() * (smith.height ?? 0),
    vx: (Math.random() - 0.5) * 0.6,
    vy: -1 - Math.random(),
    life: 30,
    maxLife: 30,
    color: '#f97316',
    size: 3 + Math.random() * 2,
    type: 'sparkle',
  });
  logEvent(state, 'event', `Blacksmith finished forging ${order.label}`, order.label);
}