/**
 * Flow routing for the river carve — the hydrology half of the SIGGRAPH 2013 model
 * (Génevaux et al., *Terrain Generation Using Procedural Models Based on Hydrology*, §4–5).
 *
 * **Why this exists.** The generator used to pick river sources by an elevation score and then walk a
 * gradient with a meander bend, so a "river" was a *path*, not a drainage network: nothing knew how much
 * land drained through a point, two paths could cross, the walk needed a stagnation bail-out when the
 * gradient flattened on a depression, and the channel's width was a function of how far along the path it
 * had travelled (`step / 200`). The paper routes water instead: every cell drains into its lowest
 * neighbour, the terrain is de-pitted first so that routing is well defined, and a watercourse is read
 * from the **area that drains through it** — its mean flow is `φ = 0.42 · A^0.69` with `A` the upstream
 * watershed area (§5.1, after Dunne & Leopold 1978).
 *
 * These two passes are that routing. They are pure, deterministic, and depend on nothing else in the
 * terrain stack: same field in, same network out.
 */

/** Where each cell sends its water, and how much land drains through it. */
export interface FlowNetwork {
  /** Index of the cell this cell drains into, or `-1` at an outlet (map edge or an unresolvable pit). */
  downstream: Int32Array;
  /**
   * Upstream area draining through each cell, counted **in cells including itself** — the paper's
   * watershed area `A`, before it is turned into a discharge.
   */
  accumulation: Float32Array;
}

/**
 * Depressions removed, in the sense that every cell can now drain to the map edge.
 *
 * A priority flood (the standard "fill sinks" pass): start from the border, repeatedly take the lowest
 * known cell and raise each of its unvisited neighbours to at least that height. A closed basin — and the
 * noisy micro-pits the noise field is full of — becomes a flat pan at its spill point, which is what lets
 * a lake sit in a real basin rather than on a noise bump, and what stops a descent walk from looping.
 *
 * The heap breaks ties by cell index, so the result is bit-identical run to run.
 */
export function fillDepressions(elevation: Float32Array, cols: number, rows: number): Float32Array {
  const n = cols * rows;
  const filled = new Float32Array(n);
  const seen = new Uint8Array(n);
  // Binary min-heap of cell indices, ordered by (filled elevation, index). Typed arrays keep this
  // allocation-free per operation and deterministic.
  const heap = new Int32Array(n);
  let size = 0;

  const less = (a: number, b: number): boolean => {
    const za = filled[a];
    const zb = filled[b];
    return za < zb || (za === zb && a < b);
  };
  const push = (cell: number): void => {
    let child = size++;
    heap[child] = cell;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!less(heap[child], heap[parent])) break;
      const swap = heap[parent];
      heap[parent] = heap[child];
      heap[child] = swap;
      child = parent;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    size--;
    if (size > 0) {
      heap[0] = heap[size];
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < size && less(heap[left], heap[smallest])) smallest = left;
        if (right < size && less(heap[right], heap[smallest])) smallest = right;
        if (smallest === parent) break;
        const swap = heap[smallest];
        heap[smallest] = heap[parent];
        heap[parent] = swap;
        parent = smallest;
      }
    }
    return top;
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1) continue; // interior cells are pushed by a neighbour
      const i = y * cols + x;
      filled[i] = elevation[i];
      seen[i] = 1;
      push(i);
    }
  }

  while (size > 0) {
    const cell = pop();
    const cx = cell % cols;
    const cy = (cell / cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const neighbour = ny * cols + nx;
        if (seen[neighbour]) continue;
        seen[neighbour] = 1;
        // Raise to the draining cell's own height where the ground is lower: the pit is filled to its
        // spill point, and nothing is ever lowered.
        filled[neighbour] = Math.max(elevation[neighbour], filled[cell]);
        push(neighbour);
      }
    }
  }
  return filled;
}

/** A diagonal step covers √2 cells, so a diagonal drop is a *gentler* slope than the same drop orthogonally. */
const DIAGONAL_DISTANCE = 1.4142135623730951;

/**
 * D8 flow directions and the upstream area that reaches each cell.
 *
 * Three passes, because forcing water downhill on a noisy field needs all three — this was **measured**,
 * not assumed: with the fill alone, 14–27 % of cells had no lower neighbour and the longest path from any
 * cell was only ~30 cells, i.e. the network was in fragments, and every river drawn on it was a stub.
 *
 * 1. **Steepest descent** by slope (`Δz / distance`) on the filled field, ties broken by the lowest
 *    neighbour index, so the network is reproducible.
 * 2. **Flat resolution** — the fill turns every pit into a flat pan, and on a flat *no* neighbour is
 *    strictly lower, so those cells would never drain. A breadth-first sweep from the cells that do drain
 *    (and from the map border, which is an outlet) walks *across* each flat, an equal-or-lower neighbour
 *    at a time, and points every unresolved cell at its parent. Uphill steps are never taken, so no cell
 *    is ever routed up.
 * 3. **Accumulation** in one pass, ordered by descending height and, within a flat, by descending
 *    distance to its outlet — so a cell's own upstream area is complete before it hands it on.
 */
export function computeFlow(filled: Float32Array, cols: number, rows: number): FlowNetwork {
  const n = cols * rows;
  const downstream = new Int32Array(n).fill(-1);
  const accumulation = new Float32Array(n).fill(1);
  const flatDepth = new Int32Array(n);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = y * cols + x;
      const z = filled[cell];
      let best = -1;
      let bestSlope = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const neighbour = ny * cols + nx;
          const drop = z - filled[neighbour];
          if (drop <= 0) continue;
          const slope = drop / (dx !== 0 && dy !== 0 ? DIAGONAL_DISTANCE : 1);
          // Strictly steeper, or equal slope to a lower index: the tie-break makes the network stable.
          if (slope > bestSlope || (slope === bestSlope && best >= 0 && neighbour < best)) {
            bestSlope = slope;
            best = neighbour;
          }
        }
      }
      downstream[cell] = best;
    }
  }

  // Pass 2 — flat resolution. A cell drains by slope, or it is the map border (water leaves the map),
  // and either way it can carry a flat's water onward; the sweep then reaches inward across the flats.
  const resolved = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = y * cols + x;
      const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
      if (downstream[cell] >= 0 || border) {
        resolved[cell] = 1;
        queue[tail++] = cell;
      }
    }
  }
  while (head < tail) {
    const cell = queue[head++];
    const cx = cell % cols;
    const cy = (cell / cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const neighbour = ny * cols + nx;
        if (resolved[neighbour]) continue;
        // Water reaches this cell from the neighbour only if the neighbour is level with it or higher.
        // (This guard is the difference between a drainage network and a cycle: allowing a *lower*
        // neighbour to drain "into" a higher cell closes a loop, and a river walked along it never
        // reaches the sea. Measured — that mistake made every walk run the full n cells.)
        if (filled[neighbour] < filled[cell]) continue;
        resolved[neighbour] = 1;
        downstream[neighbour] = cell;
        flatDepth[neighbour] = flatDepth[cell] + 1;
        queue[tail++] = neighbour;
      }
    }
  }

  // Pass 3 — highest ground first, and within a flat the cells furthest from its outlet first.
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => filled[b] - filled[a] || flatDepth[b] - flatDepth[a] || a - b);
  for (const cell of order) {
    const next = downstream[cell];
    if (next >= 0) accumulation[next] += accumulation[cell];
  }
  return { downstream, accumulation };
}

/**
 * The mean flow through a point, from the area that drains through it.
 *
 * The paper's §5.1 power law, `φ = 0.42 · A^0.69` (A in m², φ in m³s⁻¹), after Dunne & Leopold. Wilderfolk
 * has no metric scale — a cell is 16 px and the world is dimensionless — so the constants are dropped and
 * only the law's **shape** is kept: the caller supplies `area` normalised to the map's own largest
 * catchment, and this returns a relative discharge. What matters is that width follows drainage area
 * rather than distance travelled, which is the entire point of routing water.
 */
export const DISCHARGE_AREA_EXPONENT = 0.69;

export function relativeDischarge(normalisedArea: number): number {
  return Math.pow(Math.max(0, normalisedArea), DISCHARGE_AREA_EXPONENT);
}

/**
 * Channel width from the land that drains through the point — the paper's chain `A → φ → geometry`,
 * with the constants that shape Wilderfolk's rivers rather than a physical unit system.
 *
 * `φ = 0.42·A^0.69` (§5.1) gives the mean flow, and the standard hydraulic-geometry width law `w ∝ φ^0.5`
 * turns it into a width, so `w ∝ A^0.345`. A headwater is `HEADWATER_WIDTH_FACTOR` of the preset's
 * channel width and the map's trunk river `TRUNK_WIDTH_FACTOR` of it, which keeps every preset's own
 * `riverWidth` meaningful while letting a river visibly fatten downstream.
 */
export const WIDTH_AREA_EXPONENT = DISCHARGE_AREA_EXPONENT * 0.5;
export const HEADWATER_WIDTH_FACTOR = 0.3;
export const TRUNK_WIDTH_FACTOR = 2.4;

/**
 * Global narrowing of every channel, applied inside the law so each preset keeps its relative width.
 *
 * Measured on the water field (the cells above the river threshold, crossed perpendicular to the flow),
 * channels came out **3–6 terrain cells wide, 48–96 px at the median** — a band, not a river. The
 * reference look for this project is a **narrow channel, 1–2 cells across**, which is what this brings
 * it to. It is a scale on the law rather than an edit to the preset table because the preset
 * `riverWidth` values still have to express the relative difference between presets.
 */
export const CHANNEL_WIDTH_SCALE = 0.3;

export function riverWidthAt(presetWidth: number, catchmentFraction: number): number {
  const t = Math.min(1, Math.max(0, catchmentFraction));
  return presetWidth * CHANNEL_WIDTH_SCALE * (HEADWATER_WIDTH_FACTOR
    + (TRUNK_WIDTH_FACTOR - HEADWATER_WIDTH_FACTOR) * Math.pow(t, WIDTH_AREA_EXPONENT));
}
