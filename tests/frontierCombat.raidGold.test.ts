/**
 * Raid pressure is a property of the village, not of the camp: the war-band and its prize grow with
 * the adult population rather than currently available soldiers. Loot has an independent cap.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  clampRaidGoldGain,
  countArmedMilitia,
  respondToOutgoingRaidEvent,
  tickPendingOutgoingRaidEvents,
  getRaidGrowthScale,
  getRivalRaidStrength,
  maybeQueueRaid,
  RAID_GROWTH_BASE_ADULTS,
  type RaidEvent,
} from '../src/game/frontierCombat';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, OutgoingRaidEvent, RivalSettlement, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { genomeFrom } from './helpers/genome';

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

/** One world for every village size; only the number of adult residents may differ. */
const FIXTURE_SEED = 11;

/** A settler colony of `adults` and one tense camp in reach — the raid gates need a real village. */
function raidFixture(adults: number): { state: WorldState; rival: RivalSettlement } {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const template = state.entities.find((e) => e.alive && e.type === EntityType.Human);
  if (!template) throw new Error('the fixture world has no settler to clone');
  // `initGame` draws a random map seed, so normalise every per-person defence input: genome, marks
  // and juvenile status. Only the count may differ between two sizes of the same village.
  for (const entity of state.entities) {
    if (entity.alive && entity.type === EntityType.Human) {
      entity.genomeV2 = genomeFrom();
      entity.marks = [];
      entity.isJuvenile = false;
      entity.job = JobType.Soldier;
    }
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
function queuedRaid(adults: number, editWorld?: (state: WorldState) => void): RaidEvent | null {
  // A failed chance roll has no gameplay side effects; reuse this immutable-size fixture
  // rather than regenerating a terrain world (and 800 adults) up to forty times.
  const { state, rival } = raidFixture(adults);
  editWorld?.(state);
  for (let seed = 1; seed <= 40; seed++) {
    resetSimRng();
    setSimSeed(seed);
    maybeQueueRaid(state, rival, state.entities);
    const queued = state.pendingRaidEvents?.[0];
    if (queued) return queued;
  }
  return null;
}

describe('a raid scales with the village it is aimed at', () => {
  it('scales the war-band with all adults while capping the raid loot', () => {
    const small = queuedRaid(RAID_GROWTH_BASE_ADULTS);
    const grown = queuedRaid(RAID_GROWTH_BASE_ADULTS * 100);
    expect(small, 'no seed queued the raid').not.toBeNull();
    expect(grown).not.toBeNull();

    // An unprotected large settlement still faces the full population-based threat,
    // but the band cannot haul 100× more loot when the prize ceiling is 3.5×.
    expect(grown!.attackerStrength / small!.attackerStrength).toBeCloseTo(100, 0);
    expect(grown!.lootWood / small!.lootWood).toBeGreaterThan(2);
    expect(grown!.lootWood / small!.lootWood).toBeLessThanOrEqual(4);
    expect(grown!.lootStone / small!.lootStone).toBeLessThanOrEqual(4);
  });

  it('does not shrink a rival war-band when defenders are assigned elsewhere or to civilian work', () => {
    const base = queuedRaid(80);
    const away = queuedRaid(80, (world) => {
      for (const person of world.entities) {
        if (person.alive && person.type === EntityType.Human) person.raidDeploymentId = 'away_on_campaign';
      }
    });
    const civilians = queuedRaid(80, (world) => {
      for (const person of world.entities) {
        if (person.alive && person.type === EntityType.Human) person.job = JobType.Farmer;
      }
    });
    expect(base).not.toBeNull();
    expect(away?.attackerStrength).toBe(base?.attackerStrength);
    expect(civilians?.attackerStrength).toBe(base?.attackerStrength);
    expect(away?.lootWood).toBe(base?.lootWood);
  });

  it('keeps the defence-to-attack ratio flat, so growth never turns a raid into a walkover', () => {
    const pressure = (adults: number): number => {
      // Same seed ⇒ the same settlers and traits at every size, so only population changes.
      resetSimRng();
      setSimSeed(FIXTURE_SEED);
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

describe('outgoing raid payoff, news and militia ownership', () => {
  function rival(): RivalSettlement {
    return {
      id: 'rival-one',
      name: 'North Camp',
      campX: 50,
      campY: 50,
      population: 6,
      relationship: 'neutral',
      foundedYear: 0,
      daysUntilAction: 10,
      raidCooldownDays: 10,
      peaceTreatyDays: 0,
    };
  }

  function outgoingEvent(over: Partial<OutgoingRaidEvent> = {}): OutgoingRaidEvent {
    return {
      id: 'out_1',
      rivalId: 'rival-one',
      rivalName: 'North Camp',
      title: 'Raid',
      description: 'Raid',
      emoji: '🏹',
      choices: [],
      createdAtTick: 0,
      expiresAtTick: 1000,
      marchDistanceTiles: 10,
      isCounterRaid: false,
      rivalResponse: 'payoff_offer',
      attackerStrength: 100,
      defenderStrength: 50,
      lootFood: 40,
      lootGold: 10,
      lootWood: 20,
      lootStone: 5,
      ...over,
    };
  }

  describe('frontierCombat raid spoils (L26, cross-cutting storage-cap clamps)', () => {
    it('never subtracts stores that already sit above the storage cap', () => {
      const state = initGame({ villageName: 'Testholm', size: 'medium', seed: 7 });
      state.rivalSettlements = [rival()];
      state.resources.food = state.storageMax.food + 60;
      state.resources.wood = state.storageMax.wood - 10;
      const overCapFood = state.resources.food;
      const event = outgoingEvent({ rivalResponse: 'payoff_offer' });
      state.pendingOutgoingRaidEvents = [event];

      const after = respondToOutgoingRaidEvent(state, event.id, 'accept_payoff');

      // Over-cap stock is left untouched — spoils never clamp a store down…
      expect(after.resources.food).toBe(overCapFood);
      // …while a capped store still takes only the headroom that exists.
      expect(after.resources.wood).toBe(after.storageMax.wood);
      expect(after.pendingOutgoingRaidEvents ?? []).toHaveLength(0);
    });
  });

  describe('frontierCombat big news (L27)', () => {
    it('mints unique big-news ids when two notices fire on one capped tick', () => {
      const state = initGame({ villageName: 'Testholm', size: 'medium', seed: 7 });
      state.tick = 500;
      state.bigNews = Array.from({ length: 50 }, (_, i) => ({
        id: `seed_${i}`,
        title: 'Earlier news',
        message: 'Earlier news',
        type: 'neutral' as const,
        createdAt: 0,
        dismissed: false,
      }));
      state.pendingOutgoingRaidEvents = [
        outgoingEvent({ id: 'expired_a', rivalId: 'absent_a', rivalName: 'Camp A', expiresAtTick: 500, rivalResponse: 'fight' }),
        outgoingEvent({ id: 'expired_b', rivalId: 'absent_b', rivalName: 'Camp B', expiresAtTick: 500, rivalResponse: 'fight' }),
      ];

      tickPendingOutgoingRaidEvents(state);

      const ids = state.bigNews.map((n) => n.id);
      expect(ids).toHaveLength(50);
      expect(new Set(ids).size).toBe(50);
      expect(ids.filter((id) => id.startsWith('bn_'))).toHaveLength(2);
    });
  });

  describe('frontierCombat militia count (cross-cutting dead militia rule)', () => {
    it('counts militia through the militia owner instead of a local arming rule', () => {
      const state = initGame({ villageName: 'Testholm', size: 'medium', seed: 7 });
      for (const entity of state.entities) if (entity.alive && entity.type === EntityType.Human) entity.job = JobType.Soldier;
      const ownerCount = computeMilitiaBreakdown(state, state.entities, { includeStructures: false }).adultCount;
      expect(ownerCount).toBeGreaterThan(0);
      expect(countArmedMilitia(state, state.entities)).toBe(ownerCount);
    });
  });
});
