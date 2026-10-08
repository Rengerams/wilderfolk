/**
 * Non-vacuity of the long-run gate.
 *
 * `assessColonyStall` is the verdict that separates "no invariant was broken" from "the colony is
 * still working". Each rule is pinned here twice: once on a real run that grows, so it never fires
 * on a healthy colony, and once on a run that has stopped responding, so it cannot pass vacuously.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { gameTick } from '../src/game/gameEngine';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { applyWorkerCommand } from '../src/game/simWorker/commands';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { shouldVirtualPlayerAct } from '../src/hooks/useVirtualPlayer';
import { resetRelationshipDiagnostics, setRelationshipDiagnosticsEnabled } from '../src/game/relationshipDiagnostics';
import { resetSimRng } from '../src/game/simRng';
import {
  STALL_SETTLING_DAYS,
  assessColonyStall,
  captureConsoleVolume,
  createColonyObserver,
  formatColonyStallVerdict,
  livingHumans,
  prepareColonyWorld,
  sampleDelta,
  type ColonyHealthReport,
} from '../scripts/colonyHealth';

const SEED = 12345;
const CHECKPOINT_DAYS = 30;
const HEALTHY_DAYS = CHECKPOINT_DAYS * 2;

interface ObservedRun {
  world: WorldState;
  snapshots: ColonyHealthReport[];
  final: ColonyHealthReport;
  newBuildings: number;
}

function observeRun(world: WorldState, days: number, driveBot: boolean): ObservedRun {
  setRelationshipDiagnosticsEnabled(true);
  const observer = createColonyObserver(world);
  const initialBuildingIds = new Set(world.buildings.map((building) => building.id));
  const snapshots: ColonyHealthReport[] = [];
  const checkpoints = new Set(
    Array.from(
      { length: Math.ceil(days / CHECKPOINT_DAYS) },
      (_, index) => Math.min((index + 1) * CHECKPOINT_DAYS, days) * TICKS_PER_DAY,
    ),
  );
  let lastActedTick: number | null = null;

  for (let tick = 1; tick <= days * TICKS_PER_DAY; tick += 1) {
    gameTick(world);
    if (driveBot && shouldVirtualPlayerAct(true, { paused: world.paused, tick: world.tick }, lastActedTick)) {
      lastActedTick = world.tick;
      const decision = decideVirtualPlayerAction(world);
      if (decision) {
        const applied = applyWorkerCommand(world, decision.command);
        if (applied !== world) Object.assign(world as unknown as Record<string, unknown>, applied);
      }
    }
    if (!checkpoints.has(tick)) continue;
    snapshots.push(observer.observe(tick / TICKS_PER_DAY, sampleDelta(world), []));
  }

  return {
    world,
    snapshots,
    final: observer.observe(days, sampleDelta(world), []),
    newBuildings: world.buildings.filter((building) => !initialBuildingIds.has(building.id)).length,
  };
}

function verdictFor(run: ObservedRun) {
  return assessColonyStall({
    world: run.world,
    snapshots: run.snapshots,
    final: run.final,
    newBuildingsAtEnd: run.newBuildings,
  });
}

/**
 * A partial report carrying the fields the verdict reads. Cast through `unknown` because the rules
 * are deliberately readable from a handful of scalars, which is what lets a stalled state be pinned
 * without spending a two-year simulation on it.
 */
function reportOf(overrides: {
  day?: number;
  housing?: Partial<ColonyHealthReport['housing']>;
  workforce?: Partial<ColonyHealthReport['workforce']>;
  food?: Partial<ColonyHealthReport['food']>;
}): ColonyHealthReport {
  return {
    day: overrides.day ?? 720,
    food: {
      stored: 0,
      storageMax: 2600,
      spoilageRatePerDay: 0.008,
      producedToday: 8,
      consumedToday: 69,
      netToday: -61,
      ledgerDay: 720,
      ...overrides.food,
    },
    housing: { homelessPlayerHumans: 23, occupiedBeds: 48, totalBeds: 48, ...overrides.housing },
    workforce: { working: 13, idle: 44, workerSlots: 21, filledWorkerSlots: 13, ...overrides.workforce },
  } as unknown as ColonyHealthReport;
}

function fakeWorld(wood: number, stone: number): WorldState {
  return {
    resources: { food: 0, wood, stone },
    storageMax: { food: 2600, wood: 1700, stone: 500 },
  } as unknown as WorldState;
}

afterEach(() => {
  resetRelationshipDiagnostics();
  resetSimRng();
});

describe('long-run non-vacuity verdict', () => {
  it(
    `passes a real ${HEALTHY_DAYS}-day run that grows, on seed ${SEED}`,
    () => {
      const prepared = prepareColonyWorld({ size: MapSize.Medium, seed: SEED, scenario: 'producers' });
      const founders = livingHumans(prepared.world).length;
      const consoleCapture = captureConsoleVolume();
      let run: ObservedRun;
      try {
        run = observeRun(prepared.world, HEALTHY_DAYS, true);
      } finally {
        consoleCapture.restore();
      }

      const verdict = verdictFor(run);
      expect(formatColonyStallVerdict(verdict)).toBe('healthy');
      expect(verdict.reasons).toEqual([]);

      // The verdict is only meaningful if the run it approves actually did something: without this
      // "healthy" would also describe a world where nothing ever happened.
      const settlers = run.final.housing.occupiedBeds + run.final.housing.homelessPlayerHumans;
      expect(run.newBuildings, 'the run raised buildings').toBeGreaterThan(0);
      expect(settlers, 'the settlement grew').toBeGreaterThan(founders);
      expect(run.final.workforce.working, 'workers hold posts').toBeGreaterThan(0);
    },
    240_000,
  );

  it('fails a stalled colony that raises nothing while its beds stay full', () => {
    const verdict = assessColonyStall({
      world: fakeWorld(4, 4),
      snapshots: [reportOf({})],
      final: reportOf({}),
      newBuildingsAtEnd: 0,
    });

    expect(verdict.stalled).toBe(true);
    expect(verdict.reasons).toContain('housing-full');
    expect(verdict.reasons).toContain('idle-with-open-jobs');
    expect(verdict.reasons).toContain('food-exhausted');
    expect(verdict.reasons).toContain('wood-pinned');
    expect(verdict.evidence.join(' ')).toContain('23 homeless');
    expect(verdict.evidence.join(' ')).toContain('44 idle');
  });

  it('clears the housing and resource rules once the colony raises a building', () => {
    const verdict = assessColonyStall({
      world: fakeWorld(4, 4),
      snapshots: [reportOf({})],
      final: reportOf({}),
      newBuildingsAtEnd: 1,
    });

    expect(verdict.reasons).not.toContain('housing-full');
    expect(verdict.reasons).not.toContain('wood-pinned');
  });

  it('does not judge a run shorter than the settling period', () => {
    const short = reportOf({ day: STALL_SETTLING_DAYS - 1 });
    const verdict = assessColonyStall({
      world: fakeWorld(0, 0),
      snapshots: [short],
      final: short,
      newBuildingsAtEnd: 0,
    });

    expect(verdict).toEqual({ stalled: false, reasons: [], evidence: [] });
  });

  it('does not fire on one empty larder in an otherwise working colony', () => {
    const dip = reportOf({
      food: { stored: 0, producedToday: 3, consumedToday: 40 },
      workforce: { working: 13, idle: 4, workerSlots: 21, filledWorkerSlots: 13 },
      housing: { homelessPlayerHumans: 0, occupiedBeds: 41, totalBeds: 60 },
    });
    const verdict = assessColonyStall({
      world: fakeWorld(900, 400),
      snapshots: [dip],
      final: dip,
      newBuildingsAtEnd: 2,
    });

    expect(verdict.stalled).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });
});
