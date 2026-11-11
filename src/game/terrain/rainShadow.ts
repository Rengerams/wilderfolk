/**
 * Orographic rain shadow — the directional half of the moisture field: each cell marches upwind
 * and records the highest ground, giving a 0–1 dryness that is strong behind a ridge and decays.
 */

/**
 * Wind heading, as the direction the wind blows toward (a unit vector, so the upwind march is one
 * cell per step). Deliberately not axis-aligned, which would read as vertical banding.
 */
const WIND_TO_X = 0.94;
const WIND_TO_Y = -0.34;

/**
 * How far upwind a cell looks for a barrier, in cells: a range farther than this no longer
 * shades the ground, keeping the effect local to a ridge.
 */
const REACH_CELLS = 48;

/** Height above the cell that still shades it — beyond this the barrier is "a mountain", not "a wall". */
const BARRIER_CAP = 0.35;

/** A barrier takes this much of its weight away over the reach: linear falloff, no cliff at the edge. */
const DISTANCE_DECAY = 1;

/**
 * How much moisture a full-strength shadow removes, kept below the altitude penalty's scale
 * so a ridge tilts a climate rather than making a desert.
 */
export const RAIN_SHADOW_MOISTURE_STRENGTH = 0.42;

/**
 * Per-cell dryness from the terrain alone: 0 for ground with open sky upwind, rising toward 1 behind a
 * tall ridge. Deterministic and order-independent — each cell's value depends only on the elevation field.
 */
export function rainShadowField(elevation: Float32Array, cols: number, rows: number): Float32Array {
  const shadow = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = y * cols + x;
      const own = elevation[cell];
      let strongest = 0;
      for (let step = 1; step <= REACH_CELLS; step++) {
        // Upwind is against the wind heading, so the shadow lands on the far side of the ridge.
        const ux = Math.round(x - WIND_TO_X * step);
        const uy = Math.round(y - WIND_TO_Y * step);
        if (ux < 0 || uy < 0 || ux >= cols || uy >= rows) break;
        const barrier = elevation[uy * cols + ux] - own;
        if (barrier <= 0) continue;
        const weight = Math.min(BARRIER_CAP, barrier) * (1 - DISTANCE_DECAY * (step - 1) / REACH_CELLS);
        if (weight > strongest) strongest = weight;
      }
      shadow[cell] = Math.min(1, strongest / BARRIER_CAP);
    }
  }
  return shadow;
}
