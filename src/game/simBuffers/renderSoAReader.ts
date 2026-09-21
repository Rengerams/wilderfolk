import type { EntityType as EntityTypeName } from '../gameTypes';
import { codeToEntityType, isKnownEntityTypeCode } from './entityTypeCodes';
import {
  HUNT_TARGET_NONE,
  RESIDENCE_BUILDING_NONE,
  RENDER_FIELD,
  RENDER_GLOBAL_OVERFLOW,
  RENDER_HEADER,
  RENDER_SOA_MAGIC,
  RENDER_SOA_VERSION,
  RENDER_STRIDE_V1,
  renderBufferByteLength,
  rowBaseWord,
} from './schema';

export function validateRenderBufferLayout(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 32) return false;
  if (buffer.byteLength % 4 !== 0) return false;
  const u32 = new Uint32Array(buffer);
  if (u32[RENDER_HEADER.magic] !== RENDER_SOA_MAGIC) return false;
  if (u32[RENDER_HEADER.schemaVersion] !== RENDER_SOA_VERSION) return false;

  const maxSlot = u32[RENDER_HEADER.maxSlot] || 0;
  const aliveCount = u32[RENDER_HEADER.aliveCount];
  if (maxSlot <= 0 || aliveCount > maxSlot) return false;
  if (buffer.byteLength < renderBufferByteLength(maxSlot)) return false;
  return true;
}

export class RenderSoAReaderV1 {
  readonly buffer: ArrayBuffer;
  private readonly u32: Uint32Array;
  private readonly f32: Float32Array;

  constructor(buffer: ArrayBuffer) {
    if (buffer.byteLength % 4 !== 0) {
      throw new Error(`Render SoA buffer byteLength must be a multiple of 4 (got ${buffer.byteLength})`);
    }
    this.buffer = buffer;
    this.u32 = new Uint32Array(buffer);
    this.f32 = new Float32Array(buffer);
  }

  static tryCreate(buffer: ArrayBuffer): RenderSoAReaderV1 | null {
    if (!validateRenderBufferLayout(buffer)) return null;
    return new RenderSoAReaderV1(buffer);
  }

  get schemaVersion(): number {
    return this.u32[RENDER_HEADER.schemaVersion];
  }

  get tick(): number {
    return this.u32[RENDER_HEADER.tick];
  }

  get aliveCount(): number {
    return this.u32[RENDER_HEADER.aliveCount];
  }

  get maxSlot(): number {
    return this.u32[RENDER_HEADER.maxSlot];
  }

  get worldWidth(): number {
    return this.u32[RENDER_HEADER.worldWidth];
  }

  get worldHeight(): number {
    return this.u32[RENDER_HEADER.worldHeight];
  }

  get globalFlags(): number {
    return this.u32[RENDER_HEADER.globalFlags];
  }

  hasOverflow(): boolean {
    return (this.globalFlags & RENDER_GLOBAL_OVERFLOW) !== 0;
  }

  /** Total alive entities when `hasOverflow()` — otherwise equals `aliveCount`. */
  totalAliveCount(): number {
    if (!this.hasOverflow()) return this.aliveCount;
    return this.globalFlags >>> 1;
  }

  private slotInRange(slot: number): boolean {
    return slot >= 0 && slot < this.aliveCount;
  }

  private base(slot: number): number {
    return rowBaseWord(slot);
  }

  id(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.u32[this.base(slot) + RENDER_FIELD.id];
  }

  typeCode(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.u32[this.base(slot) + RENDER_FIELD.typeCode];
  }

  type(slot: number): EntityTypeName | null {
    if (!this.slotInRange(slot)) return null;
    return codeToEntityType(this.typeCode(slot));
  }

  isKnownType(slot: number): boolean {
    if (!this.slotInRange(slot)) return false;
    return isKnownEntityTypeCode(this.typeCode(slot));
  }

  x(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.f32[this.base(slot) + RENDER_FIELD.x];
  }

  y(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.f32[this.base(slot) + RENDER_FIELD.y];
  }

  vx(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.f32[this.base(slot) + RENDER_FIELD.vx];
  }

  vy(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.f32[this.base(slot) + RENDER_FIELD.vy];
  }

  spriteAngle(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.f32[this.base(slot) + RENDER_FIELD.spriteAngle];
  }

  animFrame(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.f32[this.base(slot) + RENDER_FIELD.animFrame];
  }

  size(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.f32[this.base(slot) + RENDER_FIELD.size];
  }

  flash(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.f32[this.base(slot) + RENDER_FIELD.flash];
  }

  flags(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.u32[this.base(slot) + RENDER_FIELD.flags];
  }

  huntTargetSlot(slot: number): number {
    if (!this.slotInRange(slot)) return HUNT_TARGET_NONE;
    return this.u32[this.base(slot) + RENDER_FIELD.huntTargetSlot];
  }

  hasHuntTarget(slot: number): boolean {
    return this.huntTargetSlot(slot) !== HUNT_TARGET_NONE;
  }

  residenceBuildingId(slot: number): number {
    if (!this.slotInRange(slot)) return RESIDENCE_BUILDING_NONE;
    return this.u32[this.base(slot) + RENDER_FIELD.residenceBuildingId];
  }

  chatTicks(slot: number): number {
    if (!this.slotInRange(slot)) return 0;
    return this.u32[this.base(slot) + RENDER_FIELD.chatTicks];
  }

  /** Resolve hunt line target entity id from slot table. */
  huntTargetId(slot: number): number | undefined {
    const targetSlot = this.huntTargetSlot(slot);
    if (targetSlot === HUNT_TARGET_NONE || targetSlot >= this.aliveCount) return undefined;
    return this.id(targetSlot);
  }

  forEachSlot(fn: (slot: number) => void): void {
    const count = this.aliveCount;
    for (let slot = 0; slot < count; slot++) fn(slot);
  }

  get stride(): number {
    return RENDER_STRIDE_V1;
  }
}

export function createRenderSoAReader(buffer: ArrayBuffer): RenderSoAReaderV1 | null {
  return RenderSoAReaderV1.tryCreate(buffer);
}