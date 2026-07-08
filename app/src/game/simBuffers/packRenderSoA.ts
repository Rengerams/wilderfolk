import type { Entity, WorldState } from '../gameTypes';
import { EntityType } from '../gameTypes';
import type { SimulationFocus } from '../gameEngine';
import { isPlayerHuman } from '../groupEvents';
import { entityTypeToCode } from './entityTypeCodes';
import { validateRenderBufferLayout } from './renderSoAReader';
import {
  HUNT_TARGET_NONE,
  RESIDENCE_BUILDING_NONE,
  RENDER_FLAG_ALIVE,
  RENDER_FLAG_COMBAT,
  RENDER_FLAG_EDUCATED,
  RENDER_FLAG_FEMALE,
  RENDER_FLAG_JUVENILE,
  RENDER_FLAG_MALE,
  RENDER_FLAG_MOON_HOWLER,
  RENDER_FLAG_PREGNANT,
  RENDER_FLAG_RIVAL,
  RENDER_FLAG_TAMED,
  RENDER_FLAG_VISITOR,
  RENDER_FIELD,
  RENDER_GLOBAL_OVERFLOW,
  RENDER_HEADER,
  RENDER_MAX_SLOTS,
  RENDER_SOA_MAGIC,
  RENDER_SOA_VERSION,
  RENDER_STRIDE_V1,
  renderBufferByteLength,
  rowBaseWord,
} from './schema';

export interface PackRenderSoAResult {
  buffer: ArrayBuffer;
  schemaVersion: number;
  aliveCount: number;
  totalAlive: number;
  overflow: boolean;
  tick: number;
  /** Entities written to the buffer — same order as render SoA slots. */
  packedEntities: Entity[];
}

function safeF32(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function entityFlags(entity: Entity): number {
  let flags = RENDER_FLAG_ALIVE;
  if (entity.isJuvenile) flags |= RENDER_FLAG_JUVENILE;
  if (entity.gender === 'female') flags |= RENDER_FLAG_FEMALE;
  if (entity.gender === 'male') flags |= RENDER_FLAG_MALE;
  if (entity.moonHowlerCursed) flags |= RENDER_FLAG_MOON_HOWLER;
  if (entity.tamedBy != null) flags |= RENDER_FLAG_TAMED;
  if (entity.faction === 'rival') flags |= RENDER_FLAG_RIVAL;
  if (entity.faction === 'visitor') flags |= RENDER_FLAG_VISITOR;
  if (entity.pregnant) flags |= RENDER_FLAG_PREGNANT;
  if (entity.educated) flags |= RENDER_FLAG_EDUCATED;
  if (entity.combatTicks && entity.combatTicks > 0) flags |= RENDER_FLAG_COMBAT;
  return flags;
}

function entityPriority(entity: Entity, focus?: SimulationFocus): number {
  let score = 0;
  if (entity.type === EntityType.Human && isPlayerHuman(entity)) score += 10_000;
  else if (entity.type === EntityType.Werewolf) score += 8_000;
  else if (entity.faction === 'rival' || entity.faction === 'visitor') score += 7_000;
  else if (entity.type === EntityType.Wolf || entity.type === EntityType.Fox) score += 5_000;
  else if (entity.type === EntityType.Deer || entity.type === EntityType.Rabbit) score += 3_000;
  else if (entity.type === EntityType.Tree) score += 500;
  else if (entity.type === EntityType.Grass) score += 100;

  if (focus) {
    const inFocus = entity.x >= focus.minX && entity.x <= focus.maxX
      && entity.y >= focus.minY && entity.y <= focus.maxY;
    if (inFocus) score += 2_000;
  }
  return score;
}

function clearRenderSlot(u32: Uint32Array, slot: number): void {
  const base = rowBaseWord(slot);
  for (let w = 0; w < RENDER_STRIDE_V1; w++) {
    u32[base + w] = 0;
  }
}

let scratchScores: Float64Array | null = null;
let scratchIndices: Uint32Array | null = null;

function ensureSelectionScratch(capacity: number): { scores: Float64Array; indices: Uint32Array } {
  if (!scratchScores || scratchScores.length < capacity) {
    scratchScores = new Float64Array(capacity);
    scratchIndices = new Uint32Array(capacity);
  }
  return { scores: scratchScores, indices: scratchIndices! };
}

/** Descending score, ascending index tie-break — matches legacy full-sort ordering. */
function compareIndexOrder(scores: Float64Array, ai: number, bi: number): number {
  const diff = scores[bi] - scores[ai];
  return diff !== 0 ? diff : ai - bi;
}

/** Partition so indices[0..k) are the k highest-priority entity indices. */
function partitionTopKIndices(
  indices: Uint32Array,
  scores: Float64Array,
  n: number,
  k: number,
): void {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const pivot = indices[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (compareIndexOrder(scores, indices[i], pivot) < 0) i++;
      while (compareIndexOrder(scores, pivot, indices[j]) < 0) j--;
      if (i <= j) {
        const tmp = indices[i];
        indices[i] = indices[j];
        indices[j] = tmp;
        i++;
        j--;
      }
    }
    if (k <= j + 1) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
}

/** Select entities for render SoA — prioritizes settlers and viewport when over slot cap. */
export function selectRenderEntities(
  alive: Entity[],
  maxSlots: number,
  focus?: SimulationFocus,
): { packed: Entity[]; totalAlive: number; overflow: boolean } {
  const totalAlive = alive.length;
  if (totalAlive <= maxSlots) {
    return { packed: alive.slice(), totalAlive, overflow: false };
  }

  const { scores, indices } = ensureSelectionScratch(totalAlive);
  for (let i = 0; i < totalAlive; i++) {
    indices[i] = i;
    scores[i] = entityPriority(alive[i], focus);
  }

  partitionTopKIndices(indices, scores, totalAlive, maxSlots);
  const top = indices.subarray(0, maxSlots);
  top.sort((a, b) => compareIndexOrder(scores, a, b));

  const packed = new Array<Entity>(maxSlots);
  for (let i = 0; i < maxSlots; i++) {
    packed[i] = alive[top[i]];
  }
  return { packed, totalAlive, overflow: true };
}

/** Pack alive entities into a versioned render SoA buffer (transferable). */
export function packRenderSoA(
  world: WorldState,
  into?: ArrayBuffer,
  maxSlots = RENDER_MAX_SLOTS,
  focus?: SimulationFocus,
): PackRenderSoAResult {
  const alive = world.entities.filter((e) => e.alive);
  const { packed, totalAlive, overflow } = selectRenderEntities(alive, maxSlots, focus);
  const aliveCount = packed.length;
  const byteLength = renderBufferByteLength(maxSlots);
  const buffer = into && into.byteLength >= byteLength ? into : new ArrayBuffer(byteLength);

  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);

  u32[RENDER_HEADER.magic] = RENDER_SOA_MAGIC;
  u32[RENDER_HEADER.schemaVersion] = RENDER_SOA_VERSION;
  u32[RENDER_HEADER.tick] = world.tick >>> 0;
  u32[RENDER_HEADER.aliveCount] = aliveCount;
  u32[RENDER_HEADER.maxSlot] = maxSlots;
  u32[RENDER_HEADER.worldWidth] = world.width >>> 0;
  u32[RENDER_HEADER.worldHeight] = world.height >>> 0;
  u32[RENDER_HEADER.globalFlags] = overflow
    ? (RENDER_GLOBAL_OVERFLOW | (totalAlive << 1))
    : 0;

  const idToSlot = new Map<number, number>();
  for (let slot = 0; slot < aliveCount; slot++) {
    idToSlot.set(packed[slot].id, slot);
  }

  for (let slot = 0; slot < aliveCount; slot++) {
    const entity = packed[slot];
    const base = rowBaseWord(slot);

    u32[base + RENDER_FIELD.id] = entity.id >>> 0;
    u32[base + RENDER_FIELD.typeCode] = entityTypeToCode(entity.type);
    f32[base + RENDER_FIELD.x] = safeF32(entity.x);
    f32[base + RENDER_FIELD.y] = safeF32(entity.y);
    f32[base + RENDER_FIELD.vx] = safeF32(entity.vx);
    f32[base + RENDER_FIELD.vy] = safeF32(entity.vy);
    f32[base + RENDER_FIELD.spriteAngle] = safeF32(entity.spriteAngle);
    f32[base + RENDER_FIELD.animFrame] = safeF32(entity.animFrame);
    f32[base + RENDER_FIELD.size] = safeF32(entity.size);
    f32[base + RENDER_FIELD.flash] = safeF32(entity.flash);

    u32[base + RENDER_FIELD.flags] = entityFlags(entity);

    let huntSlot = HUNT_TARGET_NONE;
    if (entity.huntTargetId != null) {
      const mapped = idToSlot.get(entity.huntTargetId);
      if (mapped != null) huntSlot = mapped >>> 0;
    }
    u32[base + RENDER_FIELD.huntTargetSlot] = huntSlot;
    u32[base + RENDER_FIELD.residenceBuildingId] = entity.residenceBuildingId != null
      ? (entity.residenceBuildingId >>> 0)
      : RESIDENCE_BUILDING_NONE;
    u32[base + RENDER_FIELD.chatTicks] = (entity.chatTicks ?? 0) >>> 0;
    u32[base + RENDER_FIELD.reserved0] = 0;
    u32[base + RENDER_FIELD.reserved1] = 0;
  }

  for (let slot = aliveCount; slot < maxSlots; slot++) {
    clearRenderSlot(u32, slot);
  }

  return {
    buffer,
    schemaVersion: RENDER_SOA_VERSION,
    aliveCount,
    totalAlive,
    overflow,
    tick: world.tick,
    packedEntities: packed,
  };
}

export function validateRenderBufferHeader(buffer: ArrayBuffer): boolean {
  return validateRenderBufferLayout(buffer);
}