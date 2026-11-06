import { appendFileSync, writeFileSync } from 'node:fs';
import { gameTick } from '../src/game/gameEngine';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { getRecentFoodFlow } from '../src/game/economyLedger';
import { resetRelationshipDiagnostics, setRelationshipDiagnosticsEnabled } from '../src/game/relationshipDiagnostics';
import { resetSimRng } from '../src/game/simRng';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { countWorkersAtBuilding, isManualStaffingBuilding } from '../src/game/workforce';
import { shouldVirtualPlayerAct } from '../src/hooks/useVirtualPlayer';
import {
  applyColonyBotAction, captureConsoleVolume, createColonyObserver, livingHumans,
  prepareColonyWorld, sampleDelta, type ColonyHealthReport,
} from '../scripts/colonyHealth';

const FEATURES = (process.env.FEATURES ?? 'diag,observer,capture').split(',');
const DAYS = Number(process.env.DAYS ?? 90);
const LOG = process.env.LOG ?? 'tmp/probe-mirror.log';
const FOOD_TYPES: readonly BuildingType[] = [
  BuildingType.Farm, BuildingType.Greenhouse, BuildingType.FishingSpot, BuildingType.HuntingSpot,
];

import { canPlaceBuilding } from '../src/game/buildingPlacementActions';
import { getBuildingFootprintForType, snapBuildingCenter } from '../src/game/buildingRotation';
import { getPlayerCampCenter } from '../src/game/frontierCombat';
import { GRID_SIZE } from '../src/game/gameTypes';

function firstLegalRing(world: WorldState, type: BuildingType, maxRing: number): number | null {
  const camp = getPlayerCampCenter(world, world.buildings);
  const { width, height } = getBuildingFootprintForType(type, 0);
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const spot = snapBuildingCenter(type, camp.x + dx * (width + GRID_SIZE), camp.y + dy * (height + GRID_SIZE), 0);
        if (canPlaceBuilding(world, type, spot.x, spot.y, 0)) return ring;
      }
    }
  }
  return null;
}

function line(text: string): void {
  appendFileSync(LOG, `${text}\n`, 'utf8');
}

function run(): void {
  writeFileSync(LOG, '', 'utf8');
  const prepared = prepareColonyWorld({ size: MapSize.Medium, seed: 12345, scenario: 'producers' });
  const world: WorldState = prepared.world;
  if (FEATURES.includes('diag')) setRelationshipDiagnosticsEnabled(true);
  const consoleCapture = FEATURES.includes('capture') ? captureConsoleVolume() : null;
  const observer = FEATURES.includes('observer') ? createColonyObserver(world) : null;
  let lastBotActedTick: number | null = null;
  const snapshots = new Map<number, ColonyHealthReport>();
  let dayOps: Record<string, number> = {};
  let dayReasons: string[] = [];
  let idleHours = 0;
  const gateLog: string[] = [];
  (globalThis as { __foodDebug?: (message: string) => void }).__foodDebug = (message) => {
    if (gateLog.length < 60) gateLog.push(message);
  };

  try {
    for (let tick = 1; tick <= DAYS * TICKS_PER_DAY; tick++) {
      gameTick(world);
      if (shouldVirtualPlayerAct(true, { paused: world.paused, tick: world.tick }, lastBotActedTick)) {
        lastBotActedTick = world.tick;
        const decision = decideVirtualPlayerAction(world);
        if (decision) {
          dayOps[decision.command.op] = (dayOps[decision.command.op] ?? 0) + 1;
          if (dayReasons.length < 3) dayReasons.push(`${decision.command.op}: ${decision.reason}`);
          if (decision.command.op === 'startBuilding' && gateLog.length < 40) {
            const food = world.buildings.filter((b) => FOOD_TYPES.includes(b.type) && b.faction !== 'rival');
            gateLog.push(`t=${world.tick} type=${String((decision.command as { type?: unknown }).type)}`
              + ` completed=${food.filter((b) => b.completed).length}`
              + ` incomplete=${food.filter((b) => !b.completed).length}`);
          }
        } else {
          idleHours += 1;
        }
        applyColonyBotAction(world);
      }
      if (observer && tick % TICKS_PER_DAY === 0) {
        snapshots.set(tick / TICKS_PER_DAY, observer.observe(tick / TICKS_PER_DAY, sampleDelta(world), []));
      }
      if (tick % TICKS_PER_DAY !== 0) continue;

      const day = tick / TICKS_PER_DAY;
      const humans = world.entities.filter((e) => e.alive && e.type === EntityType.Human);
      const adults = humans.filter((e) => !e.isJuvenile).length;
      const idleAdults = humans.filter((e) => !e.isJuvenile && e.workerBuildingId == null).length;
      const flow = getRecentFoodFlow(world, 7);
      const foodSites = world.buildings.filter((b) => FOOD_TYPES.includes(b.type) && b.faction !== 'rival');
      const understaffed = foodSites.filter((b) => b.completed && !isManualStaffingBuilding(b)
        && countWorkersAtBuilding(world.entities, b.id) < BUILDING_CONFIGS[b.type].maxOccupants).length;
      const incomplete = foodSites.filter((b) => !b.completed).length;
      const farms = foodSites.filter((b) => b.type === BuildingType.Farm && b.completed);
      const farmLevels = farms.map((f) => f.level || 1).join('/');
      const workerTypes: Record<string, number> = {};
      for (const h of humans) {
        if (h.workerBuildingId == null) continue;
        const b = world.buildings.find((candidate) => candidate.id === h.workerBuildingId);
        if (!b) continue;
        const key = FOOD_TYPES.includes(b.type) ? b.type : 'other';
        workerTypes[key] = (workerTypes[key] ?? 0) + 1;
      }
      line([
        `day=${day}`, `set=${humans.length}`, `adults=${adults}`, `idleAdults=${idleAdults}`,
        `food=${Math.round(world.resources.food)}`, `wood=${Math.round(world.resources.wood)}`,
        `ledger7=${flow ? `${Math.round(flow.producedPerDay)}/${Math.round(flow.consumedPerDay)}/${Math.round(flow.netPerDay)}` : 'n/a'}`,
        `sites=${foodSites.filter((b) => b.completed).length}+${incomplete}`, `under=${understaffed}`,
        `stone=${Math.round(world.resources.stone)}`, `gold=${Math.round(world.resources.gold)}`,
        `ringFarm=${firstLegalRing(world, BuildingType.Farm, 24)}`,
        `levels=${farmLevels}`, `workers=${JSON.stringify(workerTypes)}`,
        `idleH=${idleHours}`, `ops=${JSON.stringify(dayOps)}`, `reasons=[${dayReasons.join(' | ')}]`,
      ].join(' '));
      const checkpoint = observer ? snapshots.get(day) : undefined;
      if (checkpoint) {
        line(`  healthy day=${day} stored=${checkpoint.food.stored} farmBuildings=${checkpoint.workforce.farmBuildings}`
          + ` staffedFarms=${checkpoint.workforce.staffedFarms} working=${checkpoint.workforce.working} idle=${checkpoint.workforce.idle}`);
      }
      dayOps = {};
      dayReasons = [];
      idleHours = 0;
    }
  } finally {
    consoleCapture?.restore();
  }
  line(`final settlers=${livingHumans(world).length} food=${Math.round(world.resources.food)}`);
  line('gates:');
  for (const entry of gateLog) line(`  ${entry}`);
  resetRelationshipDiagnostics();
  resetSimRng();
}

import { it } from 'vitest';

it('mirrors the integration loop', () => {
  run();
}, 900_000);
