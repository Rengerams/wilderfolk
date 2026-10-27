/**
 * Approach-easing probe (local, gitignored): measures how long the "cooling down" stretch into a
 * building takes — the last stretch inside `COMMUTE_CONFIG.LONG_RANGE_DIST` where the commute
 * decelerates. Prints the per-tick distance and the tick count to arrival.
 *
 *   npx tsx scripts/probe-approach.mts [startDistance]
 */
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { commuteHumanToBuilding, humanBuildingTarget } from '../src/game/simulation/humanMovement';

const state = initGame({ seed: 7, villageName: 'ApproachProbe' });
const person = state.entities.find((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
if (!person) throw new Error('no settler');

const building = {
  id: state.nextBuildingId++, type: BuildingType.LumberMill, x: 600, y: 600,
  width: 60, height: 48, rotation: 0, completed: true, faction: 'player', occupants: [],
  constructionProgress: 100, level: 1, spriteScale: 1, health: 100, maxHealth: 100,
} as unknown as Building;

const startDistance = Number(process.argv[2] ?? 45);
// Place the worker so it starts `startDistance` px from its stand position (inside LONG_RANGE_DIST).
const stand = humanBuildingTarget(building, person.id, false);
person.x = stand.x;
person.y = stand.y - startDistance;
person.vx = 0;
person.vy = 0;

const dist = (): number => Math.hypot(stand.x - person.x, stand.y - person.y);
const speed = 1.05;
const rush = Number(process.argv[3] ?? 3.5);
let ticks = 0;
const trace: string[] = [];
while (dist() > 8 && ticks < 400) {
  const arrived = commuteHumanToBuilding(person, building, speed, false, rush);
  person.x += person.vx;
  person.y += person.vy;
  ticks++;
  if (ticks <= 12 || ticks % 5 === 0) trace.push(`${ticks}:${dist().toFixed(1)}`);
  if (arrived) break;
}
console.log(`start ${startDistance}px, speed ${speed}, rush ${rush}`);
console.log('tick:distance ->', trace.join(' '));
console.log(`ticks to arrive: ${ticks} (${(ticks / 3).toFixed(1)} in-game hours)`);
