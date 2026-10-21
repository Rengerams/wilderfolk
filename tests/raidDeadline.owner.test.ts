/**
 * A16 — `formatRaidDeadlineSafe` was a divergent wrapper around the owner's own legacy fallback
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The owner `frontierCombat.formatRaidDeadline` already resolves a missing `expiresAtTick` through
 * `getRaidExpiresAtTick`'s legacy window. The wrapper re-checked both fields by hand and printed
 * `'deadline unknown'` for exactly the case the owner handles — so a legacy raid showed "deadline
 * unknown" on the outgoing card (`App.tsx`) and "N days left" on the incoming one, in the same frame.
 *
 * Both cards now call the owner, and the genuinely-unknown case (no `createdAtTick` and no
 * `expiresAtTick`) is expressed *inside* the owner, so the two cards cannot disagree again.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatRaidDeadline, getRaidExpiresAtTick, resolveRaidVictory, provokeRival } from '../src/game/frontierCombat';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import type { RaidEvent } from '../src/game/gameTypes';

function readSrc(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

/** Legacy save shape: the tick fields the owner's fallback exists for are absent. */
function legacyRaid(createdAtTick: number | undefined, expiresAtTick: number | undefined): RaidEvent {
  return { id: 'raid', createdAtTick, expiresAtTick } as unknown as RaidEvent;
}

describe('A16 — one raid-deadline renderer for both cards', () => {
  it('renders a legacy event from the owner’s own fallback window', () => {
    const legacy = legacyRaid(100, undefined);
    // 3 in-game days from the creation tick — the owner's `getRaidExpireTicksLegacy`.
    expect(getRaidExpiresAtTick(legacy)).toBe(100 + 3 * TICKS_PER_DAY);
    expect(formatRaidDeadline(legacy, 100)).toBe('3 days left');
  });

  it('expresses the genuinely unknown deadline inside the owner', () => {
    const undated = legacyRaid(undefined, undefined);
    expect(Number.isFinite(getRaidExpiresAtTick(undated))).toBe(false);
    // Pre-fix this path printed `NaN days left` while the wrapper printed `deadline unknown`.
    expect(formatRaidDeadline(undated, 0)).toBe('deadline unknown');
  });

  it('leaves both raid cards on the owner, with no wrapper module left', () => {
    const app = readSrc('src/App.tsx');
    const panel = readSrc('src/components/SelectedBuildingPanel.tsx');
    expect(app, 'the outgoing raid card still uses the divergent wrapper').not.toContain('formatRaidDeadlineSafe');
    expect(panel, 'the building panel still uses the divergent wrapper').not.toContain('formatRaidDeadlineSafe');
    expect(app).toContain('formatRaidDeadline(evt, world.tick)');
    expect(panel).toContain('formatRaidDeadline(evt, state.tick)');
    expect(
      existsSync(resolve(process.cwd(), 'src/game/raidUtils.ts')),
      'the raidUtils wrapper module still exists',
    ).toBe(false);
  });
});

describe('v0.6.6.0 — explicit post-battle settlement fate', () => {
  function victoriousWorld() {
    const world = initGame({ seed: 4242 });
    world.rivalSettlements = [{
      id: 'test-rival',
      name: 'Testford',
      campX: 100,
      campY: 100,
      population: 7,
      entityIds: [],
      buildingIds: [],
      relationship: 'tense',
      foundedYear: 1,
      daysUntilAction: 0,
      raidCooldownDays: 0,
      peaceTreatyDays: 0,
    }];
    world.pendingRaidVictories = [{
      raidId: 'unique-raid',
      rivalId: 'test-rival',
      rivalName: 'Testford',
      playerDead: 1,
      enemyDead: 4,
      enemySurvivors: 7,
      playerCasualties: ['A Villager'],
      enemyCasualties: [],
    }];
    return world;
  }

  it('declares a persistent war and ends it when the defeated camp is spared', () => {
    const state = victoriousWorld();
    state.pendingRaidVictories = [];
    const declared = provokeRival(state, 'test-rival');
    expect(declared.rivalSettlements[0]?.atWarWithPlayer).toBe(true);
    expect(declared.rivalSettlements[0]?.relationship).toBe('tense');
    const originalReputation = declared.villageReputation;
    const repeated = provokeRival(declared, 'test-rival');
    expect(repeated.villageReputation).toBe(originalReputation);

    declared.pendingRaidVictories = victoriousWorld().pendingRaidVictories;
    const spared = resolveRaidVictory(declared, 'unique-raid', 'mercy');
    expect(spared.rivalSettlements[0]?.atWarWithPlayer).toBe(false);
    expect(spared.rivalSettlements[0]?.peaceTreatyDays).toBeGreaterThan(0);
  });

  it('does not raze the rival until explicit confirmation', () => {
    const world = victoriousWorld();
    expect(world.rivalSettlements).toHaveLength(1);
    expect(world.pendingRaidVictories).toHaveLength(1);
    const spared = resolveRaidVictory(world, 'unique-raid', 'mercy');
    expect(spared.rivalSettlements).toHaveLength(1);
    expect(spared.rivalSettlements[0].population).toBe(7);
    expect(spared.pendingRaidVictories).toEqual([]);
    expect(spared.rivalSettlements[0].peaceTreatyDays).toBeGreaterThan(0);
    expect(world.pendingRaidVictories).toHaveLength(1);
  });

  it('changes neighboring rival reactions once without changing remote settlements', () => {
    const mercyWorld = victoriousWorld();
    const original = mercyWorld.rivalSettlements[0]!;
    mercyWorld.rivalSettlements.push(
      { ...original, id: 'neighbor', campX: 150, campY: 100, relationship: 'competitive' },
      { ...original, id: 'remote', campX: 2500, campY: 2500, relationship: 'competitive' },
    );
    const spared = resolveRaidVictory(mercyWorld, 'unique-raid', 'mercy');
    expect(spared.rivalSettlements.find((settlement) => settlement.id === 'neighbor')?.relationship).toBe('neutral');
    expect(spared.rivalSettlements.find((settlement) => settlement.id === 'remote')?.relationship).toBe('competitive');
    expect(resolveRaidVictory(spared, 'unique-raid', 'mercy')).toBe(spared);

    const razeWorld = victoriousWorld();
    razeWorld.rivalSettlements.push(
      { ...razeWorld.rivalSettlements[0]!, id: 'neighbor', campX: 150, campY: 100, relationship: 'neutral' },
    );
    const razed = resolveRaidVictory(razeWorld, 'unique-raid', 'raze');
    expect(razed.rivalSettlements.find((settlement) => settlement.id === 'neighbor')?.relationship).toBe('competitive');
  });

  it('persists local fear and retaliation readiness but leaves distant rivals alone', () => {
    const world = victoriousWorld();
    const origin = world.rivalSettlements[0]!;
    world.rivalSettlements.push(
      { ...origin, id: 'hostile-witness', campX: 140, campY: 100, relationship: 'competitive', daysUntilAction: 80 },
      { ...origin, id: 'peaceful-witness', campX: 180, campY: 100, relationship: 'friendly', raidCooldownDays: 0 },
      { ...origin, id: 'far-away', campX: 2500, campY: 2500, relationship: 'friendly', daysUntilAction: 80 },
    );

    const result = resolveRaidVictory(world, 'unique-raid', 'raze');
    const hostile = result.rivalSettlements.find((camp) => camp.id === 'hostile-witness')!;
    const peaceful = result.rivalSettlements.find((camp) => camp.id === 'peaceful-witness')!;
    const distant = result.rivalSettlements.find((camp) => camp.id === 'far-away')!;
    expect(hostile.relationship).toBe('tense');
    expect(hostile.daysUntilAction).toBeLessThanOrEqual(10);
    expect(peaceful.relationship).toBe('neutral');
    expect(peaceful.raidCooldownDays).toBeGreaterThanOrEqual(20);
    expect(distant.relationship).toBe('friendly');
    expect(distant.daysUntilAction).toBe(80);

    const repeated = resolveRaidVictory(result, 'unique-raid', 'raze');
    expect(repeated).toBe(result);
    expect(world.rivalSettlements).toHaveLength(4);
    expect(world.pendingRaidVictories).toHaveLength(1);
  });

  it('only confirmed razing destroys a camp and does not reapply a result', () => {
    const world = victoriousWorld();
    const pending = resolveRaidVictory(world, 'unique-raid', 'not-confirmed');
    expect(pending).toBe(world);
    expect(world.rivalSettlements).toHaveLength(1);
    const razed = resolveRaidVictory(world, 'unique-raid', 'raze');
    expect(razed.rivalSettlements).toHaveLength(0);
    expect(razed.pendingRaidVictories).toEqual([]);
    expect(resolveRaidVictory(razed, 'unique-raid', 'raze')).toBe(razed);
  });
});
