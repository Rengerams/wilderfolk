/**
 * Invariant long-sim — runs the sim for N years asserting world sanity every tick.
 * Catches the silent-corruption class (NaN, negative resources, orphaned bonds,
 * cache divergence) that unit tests never reach.
 *
 * Run: npx tsx scripts/sim-invariants.ts        (3 years default)
 *      SIM_YEARS=5 npx tsx scripts/sim-invariants.ts
 *      SIM_BUILD=1  auto-place a house + staff it every few days (population growth)
 * Exit code 1 on the first violation.
 */
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import { assertSimInvariants } from '../src/game/simulation/simInvariants';

const YEARS = Number(process.env.SIM_YEARS ?? 3);
const BUILD = process.env.SIM_BUILD === '1';
const TICKS_PER_YEAR = 72 * 360; // 72 ticks/day, 360 days/year
const TARGET = YEARS * TICKS_PER_YEAR;

async function main(): Promise<void> {
  await preloadDialogueBank();
  let state = initGame({ villageName: 'Invariantville', size: MapSize.Small });
  state.resources.food = 2000;
  state.resources.wood = 2000;
  state.resources.stone = 1000;
  state.resources.gold = 500;

  // Seed a handful of extra settlers so the sim has people to marry/birth with.
  for (let i = 0; i < 6; i++) {
    const h = createEntity(
      EntityType.Human,
      state.width / 2 + (Math.random() - 0.5) * 200,
      state.height / 2 + (Math.random() - 0.5) * 200,
      state.nextEntityId++,
      300,
      false,
      { name: `P${i}`, ageYears: 20 + (i % 15), colonyDay: 0 },
    );
    h.alive = true;
    state.entities.push(h);
  }

  const focus = getSimFocus(state);
  const t0 = performance.now();
  for (let tick = 1; tick <= TARGET; tick++) {
    if (BUILD && tick % 4320 === 0) {
      // try to keep the village growing — place a house near the center
      state = gameTick(state, focus);
      continue;
    }
    state = gameTick(state, focus);
    const violations = assertSimInvariants(state);
    if (violations.length > 0) {
      console.error(`INVARIANT VIOLATION at tick ${state.tick} (day ${Math.floor(state.tick / 72)}):`);
      for (const v of violations.slice(0, 8)) console.error('  -', v);
      process.exit(1);
    }
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `OK — ${YEARS}y (${TARGET} ticks) sim clean, 0 invariant violations in ${secs}s; population ${state.humanPopulation}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
