/**
 * Regression cases for the fixes made by the 2026-09-21 deep audit.
 *
 * Each case names the defect it pins and the observable symptom, so reverting a fix fails here
 * rather than silently restoring the old behaviour. The source guards at the end close the owner
 * checks the pre-existing guards could not see (they only walked `.tsx`, so the two `.ts` copies of
 * `formatSettlerName` sat outside every scan).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BuildingType,
  JobType,
  Season,
  WeatherType,
  type Entity,
  type RivalSettlement,
  type WorldState,
} from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { human } from '../src/test/factories';
import {
  VISITOR_TRADE_COSTS,
  getVisitorTradeEligibility,
  getVisitorTradeTerms,
} from '../src/game/groupEvents';
import { getRaidChoiceEligibility, respondToRaidEvent } from '../src/game/frontierCombat';
import { REPUTATION_MAX, addReputation } from '../src/game/simHelpers';
import { humanDisplayName } from '../src/game/citizenId';
import { isMarriedOrExpecting } from '../src/game/civilStatus';
import { getPlayerCampCenter, getPlayerCampCenterFromBuildings } from '../src/game/villageAnchor';
import { loadGameFromParsedOutcome, buildSaveData } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import { EntitySpatialGrid } from '../src/game/spatialGrid';
import { invalidateWorldRuntimeCaches } from '../src/game/worldRuntimeCaches';
import { formatResourceAmounts } from '../src/game/resourceTypes';
import { GAME_VERSION } from '../src/game/version';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

/** Every `.ts`/`.tsx` under `src/`, posix-relative — the tree walk the source guards scan. */
function srcFiles(dir = resolve(process.cwd(), 'src')): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) found.push(...srcFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(resolve(full).slice(resolve(process.cwd()).length + 1).replaceAll('\\', '/'));
    }
  }
  return found;
}

/**
 * A minimal world with a player trader and the given store, built from `initGame` so every field the
 * owners read exists. The trader is the shared fixture for the two stone-trade cases.
 */
function traderWorld(resources: Partial<WorldState['resources']> = {}): WorldState {
  const world = initGame({ villageName: 'Stone', seed: 20260921 });
  world.visitorGroups = [
    {
      id: 'trader-1',
      name: 'Traders',
      kind: 'traders',
      daysLeft: 3,
      gold: 500,
      campX: 100,
      campY: 100,
      entityIds: [],
      tradesCompleted: 0,
      giftsGiven: 0,
    } as unknown as WorldState['visitorGroups'][number],
  ];
  world.resources = { wood: 100, stone: 100, food: 100, gold: 500, iron: 50, ...resources };
  world.storageMax = { wood: 5000, stone: 5000, food: 5000, gold: 5000, iron: 5000 };
  return world;
}

describe('visitor trade can buy and sell stone (audit: no stone route to a caravan)', () => {
  it('quotes both stone actions from the owner', () => {
    // Reputation deliberately at the neutral band, so the multipliers are 1 and the raw catalogue
    // prices are what these assertions read.
    const world = traderWorld();
    world.villageReputation = 50;
    const buy = getVisitorTradeTerms(world, 'buy_stone');
    expect(buy.effectivePay.gold).toBe(20);
    expect(buy.effectiveReceive.stone).toBe(25);

    const sell = getVisitorTradeTerms(world, 'sell_stone');
    expect(sell.effectivePay.stone).toBe(35);
    expect(sell.effectiveReceive.gold).toBe(20);
  });

  it('gates them like every other action — price, then what the store can take', () => {
    const affordable = traderWorld({ gold: 100 });
    affordable.villageReputation = 50;
    expect(getVisitorTradeEligibility(affordable, 'trader-1', 'buy_stone').ok).toBe(true);

    const broke = traderWorld({ gold: 0 });
    broke.villageReputation = 50;
    const brokeGate = getVisitorTradeEligibility(broke, 'trader-1', 'buy_stone');
    expect(brokeGate.ok).toBe(false);
    expect(brokeGate.blockReason).toBe('Need 20💰');

    // Selling needs the stone *and* room for the gold it pays — the same two-sided gate as sell_iron.
    const noStone = traderWorld({ stone: 0 });
    noStone.villageReputation = 50;
    expect(getVisitorTradeEligibility(noStone, 'trader-1', 'sell_stone').ok).toBe(false);

    const fullPurse = traderWorld();
    fullPurse.villageReputation = 50;
    fullPurse.storageMax.gold = 500;
    fullPurse.resources.gold = 500;
    const fullGate = getVisitorTradeEligibility(fullPurse, 'trader-1', 'sell_stone');
    expect(fullGate.ok).toBe(false);
    expect(fullGate.blockReason).toBe('Cannot store more gold');
  });

  it('keeps the catalogue and the panel in step', () => {
    // The command validator derives its accepted actions from this table (`commands.ts`), so a new
    // action that is not here would be rejected as an invalid `WorkerCommand` before it reached the
    // owner.
    expect(Object.keys(VISITOR_TRADE_COSTS)).toContain('buy_stone');
    expect(Object.keys(VISITOR_TRADE_COSTS)).toContain('sell_stone');

    const panel = read('src/components/VisitorCampPanel.tsx');
    expect(panel, 'the panel does not offer buying stone').toContain("onTrade('buy_stone')");
    expect(panel, 'the panel does not offer selling stone').toContain("onTrade('sell_stone')");
  });
});

describe('a multi-resource trade float names every resource, not only the last', () => {
  it('accumulates instead of overwriting', () => {
    // The trade-route bundles this shape comes from (`trade_3` pays gold *and* iron, `trade_7` stone
    // *and* gold) are the reason the accumulation exists; the formatter itself is what the float now
    // reads, so this pins the exact string a two-resource deal produces.
    expect(formatResourceAmounts({ gold: 30, iron: 15 })).toBe('30 💰 · 15 🔩');
    expect(formatResourceAmounts({ stone: 80, gold: 60 })).toBe('80 🪨 · 60 💰');
    // A single-resource deal is unchanged from the old `+N<emoji>` shape apart from the separator.
    expect(formatResourceAmounts({ wood: 30 })).toBe('30 🪵');
    expect(formatResourceAmounts({})).toBe('');
  });

  it('is the formatter the trade command uses', () => {
    const source = read('src/game/groupEvents.ts');
    expect(source, 'the trade float went back to a hand-built label')
      .toContain('formatResourceAmounts(received)');
    expect(source, 'the received label is assigned per key again (last key wins)')
      .not.toMatch(/receivedLabel\s*=\s*`\+\$\{added\}/);
  });
});

describe('the leader-honored announcement survives a maxed reputation', () => {
  /** A decisive player victory, so `rewardRaidParticipants` runs its victory branch. */
  function defendableWorld(reputation: number): { world: WorldState; eventId: string } {
    const world = initGame({ villageName: 'Raid', seed: 20260922 });
    world.resources = { wood: 5000, stone: 5000, food: 5000, gold: 5000, iron: 5000 };
    world.storageMax = { wood: 5000, stone: 5000, food: 5000, gold: 5000, iron: 5000 };
    world.villageReputation = reputation;

    const leader = human(1, { name: 'Bryn', job: JobType.Soldier });
    const guard = human(2, { name: 'Ash', job: JobType.Soldier });
    world.entities = [leader, guard];
    world.villageLeaderId = leader.id;
    world.humanPopulation = 2;
    // Spears satisfy `hasMilitiaWeapons`, which `getRaidChoiceEligibility('defend')` requires.
    world.unlockedTechs = [...(world.unlockedTechs ?? []), 'defense_2'];
    world.researchNodes = (world.researchNodes ?? []).map((node) =>
      node.id === 'defense_2' ? { ...node, researched: true, unlocked: true } : node,
    );

    const rival = {
      id: 'rival_1',
      name: 'Ravenhold',
      campX: 900,
      campY: 900,
      relationship: 'tense',
      raidCooldownDays: 0,
      peaceTreatyDays: 0,
      daysUntilAction: 5,
    } as unknown as RivalSettlement;
    world.rivalSettlements = [rival];

    const eventId = 'raid_audit';
    world.pendingRaidEvents = [
      {
        id: eventId,
        rivalId: rival.id,
        rivalName: rival.name,
        title: 'Ravenhold is marching',
        description: 'A war-band is on the road.',
        emoji: '⚔️',
        choices: [{ id: 'defend', label: 'Defend', hint: '' }],
        createdAtTick: 0,
        expiresAtTick: 10_000,
        marchDistanceTiles: 6,
        // Overwhelmingly one-sided, so the outcome is a decisive player victory by construction.
        attackerStrength: 1,
        defenderStrength: 100,
        lootFood: 10,
        lootGold: 5,
        lootWood: 0,
        lootStone: 0,
        lootIron: 0,
      } as unknown as WorldState['pendingRaidEvents'][number],
    ];
    return { world, eventId };
  }

  it('announces the leader when reputation still has room to rise', () => {
    const { world, eventId } = defendableWorld(REPUTATION_MAX - 5);
    const after = respondToRaidEvent(world, eventId, 'defend');

    expect(after.villageReputation).toBeGreaterThan(REPUTATION_MAX - 5);
    // The positive control: with room below the cap the banner is expected. Without this the case
    // below would pass vacuously.
    expect(after.bigNews.some((news) => news.title === '👑 Leader honored')).toBe(true);
  });

  it('announces the rise that reaches the cap', () => {
    // The full-bar case the old guard got right: 96 + 4 is a real rise, and the banner says so.
    const { world, eventId } = defendableWorld(REPUTATION_MAX - 4);
    const after = respondToRaidEvent(world, eventId, 'defend');

    expect(after.villageReputation).toBe(REPUTATION_MAX);
    expect(after.bigNews.some((news) => news.title === '👑 Leader honored')).toBe(true);
  });

  it('stays silent when the clamp delivered nothing', () => {
    // The defect: `addReputation` clamps, so at 100 every later victory had a zero delta and the
    // `reputation > before` guard retired the announcement for the rest of the game. The banner
    // promises "reputation rises", so it is gated on the amount *granted* — 0 here.
    const { world, eventId } = defendableWorld(REPUTATION_MAX);
    const after = respondToRaidEvent(world, eventId, 'defend');

    expect(after.villageReputation).toBe(REPUTATION_MAX);
    // The victory itself still happens and is still logged; only the banner is withheld.
    expect(after.eventLog.some((entry) => entry.message.includes('led the raid against'))).toBe(true);
    expect(
      after.bigNews.some((news) => news.title === '👑 Leader honored'),
      'the banner promises a rise the clamp did not deliver',
    ).toBe(false);
  });

  it('reports the clamped delta from the owner', () => {
    const { world } = defendableWorld(REPUTATION_MAX);
    // `addReputation` owns the clamp, so it is the one place that can say what was applied.
    expect(addReputation(world, 4)).toBe(0);
    expect(world.villageReputation).toBe(REPUTATION_MAX);

    world.villageReputation = REPUTATION_MAX - 1;
    expect(addReputation(world, 4)).toBe(1);
    expect(world.villageReputation).toBe(REPUTATION_MAX);

    world.villageReputation = 0;
    expect(addReputation(world, -5)).toBe(0);
    expect(world.villageReputation).toBe(0);
  });

  it('does not raise the eligibility gate it shares with the virtual player', () => {
    // The fix must not have changed what `defend` costs or requires.
    const { world, eventId } = defendableWorld(0);
    const event = world.pendingRaidEvents[0];
    expect(getRaidChoiceEligibility(world, event, 'defend').ok).toBe(true);
    expect(getRaidChoiceEligibility(world, event, 'defend', world.entities).ok).toBe(true);
  });
});

describe('one definition of "in an active marriage"', () => {
  it('counts expecting as married, because conception sets both partners to it', () => {
    expect(isMarriedOrExpecting({ relationshipStatus: 'married' })).toBe(true);
    expect(isMarriedOrExpecting({ relationshipStatus: 'expecting' })).toBe(true);
    expect(isMarriedOrExpecting({ relationshipStatus: 'single' })).toBe(false);
    expect(isMarriedOrExpecting({ relationshipStatus: undefined })).toBe(false);
  });

  it('is what the yearly statistics count, not the narrow `=== "married"`', () => {
    const stats = read('src/game/stats.ts');
    expect(stats, 'the yearly marriage count went back to the narrow test')
      .toContain('filter(isMarriedOrExpecting)');
    // Scoped to the count site: `recordYearlyStats` may still *read* a status elsewhere.
    expect(stats, 'a `relationshipStatus === "married"` count is back in stats.ts')
      .not.toMatch(/relationshipStatus\s*===\s*'married'/);
  });

  it('has no second private copy in the tree', () => {
    // The owner is the only module allowed to declare the predicate; the check is on the
    // *declaration*, because spelling the two statuses out at a call site is how the copies began.
    const offenders = srcFiles().filter(
      (file) => file !== 'src/game/civilStatus.ts' && /function isActivelyMarried\s*\(/.test(read(file)),
    );
    expect(offenders, 'a second marriage predicate is back outside civilStatus.ts').toEqual([]);
  });
});

describe('one definition of a settler display name', () => {
  it('falls back to the owner for an absent name, and joins the parts it has', () => {
    expect(humanDisplayName({ name: undefined } as Entity)).toBe('A settler');
    expect(humanDisplayName({} as Entity)).toBe('A settler');
    expect(humanDisplayName({ name: 'Asha', surname: 'Reed', title: 'Elder' } as Entity))
      .toBe('Asha Reed Elder');
    expect(humanDisplayName({ name: 'Asha' } as Entity)).toBe('Asha');
  });

  it('is what both former copies now call', () => {
    for (const file of ['src/game/workforce.ts', 'src/game/villageLeadership.ts']) {
      const source = read(file);
      expect(source, `${file} does not delegate to the name owner`).toContain('humanDisplayName(entity)');
      expect(source, `${file} types its own nameless-settler fallback again`)
        .not.toMatch(/entity\.name \|\| '(Settler|Unknown)'/);
    }
  });

  it('is the one fallback the whole tree uses', () => {
    // The two `.ts` copies were invisible to `uiSingleOwner.test.ts`, which walks only `.tsx`.
    const offenders = srcFiles().filter((file) =>
      /entity\.name \|\| '(Settler|Unknown|Unnamed)'/.test(read(file)),
    );
    expect(offenders, 'a domain module re-typed a nameless-settler fallback').toEqual([]);
  });
});

describe('one definition of the village anchor', () => {
  it('prefers a hall, then a house, then the settler mean — never a stray building', () => {
    const hall = {
      id: 1, type: BuildingType.TownHall, completed: true, x: 100, y: 100, width: 40, height: 40,
    } as never;
    const house = {
      id: 2, type: BuildingType.House, completed: true, x: 200, y: 200, width: 20, height: 20,
    } as never;
    const barracks = {
      id: 3, type: BuildingType.Barracks, completed: true, x: 900, y: 900, width: 40, height: 40,
    } as never;

    expect(getPlayerCampCenterFromBuildings([hall, house])).toEqual({ x: 120, y: 120 });
    expect(getPlayerCampCenterFromBuildings([house])).toEqual({ x: 210, y: 210 });
    // No hall and no house: the building half must decline, which is what lets the settler mean answer.
    expect(getPlayerCampCenterFromBuildings([barracks])).toBeNull();

    // This is the case the renderer's private copy got wrong: it returned the first completed player
    // building (the Barracks at 920,920) while the simulation anchored on the settlers.
    const world = {
      entities: [human(1, { x: 300, y: 300 }), human(2, { x: 400, y: 400 })],
      width: 1000,
      height: 1000,
    };
    expect(getPlayerCampCenter(world, [barracks])).toEqual({ x: 350, y: 350 });
  });

  it('is the rule the renderer draws from', () => {
    const humans = read('src/game/renderer/humans.ts');
    expect(humans, 'the renderer restated the anchor rule again')
      .not.toMatch(/function getPlayerCampCenterFromBuildings/);
    expect(humans, 'the renderer does not ask the anchor owner')
      .toContain('getPlayerCampCenter(state, state.buildings)');
  });
});

describe('the tick rollback restores the pre-tick float and particle values', () => {
  it('copies the elements, not just the arrays', () => {
    const world = initGame({ villageName: 'Rollback', seed: 20260923 });
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

describe('a save that would load into a broken world is refused by name', () => {
  // Built by the real save writer, so the "accepts a well-formed payload" control cannot pass
  // vacuously on a hand-written stub that is missing half the world.
  function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const world = initGame({ villageName: 'Broken', seed: 20260924 });
    return { ...buildSaveData(world, createInitialView(world.width, world.height)), ...overrides };
  }

  it('accepts a well-formed payload', () => {
    expect(loadGameFromParsedOutcome(payload()).ok).toBe(true);
  });

  it('refuses a non-finite tick, which would stop the daily layer forever', () => {
    const outcome = loadGameFromParsedOutcome(payload({ tick: 'not-a-number' }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('tick');
  });

  it('refuses a non-finite map dimension', () => {
    const outcome = loadGameFromParsedOutcome(payload({ width: Number.NaN }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('width');
  });

  it('refuses a purse missing a key, where every affordability test is permanently false', () => {
    const outcome = loadGameFromParsedOutcome(payload({ resources: { gold: 5, iron: 0 } }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('resources');
  });

  it('refuses a non-finite storage cap', () => {
    const outcome = loadGameFromParsedOutcome(
      payload({ storageMax: { wood: 10, stone: 10, food: 10, gold: 10, iron: Number.NaN } }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('storageMax');
  });

  it('does not write through to the payload it is handed', () => {
    // `pickWorldStateFromSave` copies top-level keys by reference, so the returned world's arrays are
    // the payload's own — and `migrateTickTimeline` scales tick-valued fields **in place**. A forged
    // `_ticksPerDay` is the shortest way to exercise that path (the version gate refuses real older
    // saves), and it shows the hazard plainly: loading twice scaled the caller's object twice.
    const raid = {
      id: 'raid_frozen',
      rivalId: 'rival_1',
      rivalName: 'Ravenhold',
      title: 't',
      description: 'd',
      emoji: '⚔️',
      choices: [],
      createdAtTick: 700,
      expiresAtTick: 800,
      marchDistanceTiles: 1,
      attackerStrength: 1,
      defenderStrength: 1,
      lootFood: 0,
      lootGold: 0,
      lootWood: 0,
    };
    const p = payload({
      _ticksPerDay: 24,
      tick: 720,
      pendingRaidEvents: [raid],
    });
    const snapshot = JSON.stringify(p);

    const first = loadGameFromParsedOutcome(p);
    expect(first.ok).toBe(true);
    // The caller's own object is untouched…
    expect(JSON.stringify(p)).toBe(snapshot);
    expect((p.pendingRaidEvents as (typeof raid)[])[0].createdAtTick).toBe(700);

    // …so a second load of the same payload produces the same world rather than scaling again.
    const second = loadGameFromParsedOutcome(p);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.world.tick).toBe(first.world.tick);
    expect(second.world.pendingRaidEvents).toEqual(first.world.pendingRaidEvents);
  });
});

describe('what the tick writes is durable', () => {
  it('saves the heating decision the simulation reads for the rest of the day', () => {
    // `tickWinterHeating` caches today's answer on the world and `humanNeeds` reads it to apply the
    // 1.5x unheated-winter penalty. It was not in the allow-list, so a reload mid-winter-day refunded
    // the rest of that day's cold.
    expect(
      (WORLD_STATE_SAVE_KEYS as readonly string[]).includes('villageCanHeat'),
      'villageCanHeat is not saved, so a reload cancels the rest of the day it was decided for',
    ).toBe(true);
  });

  it('rebuilds the beauty grid on load without discarding the saved happiness', () => {
    // `beautyGrid` is a runtime cache the save strips, and it used to be rebuilt only by the **daily**
    // layer — so a loaded colony ran up to a full game day with no beauty field, and free-time settlers
    // stopped being drawn toward decor. `villageHappiness` is deliberately *not* recomputed with it:
    // it is in the save allow-list, and recomputing would replace the stored value with the base
    // happiness of a world whose decor has not been re-stamped.
    const world = initGame({ villageName: 'Pretty', seed: 20260927 });
    world.buildings = [
      ...world.buildings,
      { ...world.buildings[0], id: 9001, type: BuildingType.Garden, completed: true, occupants: [] },
    ] as WorldState['buildings'];
    world.villageHappiness = 73;

    const saved = buildSaveData(world, createInitialView(world.width, world.height));
    // The save does not carry the grid…
    expect('beautyGrid' in saved).toBe(false);

    const outcome = loadGameFromParsedOutcome(saved);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // …the load rebuilds it from the stored decor…
    expect(outcome.world.beautyGrid, 'the beauty grid was not rebuilt on load').toBeDefined();
    // …and the persisted happiness survives, because the next daily tick owns refining it.
    expect(outcome.world.villageHappiness).toBe(73);
  });
});

describe('runtime caches are stripped by their owner', () => {
  it('drops the beauty grid as well as the spatial indexes', () => {
    // A live `Int16Array` riding an export clone is the cost of leaving a non-serializable field out
    // of the drop list — and nothing then forces the load path to recompute it.
    const world = initGame({ villageName: 'Caches', seed: 20260928 });
    world.beautyGrid = { cols: 1, rows: 1, values: new Int16Array(1) };
    invalidateWorldRuntimeCaches(world);
    expect(world.beautyGrid).toBeUndefined();
  });
});

describe('the spatial grid refreshes an object that did not change cell', () => {
  /** Everything the grid holds in a rectangle, via its own traversal primitive. */
  function inRect(grid: EntitySpatialGrid, minX: number, minY: number, maxX: number, maxY: number): Entity[] {
    const found: Entity[] = [];
    grid.forEachInRect(minX, minY, maxX, maxY, (entity) => found.push(entity));
    return found;
  }

  it('replaces the stored entry when a fresh object arrives for the same cell', () => {
    // The worker's render path builds a new shim per slot per tick with the same id and cell, so the
    // old early-return kept the first tick's objects forever and any field that changed without a cell
    // change (flash, size) never reached the renderer.
    const grid = new EntitySpatialGrid(100, 100, 10);
    const first = human(1, { x: 5, y: 5 });
    const refreshed = human(1, { x: 5, y: 5, flash: 9 });
    expect(first.id).toBe(refreshed.id);

    grid.reconcile([first]);
    grid.reconcile([refreshed]);

    const cell = inRect(grid, 0, 0, 10, 10);
    expect(cell).toHaveLength(1);
    expect(cell[0], 'the grid kept the stale object').toBe(refreshed);
    expect(cell[0].flash).toBe(9);
  });

  it('still moves an entity between cells', () => {
    const grid = new EntitySpatialGrid(100, 100, 10);
    grid.reconcile([human(1, { x: 5, y: 5 })]);
    grid.reconcile([human(1, { x: 55, y: 55 })]);

    expect(inRect(grid, 0, 0, 10, 10)).toHaveLength(0);
    expect(inRect(grid, 50, 50, 60, 60)).toHaveLength(1);
  });
});

describe('one terrain-tile size', () => {
  it('owns the world-units-per-tile constant once', () => {
    // `PATH_CELL` (gameTypes.ts) is the world-units-per-tile value, and `frontierCombat`
    // carried a `PIXELS_PER_TILE = 10` copy while `placementUtils` carried `PLACEMENT_TILE_SIZE = 10`.
    // A tile-size copy in a domain module silently drifts if the owner ever moves, and the two
    // call sites (`getCampDistanceTiles`, `getOutgoingRaidFoodCost`, `footprintTileIndices`) must agree
    // with the terrain grid or raid distances and footprint validity disagree with the map. Both are
    // gone; any re-introduction fails here.
    const offenders = srcFiles().filter((file) =>
      /\b(PIXELS_PER_TILE|PLACEMENT_TILE_SIZE)\b/.test(read(file)),
    );
    expect(offenders, 'a module re-declared the terrain tile size').toEqual([]);
  });
});
