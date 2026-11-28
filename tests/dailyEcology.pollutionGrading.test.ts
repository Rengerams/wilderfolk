/**
 * Pollution grades with settlement size: the population term no longer pins every mid-size colony
 * at the 100 cap, and a Wildlife Preserve damps the score.
 */
import { describe, expect, it } from 'vitest';
import { calculateEcosystemMetrics } from '../src/game/dailyEcology';
import { BuildingType, BUILDING_CONFIGS, EntityType, JobType } from '../src/game/gameTypes';
import type { EcosystemCounts } from '../src/game/dailyEcology';
import type { Building, WorldState } from '../src/game/gameTypes';
import { building } from '../src/test/factories';
import { createEntity } from '../src/game/entityFactory';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { getPreventiveCareMortalityMultiplier } from '../src/game/hospitalCare';

function counts(humans: number): EcosystemCounts {
  return {
    humans, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0,
    grass: 0, trees: 0,
  };
}

function world(buildings: Building[] = []): WorldState {
  return { unlockedTechs: [], buildings } as unknown as WorldState;
}

const pollutionAt = (humans: number, buildings: Building[] = []): number =>
  calculateEcosystemMetrics(world(buildings), counts(humans), buildings).pollutionLevel;

describe('pollution grading', () => {
  it('grades 300 / 1,000 / 2,500 settlers instead of pinning every colony at 100', () => {
    const small = pollutionAt(300);
    const medium = pollutionAt(1_000);
    const large = pollutionAt(2_500);
    expect(small).toBe(12);
    expect(medium).toBe(40);
    expect(large).toBe(100);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  it('lets a Wildlife Preserve damp the whole score', () => {
    const preserves = [
      building(1, BuildingType.WildlifePreserve),
      building(2, BuildingType.WildlifePreserve),
    ];
    expect(pollutionAt(1_000, preserves)).toBeLessThan(pollutionAt(1_000));
  });
  it('scales 800 buildings by their land use instead of their count', () => {
    const houses = Array.from({ length: 800 }, (_, i) => ({
      ...building(i + 1, BuildingType.House), width: 46, height: 40,
    }));
    const wildlife = { ...counts(1000), rabbits: 80 };
    const small = calculateEcosystemMetrics({ ...world(houses), width: 2560, height: 1920 }, wildlife, houses);
    const huge = calculateEcosystemMetrics({ ...world(houses), width: 6144, height: 4608 }, wildlife, houses);
    expect(huge.health).toBeGreaterThan(70);
    expect(small.buildingImpact).toBeGreaterThan(huge.buildingImpact);
    const roads = houses.map(site => ({ ...site, type: BuildingType.Road }));
    expect(calculateEcosystemMetrics(world(roads), wildlife, roads).buildingImpact).toBeLessThan(small.buildingImpact);
  });

  it('bounds stacked preserve benefits and leaves unstaffed industry without operational emissions', () => {
    const preserves = Array.from({ length: 100 }, (_, i) => building(i + 1, BuildingType.WildlifePreserve));
    const mine = building(101, BuildingType.Mine);
    const metrics = calculateEcosystemMetrics(world([...preserves, mine]), counts(1000), [...preserves, mine]);
    expect(metrics.preserveBonus).toBe(20);
    expect(metrics.pollutionLevel).toBe(20);
    expect(metrics.industrialEmissions).toBe(0);
  });
  it('charges only witnessed industry activity and applies forestry research to those emissions', () => {
    const mine = building(1, BuildingType.Mine);
    const workers = Array.from({ length: BUILDING_CONFIGS[BuildingType.Mine].maxOccupants }, (_, index) => {
      const worker = createEntity(EntityType.Human, 100, 100, index + 10, 300);
      worker.workerBuildingId = mine.id;
      worker.schedulePresentTicksToday = 9 * TICKS_PER_HOUR;
      worker.schedulePresentSiteIdToday = mine.id;
      return worker;
    });
    const state = { ...world([mine]), entities: workers };
    const active = calculateEcosystemMetrics(state, counts(0), [mine]);
    expect(active.industrialEmissions).toBeGreaterThan(0);
    expect(active.pollutionLevel).toBeGreaterThan(0);
    const cleaner = calculateEcosystemMetrics({ ...state, unlockedTechs: ['forestry_2'] }, counts(0), [mine]);
    expect(cleaner.pollutionLevel).toBeLessThan(active.pollutionLevel);
  });

  it('scales mortality prevention with living assigned doctors rather than hospital count', () => {
    const ward = building(1, BuildingType.Hospital);
    const doctor = createEntity(EntityType.Human, 100, 100, 100, 300);
    doctor.job = JobType.Doctor;
    doctor.workerBuildingId = ward.id;
    ward.occupants = [doctor.id, doctor.id];
    const byId = new Map([[doctor.id, doctor]]);
    expect(getPreventiveCareMortalityMultiplier({ humanPopulation: 50 }, [ward], byId)).toBe(0.5);
    expect(getPreventiveCareMortalityMultiplier({ humanPopulation: 500 }, [ward], byId)).toBeCloseTo(0.95);
    doctor.alive = false;
    expect(getPreventiveCareMortalityMultiplier({ humanPopulation: 50 }, [ward], byId)).toBe(1);
  });
});
