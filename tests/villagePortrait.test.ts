import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, type WorldState } from '../src/game/gameTypes';
import { building } from '../src/test/factories';
import { createEmptyLifetimeStats } from '../src/game/stats';
import { computeVillagePortrait } from '../src/game/villagePortrait';

const neutralVillage = {
  tick: 0,
  year: 0,
  humanPopulation: 8,
  entities: [],
  buildings: [],
  tradeRoutes: [],
  lifetimeStats: createEmptyLifetimeStats(),
  ecosystemHealth: 50,
  ecoHealthYearsAbove80: 0,
  villageReputation: 0,
  rivalSettlements: [],
  pendingOutgoingRaidEvents: [],
  raidBattleReports: [],
  eventLog: [],
} as unknown as WorldState;

describe('village identity follows player choices', () => {
  it('starts as Young pioneers regardless of native wolves or Wildkin', () => {
    const initial = computeVillagePortrait(neutralVillage);
    const withWildlife = computeVillagePortrait({
      ...neutralVillage,
      entities: Array.from({ length: 40 }, (_, index) => ({
        type: index % 2 === 0 ? EntityType.Wolf : EntityType.Wildkin, alive: true,
      })) as unknown as WorldState['entities'],
    });
    expect(initial.title).toBe('Young pioneers');
    expect(initial.traits.find((trait) => trait.id === 'nature')?.score).toBe(0);
    expect(withWildlife.traits.find((trait) => trait.id === 'nature')?.score).toBe(0);
    expect(withWildlife.title).toBe('Young pioneers');
  });

  it('recognizes conservation when wildlife preserves are backed by ecological health', () => {
    const world: WorldState = {
      ...neutralVillage, ecosystemHealth: 90, ecoHealthYearsAbove80: 3,
      buildings: [1, 2, 3].map((id) =>
        building(id, BuildingType.WildlifePreserve, { completed: true })),
    };
    const portrait = computeVillagePortrait(world);
    expect(portrait.primary).toBe('nature');
    expect(portrait.title).toBe('Stewards of the valley');
    expect(portrait.traits.find((trait) => trait.id === 'nature')?.score).toBeGreaterThan(55);
  });

  it('recognizes active caravans as a merchant identity', () => {
    const world: WorldState = {
      ...neutralVillage,
      tradeRoutes: Array.from({ length: 3 }, () => ({ active: true })) as unknown as WorldState['tradeRoutes'],
      lifetimeStats: {
        ...neutralVillage.lifetimeStats,
        tradeCaravansCompleted: 20, goldFromTradeRoutes: 12_000,
      },
    };
    expect(computeVillagePortrait(world).primary).toBe('trade');
  });

  it('uses retained battle reports instead of Chronicle retention for offensive history', () => {
    const world: WorldState = {
      ...neutralVillage,
      raidBattleReports: [1, 2, 3].map((id) => ({
        raidId: `raid-${id}`, side: 'offense',
      })) as unknown as NonNullable<WorldState['raidBattleReports']>,
      eventLog: [],
    };
    const portrait = computeVillagePortrait(world);
    expect(portrait.primary).toBe('war');
    expect(portrait.title).toBe('Barbarians of the border');
    const withChronicle = computeVillagePortrait({
      ...world, eventLog: [
        { id: 1, tick: 0, year: 0, day: 0, type: 'combat', message: 'Old raid',
          combatKind: 'outgoing_raid', combatStage: 'dispatched' },
      ],
    });
    expect(withChronicle.traits.find((trait) => trait.id === 'war')?.score).toBe(
      portrait.traits.find((trait) => trait.id === 'war')?.score,
    );
  });

  it('recognizes peace treaties and gifts as diplomatic engagement', () => {
    const world: WorldState = {
      ...neutralVillage,
      rivalSettlements: [1, 2].map(() => ({
        relationship: 'friendly', peaceTreatyDays: 12, giftsGiven: 2,
      })) as unknown as WorldState['rivalSettlements'],
    };
    expect(computeVillagePortrait(world).primary).toBe('diplomacy');
  });

  it('treats completed housing as development but ignores road/fence strips', () => {
    const houses = Array.from({ length: 25 }, (_, i) =>
      building(i + 1, BuildingType.House, { completed: true }));
    const strips = Array.from({ length: 90 }, (_, i) =>
      building(i + 100, i % 2 === 0 ? BuildingType.Road : BuildingType.Fence,
        { completed: true }));
    const world: WorldState = {
      ...neutralVillage, humanPopulation: 100, buildings: houses,
      lifetimeStats: { ...neutralVillage.lifetimeStats, technologiesResearched: 6 },
    };
    const original = computeVillagePortrait(world);
    const withStrips = computeVillagePortrait({ ...world, buildings: [...houses, ...strips] });
    expect(original.primary).toBe('build');
    expect(original.title).toBe('Builders of a township');
    expect(withStrips.traits.find((trait) => trait.id === 'build')?.score).toBe(
      original.traits.find((trait) => trait.id === 'build')?.score,
    );
  });
});
