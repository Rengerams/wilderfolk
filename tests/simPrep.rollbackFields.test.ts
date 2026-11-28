import { EntityType, JobType, MapSize, type Entity, type TradeRoute } from '../src/game/gameTypes';
/**
 * The prep rollback covers what the tick writes: `activeEvent` is restored, and `applySimPrep`
 * keeps the live `scentGrid` rather than invalidating it.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { ensureScentGrid } from '../src/game/scentGrid';
import type { WorldState } from '../src/game/gameTypes';

type ActiveEvent = WorldState['activeEvent'];

function event(id: string): ActiveEvent {
  return { id, title: id } as unknown as ActiveEvent;
}

describe('prep rollback covers what the tick writes (F3/F5)', () => {
  it('undoes an event the failed tick latched', () => {
    const world = initGame();
    world.activeEvent = null;
    const prep = extractSimPrep(world);

    world.activeEvent = event('visitor_pilgrims_504');
    applySimPrep(world, prep);

    expect(world.activeEvent).toBeNull();
  });

  it('restores the event that was live before the tick', () => {
    const world = initGame();
    world.activeEvent = event('raid_before');
    const prep = extractSimPrep(world);

    world.activeEvent = event('story_after');
    applySimPrep(world, prep);

    expect(world.activeEvent?.id).toBe('raid_before');
  });

  it('restores election promise records written by the tick', () => {
    const world = initGame();
    world.electionPromiseRecords = [];
    const prep = extractSimPrep(world);

    world.electionPromiseRecords = [{
      electionId: 1, leaderId: 2, year: 2, dueDay: 700, codes: [1], evaluated: false,
    }];
    applySimPrep(world, prep);

    expect(world.electionPromiseRecords).toEqual([]);
  });

  it('keeps the live scent grid across a rollback', () => {
    const world = initGame();
    const grid = ensureScentGrid(world);
    grid.values[0] = 7;
    const prep = extractSimPrep(world);

    applySimPrep(world, prep);

    expect(world.scentGrid).toBe(grid);
    expect(world.scentGrid?.values[0]).toBe(7);
  });
});

describe('worker prep preserves moon cooldowns and chronicle', () => {
  it('is carried by the worker prep payload in both directions', () => {
    const source = initGame({ skipTerrain: true, seed: 20240913 });
    source.lastMoonHowlerExorcismTick = 555;
    source.moonHowlerPriestsFleeUntil = 666;
    source.chronicleChapters = ['a', 'b'];

    const prep = extractSimPrep(source);
    const target = initGame({ skipTerrain: true, seed: 20240913 });
    applySimPrep(target, prep);

    expect(target.lastMoonHowlerExorcismTick).toBe(555);
    expect(target.moonHowlerPriestsFleeUntil).toBe(666);
    expect(target.chronicleChapters).toEqual(['a', 'b']);
  });
});

describe('worker rollback of mutable economy and entity records', () => {
  function settlerFixture(): Entity {
    return {
      id: 1,
      type: EntityType.Human,
      x: 10,
      y: 10,
      energy: 0,
      maxEnergy: 0,
      needs: { nutrition: 80, rest: 85, stamina: 100 },
      age: 30,
      birthYear: 0,
      birthMonth: 0,
      birthDay: 0,
      alive: true,
      size: 10,
      speed: 2,
      vx: 0,
      vy: 0,
      flash: 0,
      animFrame: 0,
      spriteAngle: 0,
      generation: 0,
      isJuvenile: false,
      job: JobType.Settler,
      childrenIds: [7, 8],
      childhoodFriendsIds: [9],
      skills: { [JobType.Farmer]: 1 },
      friendships: { '2': 0.5 },
      feuds: { '3': 0.25 },
      moonHowlerSaved: { energy: 5, maxEnergy: 10, speed: 1, size: 2 },
    } as unknown as Entity;
  }

  it('L65 — rolls back the economy ledger, food history and spoilage rate', () => {
    const world = initGame({ size: MapSize.Medium, seed: 11 });
    world.economyLedger = { day: 3, produced: { food: 10 }, consumed: { food: 2 } };
    world.foodHistory = [{ day: 2, produced: { food: 5 }, consumed: { food: 1 } }];
    world.foodSpoilageRate = 0.03;

    const prep = extractSimPrep(world);

    // The backup must own copies of the nested records, not references into live state.
    expect(prep.economyLedger).toEqual(world.economyLedger);
    expect(prep.economyLedger).not.toBe(world.economyLedger);
    expect(prep.economyLedger!.produced).not.toBe(world.economyLedger.produced);
    expect(prep.foodHistory).toEqual(world.foodHistory);
    expect(prep.foodHistory).not.toBe(world.foodHistory);

    // A daily tick that fails after writing the ledger leaves these in-place edits behind.
    world.economyLedger.produced.food = 99;
    world.foodHistory![0].consumed.food = 77;
    world.foodSpoilageRate = 0.008;

    applySimPrep(world, prep);

    expect(world.economyLedger).toEqual({ day: 3, produced: { food: 10 }, consumed: { food: 2 } });
    expect(world.foodHistory).toEqual([{ day: 2, produced: { food: 5 }, consumed: { food: 1 } }]);
    expect(world.foodSpoilageRate).toBe(0.03);
  });

  it('L66 — rolls back nested entity state and mutable array elements', () => {
    const world = initGame({ size: MapSize.Medium, seed: 12 });
    const settler = settlerFixture();
    world.entities = [settler];
    const route: TradeRoute = {
      id: 'route-1',
      targetName: 'North',
      resourcesGiven: { wood: 10, stone: 0, food: 0, gold: 0, iron: 0 },
      resourcesReceived: { wood: 0, stone: 0, food: 5, gold: 0, iron: 0 },
      reputationRequired: 0,
      active: true,
      caravanLeg: 'outbound',
      caravanWaitTicks: 0,
      caravansCompleted: 0,
    };
    world.tradeRoutes = [route];
    world.disasters = [{ type: 'fire', x: 1, y: 2, radius: 10, duration: 5, progress: 0 }];

    const prep = extractSimPrep(world);

    // In-place writes of the failed attempt — the writers the rollback must undo.
    settler.skills![JobType.Farmer] = 99;
    settler.childrenIds!.push(9);
    settler.childhoodFriendsIds!.push(10);
    // Relationship records are copy-on-write: a writer replaces the record, never mutates it.
    settler.friendships = { ...settler.friendships, '2': 0.9 };
    settler.feuds = { ...settler.feuds, '3': 0.8 };
    settler.moonHowlerSaved!.energy = 500;
    world.tradeRoutes[0].caravanWaitTicks = 9;
    world.tradeRoutes[0].caravansCompleted = 4;
    world.disasters[0].progress = 3;

    applySimPrep(world, prep);

    const restored = world.entities.find((e) => e.id === settler.id)!;
    expect(restored.skills).toEqual({ [JobType.Farmer]: 1 });
    expect(restored.childrenIds).toEqual([7, 8]);
    expect(restored.childhoodFriendsIds).toEqual([9]);
    expect(restored.friendships).toEqual({ '2': 0.5 });
    expect(restored.feuds).toEqual({ '3': 0.25 });
    expect(restored.moonHowlerSaved?.energy).toBe(5);
    expect(world.tradeRoutes[0].caravanWaitTicks).toBe(0);
    expect(world.tradeRoutes[0].caravansCompleted).toBe(0);
    expect(world.disasters[0].progress).toBe(0);
  });
});

describe('the tick rollback restores the pre-tick float and particle values', () => {
  it('copies the elements, not just the arrays', () => {
    const world = initGame({ villageName: 'Rollback', seed: 20260923, size: MapSize.Medium });
    world.floatingTexts = [
      { id: 1, x: 10, y: 10, text: 'hi', color: '#fff', life: 5, maxLife: 5, scale: 1 },
    ] as unknown as WorldState['floatingTexts'];
    world.deathParticles = [
      { x: 10, y: 10, vx: 0, vy: 0, life: 5, maxLife: 5, color: '#fff', size: 2 },
    ] as unknown as WorldState['deathParticles'];

    const prep = extractSimPrep(world);
    // The snapshot must hold copies: the realtime layer decays these objects in place, so an aliased
    // backup would "restore" the already-mutated values.
    expect(prep.floatingTexts[0]).not.toBe(world.floatingTexts[0]);
    expect(prep.deathParticles[0]).not.toBe(world.deathParticles[0]);

    // The realtime layer's in-place decay, applied to the live objects after the snapshot.
    world.floatingTexts[0].life -= 1;
    world.floatingTexts[0].y -= 0.7;
    world.deathParticles[0].life -= 1;
    applySimPrep(world, prep);

    expect(world.floatingTexts[0].life).toBe(5);
    expect(world.floatingTexts[0].y).toBe(10);
    expect(world.deathParticles[0].life).toBe(5);
  });
});
