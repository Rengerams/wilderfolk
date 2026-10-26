
/**
 * Non-vacuity of the long-run gate.
 *
 * `assessColonyStall` separates "no invariant was broken" from
 * "the colony is still working".
 *
 * Each rule is tested against a real growing colony and against
 * deliberately stalled or invalid conditions.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { gameTick } from '../src/game/gameEngine';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { buildResidenceOccupancy, getResidenceCapacity, isHomelessSettler, isImprisoned, isResidenceBuilding, isResidenceOccupantEntity } from '../src/game/residencyOccupancy';
import { buildHousingUnits, listPlayerResidences, pickResidenceForFamily, pickResidenceForHuman } from '../src/game/residencySelection';
import { getChildCustodian, isMinorChild } from '../src/game/householdComposition';
import {
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsEnabled,
} from '../src/game/relationshipDiagnostics';
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
/** Three checkpoints: the retuned 288-tick day pushed the first delivery past the old 60-day window. */
const HEALTHY_DAYS = CHECKPOINT_DAYS * 3;

interface ObservedRun {
  world: WorldState;
  snapshots: ColonyHealthReport[];
  final: ColonyHealthReport;
  newBuildings: number;
}

/**
 * Run the real simulation without the Virtual Player.
 * Record observations at each checkpoint.
 */
function observeRun(world: WorldState, days: number): ObservedRun {
  setRelationshipDiagnosticsEnabled(true);

  const observer = createColonyObserver(world);
  const initialBuildingIds = new Set(
    world.buildings.map((building) => building.id),
  );

  const snapshots: ColonyHealthReport[] = [];

  const checkpoints = new Set(
    Array.from(
      { length: Math.ceil(days / CHECKPOINT_DAYS) },
      (_, index) =>
        Math.min((index + 1) * CHECKPOINT_DAYS, days) *
        TICKS_PER_DAY,
    ),
  );

  for (let tick = 1; tick <= days * TICKS_PER_DAY; tick++) {
    gameTick(world);

    if (!checkpoints.has(tick)) continue;

    snapshots.push(
      observer.observe(
        tick / TICKS_PER_DAY,
        sampleDelta(world),
        [],
      ),
    );
  }

  return {
    world,
    snapshots,
    final: observer.observe(
      days,
      sampleDelta(world),
      [],
    ),
    newBuildings: world.buildings.filter(
      (building) => !initialBuildingIds.has(building.id),
    ).length,
  };
}

/**
 * Evaluate whether the colony stalled.
 */
function verdictFor(run: ObservedRun) {
  return assessColonyStall({
    world: run.world,
    snapshots: run.snapshots,
    final: run.final,
    newBuildingsAtEnd: run.newBuildings,
  });
}

/**
 * Construct a minimal health report for isolated verdict tests.
 *
 * These values do not affect the actual simulation.
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
      stored: 50,
      storageMax: 5000,
      spoilageRatePerDay: 0.008,
      producedToday: 8,
      consumedToday: 69,
      netToday: -61,
      ledgerDay: 720,
      ...overrides.food,
    },

    housing: {
      homelessPlayerHumans: 23,
      occupiedBeds: 48,
      totalBeds: 48,
      ...overrides.housing,
    },

    workforce: {
      working: 13,
      idle: 44,
      workerSlots: 21,
      filledWorkerSlots: 13,
      ...overrides.workforce,
    },
  } as unknown as ColonyHealthReport;
}

/**
 * Minimal world fixture with all five resource types.
 *
 * Gold and iron are genuine resources in Wilderfolk.
 * Defaults preserve existing two-argument test calls.
 */
function fakeWorld(
  wood: number,
  stone: number,
  iron = 0,
  gold = 0,
): WorldState {
  return {
    resources: {
      food: 0,
      wood,
      stone,
      iron,
      gold,
    },

    storageMax: {
      food: 2600,
      wood: 1700,
      stone: 1000,
      iron: 1000,
      gold: 1000,
    },
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
      const prepared = prepareColonyWorld({
        size: MapSize.Medium,
        seed: SEED,
        scenario: 'producers',
      });

      const founders = livingHumans(prepared.world).length;
      const consoleCapture = captureConsoleVolume();

      let run: ObservedRun;

      try {
        run = observeRun(prepared.world, HEALTHY_DAYS);
      } finally {
        consoleCapture.restore();
      }

      const verdict = verdictFor(run);

      expect(formatColonyStallVerdict(verdict)).toBe('healthy');
      expect(verdict.reasons).toEqual([]);

      // A healthy verdict must reflect real population growth.
      const settlers =
        run.final.housing.occupiedBeds +
        run.final.housing.homelessPlayerHumans;

      expect(
        settlers,
        'the settlement grew',
      ).toBeGreaterThan(founders);

      expect(
        run.final.lifecycle.birthsLogged,
        'births were delivered',
      ).toBeGreaterThan(0);

      expect(
        run.final.workforce.working,
        'workers hold posts',
      ).toBeGreaterThan(0);

      expect(
        run.final.food.stored,
        'the larder still holds food',
      ).toBeGreaterThan(0);

      const occupancy = buildResidenceOccupancy(run.world.entities);
      const residences = run.world.buildings.filter(isResidenceBuilding);
      for (const residence of residences) {
        const used = occupancy.get(residence.id) ?? 0;
        expect(used, `residence ${residence.id} must not exceed its capacity`).toBeLessThanOrEqual(getResidenceCapacity(residence));
      }

      const residents = run.world.entities.filter((human) => isResidenceOccupantEntity(human) && !isImprisoned(human));
      const possibleHomes = listPlayerResidences(run.world.buildings);
      for (const unit of buildHousingUnits(residents)) {
        const homeless = unit.filter(isHomelessSettler);
        if (homeless.length === 0) continue;
        expect(
          pickResidenceForFamily(unit, residents, possibleHomes, occupancy),
          `household containing ${homeless.map((human) => human.id).join(', ')} has a viable home`,
        ).toBeUndefined();
        if (unit.length !== 1) continue;
        const dependentIds = new Set(
          unit.filter(isMinorChild).map((child) => getChildCustodian(child, residents)?.id),
        );
        for (const human of homeless) {
          if (isMinorChild(human) || dependentIds.has(human.id)) continue;
          expect(
            pickResidenceForHuman(human, residents, possibleHomes, occupancy),
            `homeless independent adult ${human.id} can be placed by the game's selection rule`,
          ).toBeUndefined();
        }
      }
    },
    300_000,
  );

  it('fails a stalled colony that raises nothing while its beds stay full', () => {
    const stalledReport = reportOf({
      food: {
        stored: 0,
      },
    });

    const verdict = assessColonyStall({
      world: fakeWorld(4, 4, 0, 0),
      snapshots: [stalledReport],
      final: stalledReport,
      newBuildingsAtEnd: 0,
    });

    expect(verdict.stalled).toBe(true);

    expect(verdict.reasons).toContain('housing-full');
    expect(verdict.reasons).toContain('food-exhausted');
    expect(verdict.reasons).toContain('wood-pinned');

    expect(verdict.evidence.join(' ')).toContain('23 homeless');
    expect(verdict.evidence.join(' ')).toContain('larder at 0');
  });

  it('clears the housing and resource rules once the colony raises a building', () => {
    const verdict = assessColonyStall({
      world: fakeWorld(4, 4, 0, 0),
      snapshots: [reportOf({})],
      final: reportOf({}),
      newBuildingsAtEnd: 1,
    });

    expect(verdict.reasons).not.toContain('housing-full');
    expect(verdict.reasons).not.toContain('wood-pinned');
  });

  it('does not judge a run shorter than the settling period', () => {
    const short = reportOf({
      day: STALL_SETTLING_DAYS - 1,
    });

    const verdict = assessColonyStall({
      world: fakeWorld(0, 0, 0, 0),
      snapshots: [short],
      final: short,
      newBuildingsAtEnd: 0,
    });

    expect(verdict).toEqual({
      stalled: false,
      reasons: [],
      evidence: [],
    });
  });

  it('does not fire on a single observation of a working colony', () => {
    const working = reportOf({
      day: 60,

      food: {
        stored: 2112,
        producedToday: 107,
        consumedToday: 46,
        netToday: 61,
      },

      workforce: {
        working: 13,
        idle: 29,
        workerSlots: 21,
        filledWorkerSlots: 13,
      },

      housing: {
        homelessPlayerHumans: 0,
        occupiedBeds: 48,
        totalBeds: 48,
      },
    });

    const verdict = assessColonyStall({
      world: fakeWorld(1700, 90, 0, 0),
      snapshots: [working],
      final: working,
      newBuildingsAtEnd: 0,
    });

    expect(verdict.stalled).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });
});
