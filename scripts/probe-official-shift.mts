/**
 * Official/leader shift probe (local, gitignored): put the village head on the Town Hall
 * (job = Official) and watch whether they actually go there during the work day.
 *
 *   npx tsx scripts/probe-official-shift.mts
 */
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function building(state: WorldState, type: BuildingType, x: number, y: number): Building {
  const b = {
    id: state.nextBuildingId++, type, x, y, width: 60, height: 48, rotation: 0,
    completed: true, faction: 'player', occupants: [], constructionProgress: 100,
    level: 1, spriteScale: 1, health: 100, maxHealth: 100,
  } as unknown as Building;
  state.buildings.push(b);
  return b;
}

const state = initGame({ seed: 4242, villageName: 'OfficialShift' });
const hall = building(state, BuildingType.TownHall, 700, 620);
building(state, BuildingType.House, 460, 470);

const leader = state.entities.find((e) => e.id === state.villageLeaderId);
if (!leader) throw new Error('no leader');
// Staff the head of the village at the Town Hall, exactly as the assign layer would.
leader.homeBuildingId = hall.id;
leader.job = JobType.Official;
hall.occupants.push(leader.id);

const distToHall = (): number => Math.round(Math.hypot(hall.x + 30 - leader.x, hall.y + 30 - leader.y));
console.log(`leader #${leader.id} occ=${leader.occupation} job=${leader.job} workplace=hall#${hall.id}`);
console.log(`start: pos=(${Math.round(leader.x)},${Math.round(leader.y)}) distToHall=${distToHall()}`);

for (let day = 1; day <= 2; day++) {
  let closest = distToHall();
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    gameTick(state);
    closest = Math.min(closest, distToHall());
  }
  console.log(
    `day ${day}: pos=(${Math.round(leader.x)},${Math.round(leader.y)}) distToHall=${distToHall()} closest=${closest} moved=${Math.round(Math.hypot(leader.vx, leader.vy) * 100) / 100}`,
  );
}
console.log(distToHall() < 60 ? 'RESULT: the leader goes to the hall' : 'RESULT: the leader never goes to the hall');
