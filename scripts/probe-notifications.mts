/**
 * Probe: does immigration actually produce a 'New Settler' notification in the sim world,
 * and does that notification survive the worker tick-delta round trip onto a display world?
 */
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { extractSimTickDelta, applySimTickDelta } from '../src/game/simBuffers/simDelta';

function house(state: WorldState, x: number, y: number): void {
  state.buildings.push({
    id: state.nextBuildingId++, type: BuildingType.House, x, y, width: 60, height: 48,
    rotation: 0, completed: true, faction: 'player', occupants: [], constructionProgress: 100,
    level: 1, spriteScale: 1, health: 100, maxHealth: 100,
  } as unknown as Building);
}

const state = initGame({ seed: 11 });
state.villageReputation = 120;
state.maxHumanPopulation = 200;
for (let i = 0; i < 6; i += 1) house(state, 300 + i * 70, 400);

// A display world that mirrors the worker round trip.
let display: WorldState = structuredClone(state);

let arrivals = 0;
let notificationsSeenInSim = 0;
let notificationsSeenInDisplay = 0;

for (let day = 0; day < 6; day += 1) {
  for (let tick = 0; tick < TICKS_PER_DAY; tick += 1) {
    const before = state.tick;
    gameTick(state);
    // Replicate the worker delta path.
    const delta = extractSimTickDelta(state, state.entities.filter((e) => e.alive), {
      headless: true,
      cloneMode: 'isolated',
    });
    applySimTickDelta(display, delta);
    void before;
  }
  const simNew = state.notifications.filter((n) => n.title === 'New Settler');
  const dispNew = display.notifications.filter((n) => n.title === 'New Settler');
  notificationsSeenInSim = simNew.length;
  notificationsSeenInDisplay = dispNew.length;
  arrivals = state.eventLog.filter((e) => e.type === 'migration').length;
  console.log(
    `day ${day + 1}: migrations=${arrivals} simNotifs=${state.notifications.length} ` +
      `simNewSettler=${simNew.length} displayNotifs=${display.notifications.length} ` +
      `displayNewSettler=${dispNew.length} humans=${state.entities.filter((e) => e.alive && e.type === EntityType.Human).length}`,
  );
}

console.log('last sim notification titles:', state.notifications.slice(-5).map((n) => n.title).join(' | '));
console.log('last display notification titles:', display.notifications.slice(-5).map((n) => n.title).join(' | '));
console.log('simNewSettler total:', notificationsSeenInSim, 'displayNewSettler total:', notificationsSeenInDisplay);
