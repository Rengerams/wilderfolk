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

function bench(label: string, focus: ReturnType<typeof getSimFocus>) {
  let state = initGame({ villageName: 'Balanceville', size: MapSize.Large });
  state.resources.food = 5000;
  const cx = state.width / 2;
  const cy = state.height / 2;
  for (let i = 0; i < HUMANS; i++) {
    state.entities.push(
      createEntity(EntityType.Human, cx + (Math.random() - 0.5) * 400, cy + (Math.random() - 0.5) * 300, state.nextEntityId++, 250),
    );
  }
  state.humanPopulation = HUMANS;

  const ms: number[] = [];
  for (let t = 1; t <= WARMUP + TICKS; t++) {
    const t0 = performance.now();
    state = gameTick(state, focus);
    if (t > WARMUP) ms.push(performance.now() - t0);
  }
  const sorted = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  let alive = 0;
  for (const e of state.entities) if (e.alive) alive++;
  console.log(
    `${label}: grid=${USE_SPATIAL_GRID ? 'ON' : 'OFF'} alive=${alive} | avg=${avg.toFixed(2)}ms p95=${sorted[Math.floor(sorted.length * 0.95)].toFixed(2)}ms max=${sorted[sorted.length - 1].toFixed(2)}ms`,
  );
}

async function main() {
  await preloadDialogueBank();
  const state = initGame({ size: MapSize.Large });
  const focus = getSimFocus(state);
  const full = process.env.SIM_FULL_SIM === '1' ? undefined : focus;
  bench(`97 humans focus=${full ? 'ON' : 'OFF'}`, full);
}

main();