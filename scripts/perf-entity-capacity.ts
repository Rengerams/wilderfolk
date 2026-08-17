import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import { isPlayerHuman } from '../src/game/groupEvents';

const TICKS = Number(process.env.PERF_TICKS ?? 250);
const WARMUP = 30;

// Veilige syntax die de code-editor niet kapot kan maken
const TIERS: number[] = [];
TIERS.push(0);
TIERS.push(200);
TIERS.push(400);
TIERS.push(600);
TIERS.push(800);
TIERS.push(1000);
TIERS.push(1200);

const GC_BETWEEN = process.env.SIM_GC === '1';

declare global {
  function gc(): void;
}

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
    `Ticks=${TICKS} warmup=${WARMUP} | ${fullSim ? 'FULL SIM (no throttle)' : 'focus throttle (default)'}${GC_BETWEEN ? ' | forced gc() between ticks' : ''}`,
  );
  console.log('');

  for (const pop of TIERS) {
    const state = initGame({ villageName: 'Big', size: MapSize.Large });
    state.resources.food = 999999;
    state.resources.wood = 99999;
    state.resources.gold = 99999;
    state.resources.iron = 99999;
    state.resources.stone = 99999;
    
    // Filter bomen en gras direct uit de gegenereerde wereld
    state.entities = state.entities.filter(
      (e) => e.type !== EntityType.Tree && e.type !== EntityType.Grass
    );
    
    seedHumans(state, pop);

    const ms: number[] = [];
    for (let t = 1; t <= WARMUP + TICKS; t++) {
      if (GC_BETWEEN && t > 1 && typeof gc === 'function') {
        gc();
      }
      const t0 = performance.now();
      gameTick(state, fullSim ? undefined : focus);
      ms.push(performance.now() - t0);
    }
    
    const sorted = [...ms.slice(WARMUP)].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    
    const p95Index = Math.min(Math.max(0, Math.floor(sorted.length * 0.95)), sorted.length - 1);
    const p95 = sorted.length > 0 ? sorted[p95Index] : 0;

    const byType: Record<string, number> = {};
    for (const e of state.entities) {
      // Trees/grass are static scenery — not reported as living entities.
      if (e.alive && e.type !== EntityType.Tree && e.type !== EntityType.Grass) {
        const typeKey = typeof e.type === 'number' ? (EntityType[e.type] ?? e.type) : e.type;
        byType[typeKey] = (byType[typeKey] ?? 0) + 1;
      }
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
