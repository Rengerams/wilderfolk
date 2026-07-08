/**
 * Quick family sim — courtship, marriage, and births.
 * Run: npx tsx scripts/simulate-family.ts
 */
import { initGame, gameTick, recruitSettler, BuildingType } from '../src/game/gameEngine';
import { getSimFocus } from './simFocus';
import { isPlayerHuman } from '../src/game/groupEvents';
import { tryPlaceBuilding } from './simBuildUtils';

let state = initGame();
state.resources.wood = 3000;
state.resources.stone = 1500;
state.resources.food = 1000;
const cx = state.width / 2;
const cy = state.height / 2;

const housePlacement = tryPlaceBuilding(state, BuildingType.House, cx, cy);
if (housePlacement.ok) state = housePlacement.state;
for (let i = 0; i < 3; i++) state = recruitSettler(state);

let marriages = 0;
let births = 0;
let scandals = 0;
let bastards = 0;

const simFocus = getSimFocus(state);
for (let t = 1; t <= 720; t++) {
  state = gameTick(state, simFocus);
  for (const e of state.eventLog) {
    if (e.tick !== state.tick) continue;
    if (e.type === 'marriage') marriages++;
    if (e.type === 'birth') births++;
    if (e.type === 'scandal') scandals++;
    if (e.type === 'birth' && e.message.includes('bastard')) bastards++;
  }
}

const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
const married = humans.filter((h) => h.relationshipStatus === 'married' || h.relationshipStatus === 'expecting').length;
const children = humans.filter((h) => h.isJuvenile).length;
const singles = humans.filter((h) => h.relationshipStatus === 'single' && !h.isJuvenile).length;

console.log('\n=== Family sim (30 game-days) ===');
console.log(`Humans: ${humans.length} | married pairs: ~${Math.floor(married / 2)} | singles: ${singles} | children: ${children}`);
const bastardChildren = humans.filter((h) => h.isBastard).length;
console.log(`Event log: ${marriages} marriages, ${births} births, ${bastards} bastard births, ${scandals} scandals`);
console.log(`Living bastards: ${bastardChildren}`);
console.log(marriages > 0 && births > 0 ? 'PASS — families forming' : 'FAIL — no marriages or births yet');

if (marriages === 0 || births === 0) process.exitCode = 1;