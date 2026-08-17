/** One-tier 1200h CPU profile driver — run: node --cpu-prof --cpu-prof-dir=prof_out --cpu-prof-name=1200.cpuprofile -r tsx/register scripts/prof-single-tier.ts */
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';

const TICKS = Number(process.env.PERF_TICKS ?? 120);
const WARMUP = 20;
const POP = Number(process.env.POP ?? 1200);
const FULL = process.env.SIM_FULL_SIM === '1';

async function main() {
  await preloadDialogueBank();
  let state = initGame({ villageName: 'Prof', size: MapSize.Large });
  // Seed POP humans clustered in the center (worst case — everything in focus).
  for (let i = 0; i < POP; i++) {
    const h = createEntity(
      EntityType.Human,
      state.width / 2 + (Math.random() - 0.5) * 300,
      state.height / 2 + (Math.random() - 0.5) * 220,
      state.nextEntityId++,
      80,
      false,
      { name: `P${i}`, ageYears: 20 + (i % 40), colonyDay: 0 },
    );
    h.alive = true;
    state.entities.push(h);
  }
  if (process.env.NO_SCENERY === '1') {
    state.entities = state.entities.filter((e) => e.type !== EntityType.Tree && e.type !== EntityType.Grass);
  }
  const focus = FULL ? undefined : getSimFocus(state);
  for (let t = 1; t <= WARMUP; t++) state = gameTick(state, focus);
  const t0 = performance.now();
  for (let t = 1; t <= TICKS; t++) state = gameTick(state, focus);
  const avg = (performance.now() - t0) / TICKS;
  console.log(`POP=${POP} FULL=${FULL ? 1 : 0} ticks=${TICKS} avg=${avg.toFixed(1)}ms humans=${POP + 2}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
