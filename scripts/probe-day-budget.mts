/**
 * Day-budget probe (local, gitignored): measures what a colony day actually contains, so the
 * clock constants can be judged on numbers instead of feel.
 *
 * Reports, per simulated day:
 *   - the tick split per settler (travelling / at work / at home / idle),
 *   - distance walked per settler per day,
 *   - when each worker first reaches its workplace inside the 07:00-16:00 shift,
 *   - the real-time length of that day at every speed multiplier (from the loop constants).
 *
 *   npx tsx scripts/probe-day-budget.mts [days]
 */
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { createSimFocus } from '../src/game/simFocus';
import { getWorkSchedule } from '../src/game/workSchedule';
import { TICKS_PER_DAY, TICKS_PER_HOUR, getTickOfDay } from '../src/game/dayCycle';

// Keep in sync with `gameLoop.BASE_TICKS_PER_SECOND` (1 tick/s → a 72 s in-game day at 1×);
// `tests/gameLoop.test.ts` fails if this copy drifts.
const BASE_TICKS_PER_SECOND = 1;
const SPEEDS = [0.5, 1, 2, 3, 5, 10];

function building(state: WorldState, type: BuildingType, x: number, y: number): Building {
  const b = {
    id: state.nextBuildingId++, type, x, y, width: 60, height: 48, rotation: 0,
    completed: true, faction: 'player', occupants: [], constructionProgress: 100,
    level: 1, spriteScale: 1, health: 100, maxHealth: 100,
  } as unknown as Building;
  state.buildings.push(b);
  return b;
}

const days = Number(process.argv[2] ?? 3);
const state = initGame({ seed: 4242, villageName: 'DayBudget' });
building(state, BuildingType.House, 420, 430);
building(state, BuildingType.LumberMill, 640, 520);
building(state, BuildingType.Farm, 300, 620);
building(state, BuildingType.TownHall, 700, 700);
const focus = createSimFocus(state);
const schedule = getWorkSchedule(state);

const settlers = () => state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

type Tally = { travelling: number; atWork: number; atHome: number; idle: number; walked: number };
const tallies = new Map<number, Tally>();
const arrivalTick = new Map<string, number>();
const tally = (id: number): Tally => {
  let t = tallies.get(id);
  if (!t) { t = { travelling: 0, atWork: 0, atHome: 0, idle: 0, walked: 0 }; tallies.set(id, t); }
  return t;
};

function classify(e: Entity): keyof Omit<Tally, 'walked'> {
  if (Math.hypot(e.vx, e.vy) > 0.05) return 'travelling';
  const workplace = state.buildings.find((b) => b.id === e.homeBuildingId);
  if (workplace?.completed) {
    const target = humanBuildingTarget(workplace, e.id, false);
    if (dist(e, target) < 22) return 'atWork';
  }
  const residence = state.buildings.find((b) => b.id === e.residenceBuildingId);
  if (residence) {
    const target = humanBuildingTarget(residence, e.id, true);
    if (dist(e, target) < 30) return 'atHome';
  }
  return 'idle';
}

const previous = new Map<number, { x: number; y: number }>();
for (const day of [0, ...Array.from({ length: days }, (_, i) => i + 1)]) {
  if (day > 0) {
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      gameTick(state, focus);
      for (const e of settlers()) {
        const t2 = tally(e.id);
        const prev = previous.get(e.id);
        if (prev) t2.walked += dist(e, prev);
        previous.set(e.id, { x: e.x, y: e.y });
        t2[classify(e)]++;
        // First arrival at the workplace since the day began (shift window 07:00-16:00).
        const workplace = state.buildings.find((b) => b.id === e.homeBuildingId);
        if (workplace?.completed) {
          const dayStart = state.tick - getTickOfDay(state.tick);
          const key = `${e.id}|${dayStart}`;
          if (!arrivalTick.has(key) && dist(e, humanBuildingTarget(workplace, e.id, false)) < 22) {
            arrivalTick.set(key, getTickOfDay(state.tick));
          }
        }
      }
    }
  }
  console.log(`\n--- after day ${day} (tick ${state.tick}) ---`);
  console.log(`work schedule: ${schedule.startHour}:00-${schedule.endHour}:00 (ticks ${schedule.startHour * TICKS_PER_HOUR}-${schedule.endHour * TICKS_PER_HOUR})`);
  for (const e of settlers()) {
    const t = tallies.get(e.id);
    if (!t) continue;
    const total = t.travelling + t.atWork + t.atHome + t.idle;
    const pct = (n: number) => `${Math.round((n / Math.max(1, total)) * 100)}%`;
    console.log(
      `#${e.id} occ=${e.occupation} job=${e.job} work=${e.homeBuildingId ?? '-'} | ` +
      `travelling ${pct(t.travelling)} atWork ${pct(t.atWork)} atHome ${pct(t.atHome)} idle ${pct(t.idle)} | ` +
      `walked ${Math.round(t.walked)}px over ${total} ticks`,
    );
  }
}

console.log('\n--- commute arrival inside the shift (tick of day) ---');
const shiftEnd = schedule.endHour * TICKS_PER_HOUR;
for (const [key, tick] of [...arrivalTick].sort((a, b) => a[0].localeCompare(b[0]))) {
  const [id, dayStart] = key.split('|');
  console.log(
    `settler #${id} day-start ${dayStart}: first reached its workplace at tick ${tick} of the day ` +
    `(shift ${schedule.startHour * TICKS_PER_HOUR}-${shiftEnd}) ${tick <= shiftEnd ? 'OK' : 'LATE'}`,
  );
}

console.log('\n--- real-time length of one game day (72 ticks) ---');
console.log(`BASE_TICKS_PER_SECOND=${BASE_TICKS_PER_SECOND}, TICKS_PER_DAY=${TICKS_PER_DAY}, TICKS_PER_HOUR=${TICKS_PER_HOUR}`);
for (const s of SPEEDS) {
  const seconds = TICKS_PER_DAY / (BASE_TICKS_PER_SECOND * s);
  console.log(`  ${s}x: ${seconds.toFixed(1)}s per day, ${(seconds / 24).toFixed(2)}s per game hour, season (90d) ${(seconds * 90 / 60).toFixed(1)}min`);
}
