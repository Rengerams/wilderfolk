/**
 * Leader-work probe (local, gitignored): what does the village head actually do?
 * Prints the leader's office/job/workplace/residence beside a normal settler's, per day.
 *
 *   npx tsx scripts/probe-leader.mts [days]
 */
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';

import { TICKS_PER_DAY } from '../src/game/dayCycle';

function building(state: WorldState, type: BuildingType, x: number, y: number): Building {
  const b = {
    id: state.nextBuildingId++,
    type,
    x,
    y,
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
  state.buildings.push(b);
  return b;
}

const days = Number(process.argv[2] ?? 3);
const state = initGame({ seed: 4242, villageName: 'LeaderProbe' });

// A workplace, a civic venue and a house next to the founders. No manual assignment:
// this is what the game's own daily assign layer does.
const mill = building(state, BuildingType.LumberMill, 520, 500);
const hall = building(state, BuildingType.TownHall, 560, 540);
building(state, BuildingType.House, 460, 470);

const settlers = () => state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));

const describe = (e: { id: number; occupation?: string; job?: string; homeBuildingId?: number; residenceBuildingId?: number }) =>
  `#${e.id} occ=${e.occupation ?? '-'} job=${e.job ?? '-'} work=${e.homeBuildingId ?? '-'} home=${e.residenceBuildingId ?? '-'}`;

function report(label: string): void {
  const leaderId = state.villageLeaderId;
  const leader = state.entities.find((e) => e.id === leaderId);
  console.log(`\n${label} (tick ${state.tick}) villageLeaderId=${leaderId ?? 'none'}`);
  if (leader) console.log('  LEADER   ', describe(leader));
  for (const s of settlers()) {
    if (s.id === leaderId) continue;
    console.log('  settler  ', describe(s));
  }
  console.log('  workplaces:', state.buildings.filter((b) => b.completed && b.occupants.length > 0).map((b) => `${b.type}#${b.id}[${b.occupants.join(',')}]`).join(' ') || 'none staffed');
  console.log('  nearest target for LEADER:', leader ? `mill=${Math.round(Math.hypot(mill.x - leader.x, mill.y - leader.y))}px hall=${Math.round(Math.hypot(hall.x - leader.x, hall.y - leader.y))}px` : 'n/a');
}

report('before');
for (let day = 1; day <= days; day++) {
  for (let t = 0; t < TICKS_PER_DAY; t++) gameTick(state);
  report(`after day ${day}`);
}
