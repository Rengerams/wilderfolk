/** Benchmark ~97 humans like Balanceville @ day 180. */
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import { USE_SPATIAL_GRID } from '../src/game/spatialGrid';

const TICKS = 300;
const WARMUP = 30;
const HUMANS = 97;

// Seeded PRNG (mulberry32) for reproducible benchmarks
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bench(label: string, focus: ReturnType<typeof getSimFocus> | undefined) {
  let state = initGame({ villageName: 'Balanceville', size: MapSize.Large });

  // Validate map dimensions before use
  if (!state.width || !state.height) {
    throw new Error('Map dimensions missing after initGame');
  }

  // Safe resource initialization — handles both mutable and frozen state objects
  if (state.resources && typeof state.resources === 'object') {
    state.resources.food = 5000;
  }

  const cx = state.width / 2;
  const cy = state.height / 2;

  // Ensure nextEntityId is initialized to avoid NaN IDs
  state.nextEntityId = state.nextEntityId ?? 0;

  const rng = mulberry32(42); // Fixed seed for reproducibility

  for (let i = 0; i < HUMANS; i++) {
    const entity = createEntity(
      EntityType.Human,
      cx + (rng() - 0.5) * 400,
      cy + (rng() - 0.5) * 300,
      state.nextEntityId++,
      250,
    );
    if (state.entities && Array.isArray(state.entities)) {
      state.entities.push(entity);
    }
  }

  // Sync population counter — gameTick may rely on this
  state.humanPopulation = HUMANS;

  const simFocus = focus ?? getSimFocus(state);

  const ms: number[] = [];
  const aliveLog: number[] = [];

  for (let t = 1; t <= WARMUP + TICKS; t++) {
    const t0 = performance.now();
    state = gameTick(state, simFocus);
    const tickMs = performance.now() - t0;

    if (t > WARMUP) {
      ms.push(tickMs);
      let alive = 0;
      for (const e of state.entities) if (e.alive) alive++;
      aliveLog.push(alive);
    }
  }

  if (ms.length === 0) {
    console.log(`${label}: no steady-state ticks collected (TICKS=${TICKS})`);
    return;
  }

  const sorted = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const p95Idx = Math.floor(sorted.length * 0.95);
  const p95 = sorted[Math.min(p95Idx, sorted.length - 1)];
  const max = sorted[sorted.length - 1];

  const finalAlive = aliveLog[aliveLog.length - 1] ?? 0;
  const minAlive = Math.min(...aliveLog);

  console.log(
    `${label}: grid=${USE_SPATIAL_GRID ? 'ON' : 'OFF'} alive=${finalAlive} (min=${minAlive}) | avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
  );
}

async function main() {
  try {
    if (process.env.SIM_PRELOAD_DIALOGUE === '1') {
      await preloadDialogueBank();
    }

    const state = initGame({ size: MapSize.Large });
    const focus = getSimFocus(state);

    const useFocus = process.env.SIM_FULL_SIM !== '1';
    const benchFocus = useFocus ? focus : undefined;

    bench(`97 humans focus=${useFocus ? 'ON' : 'OFF'}`, benchFocus);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('Benchmark failed:', err.stack || err.message);
    } else {
      console.error('Benchmark failed:', JSON.stringify(err));
    }
    process.exitCode = 1;
  }
}

main();