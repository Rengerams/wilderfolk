/**
 * gameTick-only perf at town scale (no sim harness overhead).
 * Run: npx tsx scripts/profile-town-tick.ts
 */
import { gameTick, initGame, recruitSettler } from '../src/game/gameEngine';
import { BuildingType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { isPlayerHuman } from '../src/game/groupEvents';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { tryPlaceBuilding } from './simBuildUtils';

const TARGET = Number(process.env.PROFILE_TICKS ?? 2880);

function countPlayerHumans(state: ReturnType<typeof initGame>) {
  let n = 0;
  for (const e of state.entities) if (e.alive && isPlayerHuman(e)) n++;
  return n;
}

async function main() {
  await preloadDialogueBank();
  let state = initGame({ villageName: 'Profileville', size: MapSize.Large });
  state.resources.food = 5000;
  state.resources.wood = 5000;
  state.resources.stone = 3000;
  state.resources.gold = 2000;
  state.maxHumanPopulation = 120;

  const cx = state.width / 2;
  const cy = state.height / 2;
  const focus = getSimFocus(state);

  const samples: { tick: number; avg: number; p95: number; humans: number }[] = [];
  const window: number[] = [];

  for (let t = 1; t <= TARGET; t++) {
    if (t % 36 === 0) {
      tryPlaceBuilding(state, BuildingType.House, cx + (t % 200) - 100, cy + (t % 160) - 80);
    }
    if (t % 120 === 0 && state.humanPopulation < state.maxHumanPopulation - 2) {
      state = recruitSettler(state);
    }

    const t0 = performance.now();
    state = gameTick(state, focus);
    const ms = performance.now() - t0;
    window.push(ms);
    if (window.length > 120) window.shift();

    if (t % 720 === 0) {
      const sorted = [...window].sort((a, b) => a - b);
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? ms;
      samples.push({ tick: t, avg, p95, humans: countPlayerHumans(state) });
      console.log(
        `tick ${t} day ${state.dayInYear}: avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms humans=${countPlayerHumans(state)}`,
      );
    }
  }

  const tail = samples.slice(-3);
  const end = tail[tail.length - 1];
  if (end) {
    console.log(`\nEnd @ tick ${TARGET}: humans=${end.humans} avg=${end.avg.toFixed(1)}ms p95=${end.p95.toFixed(1)}ms`);
    console.log(end.p95 < 16 ? 'PASS @ 16ms playability budget' : end.p95 < 50 ? 'MARGINAL' : 'FAIL — too slow for 1x speed');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});