/**
 * Movement regression probe (local, gitignored): run a bare colony for N colony days and report
 * every living player settler's displacement, velocity and energy, so a "citizens don't walk"
 * report can be reproduced or ruled out in one command.
 *
 *   npx tsx scripts/probe-movement.mts [days]
 */
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { isPlayerHuman } from '../src/game/playerHuman';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';

const days = Number(process.argv[2] ?? 3);
const state = initGame({ seed: 12345, villageName: 'Probe' });
const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
const start = new Map(humans.map((h) => [h.id, { x: h.x, y: h.y }]));
console.log('start', humans.map((h) => ({ id: h.id, x: Math.round(h.x), y: Math.round(h.y), energy: Math.round(h.energy), job: h.job })));

for (let t = 0; t < days * TICKS_PER_DAY; t++) gameTick(state);

const rows = state.entities
  .filter((e) => e.alive && isPlayerHuman(e))
  .map((h) => {
    const s = start.get(h.id);
    return {
      id: h.id,
      displaced: s ? Number(Math.hypot(h.x - s.x, h.y - s.y).toFixed(2)) : null,
      speed: Number(Math.hypot(h.vx, h.vy).toFixed(3)),
      energy: Math.round(h.energy),
      job: h.job,
      x: Math.round(h.x),
      y: Math.round(h.y),
    };
  });
console.log('after', days, 'days (tick', state.tick, 'hour', Math.floor((state.tick % TICKS_PER_DAY) / TICKS_PER_HOUR), ')');
console.table(rows);
const moved = rows.filter((r) => (r.displaced ?? 0) > 1).length;
console.log(`moved >1px: ${moved}/${rows.length}`);
