/**
 * Orographic rain shadow — the directional half of the moisture field.
 *
 * **Why this exists.** Moisture was a noise field plus a *symmetric* altitude penalty
 * (`MOISTURE_ALTITUDE_PENALTY`), so both flanks of a mountain range dried by the same amount: a range had
 * no wet side and no dry side, and dry ground could only appear from the noise itself. Real ranges do have
 * sides. Air is forced up the windward flank, drops its water there, and comes down the leeward flank warm
 * and dry — which is what puts a dry interior behind a coastal range, and what stops a coastline from
 * being the only place a map can be arid.
 *
 * **Method.** For each cell, march **upwind** and record the highest ground standing between it and the
 * wind. The result is a dimensionless 0–1 dryness: it is strong immediately behind a ridge and decays
 * with distance, so a leeward plain dries at its range and recovers as it runs on. The field is pure — it
 * reads elevation and nothing else, and it is a function of the cell grid, not of the iteration order.
 *
 * The caller subtracts it from the moisture field. Doing it *before* the per-map moisture cuts are taken
 * matters: those cuts are quantiles of the finished field, so the wet/dry *proportions* of a map survive
 * while their *placement* becomes topographic — the same valley is forested on the windward side and open
 * on the leeward side.
 */

/**
 * Wind heading, as the direction the wind blows **toward** (a unit vector, so the upwind march is one
 * cell per step). This is a west-south-westerly carrying air east-north-east, which is the mid-latitude
 * pattern the effect is modelled on; it is deliberately **not** axis-aligned, because a shadow exactly
 * down a lattice axis reads as vertical banding on the finished map.
 */
const WIND_TO_X = 0.94;
const WIND_TO_Y = -0.34;

/**
 * How far upwind a cell looks for a barrier, in cells. A range further away than this no longer shades the
 * ground, which is what keeps the effect local to a ridge instead of drying a whole continent from its
 * first mountain.
 */
const REACH_CELLS = 48;

/** Height above the cell that still shades it — beyond this the barrier is "a mountain", not "a wall". */
const BARRIER_CAP = 0.35;

/** A barrier takes this much of its weight away over the reach: linear falloff, no cliff at the edge. */
const DISTANCE_DECAY = 1;

/**
 * How much moisture a full-strength shadow removes. Kept below the altitude penalty's own scale
 * (`0.28` per unit of elevation) so the shadow *tilts* a climate rather than overriding it: a ridge
 * makes a dry leeward flank, not a desert on every map.
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
