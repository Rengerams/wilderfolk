/**
 * Commute regression probe (local, gitignored): give a settler a real workplace and watch the
 * distance to it, so a "citizens don't walk" report can be traced to the commute path
 * (`simulation/humanMovement.commuteHumanToBuilding` → `pathfinding.steerWithPath` → the human
 * loop's single movement apply).
 *
 *   npx tsx scripts/probe-commute.mts
 */
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { assignMissingWorkers } from '../src/game/workforce';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

const state = initGame({ seed: 4242, villageName: 'CommuteProbe' });

// A completed workplace at a real distance from the settlers, then let the staffing owner fill it.
const home = state.entities.filter((e) => e.alive && isPlayerHuman(e))[0];
const workplace: Building = {
  id: state.nextBuildingId++,
  type: BuildingType.LumberMill,
  x: Math.min((home?.x ?? 300) + 260, state.width - 40),
  y: Math.min((home?.y ?? 300) + 160, state.height - 40),
  width: 60,
  height: 48,
  rotation: 0,
  completed: true,
  faction: 'player',
  occupants: [],
  constructionProgress: 100,
  level: 1,
  spriteScale: 1,
  health: 100,
  maxHealth: 100,
} as unknown as Building;
state.buildings.push(workplace);
assignMissingWorkers(state.entities.filter((e) => e.alive && isPlayerHuman(e)), state.buildings);

const worker = state.entities.find(
  (e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e) && e.homeBuildingId === workplace.id,
);
if (!worker) {
  console.log('no worker assigned to the probe workplace — job map:', state.entities.map((e) => e.job));
  process.exit(1);
}
console.log('worker', worker.id, 'job', worker.job, 'workplace', workplace.id, 'at', workplace.x, workplace.y);
console.log('start', { x: Math.round(worker.x), y: Math.round(worker.y) });

const dist = (): number => {
  const t = humanBuildingTarget(workplace, worker.id, false);
  return Number(Math.hypot(t.x - worker.x, t.y - worker.y).toFixed(1));
};
console.log('stand target', humanBuildingTarget(workplace, worker.id, false), 'start dist', dist());
let closest = dist();
for (let day = 0; day < 3; day++) {
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    gameTick(state);
    closest = Math.min(closest, dist());
    if (state.tick % (TICKS_PER_DAY / 2) === 0) {
      console.log(
        `tick ${state.tick} hour ${Math.floor((state.tick % TICKS_PER_DAY) / 3)}`,
        { x: Math.round(worker.x), y: Math.round(worker.y), dist: dist(), speed: Number(Math.hypot(worker.vx, worker.vy).toFixed(3)), energy: Math.round(worker.energy), job: worker.job },
      );
    }
  }
}
console.log('closest approach', closest);
console.log(closest < 20 ? 'RESULT: commutes (reaches its stand position)' : `RESULT: never reaches the stand position (closest ${closest})`);
