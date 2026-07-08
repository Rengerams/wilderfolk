/**
 * Run game ticks with housing audits — catches end-of-tick assignment gaps.
 * Run: npm run simulate:housing:ticks
 */
import { initGame, gameTick, BuildingType } from '../src/game/gameEngine';
import { tryPlaceBuilding } from './simBuildUtils';
import { auditHousingSharingIssues, countResidentsInBuilding, isResidenceBuilding } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/groupEvents';
import { loadNames } from '../src/game/nameLoader';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { getSimFocus } from './simFocus';

function placeHouse(state: ReturnType<typeof initGame>, cx: number, cy: number) {
  const { state: next, ok } = tryPlaceBuilding(state, BuildingType.House, cx, cy);
  return ok ? next : state;
}

await loadNames();
let state = initGame();
const focus = getSimFocus(state);
const cx = state.width / 2;
const cy = state.height / 2;

state = placeHouse(state, cx, cy);
for (let i = 0; i < TICKS_PER_DAY * 8; i++) state = gameTick(state, focus);
state = placeHouse(state, cx + 200, cy);
state = placeHouse(state, cx - 200, cy);
for (let i = 0; i < TICKS_PER_DAY * 40; i++) state = gameTick(state, focus);

const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
const residences = state.buildings.filter(isResidenceBuilding);
const issues = auditHousingSharingIssues(humans, state.buildings);
const occ = residences.map((r) => `${r.id}:${countResidentsInBuilding(humans, r.id)}`).join(', ');

console.log(`Day ~${Math.floor(state.tick / TICKS_PER_DAY)} | humans ${humans.length} | houses ${residences.length}`);
console.log('Occupancy:', occ);
console.log('Sharing issues:', issues.length);
if (issues.length > 0) {
  for (const msg of issues) console.error(`  ${msg}`);
  process.exit(1);
}
console.log('PASS — no unnecessary housing sharing after tick sim');