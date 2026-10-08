/**
 * Raid pressure is a property of the village, not of the camp: the war-band and its prize grow with
 * the adults that can be mustered against them, so growth never turns a raid into a walkover.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  clampRaidGoldGain,
  getRaidGrowthScale,
  getRivalRaidStrength,
  maybeQueueRaid,
  RAID_GROWTH_BASE_ADULTS,
  type RaidEvent,
} from '../src/game/frontierCombat';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, RivalSettlement, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

afterEach(() => {
  resetSimRng();
});

describe('clampRaidGoldGain', () => {
  it('caps per-raid gold', () => {
    expect(clampRaidGoldGain(0, 500, 9999)).toBe(80);
  });
  it('respects soft vault room', () => {
    expect(clampRaidGoldGain(9970, 50, 9999)).toBe(29);
  });
  it('returns 0 when spoils empty', () => {
    expect(clampRaidGoldGain(100, 0)).toBe(0);
  });
});

describe('getRaidGrowthScale', () => {
  it('leaves the camp its own war-band at or below the tuned village size', () => {
    expect(getRaidGrowthScale(RAID_GROWTH_BASE_ADULTS)).toBe(1);
    expect(getRaidGrowthScale(2)).toBe(1);
    expect(getRaidGrowthScale(0)).toBe(1);
  });

  it('grows linearly above it and survives nonsense input', () => {
    expect(getRaidGrowthScale(RAID_GROWTH_BASE_ADULTS * 10)).toBe(10);
    expect(getRaidGrowthScale(RAID_GROWTH_BASE_ADULTS * 100)).toBe(100);
    expect(getRaidGrowthScale(Number.NaN)).toBe(1);
    expect(getRaidGrowthScale(-40)).toBe(1);
  });
});

/** A settler colony of `adults` and one tense camp in reach — the raid gates need a real village. */
function raidFixture(adults: number): { state: WorldState; rival: RivalSettlement } {
  const state = initGame();
  const template = state.entities.find((e) => e.alive && e.type === EntityType.Human);
  if (!template) throw new Error('the fixture world has no settler to clone');
  // `initGame` rolls traits without the sim seed, so the fixture normalises them: only the count may
  // differ between two sizes of the same village, or a chivalrous settler would decide the ratio.
  for (const entity of state.entities) {
    if (entity.alive && entity.type === EntityType.Human) entity.traits = [];
  }
  let id = 500_000;
  while (state.entities.filter((e) => e.alive && e.type === EntityType.Human).length < adults) {
    state.entities.push({ ...template, id: id++ } as Entity);
  }
  state.buildings.push({
    id: 700_000,
    type: BuildingType.House,
    x: 400,
    y: 400,
    width: 3,
    height: 3,
    completed: true,
    occupants: [],
    faction: undefined,
  } as unknown as Building);

  const rival = {
    id: 'raid-fixture',
    name: 'Fixture Camp',
    campX: 900,
    campY: 900,
    population: 8,
    entityIds: [],
    buildingIds: [],
    relationship: 'tense',
    foundedYear: 0,
    daysUntilAction: 0,
    raidCooldownDays: 0,
    peaceTreatyDays: 0,
  } as unknown as RivalSettlement;
  state.rivalSettlements.push(rival);
  state.villageReputation = 0;
  return { state, rival };
}

/** The first seed whose chance roll queues the raid — the same seed is used for every village size. */
function queuedRaid(adults: number): RaidEvent | null {
  for (let seed = 1; seed <= 40; seed++) {
    resetSimRng();
    setSimSeed(seed);
    const { state, rival } = raidFixture(adults);
    maybeQueueRaid(state, rival, state.entities);
    const queued = state.pendingRaidEvents?.[0];
    if (queued) return queued;
  }
  return null;
}

describe('a raid scales with the village it is aimed at', () => {
  it('sends a war-band and a prize in proportion to the adults that can be mustered', () => {
    const small = queuedRaid(RAID_GROWTH_BASE_ADULTS);
    const grown = queuedRaid(RAID_GROWTH_BASE_ADULTS * 100);
    expect(small, 'no seed queued the raid').not.toBeNull();
    expect(grown).not.toBeNull();

    // 100× the adults, the same camp: 100× the war-band and ~100× the loot it is after.
    expect(grown!.attackerStrength / small!.attackerStrength).toBeCloseTo(100, 0);
    expect(grown!.lootWood).toBeGreaterThan(small!.lootWood * 50);
    expect(grown!.lootStone).toBeGreaterThan(small!.lootStone * 50);
  });

  it('keeps the defence-to-attack ratio flat, so growth never turns a raid into a walkover', () => {
    const pressure = (adults: number): number => {
      // Same seed ⇒ the same settlers and traits at every size, so only population changes.
      resetSimRng();
      setSimSeed(11);
      const { state, rival } = raidFixture(adults);
      const defence = computeMilitiaBreakdown(state, state.entities).militiaStrength;
      const attack = Math.round(getRivalRaidStrength(rival) * getRaidGrowthScale(adults));
      return defence / attack;
    };

    const ratios = [RAID_GROWTH_BASE_ADULTS, RAID_GROWTH_BASE_ADULTS * 10, RAID_GROWTH_BASE_ADULTS * 100].map(pressure);

    // The ratio is what `resolveDefenseRatio` turns into defeat/stalemate/narrow/decisive, so it is the
    // quantity that must not drift with population; a walkover is a ratio of tens.
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.01);
    expect(ratios[0]).toBeLessThan(1.5);
  });
});
