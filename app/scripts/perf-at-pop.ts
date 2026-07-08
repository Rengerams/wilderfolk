/**
 * Tick cost vs player-human count (instant seed, no logging).
 * Run: npx tsx scripts/perf-at-pop.ts
 */
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { isPlayerHuman } from '../src/game/groupEvents';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import {
  countAlive,
  maintainCityBenchmarkState,
  refreshCityBenchmarkResources,
  seedCityScaleProfile,
  DEFAULT_CITY_TARGETS,
} from './simCityProfile';

const TICKS = Number(process.env.PERF_TICKS ?? 300);
const WARMUP = 30;

function countPlayerHumans(state: ReturnType<typeof initGame>): number {
  let n = 0;
  for (const e of state.entities) {
    if (e.alive && e.type === EntityType.Human && isPlayerHuman(e)) n++;
  }
  return n;
}

function seedHumans(state: ReturnType<typeof initGame>, count: number) {
  const cx = state.width / 2;
  const cy = state.height / 2;
  for (let i = 0; i < count; i++) {
    const h = createEntity(EntityType.Human, cx + (Math.random() - 0.5) * 300, cy + (Math.random() - 0.5) * 300, state.nextEntityId++, 300);
    h.name = `S${i}`;
    h.surname = 'Test';
    h.gender = i % 2 === 0 ? 'male' : 'female';
    state.entities.push(h);
    state.humanPopulation++;
  }
}

function bench(state: ReturnType<typeof initGame>, label: string, focus: ReturnType<typeof getSimFocus>) {
  const ms: number[] = [];
  for (let t = 1; t <= WARMUP + TICKS; t++) {
    maintainCityBenchmarkState(state);
    refreshCityBenchmarkResources(state, t);
    const t0 = performance.now();
    state = gameTick(state, focus);
    const dt = performance.now() - t0;
    maintainCityBenchmarkState(state);
    if (t > WARMUP) ms.push(dt);
  }
  const sorted = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];
  console.log(
    `${label}: humans=${countPlayerHumans(state)} alive=${countAlive(state)} | avg=${avg.toFixed(2)}ms p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
  );
  return { avg, p95 };
}

async function main() {
  await preloadDialogueBank();
  const focus = getSimFocus(initGame({ size: MapSize.Large }));
  const fullSim = process.env.SIM_FULL_SIM === '1';

  console.log(`Ticks=${TICKS} warmup=${WARMUP} | focus=${fullSim ? 'OFF (full sim)' : 'ON (viewport throttle)'}`);
  console.log('');

  for (const pop of [50, 100, 150, 200, 250, 300]) {
    const state = initGame({ villageName: 'Bench', size: MapSize.Large });
    state.resources.food = 8000;
    seedHumans(state, pop);
    bench(state, `Seed ${pop} humans`, fullSim ? undefined : focus);
  }

  console.log('');
  const city = initGame({ villageName: 'City', size: MapSize.Large });
  city.resources.food = 8000;
  seedCityScaleProfile(city, DEFAULT_CITY_TARGETS);
  bench(city, `City profile (${DEFAULT_CITY_TARGETS.playerHumans}+neighbors)`, fullSim ? undefined : focus);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});