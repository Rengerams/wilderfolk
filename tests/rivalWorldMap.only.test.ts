/** Rivals are world-map records, not physical village-map hunters or raiders. */
import { afterEach, describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, RivalSettlement, WorldState } from '../src/game/gameTypes';
import { isCounterRaidOnRival } from '../src/game/frontierCombat';
import { tickRivalSettlements } from '../src/game/rivalEvents';
import { createRivalProfile, normalizeRivalProfile } from '../src/game/rivalProfiles';
import { initGame } from '../src/game/worldGen';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

function worldWithCompetitiveRival(): { world: WorldState; deer: Entity } {
  const world = initGame({ seed: 20261122, width: 1024, height: 768, skipTerrain: true });
  const deer = { id: 999_001, type: EntityType.Deer, x: 300, y: 300, alive: true } as Entity;
  world.entities.push(deer);
  const profile = createRivalProfile(2, 'competitive');
  profile.ledger = { food: 10, wood: 5, gold: 0, morale: 80, recovery: 100 };
  world.rivalSettlements = [{
    id: 'worldmap_rival',
    name: 'Distant Camp',
    campX: 700,
    campY: 600,
    population: 5,
    relationship: 'competitive',
    foundedYear: 0,
    daysUntilAction: 1,
    raidCooldownDays: 100,
    peaceTreatyDays: 0,
    profile,
  } as RivalSettlement];
  world.tick = 0;
  world.year = 0;
  return { world, deer };
}

afterEach(() => resetSimRng());

describe('world-map-only rival simulation', () => {
  it('limits the total daily reputation drain across hostile rival camps', () => {
    for (let seed = 1; seed <= 24; seed++) {
      resetSimRng();
      const state = initGame({ seed, skipTerrain: true });
      setSimSeed(seed);
      state.tick = 0;
      state.year = 0;
      state.villageReputation = 50;
      state.rivalSettlements = Array.from({ length: 6 }, (_, index) => ({
        id: `tense_${index}`,
        name: `Tense Camp ${index}`,
        campX: 500 + index * 20,
        campY: 600,
        population: 5,
        relationship: 'tense' as const,
        foundedYear: 0,
        daysUntilAction: 1,
        raidCooldownDays: 100,
        peaceTreatyDays: 0,
        profile: createRivalProfile(index + 1, 'tense'),
      }));
      tickRivalSettlements(state, state.entities, {
        pushNews: () => {},
        logEvent: () => {},
        tickPendingDiplomacyEvents: () => {},
        queueDiplomacyEvent: () => {},
      });
      expect(state.villageReputation, `seed ${seed}`).toBeGreaterThanOrEqual(48);
    }
  });

  it('updates strategic supplies without killing village wildlife, polluting or placing map text', () => {
    setSimSeed(20261122);
    const { world, deer } = worldWithCompetitiveRival();
    const beforePollution = world.pollutionLevel;
    const beforeFloating = world.floatingTexts.length;
    const beforePosition = { x: deer.x, y: deer.y };
    const events: string[] = [];
    tickRivalSettlements(world, world.entities, {
      pushNews: () => {},
      logEvent: (_state, _type, message) => { events.push(message); },
      tickPendingDiplomacyEvents: () => {},
      queueDiplomacyEvent: () => {},
    });

    expect(deer.alive).toBe(true);
    expect({ x: deer.x, y: deer.y }).toEqual(beforePosition);
    expect(world.pollutionLevel).toBe(beforePollution);
    expect(world.floatingTexts).toHaveLength(beforeFloating);
    expect(normalizeRivalProfile(world.rivalSettlements[0]).lastAction).toBe('gather');
    expect(normalizeRivalProfile(world.rivalSettlements[0]).ledger.wood).toBeGreaterThan(5);
    expect(events.some((message) => message.includes('Distant Camp'))).toBe(true);
  });

  it('reads incoming strategic raids without village-map raider entities', () => {
    const { world } = worldWithCompetitiveRival();
    expect(isCounterRaidOnRival(world, 'worldmap_rival')).toBe(false);
    world.pendingRaidEvents = [{ id: 'worldmap_raid', rivalId: 'worldmap_rival' } as never];
    expect(isCounterRaidOnRival(world, 'worldmap_rival')).toBe(true);
    expect(isCounterRaidOnRival(world, 'another_rival')).toBe(false);
  });
});
