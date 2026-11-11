/**
 * Invariant long-sim: runs for N years asserting world sanity every tick. Env: `SIM_YEARS`,
 * `SIM_SEED`. For a fast Year-2 check, set `SIM_START_DAY=720 SIM_DAYS=3`.
 * Run: `npx tsx scripts/sim-invariants.ts`; exits 1 on the first violation.
 */
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { createEntity } from '../src/game/worldGen';
import { assertSimInvariants } from '../src/game/simulation/simInvariants';

const YEARS = Number(process.env.SIM_YEARS ?? 3);
const SEED = Number(process.env.SIM_SEED ?? 12345);
const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
const DAYS = process.env.SIM_DAYS == null ? null : Number(process.env.SIM_DAYS);
const START_DAY = Number(process.env.SIM_START_DAY ?? 0);
if (DAYS !== null && (!Number.isSafeInteger(DAYS) || DAYS < 1)) throw new Error('SIM_DAYS must be positive whole days');
if (!Number.isSafeInteger(START_DAY) || START_DAY < 0) throw new Error('SIM_START_DAY must be non-negative whole days');
const TARGET = DAYS === null ? YEARS * TICKS_PER_YEAR : DAYS * TICKS_PER_DAY;

function createSeededRandom(seed: number): () => number {
  let value = (Number.isFinite(seed) ? Math.trunc(seed) : 12345) >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  await preloadDialogueBank();
  const originalRandom = Math.random;
  Math.random = createSeededRandom(SEED);
  try {
    // `MapSize` is Medium | Large | Huge — there is no `Small`, so this read `undefined` and
    // `initGame` resolved it to Medium anyway. Naming Medium is the same world, honestly typed.
    let state = initGame({ villageName: 'Invariantville', size: MapSize.Medium, seed: SEED });
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

    // Boundary mode starts one tick before a target day; each step still runs the real game.
    // This short run cannot be counted as 720 consecutive simulated days.
    if (START_DAY > 0) {
      state.tick = START_DAY * TICKS_PER_DAY - 1;
      state.year = Math.floor((START_DAY - 1) / DAYS_PER_YEAR);
      state.dayInYear = (START_DAY - 1) % DAYS_PER_YEAR;
      state.lastProcessedCalendarDay = START_DAY - 1;
    }

    const focus = getSimFocus(state);
    const t0 = performance.now();
    for (let tick = 1; tick <= TARGET; tick++) {
      state = gameTick(state, focus);
      if (START_DAY === 2 * DAYS_PER_YEAR && tick === 1 && state.electionCeremony?.reason !== 'term') {
        throw new Error('Year-2 midnight did not schedule a term election through gameTick');
      }
      // A1 parity: use the EXISTING invariant harness for the same seeded
      // 7/30/360-day measurement before #129 and after #132. No separate probe.
      if (process.env.SIM_A1_CHECKPOINTS === '1'
          && START_DAY === 0
          && tick % TICKS_PER_DAY === 0
          && [7, 30, DAYS_PER_YEAR].includes(tick / TICKS_PER_DAY)) {
        const playerHumans = state.entities.filter((entity) =>
          entity.alive && entity.type === EntityType.Human && entity.faction !== 'rival');
        const skillPoints = playerHumans.reduce((sum, human) =>
          sum + Object.values(human.skills ?? {}).reduce((total, value) =>
            total + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0), 0);
        console.log('A1_SNAPSHOT ' + JSON.stringify({
          elapsedDays: tick / TICKS_PER_DAY,
          food: state.resources.food,
          population: state.humanPopulation,
          livingHumans: playerHumans.length,
          totalSkillPoints: Math.round(skillPoints * 1000) / 1000,
          tick: state.tick,
        }));
      }
      const violations = assertSimInvariants(state);
      if (violations.length > 0) {
        console.error(`INVARIANT VIOLATION at tick ${state.tick} (day ${Math.floor(state.tick / TICKS_PER_DAY)}; seed ${SEED}):`);
        for (const v of violations.slice(0, 8)) console.error('  -', v);
        process.exitCode = 1;
        return;
      }
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(
      `OK — ${DAYS === null ? `${YEARS}y` : `${DAYS}d from day ${START_DAY}`} (${TARGET} ticks; seed ${SEED}) sim clean, 0 invariant violations in ${secs}s; population ${state.humanPopulation}`,
    );
  } finally {
    Math.random = originalRandom;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
