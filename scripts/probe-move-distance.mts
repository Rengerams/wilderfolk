/**
 * Movement-rate probe (local, gitignored): measures how far player settlers actually travel.
 * Prints total path length (sum of per-tick displacement), distance travelled per settler and the
 * per-tick speed distribution, so a "they move way less than they should" report can be compared
 * between revisions with one command.
 *
 *   npx tsx scripts/probe-move-distance.mts [days]
 */
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { isPlayerHuman } from '../src/game/playerHuman';
import { createSimFocus } from '../src/game/simFocus';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

const days = Number(process.argv[2] ?? 5);
const state = initGame({ seed: 4242, villageName: 'MoveRate' });
// No focus arg = the headless default (everyone off-screen-throttled); `focus` = whole map in
// view, i.e. every settler runs full AI every tick (`OFFSCREEN_HUMAN_THROTTLE` bypassed).
const focus =
  process.argv[3] === 'focus'
    ? { minX: 0, maxX: state.width, minY: 0, maxY: state.height }
    : process.argv[3] === 'sim'
      ? createSimFocus(state)
      : process.argv[3] === 'corner'
        ? { minX: 0, maxX: 60, minY: 0, maxY: 60 }
        : undefined;
console.log('focus mode:', process.argv[3] ?? 'none');
const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
const last = new Map(humans.map((h) => [h.id, { x: h.x, y: h.y }]));
const travelled = new Map(humans.map((h) => [h.id, 0]));
let stillTicks = 0;
let movingTicks = 0;
let speedSum = 0;
let speedMax = 0;

for (let t = 0; t < days * TICKS_PER_DAY; t++) {
  gameTick(state, focus);
  for (const h of state.entities) {
    if (!h.alive || !isPlayerHuman(h)) continue;
    const prev = last.get(h.id);
    if (!prev) continue;
    const step = Math.hypot(h.x - prev.x, h.y - prev.y);
    travelled.set(h.id, (travelled.get(h.id) ?? 0) + step);
    prev.x = h.x;
    prev.y = h.y;
    const speed = Math.hypot(h.vx, h.vy);
    speedSum += speed;
    speedMax = Math.max(speedMax, speed);
    if (step < 0.01) stillTicks++;
    else movingTicks++;
  }
  // Track settlers born during the run so the metric covers them too.
  for (const h of state.entities) {
    if (h.alive && isPlayerHuman(h) && !last.has(h.id)) {
      last.set(h.id, { x: h.x, y: h.y });
      travelled.set(h.id, 0);
    }
  }
}

const rows = [...travelled.entries()].map(([id, px]) => ({ id, px: Number(px.toFixed(1)) }));
const total = rows.reduce((sum, r) => sum + r.px, 0);
console.log(`days=${days} ticks=${state.tick} settlers=${rows.length}`);
console.log('per-settler travelled px:', rows.map((r) => r.px).join(', '));
console.log(`total travelled px: ${total.toFixed(1)}`);
console.log(`ticks moving: ${movingTicks}, still: ${stillTicks} (${((movingTicks / Math.max(1, movingTicks + stillTicks)) * 100).toFixed(1)}% moving)`);
console.log(`mean velocity ${(speedSum / Math.max(1, movingTicks + stillTicks)).toFixed(3)} px/tick, max ${speedMax.toFixed(3)}`);
