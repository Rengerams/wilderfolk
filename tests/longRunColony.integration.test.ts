import { afterEach, describe, expect, it } from 'vitest';
import { gameTick } from '../src/game/gameEngine';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { buildResidenceOccupancy, getResidenceCapacity, isHomelessSettler, isImprisoned, isResidenceBuilding, isResidenceOccupantEntity } from '../src/game/residencyOccupancy';
import { buildHousingUnits, listPlayerResidences, pickResidenceForFamily, pickResidenceForHuman } from '../src/game/residencySelection';
import { getChildCustodian, isMinorChild } from '../src/game/householdComposition';
import { resetRelationshipDiagnostics, setRelationshipDiagnosticsEnabled } from '../src/game/relationshipDiagnostics';
import { resetSimRng } from '../src/game/simRng';
import { shouldVirtualPlayerAct } from '../src/hooks/useVirtualPlayer';
import { applyColonyBotAction, assessColonyStall, captureConsoleVolume, createColonyObserver, formatColonyStallVerdict, livingHumans, prepareColonyWorld, sampleDelta, type ColonyHealthReport } from '../scripts/colonyHealth';

const SEED = 12345;
const CHECKPOINT_DAYS = 30;

const HEALTHY_DAYS = CHECKPOINT_DAYS * 3;

interface ObservedRun {
  world: WorldState;
  snapshots: ColonyHealthReport[];
  final: ColonyHealthReport;
  newBuildings: number;
}

function observeRun(world: WorldState, days: number): ObservedRun {
  setRelationshipDiagnosticsEnabled(true);

  const observer = createColonyObserver(world);
  const initialBuildingIds = new Set(
    world.buildings.map((building) => building.id),
  );

  const snapshots: ColonyHealthReport[] = [];
  let lastBotActedTick: number | null = null;

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
    if (shouldVirtualPlayerAct(true, { paused: world.paused, tick: world.tick }, lastBotActedTick)) {
      lastBotActedTick = world.tick;
      applyColonyBotAction(world);
    }

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

function verdictFor(run: ObservedRun) {
  return assessColonyStall({
    world: run.world,
    snapshots: run.snapshots,
    final: run.final,
    newBuildingsAtEnd: run.newBuildings,
  });
}

afterEach(() => {
  resetRelationshipDiagnostics();
  resetSimRng();
});

describe('90-day producer colony integration', () => {
  it(
    `passes a real ${HEALTHY_DAYS}-day bot-driven producer run on seed ${SEED}`,
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
        const dependentIds = new Set(
          unit.filter(isMinorChild).map((child) => getChildCustodian(child, residents)?.id),
        );
        for (const human of homeless) {
          if (isMinorChild(human) || dependentIds.has(human.id)
            || unit.some((member) => member.id === human.partnerId)) continue;
          const availableHome = pickResidenceForHuman(human, residents, possibleHomes, occupancy);
          const target = possibleHomes.find((home) => home.id === availableHome);
          const household = unit.map((member) =>
            `${member.id}:${member.age}:${member.residenceBuildingId ?? 'homeless'}:${isMinorChild(member) ? 'minor' : 'adult'}`,
          ).join(',');
          const occupants = residents.filter((member) => member.residenceBuildingId === availableHome)
            .map((member) => member.id).join(',');
          expect(
            availableHome,
            `homeless independent adult ${human.id} can be placed by the game's selection rule; household=[${household}], candidate=${availableHome}, occupants=[${occupants}], capacity=${target ? getResidenceCapacity(target) : 'unknown'}`,
          ).toBeUndefined();
        }
      }
    },
    300_000,
  );

});
