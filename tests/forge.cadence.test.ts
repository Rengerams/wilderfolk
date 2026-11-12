/**
 * S-01 regression: the 18:00 production pass is the forge's only clock. A queued order advances on
 * forge production days (every FORGE_PACE_INTERVAL_TICKS), never at the midnight day boundary, and
 * finishes at the pace its own constants declare.
 */
import { describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import { createBuilding } from '../src/game/worldGen';
import { BuildingType, JobType, MapSize } from '../src/game/gameTypes';
import { COMBAT_TECH } from '../src/game/combatTech';
import { TICKS_PER_DAY, tickAtDailyPhase } from '../src/game/dayCycleClock';
import { FORGE_PACE_INTERVAL_TICKS, getForgeOrder, queueForgeOrder } from '../src/game/forge';

const SEED = 20261111;
const SMITH_ID = 900;

describe('village forge cadence', () => {
  it('advances once per forge production day and never at midnight', () => {
    const world = initGame({ skipTerrain: true, size: MapSize.Medium, seed: SEED });
    const smithWorker = world.entities.find((entity) => entity.id === world.villageLeaderId);
    expect(smithWorker, 'the founding leader is the Blacksmith').toBeDefined();
    if (!smithWorker) return;
    // One settler keeps the crew factor at 1, so every pass must deliver exactly the declared pace.
    world.entities = [smithWorker];
    const smith = createBuilding(BuildingType.Blacksmith, world.width / 2, world.height / 2, SMITH_ID);
    smith.completed = true;
    smith.constructionProgress = 100;
    smith.occupants = [smithWorker.id];
    smithWorker.workerBuildingId = smith.id;
    smithWorker.job = JobType.Blacksmith;
    world.buildings = [smith];
    world.unlockedTechs = [...world.unlockedTechs, COMBAT_TECH.ironSpears];
    world.resources = { ...world.resources, wood: 500, stone: 500, gold: 500, iron: 500 };

    const order = getForgeOrder('iron_spears');
    expect(order, 'Iron Spears is a real order').toBeDefined();
    if (!order) return;

    // Queue through the owner: the inputs are paid now, not while the order advances.
    const queued = queueForgeOrder(world, SMITH_ID, 'iron_spears');
    expect(queued.villageForge?.activeOrder).toBe('iron_spears');
    expect(queued.villageForge?.progress).toBe(0);
    expect(queued.resources.wood).toBe(500 - (order.inputs.wood ?? 0));
    expect(queued.resources.iron).toBe(500 - (order.inputs.iron ?? 0));

    const intervalDays = FORGE_PACE_INTERVAL_TICKS / TICKS_PER_DAY;
    const firstDay = 8;
    expect(intervalDays).toBe(2);
    // isProductionTick anchors the forge interval to absolute calendar days.
    expect(firstDay % intervalDays).toBe(0);

    // Day 0 shares the canonical startup guard: its anchor is tick 0, which isProductionTick rejects,
    // so the first forge tick is the first even production day — the same rule every producer has.
    queued.tick = tickAtDailyPhase(0, 'production') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(0);

    // Day 8, midnight: the day-boundary pass must not move the order.
    queued.tick = tickAtDailyPhase(firstDay, 'fatigue') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(0);

    // Day 8, 18:00: the production pass delivers exactly one declared pace.
    queued.tick = tickAtDailyPhase(firstDay, 'production') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(order.progressPerTick);

    // Day 9 is off the forge interval: neither its midnight nor its 18:00 pass adds progress.
    queued.tick = tickAtDailyPhase(firstDay + 1, 'fatigue') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(order.progressPerTick);
    queued.tick = tickAtDailyPhase(firstDay + 1, 'production') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(order.progressPerTick);

    // Day 10, midnight: still no progress; the evening pass delivers the second pace.
    queued.tick = tickAtDailyPhase(firstDay + intervalDays, 'fatigue') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(order.progressPerTick);
    queued.tick = tickAtDailyPhase(firstDay + intervalDays, 'production') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(2 * order.progressPerTick);

    // Two paces in, the order is not yet finished.
    expect(queued.villageForge?.activeOrder).toBe('iron_spears');
    expect(queued.villageForge?.completed.iron_spears).toBeUndefined();

    // Day 11 is off the interval again.
    queued.tick = tickAtDailyPhase(firstDay + intervalDays + 1, 'fatigue') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(2 * order.progressPerTick);

    // Day 12, midnight: the boundary still does nothing; the third evening pass completes the order.
    queued.tick = tickAtDailyPhase(firstDay + intervalDays * 2, 'fatigue') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(2 * order.progressPerTick);
    queued.tick = tickAtDailyPhase(firstDay + intervalDays * 2, 'production') - 1;
    gameTick(queued);
    expect(queued.villageForge?.progress).toBe(0);
    expect(queued.villageForge?.activeOrder).toBeNull();
    expect(queued.villageForge?.completed.iron_spears).toBe(true);
  });
});
