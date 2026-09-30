/**
 * Temporary probe (local-only, gitignored, safe to delete).
 *
 * WHY: the reported illogic is "it researches Advanced Farming but never builds
 * a Farm". `decideFood` only fires when stores drop below
 * `VirtualPlayer.FOOD_BUFFER_DAYS` (2 days of settler need), so a colony with a
 * comfortable larder and no producer at all may research farm technology before
 * it ever owns a farm. This probe shows what the real ladder does over a long run
 * and how the food economy actually evolves.
 */
import { initGame, gameTick } from '../src/game/gameEngine';
import { BuildingType, MapSize } from '../src/game/gameTypes';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { shouldVirtualPlayerAct } from '../src/hooks/useVirtualPlayer';
import { applyWorkerCommand } from '../src/game/simWorker/commands';
import { playerHumanCount, isPlayerHuman } from '../src/game/playerHuman';
import { Human } from '../src/game/gameConstants';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { BUILDING_JOB_TYPES } from '../src/game/gameTypes';
import { canPlaceBuilding, getPlaceBuildingFailureReason } from '../src/game/buildingPlacementActions';
import { getBuildingFootprintForType, snapBuildingCenter } from '../src/game/buildingRotation';
import { getPlayerCampCenter } from '../src/game/frontierCombat';
import { VirtualPlayer } from '../src/game/gameConstants';
import { GRID_SIZE } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { getOpenPlayerBeds, getTotalBeds } from '../src/game/populationGrowth';
import { computeCitizenOverview } from '../src/game/citizenOverview';
import { AFFAIR_ESTABLISHED_LOG_PHRASE } from '../src/game/simulation/humanRelationships';

/** Same rule as the bot's private helper (`virtualPlayer.ts:188`). */
const foodNeedPerDay = (settlers: number): number => settlers * Human.DAILY_FOOD_CONSUMPTION;

const FOOD_TYPES = [
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.FishingSpot,
  BuildingType.HuntingSpot,
] as const;

let world = initGame({ size: MapSize.Medium, seed: 4242 });
let lastActedTick: number | null = null;

function producers(w: typeof world, completedOnly: boolean): string {
  const rows = FOOD_TYPES.map((type) => {
    const hits = w.buildings.filter(
      (b) => b.type === type && b.faction !== 'rival' && (!completedOnly || b.completed),
    ).length;
    return hits > 0 ? `${BUILDING_CONFIGS[type].label}×${hits}` : null;
  }).filter(Boolean);
  return rows.length > 0 ? rows.join(' ') : '(none)';
}

const settlers0 = playerHumanCount(world.entities);
console.log('=== starting colony ===');
console.log(
  `buildings: ${world.buildings.map((b) => BUILDING_CONFIGS[b.type].label + (b.completed ? '' : '(building)')).join(', ') || '(none)'}`,
);
console.log(
  `settlers=${settlers0} needPerDay=${foodNeedPerDay(settlers0).toFixed(2)} food=${world.resources.food} wood=${world.resources.wood} gold=${world.resources.gold}`,
);
console.log(`food producers at start: ${producers(world, false)}`);
console.log('');
console.log('=== ladder over 30 in-game days ===');

/** One line of colony state, for the periodic trace. */
function snapshot(w: typeof world): string {
  const humans = playerHumanCount(w.entities);
  const homeless = w.entities.filter(
    (entity) => entity.alive && isPlayerHuman(entity) && entity.residenceBuildingId == null,
  ).length;
  const built = w.buildings
    .filter((building) => building.faction !== 'rival')
    .map((building) => BUILDING_CONFIGS[building.type].label + (building.completed ? '' : '…'))
    .join(' ');
  return `d${String(Math.floor(w.tick / TICKS_PER_DAY)).padStart(2)} pop=${humans} homeless=${homeless} beds=${getTotalBeds(w)} open=${getOpenPlayerBeds(w)} food=${w.resources.food} wood=${w.resources.wood} stone=${w.resources.stone} gold=${w.resources.gold} iron=${w.resources.iron} | ${built || '(none)'}`;
}

const acts: string[] = [];
/** Run length in in-game days; `npx tsx scripts/autoplay-food-probe.mts 360` for a year at scale. */
const DAYS = Number(process.argv[2] ?? 30);
const TICKS = DAYS * TICKS_PER_DAY;
console.log(`start  ${snapshot(world)}`);
for (let i = 0; i < TICKS; i++) {
  world = gameTick(world);
  if (world.tick % TICKS_PER_DAY === 0 && i > 0) console.log(`       ${snapshot(world)}`);
  if (!shouldVirtualPlayerAct(true, world, lastActedTick)) continue;
  lastActedTick = world.tick;
  const decision = decideVirtualPlayerAction(world);
  if (!decision) continue;
  const settlers = playerHumanCount(world.entities);
  const need = foodNeedPerDay(settlers);
  const before = producers(world, false);
  world = applyWorkerCommand(world, decision.command);
  const after = producers(world, false);
  const foodLine = `food=${world.resources.food} (${(world.resources.food / Math.max(need, 0.01)).toFixed(1)}d) gold=${world.resources.gold} iron=${world.resources.iron} producers: ${after}`;
  acts.push(`${decision.command.op} — ${decision.reason}`);
  if (before !== after || acts.length <= 15) {
    console.log(`t${world.tick} ${foodLine} :: ${decision.command.op} — ${decision.reason}`);
  }
}

console.log('');
console.log('=== after 30 in-game days ===');
console.log(`acts=${acts.length}`);
console.log(`final: tick=${world.tick} food=${world.resources.food} wood=${world.resources.wood} stone=${world.resources.stone} gold=${world.resources.gold}`);
console.log(`food producers (completed): ${producers(world, true)}`);
console.log(`food producers (incl. sites): ${producers(world, false)}`);
console.log(`research done: ${world.researchNodes.filter((n) => n.researched).map((n) => n.name).join(', ') || '(none)'}`);
// `activeResearch` is a research *id*, not a node — `?.name` on it printed "(none)" even while a
// research was running. Resolve the node the way every other reader does.
console.log(`research active: ${world.researchNodes.find((n) => n.id === world.activeResearch)?.name ?? world.activeResearch ?? '(none)'}`);
console.log('first 8 acts:');
for (const act of acts.slice(0, 8)) console.log(`  - ${act}`);

// The Mine is the only early gold income and the game gives it no research gate,
// so when the bot never builds it the owner must be saying why. Ask the placement
// owner directly rather than guessing.
const mineCost = BUILDING_CONFIGS[BuildingType.Mine].cost;
const affordable = (['wood', 'stone', 'gold', 'iron'] as const).every(
  (key) => (world.resources[key] ?? 0) >= (mineCost[key] ?? 0),
);
const camp = getPlayerCampCenter(world, world.buildings);
console.log('');
console.log('=== is the ladder stuck? ===');
const tally = new Map<string, number>();
for (const act of acts) {
  const op = act.split(' — ')[0];
  tally.set(op, (tally.get(op) ?? 0) + 1);
}
console.log(`ops: ${[...tally.entries()].map(([op, n]) => `${op}×${n}`).join(', ')}`);
const assignedCount = (w: typeof world): number =>
  w.entities.filter((e) => e.alive && isPlayerHuman(e) && e.homeBuildingId != null).length;
const idleAdults = (w: typeof world): number =>
  w.entities.filter((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile && e.homeBuildingId == null).length;
console.log(`idle adults: ${idleAdults(world)} · assigned settlers: ${assignedCount(world)}`);
for (const building of world.buildings) {
  if (!building.completed || building.faction === 'rival') continue;
  if (!BUILDING_JOB_TYPES[building.type]) continue;
  console.log(
    `  ${BUILDING_CONFIGS[building.type].label}: ${building.occupants.length}/${BUILDING_CONFIGS[building.type].maxOccupants} occupied`,
  );
}
const next = decideVirtualPlayerAction(world);
if (next) {
  const after = applyWorkerCommand(world, next.command);
  console.log(`next proposal: ${next.command.op} — ${next.reason}`);
  console.log(
    `applying it: assigned ${assignedCount(world)} -> ${assignedCount(after)}, resource change=${JSON.stringify(after.resources) !== JSON.stringify(world.resources)}`,
  );
} else {
  console.log('next proposal: (none)');
}

console.log('');
console.log('=== industry inputs at the end ===');
const INDUSTRY = [BuildingType.LumberMill, BuildingType.Quarry, BuildingType.Mine, BuildingType.Store] as const;
for (const type of INDUSTRY) {
  const exists = world.buildings.some((b) => b.type === type && b.faction !== 'rival');
  const under = world.buildings.some((b) => b.type === type && b.faction !== 'rival' && !b.completed);
  const cost = BUILDING_CONFIGS[type].cost;
  const afford = (['wood', 'stone', 'gold', 'iron'] as const).every(
    (key) => (world.resources[key] ?? 0) >= (cost[key] ?? 0),
  );
  console.log(`  ${BUILDING_CONFIGS[type].label}: exists=${exists} underConstruction=${under} affordable=${afford} cost=${JSON.stringify(cost)}`);
}
console.log(`  unfinished buildings: ${world.buildings.filter((b) => !b.completed).map((b) => BUILDING_CONFIGS[b.type].label).join(', ') || '(none)'}`);
console.log(`  active research: ${world.activeResearch ?? '(none)'} · iron=${world.resources.iron}`);

console.log('');
console.log('=== why no Mine? ===');
console.log(`cost=${JSON.stringify(mineCost)} stores=${JSON.stringify(world.resources)} affordable=${affordable}`);
console.log(`reason at camp centre: ${getPlaceBuildingFailureReason(world, BuildingType.Mine, camp.x, camp.y, 0) ?? 'ok'}`);
const spots: string[] = [];
let nearest = Infinity;
for (let dx = -12; dx <= 12; dx++) {
  for (let dy = -12; dy <= 12; dy++) {
    const x = camp.x + dx * 70;
    const y = camp.y + dy * 70;
    if (canPlaceBuilding(world, BuildingType.Mine, x, y, 0)) {
      spots.push(`${Math.round(x)},${Math.round(y)}`);
      nearest = Math.min(nearest, Math.hypot(x - camp.x, y - camp.y));
    }
  }
}
console.log(`legal Mine plots within 12 rings of the camp (70u steps): ${spots.length}${spots.length ? ` · nearest ${Math.round(nearest)}u away` : ''}`);
// The bot's own search, replicated exactly: snapped to the build grid, footprint+GRID_SIZE
// steps, `VirtualPlayer.PLACEMENT_SEARCH_RINGS` rings around the camp centre.
function botPlacementSearch(w: typeof world): string {
  const camp = getPlayerCampCenter(w, w.buildings);
  const { width, height } = getBuildingFootprintForType(BuildingType.Mine, 0);
  const stepX = width + GRID_SIZE;
  const stepY = height + GRID_SIZE;
  let tried = 0;
  const failures = new Map<string, number>();
  for (let ring = 0; ring <= VirtualPlayer.PLACEMENT_SEARCH_RINGS; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const spot = snapBuildingCenter(BuildingType.Mine, camp.x + dx * stepX, camp.y + dy * stepY, 0);
        tried++;
        const reason = getPlaceBuildingFailureReason(w, BuildingType.Mine, spot.x, spot.y, 0);
        if (reason == null) return `found ${Math.round(spot.x)},${Math.round(spot.y)} after ${tried} checks`;
        failures.set(reason, (failures.get(reason) ?? 0) + 1);
      }
    }
  }
  const tally = [...failures.entries()].map(([reason, n]) => `${reason}×${n}`).join(', ');
  return `no spot in ${tried} checks (${tally})`;
}
console.log(`bot's own search result: ${botPlacementSearch(world)}`);

// ── relationships at whatever scale the BOT reached ──────────────────────────────────────────────
//
// The repo's engine gate only reaches ~70 settlers in a year because its scenario fixes 8 houses and
// immigration follows free beds; the owner's New Frontier reached 453 by day 279. The bot builds its
// own housing, so this reports the relationship state at the population the bot actually reaches, and
// checks the People screen's year counter against the log's 2000-entry cap at that scale.
const ppl = world.entities.filter((e) => e.alive && isPlayerHuman(e));
const half = (field: 'affairPartnerId' | 'youthLovePartnerId'): number =>
  ppl.filter((e) => e[field] != null && e.id < (e[field] as number)).length;
const overview = computeCitizenOverview(world);
const inLogThisYear = world.eventLog.filter(
  (l) => l.year === world.year && l.message.includes(AFFAIR_ESTABLISHED_LOG_PHRASE),
).length;
console.log('');
console.log(`=== relationships after ${DAYS} days (bot-driven) ===`);
console.log(`population=${ppl.length} beds=${getTotalBeds(world)} open=${getOpenPlayerBeds(world)}`);
console.log(`liveAffairs=${half('affairPartnerId')} liveSweethearts=${half('youthLovePartnerId')}`);
console.log(`citizenOverview: married=${overview.married} youthLove=${overview.youthLove} affairs=${overview.affairs} affairsThisYear=${overview.affairsThisYear}`);
console.log(`log: entries=${world.eventLog.length} (cap 2000) establishmentsThisYear=${inLogThisYear} whispers=${world.eventLog.filter((l) => l.message.includes('Whispers spread about')).length} caught=${world.eventLog.filter((l) => l.message.includes('was caught with')).length}`);
