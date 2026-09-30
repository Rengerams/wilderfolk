/**
 * Wilderfolk — the **testing bot**: builds the whole catalogue and reports what became reachable.
 *
 * WHY THIS IS NOT THE IN-GAME BOT
 * -------------------------------
 * Owner, 2026-09-29: "well keep virtual-player.ts apart thats for in game and use own for testing"
 * and "give the bot just options to build all things so cheating but for testing".
 *
 * `src/game/virtualPlayer.ts` is the player-facing auto-play ladder. Its rules are pinned by 68
 * cases in `tests/virtualPlayer.test.ts` that assert the exact decision sequence and treat `null`
 * ("the colony needs nothing") as a reachable healthy state. Widening it to raise community
 * buildings contradicted 15 of those terminal expectations — measured, twice, at the civic step (36
 * failures) and at the end of the ladder (15) — so the ladder is the wrong home for a cheat. This
 * script is: a separate, automated driver that never ships and never changes a game rule.
 *
 * What it closes: `BUG_REPORTS/2026-09-29-automated-runs-never-build-a-church.md` — no automated run
 * in this repository ever reached `churchStrength > 0`, so the church-side branch of
 * `tryDailyAffairGossip` was exercised by nothing. This bot raises every building for free and then
 * proves the church branch is live, so future work on church/affair/scandal behaviour has a harness.
 *
 * It goes through the real command boundary (`applyWorkerCommand` with the `buildDebug` op, which
 * calls `startBuilding(..., free: true)`), so placement is still enforced by its owner: terrain,
 * overlap and one-per-village are all checked. Only research and cost are skipped. There is no second
 * mutation path into `WorldState`.
 *
 * Run:
 *   npx tsx scripts/test-bot-build-all.mts
 *   npx tsx scripts/test-bot-build-all.mts --seed=999 --verbose
 */
import { gameTick } from '../src/game/gameEngine';
import { BUILDING_CONFIGS, BuildingType, MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { canPlaceBuilding } from '../src/game/buildingPlacementActions';
import { applyWorkerCommand, WORKER_CMD_PROTO, type WorkerCommand } from '../src/game/simWorker/commands';
import { getChurchStrength } from '../src/game/workforce';
import { isPlayerHuman } from '../src/game/playerHuman';
import { isStripBuildType } from '../src/game/stripBuild';
import { GRID_SIZE } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { resetSimRng } from '../src/game/simRng';
import { prepareColonyWorld } from './colonyHealth';

const DEFAULT_SEED = 12345;
/**
 * `scripts/**` is deliberately outside every tsconfig project (see `tsconfig.node.json`), so the
 * Node globals are not in scope for the lint gate that does check this directory. Declared narrowly
 * rather than by pulling `@types/node` into a project that does not include this file.
 */
declare const process: { argv: string[]; exitCode?: number };
/** Ring search radius, in placement grid steps, for a legal footprint. */
const MAX_RING = 40;

interface Options {
  seed: number;
  verbose: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { seed: DEFAULT_SEED, verbose: false };
  for (const arg of argv) {
    if (arg === '--verbose') options.verbose = true;
    else if (arg.startsWith('--seed=')) options.seed = Number(arg.slice('--seed='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.seed)) throw new Error('--seed must be a number');
  return options;
}

/** Every buildable type this bot knows how to place: strip builds need a path, not a point. */
function buildableTypes(): BuildingType[] {
  return (Object.values(BuildingType) as BuildingType[]).filter(
    (type) => BUILDING_CONFIGS[type] != null && !isStripBuildType(type),
  );
}

/**
 * First footprint this world will accept for `type`, searched outward from the map centre.
 *
 * Placement is checked with the placement owner before the command is built, so a refusal is never
 * silently counted as a success — the point of this bot is to report what actually happened.
 */
function findSpot(state: WorldState, type: BuildingType): { x: number; y: number } | null {
  const originX = (state.width ?? 1200) / 2;
  const originY = (state.height ?? 900) / 2;
  for (let ring = 0; ring <= MAX_RING; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const x = originX + dx * GRID_SIZE;
        const y = originY + dy * GRID_SIZE;
        if (canPlaceBuilding(state, type, x, y, 0)) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Raise every type once. Returns the world plus a per-type outcome, so a failure names the type
 * rather than only reporting a smaller building count.
 */
function buildEverything(world: WorldState): {
  world: WorldState;
  built: BuildingType[];
  skipped: { type: BuildingType; why: string }[];
} {
  let next = world;
  const built: BuildingType[] = [];
  const skipped: { type: BuildingType; why: string }[] = [];

  for (const type of buildableTypes()) {
    const config = BUILDING_CONFIGS[type];
    if (config.unique && next.buildings.some((building) => building.type === type)) {
      skipped.push({ type, why: 'already stands (one per village)' });
      continue;
    }
    const spot = findSpot(next, type);
    if (!spot) {
      skipped.push({ type, why: 'no legal footprint found' });
      continue;
    }
    const command: WorkerCommand = {
      proto: WORKER_CMD_PROTO,
      op: 'buildDebug',
      type,
      x: spot.x,
      y: spot.y,
    };
    const before = next.buildings.length;
    next = applyWorkerCommand(next, command);
    if (next.buildings.length > before) built.push(type);
    else skipped.push({ type, why: 'the placement owner refused the command' });
  }

  return { world: next, built, skipped };
}

/**
 * Run until a settler is physically **at** the Church during a work shift, and report which.
 *
 * Owner, 2026-09-29: "no it need people workin there". `countWorkersAtBuilding` counts a setter's
 * `homeBuildingId` (`workforce.ts:85`) — an *assignment*, not an arrival — so `getChurchStrength`
 * reads 1 for a church whose keeper is still asleep at home. That is the same assignment-vs-attendance
 * distinction as the daily production calculation, and this bot must not report "the church is live"
 * on the strength of a roster entry.
 *
 * So it schedules the church from the start of the day and ticks until the keeper is within
 * `PRESENCE_RADIUS` of the church footprint, or the budget runs out. The answer it gives is therefore
 * about a settler standing in the building, not about a name in a list.
 */
const PRESENCE_RADIUS = 40;
const CHURCH_WATCH_DAYS = 2;

function isAtBuilding(entity: { x: number; y: number }, building: { x: number; y: number; width: number; height: number }): boolean {
  // `building.x/y` is the footprint centre (`buildingGeometry.getBuildingCenter`), so no width/2 here.
  return Math.hypot(entity.x - building.x, entity.y - building.y) <= Math.max(building.width, building.height) / 2 + PRESENCE_RADIUS;
}

function runUntilKeeperOnSite(world: WorldState): {
  world: WorldState;
  onSite: boolean;
  atTick: number;
  distance: number;
} {
  let next = world;
  const church = next.buildings.find((b) => b.type === BuildingType.Church && b.completed);
  const keeperId = church?.occupants[0];
  if (!church || keeperId == null) return { world: next, onSite: false, atTick: next.tick, distance: Number.POSITIVE_INFINITY };

  for (let i = 0; i < CHURCH_WATCH_DAYS * TICKS_PER_DAY; i++) {
    next = gameTick(next);
    const keeper = next.entities.find((entity) => entity.id === keeperId);
    if (!keeper || !keeper.alive) break;
    const live = next.buildings.find((b) => b.type === BuildingType.Church && b.completed) ?? church;
    const distance = Math.hypot(keeper.x - live.x, keeper.y - live.y);
    if (isAtBuilding(keeper, live)) {
      return { world: next, onSite: true, atTick: next.tick, distance };
    }
  }

  const keeper = next.entities.find((entity) => entity.id === keeperId);
  const live = next.buildings.find((b) => b.type === BuildingType.Church && b.completed) ?? church;
  const distance = keeper ? Math.hypot(keeper.x - live.x, keeper.y - live.y) : Number.POSITIVE_INFINITY;
  return { world: next, onSite: false, atTick: next.tick, distance };
}

/**
 * Finish every site the build pass raised, and assign one settler to the Church.
 *
 * `buildDebug` places a **construction site** — `startBuilding` sets `completed = false` and the
 * daily economy completes it later. That matters here because `getChurchStrength` is gated on
 * `b.completed` (`workforce.ts:121`): a raised-but-unbuilt church reads 0, which is the trap the
 * first run of this bot fell into ("church built: true, churchStrength: 0").
 *
 * Marking them complete is the debug half of the same cheat, done here in the harness rather than in
 * a game rule, so no shipping path can finish a building for free.
 */
function completeEverything(world: WorldState): { world: WorldState; completed: number; churchStaffed: boolean } {
  let next = structuredClone(world);
  let completed = 0;
  for (const building of next.buildings) {
    if (building.faction === 'rival' || building.completed) continue;
    building.completed = true;
    building.constructionProgress = 100;
    building.spriteScale = 1;
    completed++;
  }

  // Staff the Church from any settler without a post, through the real staffing command so the
  // assignment obeys its own owner (`canAssignWorkerToBuilding`).
  const church = next.buildings.find((b) => b.type === BuildingType.Church && b.completed);
  let churchStaffed = false;
  if (church && church.occupants.length === 0) {
    const idle = next.entities.find((entity) => isPlayerHuman(entity) && entity.alive && !entity.isJuvenile);
    if (idle) {
      const staffed = applyWorkerCommand(next, {
        proto: WORKER_CMD_PROTO,
        op: 'assignWorker',
        buildingId: church.id,
        humanId: idle.id,
      });
      churchStaffed = staffed.buildings.some((b) => b.id === church.id && b.occupants.length > 0);
      next = staffed;
    }
  }

  return { world: next, completed, churchStaffed };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  resetSimRng();

  const { world: seeded } = prepareColonyWorld({
    size: MapSize.Medium,
    seed: options.seed,
    scenario: 'restocked',
  });

  console.log(`=== testing bot: build everything (seed ${options.seed}) ===`);
  console.log(`buildings before      : ${seeded.buildings.length}`);
  const beforeChurch = getChurchStrength(seeded.buildings, seeded.entities.filter(isPlayerHuman));
  console.log(`churchStrength before : ${beforeChurch}`);

  const { world: filled, built, skipped } = buildEverything(seeded);
  console.log(`\nraised ${built.length} of ${buildableTypes().length} buildable types`);
  if (options.verbose) {
    for (const type of built) console.log(`  + ${BUILDING_CONFIGS[type].label}`);
  }
  if (skipped.length > 0) {
    console.log(`skipped ${skipped.length}:`);
    for (const entry of skipped) console.log(`  - ${BUILDING_CONFIGS[entry.type].label}: ${entry.why}`);
  }

  // The coverage gap this bot exists to close.
  const finished = completeEverything(filled);
  const humansAfter = finished.world.entities.filter(isPlayerHuman);
  const churchStrength = getChurchStrength(finished.world.buildings, humansAfter);
  console.log(`\nsites completed       : ${finished.completed}`);
  console.log(`church staffed        : ${finished.churchStaffed}`);
  console.log(`churchStrength after  : ${churchStrength}`);
  console.log(`church built          : ${finished.world.buildings.some((b) => b.type === BuildingType.Church)}`);

  // Prove a settler actually reaches the church, and that the world still simulates with the whole
  // catalogue standing. `getChurchStrength` only proves an *assignment*, so presence is measured
  // separately here (owner: "no it need people workin there").
  const watched = runUntilKeeperOnSite(finished.world);
  const ticked: WorldState = watched.world;
  const advanced = ticked.tick - finished.world.tick;
  console.log(`\nkeeper on site        : ${watched.onSite} (at tick ${watched.atTick}, ${watched.distance.toFixed(0)} px away)`);
  console.log(`simulated             : ${advanced} ticks`);
  console.log(`buildings at end      : ${ticked.buildings.length}`);
  console.log(`settlers at end       : ${ticked.entities.filter(isPlayerHuman).length}`);

  const failures: string[] = [];
  if (!finished.world.buildings.some((b) => b.type === BuildingType.Church)) {
    failures.push('the Church was never raised');
  }
  if (churchStrength <= 0) {
    failures.push('churchStrength is still 0, so the church branch remains unexercised');
  }
  if (!watched.onSite) {
    failures.push('no settler ever stood at the church, so nobody is working there');
  }
  if (skipped.length > built.length) {
    failures.push(`${skipped.length} types were skipped against ${built.length} raised`);
  }
  // There is deliberately no "the world must advance N ticks" gate here: the keeper can reach the
  // church on the first tick, and a small menu of ticks is not evidence of anything. The presence
  // check above is the proof, and a world that threw would have failed before reaching this line.

  console.log('');
  if (failures.length === 0) {
    console.log(`VERDICT: PASS — ${built.length} types raised, a keeper on site at the church (strength ${churchStrength}), world still simulates`);
  } else {
    console.log(`VERDICT: FAIL — ${failures.join('; ')}`);
    process.exitCode = 1;
  }
}

main();
