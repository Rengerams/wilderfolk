export interface FlowNetwork {
  downstream: Int32Array;
  accumulation: Float32Array;
}

export function fillDepressions(elevation: Float32Array, cols: number, rows: number): Float32Array {
  const n = cols * rows;
  const filled = new Float32Array(n);
  const seen = new Uint8Array(n);
  const heap = new Int32Array(n);
  let size = 0;

  const less = (a: number, b: number): boolean => {
    const za = filled[a];
    const zb = filled[b];
    return za < zb || (za === zb && a < b);
  };

  const push = (cell: number): void => {
    let child = size++;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      const pCell = heap[parent];
      if (!less(cell, pCell)) break;
      heap[child] = pCell;
      child = parent;
    }
    heap[child] = cell;
  };

  const pop = (): number => {
    const top = heap[0];
    const last = heap[--size];
    if (size > 0) {
      let parent = 0;
      while (true) {
        let left = (parent << 1) + 1;
        let right = left + 1;
        let smallest = parent;
        let sCell = last;

        if (left < size && less(heap[left], sCell)) {
          smallest = left;
          sCell = heap[left];
        }
        if (right < size && less(heap[right], sCell)) {
          smallest = right;
          sCell = heap[right];
        }
        if (smallest === parent) break;

        heap[parent] = sCell;
        parent = smallest;
      }
      heap[parent] = last;
    }
    return top;
  };

  // Seed boundary cells as drainage base
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1) continue;
      const i = y * cols + x;
      filled[i] = elevation[i];
      seen[i] = 1;
      push(i);
    }
  }

  // Priority-flood algorithm (Barnes et al.)
  while (size > 0) {
    const cell = pop();
    const cx = cell % cols;
    const cy = (cell / cols) | 0;

    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= rows) continue;
      const rowOffset = ny * cols;

      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        if (nx < 0 || nx >= cols) continue;

        const neighbour = rowOffset + nx;
        if (seen[neighbour]) continue;
        seen[neighbour] = 1;

        filled[neighbour] = Math.max(elevation[neighbour], filled[cell]);
        push(neighbour);
      }
    }
  }

  return filled;
}

const DIAGONAL_DISTANCE = Math.SQRT2;

export function computeFlow(filled: Float32Array, cols: number, rows: number): FlowNetwork {
  const n = cols * rows;
  const downstream = new Int32Array(n).fill(-1);
  const accumulation = new Float32Array(n).fill(1);

  // Pass 1: Steepest descent (D8)
  for (let y = 0; y < rows; y++) {
    const rowOffset = y * cols;
    for (let x = 0; x < cols; x++) {
      const cell = rowOffset + x;
      const z = filled[cell];
      let best = -1;
      let bestSlope = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= rows) continue;
        const nRow = ny * cols;

        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= cols) continue;

          const neighbour = nRow + nx;
          const drop = z - filled[neighbour];
          if (drop <= 0) continue;

          const dist = (dx !== 0 && dy !== 0) ? DIAGONAL_DISTANCE : 1;
          const slope = drop / dist;

          if (slope > bestSlope || (slope === bestSlope && best >= 0 && neighbour < best)) {
            bestSlope = slope;
            best = neighbour;
          }
        }
      }
      downstream[cell] = best;
    }
  }

  // Pass 2: Resolve flats via inward BFS from outlets and boundaries
  const resolved = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  for (let y = 0; y < rows; y++) {
    const rowOffset = y * cols;
    for (let x = 0; x < cols; x++) {
      const cell = rowOffset + x;
      const border = (x === 0 || y === 0 || x === cols - 1 || y === rows - 1);
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
      const ny = cy + dy;
      if (ny < 0 || ny >= rows) continue;
      const nRow = ny * cols;

      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        if (nx < 0 || nx >= cols) continue;

        const neighbour = nRow + nx;
        if (resolved[neighbour]) continue;
        if (filled[neighbour] < filled[cell]) continue;

        resolved[neighbour] = 1;
        downstream[neighbour] = cell;
        queue[tail++] = neighbour;
      }
    }
  }

  // Pass 3: Accumulate flow via Topological Sort (Kahn's algorithm) - O(N)
  const inDegree = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const d = downstream[i];
    if (d >= 0) inDegree[d]++;
  }

  head = 0;
  tail = 0;
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) {
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    const cell = queue[head++];
    const next = downstream[cell];
    if (next >= 0) {
      accumulation[next] += accumulation[cell];
      if (--inDegree[next] === 0) {
        queue[tail++] = next;
      }
    }
  }

  return { downstream, accumulation };
}

export const DISCHARGE_AREA_EXPONENT = 0.69;
export const WIDTH_AREA_EXPONENT = DISCHARGE_AREA_EXPONENT * 0.5;
export const HEADWATER_WIDTH_FACTOR = 0.3;
export const TRUNK_WIDTH_FACTOR = 2.4;
export const CHANNEL_WIDTH_SCALE = 0.3;

export function riverWidthAt(presetWidth: number, catchmentFraction: number): number {
  const t = Math.min(1, Math.max(0, catchmentFraction));
  return (
    presetWidth *
    CHANNEL_WIDTH_SCALE *
    (HEADWATER_WIDTH_FACTOR +
      (TRUNK_WIDTH_FACTOR - HEADWATER_WIDTH_FACTOR) * Math.pow(t, WIDTH_AREA_EXPONENT))
  );
}