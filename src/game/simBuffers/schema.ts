/** Magic `WFKR` — Wilderfolk render buffer. */
export const RENDER_SOA_MAGIC = 0x57464b52;

export const RENDER_SOA_VERSION = 1;

/** Words (u32/f32 slots) before entity rows. */
export const RENDER_HEADER_WORDS = 8;

/** Words per alive entity row — append-only when bumping version. */
export const RENDER_STRIDE_V1 = 16;

export const RENDER_MAX_SLOTS = 1500;

export const RENDER_FIELD = {
  id: 0,
  typeCode: 1,
  x: 2,
  y: 3,
  vx: 4,
  vy: 5,
  spriteAngle: 6,
  animFrame: 7,
  size: 8,
  flash: 9,
  flags: 10,
  huntTargetSlot: 11,
  residenceBuildingId: 12,
  chatTicks: 13,
  /** Reserved for v2 — scentLevel, packBonus, etc. */
  reserved0: 14,
  reserved1: 15,
} as const;

/** Header layout (Uint32 indices). */
export const RENDER_HEADER = {
  magic: 0,
  schemaVersion: 1,
  tick: 2,
  aliveCount: 3,
  maxSlot: 4,
  worldWidth: 5,
  worldHeight: 6,
  globalFlags: 7,
} as const;

/** Flag bits — upper 16 bits reserved for future bool semantics. */
export const RENDER_FLAG_ALIVE = 1 << 0;
export const RENDER_FLAG_JUVENILE = 1 << 1;
export const RENDER_FLAG_FEMALE = 1 << 2;
export const RENDER_FLAG_MALE = 1 << 3;
export const RENDER_FLAG_MOON_HOWLER = 1 << 4;
export const RENDER_FLAG_TAMED = 1 << 5;
export const RENDER_FLAG_RIVAL = 1 << 6;
export const RENDER_FLAG_VISITOR = 1 << 7;
export const RENDER_FLAG_PREGNANT = 1 << 8;
export const RENDER_FLAG_EDUCATED = 1 << 9;
export const RENDER_FLAG_COMBAT = 1 << 10;

export const HUNT_TARGET_NONE = 0xffffffff;

/** No residence building — distinct from building id 0. */
export const RESIDENCE_BUILDING_NONE = 0xffffffff;

/** `globalFlags` bit — packed aliveCount < total alive entities. */
export const RENDER_GLOBAL_OVERFLOW = 1 << 0;

export function renderBufferWordCount(maxSlots = RENDER_MAX_SLOTS): number {
  return RENDER_HEADER_WORDS + maxSlots * RENDER_STRIDE_V1;
}

export function renderBufferByteLength(maxSlots = RENDER_MAX_SLOTS): number {
  return renderBufferWordCount(maxSlots) * 4;
}

export function rowBaseWord(slot: number): number {
  return RENDER_HEADER_WORDS + slot * RENDER_STRIDE_V1;
}