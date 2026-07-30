/**
 * Minimal headless perf curve: tick ms vs population (organic growth, no sim logging).
 * Run: npx tsx scripts/perf-vs-pop.ts
 */
import { gameTick, initGame, recruitSettler } from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { isPlayerHuman } from '../src/game/groupEvents';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { tryPlaceBuilding } from './simBuildUtils';
import { BuildingType } from '../src/game/gameTypes';

const SAMPLE_EVERY = 360;
const MAX_TICKS = Number(process.env.MAX_TICKS ?? 8640);

function countHumans(state: ReturnType<typeof initGame>) {
  let n = 0;
  let alive = 0;
  for (const e of state.entities) {
    if (!e.alive) continue;
    alive++;
    if (isPlayerHuman(e)) n++;
  }
  return { humans: n, alive };
}

async function main() {
  await preloadDialogueBank();
  let state = initGame({ villageName: 'Perfville', size: MapSize.Large });
  state.resources.food = 5000;
  state.resources.wood = 5000;
  state.resources.stone = 3000;
  state.resources.gold = 2000;
  state.maxHumanPopulation = 400;

  const cx = state.width / 2;
  const cy = state.height / 2;
  const focus = getSimFocus(state);
  const zoom = process.env.SIM_ZOOM ?? '(default)';
  console.log(`Map ${state.width}x${state.height} | focus zoom=${zoom} | ticks=${MAX_TICKS}`);

  const samples: { tick: number; ms: number; humans: number; alive: number }[] = [];
  const window: number[] = [];
  const start = performance.now();

  for (let t = 1; t <= MAX_TICKS; t++) {
    if (t === 1) {
      const { state: s, ok } = tryPlaceBuilding(state, BuildingType.House, cx, cy);
      if (ok) state = s;
    }
    if (t % 48 === 0) {
      const { state: s, ok } = tryPlaceBuilding(state, BuildingType.House, cx + (t % 200) - 100, cy + (t % 160) - 80);
      if (ok) state = s;
    }
    if (t % 120 === 0 && state.humanPopulation < state.maxHumanPopulation - 2) {
      state = recruitSettler(state);
    }

    const t0 = performance.now();
    state = gameTick(state, focus);
    const ms = performance.now() - t0;
    window.push(ms);
    if (window.length > 120) window.shift();

    if (t % SAMPLE_EVERY === 0) {
      const { humans, alive } = countHumans(state);
      const sorted = [...window].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? ms;
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      samples.push({ tick: t, ms: avg, humans, alive });
      console.log(
        `tick ${t} (Y${state.year}d${state.dayInYear}): avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms | humans=${humans} alive=${alive}`,
      );
    }
  }

  const wall = ((performance.now() - start) / 1000).toFixed(1);
  const last = samples[samples.length - 1];
  console.log(`\nDone in ${wall}s wall time`);
  if (last) {
    console.log(`End state: humans=${last.humans} alive=${last.alive} avg=${last.ms.toFixed(1)}ms`);
    const playable = last.ms < 16 ? 'OK @ 1x (16ms budget)' : last.ms < 50 ? 'marginal' : 'too slow for 1x';
    console.log(`Playability @ end pop: ${playable}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});