import type { Entity } from './gameTypes';
import { EntityType } from './gameTypes';
import { envFlagDisabled, MOBILE_CELL_SIZE } from './spatialGrid';
import { isActiveMoonHowler } from './moonHowler';

/** Magic `WFSN` — Wilderfolk scent sidecar. */
export const SCENT_GRID_MAGIC = 0x5746534e;

export const SCENT_GRID_VERSION = 1;

export const SCENT_HEADER_WORDS = 6;

export const SCENT_HEADER = {
  magic: 0,
  schemaVersion: 1,
  tick: 2,
  cols: 3,
  rows: 4,
  cellSize: 5,
} as const;

/** Per-tick multiplicative decay (≈ half-life ~20 ticks). */
export const SCENT_DECAY_PER_TICK = 0.965;

export const WOLF_SCENT_DEPOSIT = 6;
export const FOX_SCENT_DEPOSIT = 3;
export const WEREWOLF_SCENT_DEPOSIT = 11;

/** Minimum neighborhood scent before grazers react. */
export const SCENT_FLEE_MIN = 1.4;

export const RABBIT_SCENT_SENSITIVITY = 1.25;
export const DEER_SCENT_SENSITIVITY = 0.75;
export const WILDKIN_SCENT_SENSITIVITY = 0.55;

function isScentGridDisabled(): boolean {
  if (typeof import.meta !== 'undefined' && envFlagDisabled(import.meta.env?.VITE_USE_SCENT_GRID)) {
    return true;
  }
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return envFlagDisabled(runtime.process?.env?.USE_SCENT_GRID);
}

export const USE_SCENT_GRID = !isScentGridDisabled();

export interface ScentGradientSample {
  /** Unit vector — flee away from rising scent. */
  awayX: number;
  awayY: number;
  /** Average scent in 3×3 neighborhood. */
  strength: number;
}

export interface ScentGridRuntime {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly values: Float32Array;
}

export class ScentGrid implements ScentGridRuntime {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly values: Float32Array;

  constructor(mapWidth: number, mapHeight: number, cellSize = MOBILE_CELL_SIZE) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(mapWidth / cellSize));
    this.rows = Math.max(1, Math.ceil(mapHeight / cellSize));
    this.values = new Float32Array(this.cols * this.rows);
  }

  static fromRuntime(runtime: ScentGridRuntime): ScentGrid {
    const grid = new ScentGrid(runtime.cols * runtime.cellSize, runtime.rows * runtime.cellSize, runtime.cellSize);
    grid.values.set(runtime.values);
    return grid;
  }

  /** Reuse a plain runtime object (e.g. after structuredClone) without copying values. */
  static adoptRuntime(runtime: ScentGridRuntime): ScentGrid {
    const grid = Object.create(ScentGrid.prototype) as {
      cols: number;
      rows: number;
      cellSize: number;
      values: Float32Array;
    };
    grid.cols = runtime.cols;
    grid.rows = runtime.rows;
    grid.cellSize = runtime.cellSize;
    grid.values = runtime.values;
    return grid as ScentGrid;
  }

  private index(col: number, row: number): number {
    return row * this.cols + col;
  }

  cellCoords(x: number, y: number): { col: number; row: number } {
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    return { col, row };
  }

  decay(factor = SCENT_DECAY_PER_TICK): void {
    for (let i = 0; i < this.values.length; i++) {
      this.values[i] *= factor;
    }
  }

  deposit(x: number, y: number, amount: number): void {
    if (amount <= 0) return;
    const { col, row } = this.cellCoords(x, y);
    const idx = this.index(col, row);
    this.values[idx] = Math.min(255, this.values[idx] + amount);
  }

  /** Stain cells where mobile predators stood this tick (wolf / fox / active werewolf only). */
  depositPredatorScent(entities: Iterable<Entity>): void {
    for (const entity of entities) {
      if (!entity.alive) continue;
      const type = entity.type;
      if (
        type !== EntityType.Wolf
        && type !== EntityType.Fox
        && type !== EntityType.Werewolf
      ) {
        continue;
      }
      let amount = 0;
      if (type === EntityType.Wolf) amount = WOLF_SCENT_DEPOSIT;
      else if (type === EntityType.Fox) amount = FOX_SCENT_DEPOSIT;
      else if (type === EntityType.Werewolf && isActiveMoonHowler(entity)) amount = WEREWOLF_SCENT_DEPOSIT;
      else continue;
      this.deposit(entity.x, entity.y, amount);
    }
  }

  getScentAt(x: number, y: number): number {
    const { col, row } = this.cellCoords(x, y);
    return this.values[this.index(col, row)];
  }

  /**
   * Sample 3×3 neighborhood — grazers move opposite the scent gradient.
   * Returns zero vector when scent is below threshold.
   */
  sampleFleeGradient(x: number, y: number, sensitivity = 1): ScentGradientSample {
    const { col: cx, row: cy } = this.cellCoords(x, y);
    let sum = 0;
    let gradX = 0;
    let gradY = 0;
    let count = 0;

    for (let row = Math.max(0, cy - 1); row <= Math.min(this.rows - 1, cy + 1); row++) {
      for (let col = Math.max(0, cx - 1); col <= Math.min(this.cols - 1, cx + 1); col++) {
        const scent = this.values[this.index(col, row)];
        if (!Number.isFinite(scent) || scent <= 0) continue;
        const cellCenterX = (col + 0.5) * this.cellSize;
        const cellCenterY = (row + 0.5) * this.cellSize;
        gradX += scent * (cellCenterX - x);
        gradY += scent * (cellCenterY - y);
        sum += scent;
        count++;
      }
    }

    const strength = count > 0 ? (sum / count) * sensitivity : 0;
    if (strength < SCENT_FLEE_MIN) {
      return { awayX: 0, awayY: 0, strength: 0 };
    }

    const mag = Math.hypot(gradX, gradY) || 1;
    return {
      awayX: -gradX / mag,
      awayY: -gradY / mag,
      strength,
    };
  }

  packSidecar(tick: number, into?: ArrayBuffer): ArrayBuffer {
    const words = SCENT_HEADER_WORDS + this.values.length;
    const byteLength = words * 4;
    const buffer = into && into.byteLength >= byteLength ? into : new ArrayBuffer(byteLength);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);

    u32[SCENT_HEADER.magic] = SCENT_GRID_MAGIC;
    u32[SCENT_HEADER.schemaVersion] = SCENT_GRID_VERSION;
    u32[SCENT_HEADER.tick] = tick >>> 0;
    u32[SCENT_HEADER.cols] = this.cols;
    u32[SCENT_HEADER.rows] = this.rows;
    u32[SCENT_HEADER.cellSize] = this.cellSize;

    f32.set(this.values, SCENT_HEADER_WORDS);
    return buffer;
  }
}

export class ScentGridReader {
  private readonly u32: Uint32Array;
  private readonly f32: Float32Array;

  constructor(buffer: ArrayBuffer) {
    this.u32 = new Uint32Array(buffer);
    this.f32 = new Float32Array(buffer);
  }

  static tryCreate(buffer: ArrayBuffer): ScentGridReader | null {
    if (buffer.byteLength < SCENT_HEADER_WORDS * 4) return null;
    const u32 = new Uint32Array(buffer);
    if (u32[SCENT_HEADER.magic] !== SCENT_GRID_MAGIC) return null;
    if (u32[SCENT_HEADER.schemaVersion] !== SCENT_GRID_VERSION) return null;
    return new ScentGridReader(buffer);
  }

  get tick(): number {
    return this.u32[SCENT_HEADER.tick];
  }

  get cols(): number {
    return this.u32[SCENT_HEADER.cols];
  }

  get rows(): number {
    return this.u32[SCENT_HEADER.rows];
  }

  get cellSize(): number {
    return this.u32[SCENT_HEADER.cellSize];
  }

  scentAt(col: number, row: number): number {
    const idx = SCENT_HEADER_WORDS + row * this.cols + col;
    const scent = this.f32[idx];
    return Number.isFinite(scent) ? scent : 0;
  }

  maxScent(): number {
    let max = 0;
    const start = SCENT_HEADER_WORDS;
    const end = start + this.cols * this.rows;
    for (let i = start; i < end; i++) {
      if (this.f32[i] > max) max = this.f32[i];
    }
    return max;
  }
}

export function scentSidecarByteLength(cols: number, rows: number): number {
  return (SCENT_HEADER_WORDS + cols * rows) * 4;
}

export function isScentGridRuntime(value: unknown): value is ScentGridRuntime {
  if (!value || typeof value !== 'object') return false;
  const grid = value as ScentGridRuntime;
  return (
    Number.isFinite(grid.cols) && grid.cols > 0
    && Number.isFinite(grid.rows) && grid.rows > 0
    && Number.isFinite(grid.cellSize) && grid.cellSize > 0
    && grid.values instanceof Float32Array
    && grid.values.length === grid.cols * grid.rows
  );
}

export function ensureScentGrid(
  state: { width: number; height: number; scentGrid?: ScentGrid },
): ScentGrid {
  const cellSize = MOBILE_CELL_SIZE;
  const cols = Math.max(1, Math.ceil(state.width / cellSize));
  const rows = Math.max(1, Math.ceil(state.height / cellSize));

  const existing = state.scentGrid;
  if (
    isScentGridRuntime(existing)
    && existing.cols === cols
    && existing.rows === rows
    && existing.cellSize === cellSize
  ) {
    const grid = existing instanceof ScentGrid
      ? existing
      : ScentGrid.adoptRuntime(existing);
    state.scentGrid = grid;
    return grid;
  }

  state.scentGrid = new ScentGrid(state.width, state.height, cellSize);
  return state.scentGrid;
}

export function tickScentGrid(
  state: { scentGrid?: ScentGrid },
  predators: Iterable<Entity>,
): ScentGrid | undefined {
  if (!USE_SCENT_GRID || !state.scentGrid) return undefined;
  state.scentGrid.decay();
  state.scentGrid.depositPredatorScent(predators);
  return state.scentGrid;
}