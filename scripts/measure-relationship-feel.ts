/**
 * Relationship-feel measurement (Objective 9 validation).
 *
 * Seeds a small valley with married couples + single paramours + houses and
 * workplaces, runs MEASURE_DAYS colony days, captures the daily relationship
 * diagnostics snapshots (interval + active counters) and per-tick timings,
 * then reports event rates/day and tick p50/p95.
 *
 * Run: npx tsx scripts/measure-relationship-feel.ts
 *      MEASURE_DAYS=90 npx tsx scripts/measure-relationship-feel.ts
 */
import { gameTick, initGame } from '../src/game/gameEngine';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/worldGen';
import { getSimFocus } from './simFocus';
import { preloadDialogueBank } from '../src/game/dialogueTrees';

const DAYS = Number(process.env.MEASURE_DAYS ?? 60);

function placeBuilding(state: WorldState, type: BuildingType, x: number, y: number, id: number): Building {
  const b: Building = {
    id,
    type,
    x,
    y,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  } as Building;
  state.buildings.push(b);
  return b;
}

async function main(): Promise<void> {
  await preloadDialogueBank();
  const state = initGame({ villageName: 'Feelville', size: MapSize.Small });
  state.resources.food = 3000;
  state.resources.wood = 3000;
  state.resources.stone = 1500;
  state.resources.gold = 800;

  let id = state.nextEntityId;
  const make = (x: number, y: number, age: number, gender: 'male' | 'female'): Entity => {
    const h = createEntity(EntityType.Human, x, y, id++, 300, false, {
      name: `C${id}`,
      ageYears: age,
      colonyDay: 0,
    });
    h.alive = true;
    h.isJuvenile = false;
    h.age = age;
    h.gender = gender;
    state.entities.push(h);
    state.humanPopulation++;
    return h;
  };

  // Three married couples, homes spread out so spouses separate for work.
  const coupleSpots: Array<[number, number]> = [[120, 120], [220, 120], [320, 120]];
  for (const [x, y] of coupleSpots) {
    const wife = make(x, y, 26, 'female');
    const husband = make(x + 5, y + 3, 28, 'male');
    wife.relationshipStatus = 'married';
    husband.relationshipStatus = 'married';
    wife.partnerId = husband.id;
    husband.partnerId = wife.id;
  }
  // Single paramours scattered near the couples.
  make(160, 150, 24, 'male');
  make(260, 150, 25, 'male');
  make(360, 150, 27, 'male');
  make(180, 160, 23, 'male');
  state.nextEntityId = id;

  // A couple of houses + workplaces so the assign layer separates spouses by day.
  let bId = state.nextBuildingId;
  placeBuilding(state, BuildingType.House, 100, 100, bId++);
  placeBuilding(state, BuildingType.House, 200, 100, bId++);
  placeBuilding(state, BuildingType.House, 300, 100, bId++);
  placeBuilding(state, BuildingType.Tavern, 220, 200, bId++);
  placeBuilding(state, BuildingType.LumberMill, 320, 220, bId++);
  placeBuilding(state, BuildingType.Farm, 200, 300, bId++);
  placeBuilding(state, BuildingType.Farm, 260, 300, bId++);
  placeBuilding(state, BuildingType.Farm, 320, 300, bId++);
  state.nextBuildingId = bId;

  const focus = getSimFocus(state);
  const tickTimes: number[] = [];
  const snapshots: Array<Record<string, number>> = [];
  const origInfo = console.info;
  console.info = (...args: unknown[]) => {
    if (args[0] === '[Wilderfolk relationship diagnostics]') {
      snapshots.push(args[1] as Record<string, number>);
    } else {
      origInfo(...args);
    }
  };

  for (let tick = 0; tick < DAYS * 72; tick++) {
    const t0 = performance.now();
    gameTick(state, focus);
    tickTimes.push(performance.now() - t0);
  }
  console.info = origInfo;

  const sum = (k: string): number => snapshots.reduce((a, d) => a + (d[k] ?? 0), 0);
  const sorted = [...tickTimes].sort((a, b) => a - b);
  const pct = (q: number): string =>
    (sorted[Math.min(Math.floor(sorted.length * q), sorted.length - 1)] ?? 0).toFixed(1);
  const last = snapshots[snapshots.length - 1] ?? {};

  console.log(`\n=== relationship feel: ${DAYS} seeded days ===`);
  console.log(`colonists: ${state.humanPopulation} | tick p50 ${pct(0.5)}ms | p95 ${pct(0.95)}ms`);
  console.log(`social: affairChecks/day ${(sum('affairChecks') / DAYS).toFixed(1)} | `
    + `affairProgressGains ${sum('affairProgressGains')} | affairsEstablished ${sum('affairsEstablished')} | `
    + `gossipChecks ${sum('gossipChecks')}`);
  console.log(`conception: candidates/day ${(sum('conceptionCandidates') / DAYS).toFixed(1)} | `
    + `eligibility ${sum('conceptionEligibilityRejected')} | energy ${sum('conceptionEnergyBlocked')} | `
    + `proximity ${sum('conceptionProximityBlocked')} | rollFailed ${sum('conceptionRollFailed')}`);
  console.log(`pregnancies started: ${sum('pregnanciesStartedThisInterval')} | `
    + `births: ${sum('birthsCompletedThisInterval')} | scandals: ${sum('scandalExposures')}`);
  console.log(`final active pregnancies: ${last.activePregnancies ?? 0}`);
  const deaths = state.eventLog.filter((l) => l.type === 'death').length;
  const aliveCount = state.entities.filter((e) => e.alive && e.type === EntityType.Human).length;
  console.log(`alive humans: ${aliveCount} | death events: ${deaths}`);
  const deathEntries = state.eventLog.filter((l) => l.type === 'death').slice(0, 5);
  console.log('sample deaths:', JSON.stringify(deathEntries).slice(0, 600));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
