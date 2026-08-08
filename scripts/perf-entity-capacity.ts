/**
 * Entity-capacity sweep — how many entities can a tick handle before the
 * playability budget breaks?
 *
 * Seeds N player humans onto a Large map (which already carries the full
 * grass/tree/wildlife base) and measures gameTick cost. Prints alive totals
 * by type so "entities" means real entities, not just humans.
 *
 * Run: npx tsx scripts/perf-entity-capacity.ts
 *      SIM_FULL_SIM=1   disable the viewport throttle (worst case)
 *      PERF_TICKS=200   samples per tier
 */
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import { isPlayerHuman } from '../src/game/groupEvents';

const TICKS = Number(process.env.PERF_TICKS ?? 250);
const WARMUP = 30;
const TIERS = [0, 200, 400, 600, 800, 1000, 1200, 1500];

function seedHumans(state: ReturnType<typeof initGame>, pop: number): void {
  for (let i = 0; i < pop; i++) {
    const h = createEntity(
      EntityType.Human,
      state.width / 2 + (Math.random() - 0.5) * 400,
      state.height / 2 + (Math.random() - 0.5) * 400,
      state.nextEntityId++,
      300,
    );
    h.name = `S${i}`;
    h.surname = 'Test';
    h.gender = i % 2 === 0 ? 'male' : 'female';
    h.isJuvenile = false;
    h.age = 25;
    state.entities.push(h);
    state.humanPopulation++;
  }
}

async function main(): Promise<void> {
  await preloadDialogueBank();
  const focus = getSimFocus(initGame({ villageName: 'Ceil', size: MapSize.Large }));
  const fullSim = process.env.SIM_FULL_SIM === '1';

  console.log(
    `Ticks=${TICKS} warmup=${WARMUP} | ${fullSim ? 'FULL SIM (no throttle)' : 'focus throttle (default)'}`,
  );
  console.log('');

  for (const pop of TIERS) {
    const state = initGame({ villageName: 'Big', size: MapSize.Large });
    state.resources.food = 999999;
    state.resources.wood = 99999;
    state.resources.stone = 99999;
    seedHumans(state, pop);

    const ms: number[] = [];
    for (let t = 1; t <= WARMUP + TICKS; t++) {
      const t0 = performance.now();
      gameTick(state, fullSim ? undefined : focus);
      ms.push(performance.now() - t0);
    }
    const sorted = [...ms.slice(WARMUP)].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    const byType: Record<string, number> = {};
    for (const e of state.entities) {
      if (e.alive) byType[e.type] = (byType[e.type] ?? 0) + 1;
    }
    const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e)).length;

    console.log(
      `${pop}h: avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms | alive=${state.entities.filter((e) => e.alive).length} humans=${humans} ${JSON.stringify(byType)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
