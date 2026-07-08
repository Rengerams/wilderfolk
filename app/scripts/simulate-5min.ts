/**
 * Headless 5-minute session sim (~300 ticks @ 1 tick/s) with automated building + audits.
 * Run: npx tsx scripts/simulate-5min.ts
 */
import { getSimFocus } from './simFocus';
import {
  advanceSimTick,
  disposeSimWorkerHost,
  initSimWorkerHost,
} from './simWorkerRuntime';
import {
  initGame,
  recruitSettler,
  EntityType,
  BuildingType,
  BUILDING_CONFIGS,
  BUILDING_JOB_TYPES,
} from '../src/game/gameEngine';
import { tryPlaceBuilding } from './simBuildUtils';
import type { WorldState, Entity, Building } from '../src/game/gameTypes';
import {
  auditHousingSharingIssues,
  countResidentsInBuilding,
  getResidenceCapacity,
  hasResidenceAssignment,
  hasWorkAssignment,
  isResidenceBuilding,
} from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/groupEvents';

const TICKS_PER_REAL_MINUTE = 60; // 1 tick/s at 1× speed
const SIM_MINUTES = Number(process.env.SIM_MINUTES ?? 5);
const TOTAL_TICKS = TICKS_PER_REAL_MINUTE * SIM_MINUTES;

type Severity = 'error' | 'warn';
interface SimIssue {
  tick: number;
  severity: Severity;
  category: string;
  message: string;
}

function countByType(state: WorldState, type: EntityType): number {
  return state.entities.filter((e) => e.alive && e.type === type).length;
}

function jobWorkers(state: WorldState, buildingId: number): number {
  return state.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && e.homeBuildingId === buildingId,
  ).length;
}

function audit(state: WorldState, tick: number): SimIssue[] {
  const issues: SimIssue[] = [];
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const residences = state.buildings.filter((b) => b.completed && isResidenceBuilding(b));
  const jobSites = state.buildings.filter(
    (b) => b.completed && b.faction !== 'rival' && BUILDING_JOB_TYPES[b.type],
  );

  for (const house of residences) {
    const cap = getResidenceCapacity(house);
    if (house.occupants.length > cap) {
      issues.push({
        tick,
        severity: 'error',
        category: 'housing',
        message: `${BUILDING_CONFIGS[house.type].label} #${house.id}: ${house.occupants.length}/${cap} residents`,
      });
    }
  }

  const openBeds = residences.reduce((sum, r) => {
    const cap = getResidenceCapacity(r);
    const used = countResidentsInBuilding(humans, r.id);
    return sum + Math.max(0, cap - used);
  }, 0);

  for (const message of auditHousingSharingIssues(humans, state.buildings)) {
    issues.push({ tick, severity: 'error', category: 'housing', message });
  }

  for (const h of humans.filter((x) => !x.isJuvenile)) {
    if (!hasResidenceAssignment(h) && openBeds > 0) {
      const name = h.name ?? `human#${h.id}`;
      issues.push({
        tick,
        severity: 'error',
        category: 'housing',
        message: `Adult ${name} homeless while ${openBeds} beds free in completed houses`,
      });
    }
  }

  for (const h of humans) {
    if (!h.partnerId || !h.residenceBuildingId) continue;
    const partner = humans.find((p) => p.id === h.partnerId);
    if (!partner?.residenceBuildingId || partner.id > h.id) continue;
    if (partner.residenceBuildingId !== h.residenceBuildingId) {
      issues.push({
        tick,
        severity: 'warn',
        category: 'housing',
        message: `Married pair split: ${h.name ?? h.id} vs ${partner.name ?? partner.id} in different houses`,
      });
    }
  }

  for (const needy of jobSites) {
    const staffed = jobWorkers(state, needy.id);
    const cap = BUILDING_CONFIGS[needy.type].maxOccupants;
    if (staffed === 0 && cap > 0) {
      const donor = jobSites.find((b) => b.id !== needy.id && jobWorkers(state, b.id) >= 2);
      if (donor) {
        issues.push({
          tick,
          severity: 'error',
          category: 'workers',
          message: `${BUILDING_CONFIGS[needy.type].label} empty but ${BUILDING_CONFIGS[donor.type].label} has ${jobWorkers(state, donor.id)} workers`,
        });
      }
    }
  }

  const prey = countByType(state, EntityType.Rabbit) + countByType(state, EntityType.Deer);
  if (prey < 8) {
    issues.push({
      tick,
      severity: prey === 0 ? 'error' : 'warn',
      category: 'wildlife',
      message: `Low prey: ${countByType(state, EntityType.Rabbit)} rabbits, ${countByType(state, EntityType.Deer)} deer`,
    });
  }

  const predators =
    countByType(state, EntityType.Wolf) + countByType(state, EntityType.Fox);
  if (predators === 0 && tick >= TOTAL_TICKS) {
    issues.push({
      tick,
      severity: 'warn',
      category: 'wildlife',
      message: 'No wolves or foxes left on the map at end of sim',
    });
  }

  const childStacks = new Map<string, number>();
  for (const c of humans.filter((h) => h.isJuvenile)) {
    const key = `${Math.round(c.x)},${Math.round(c.y)}`;
    childStacks.set(key, (childStacks.get(key) ?? 0) + 1);
  }
  for (const [pos, n] of childStacks) {
    if (n > 1) {
      issues.push({
        tick,
        severity: 'warn',
        category: 'children',
        message: `${n} children stacked at (${pos})`,
      });
    }
  }

  for (const h of humans) {
    for (const childId of h.childrenIds) {
      const child = state.entities.find((e) => e.id === childId);
      if (child && child.fatherId !== h.id && child.motherId !== h.id) {
        issues.push({
          tick,
          severity: 'error',
          category: 'family',
          message: `${h.name ?? h.id} lists child#${childId} but is not parent`,
        });
      }
    }
  }

  const onCrew = (h: Entity) =>
    state.buildings.some((b) => !b.completed && b.occupants.includes(h.id));
  const trulyIdle = humans.filter(
    (h) => !h.isJuvenile && !hasWorkAssignment(h) && !h.pregnant && !onCrew(h),
  );
  const incomplete = state.buildings.filter((b) => !b.completed);
  if (trulyIdle.length > 0 && incomplete.length > 0 && tick > 48) {
    const stuck = incomplete.find(
      (b) =>
        b.constructionProgress < 100
        && b.occupants.length < BUILDING_CONFIGS[b.type].maxOccupants,
    );
    if (stuck) {
      issues.push({
        tick,
        severity: 'warn',
        category: 'construction',
        message: `${trulyIdle.length} settlers idle but ${BUILDING_CONFIGS[stuck.type].label} still building (${Math.floor(stuck.constructionProgress)}%)`,
      });
    }
  }

  if (humans.length === 0) {
    issues.push({
      tick,
      severity: 'error',
      category: 'population',
      message: 'All player humans dead',
    });
  }

  return issues;
}

function tryPlaceNear(
  state: WorldState,
  type: BuildingType,
  cx: number,
  cy: number,
): WorldState {
  const { state: next, ok } = tryPlaceBuilding(state, type, cx, cy);
  return ok ? next : state;
}

type ScheduledAction = { at: number; fn: (s: WorldState) => WorldState; label: string };

function buildScenario(): ScheduledAction[] {
  const cx = 600;
  const cy = 450;
  return [
    { at: 1, label: 'House A', fn: (s) => tryPlaceNear(s, BuildingType.House, cx, cy) },
    { at: 24, label: 'Farm', fn: (s) => tryPlaceNear(s, BuildingType.Farm, cx + 60, cy) },
    { at: 48, label: 'House B', fn: (s) => tryPlaceNear(s, BuildingType.House, cx - 80, cy + 40) },
    { at: 72, label: 'Lumber mill', fn: (s) => tryPlaceNear(s, BuildingType.LumberMill, cx + 120, cy - 40) },
    { at: 96, label: 'Well', fn: (s) => tryPlaceNear(s, BuildingType.Well, cx - 30, cy - 60) },
    { at: 120, label: 'Recruit settler', fn: (s) => recruitSettler(s) },
    { at: 150, label: 'Quarry', fn: (s) => tryPlaceNear(s, BuildingType.Quarry, cx - 140, cy - 30) },
    { at: 180, label: 'Recruit settler', fn: (s) => recruitSettler(s) },
    { at: 210, label: 'House C', fn: (s) => tryPlaceNear(s, BuildingType.House, cx + 20, cy + 100) },
  ];
}

function summarizeBuildings(state: WorldState): string {
  return state.buildings
    .map((b: Building) => {
      const label = BUILDING_CONFIGS[b.type].label;
      const status = b.completed ? 'done' : `${Math.floor(b.constructionProgress)}%`;
      return `${label}(${status}, occ=${b.occupants.length})`;
    })
    .join(', ');
}

async function runSimulation(): Promise<void> {
  let state = initGame({ villageName: 'Simville' });
  state.resources.wood = 2500;
  state.resources.stone = 1200;
  state.resources.food = 800;
  state.resources.gold = 200;

  const actions = buildScenario();
  const allIssues: SimIssue[] = [];
  const issueKeys = new Set<string>();
  const milestones: string[] = [];

  const simFocus = getSimFocus(state);
  const workerBoot = await initSimWorkerHost(state);
  const workerHost = workerBoot.host;
  state = workerBoot.state;
  const start = performance.now();

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    for (const action of actions) {
      if (action.at === t) {
        const before = state.buildings.length;
        state = action.fn(state);
        const placed = state.buildings.length > before;
        milestones.push(`tick ${t}: ${action.label} ${placed ? 'placed' : 'FAILED'}`);
      }
    }

    state = (await advanceSimTick(state, simFocus, workerHost)).state;

    if (t % 24 === 0) {
      const day = t / 24;
      const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
      milestones.push(
        `— day ${day}: pop=${humans.length}, rabbits=${countByType(state, EntityType.Rabbit)}, deer=${countByType(state, EntityType.Deer)}, buildings=[${summarizeBuildings(state)}]`,
      );
    }

    for (const issue of audit(state, t)) {
      const key = `${issue.category}|${issue.message}`;
      if (!issueKeys.has(key)) {
        issueKeys.add(key);
        allIssues.push(issue);
      }
    }
  }

  disposeSimWorkerHost(workerHost);
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const errors = allIssues.filter((i) => i.severity === 'error');
  const warns = allIssues.filter((i) => i.severity === 'warn');

  console.log('\n=== Wilderfolk 5-minute simulation ===');
  console.log(`Ticks: ${TOTAL_TICKS} (~${SIM_MINUTES} min @ 1×) | Wall time: ${elapsed}s`);
  console.log(`End state: year ${state.year} day ${state.dayInYear} | humans ${humans.length}`);
  console.log(
    `Wildlife: ${countByType(state, EntityType.Rabbit)} rabbits, ${countByType(state, EntityType.Deer)} deer, ${countByType(state, EntityType.Wolf)} wolves, ${countByType(state, EntityType.Fox)} foxes`,
  );
  console.log(`Ecosystem health: ${state.ecosystemHealth}%`);

  console.log('\n--- Player actions ---');
  for (const m of milestones) console.log(m);

  console.log('\n--- Issues found ---');
  if (allIssues.length === 0) {
    console.log('None — all audits passed.');
  } else {
    for (const i of allIssues) {
      console.log(`[${i.severity.toUpperCase()}] tick ${i.tick} ${i.category}: ${i.message}`);
    }
    console.log(`\nTotal: ${errors.length} errors, ${warns.length} warnings (deduped)`);
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

runSimulation().catch((err) => {
  console.error(err);
  process.exit(1);
});