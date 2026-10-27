import { describe, expect, it } from 'vitest';
import { applyRivalDailyAction, createRivalProfile, ensureRivalProfile, normalizeRivalProfile, selectRivalDailyAction } from '../src/game/rivalProfiles';
import type { RivalSettlement } from '../src/game/gameTypes';

const rival = (profile?: RivalSettlement['profile']): RivalSettlement => ({
  id: 'rival-one', name: 'North Camp', campX: 10, campY: 10, population: 6,
  entityIds: [], buildingIds: [], relationship: 'neutral', foundedYear: 0,
  daysUntilAction: 10, raidCooldownDays: 10, peaceTreatyDays: 0, profile,
});

describe('rival profiles and ledgers', () => {
  it('creates deterministic bounded defaults', () => {
    const profile = createRivalProfile(7, 'neutral');
    expect(profile.ledger.food).toBeGreaterThanOrEqual(30);
    expect(profile.ledger.food).toBeLessThanOrEqual(60);
    expect(profile.ledger.morale).toBe(55);
    expect(profile.contactCount).toBe(0);
  });

  it('normalizes legacy or malformed ledger values without changing relationship', () => {
    const normalized = normalizeRivalProfile({ id: 'legacy', relationship: 'tense', profile: {
      temperament: 'invalid' as never, priority: 'invalid' as never,
      ledger: { food: 999, wood: -4, gold: Number.NaN, morale: 150, recovery: -9 }, contactCount: 5000,
    } });
    expect(normalized.temperament).toBe('warlike');
    expect(normalized.ledger.food).toBe(200);
    expect(normalized.ledger.wood).toBe(0);
    expect(normalized.ledger.gold).toBe(0);
    expect(normalized.ledger.morale).toBe(100);
    expect(normalized.ledger.recovery).toBe(0);
    expect(normalized.contactCount).toBe(999);
  });

  it('hydrates a legacy rival once through the canonical normalizer', () => {
    const stateRival = rival();
    const profile = ensureRivalProfile(stateRival);
    expect(stateRival.profile).toEqual(profile);
    expect(profile.ledger.recovery).toBe(100);
  });

  it('selects recovery deterministically when recovery pressure is high', () => {
    const profile = createRivalProfile(2, 'neutral');
    profile.ledger.recovery = 20;
    expect(selectRivalDailyAction(profile, 'neutral', () => 0.99)).toBe('recover');
  });

  it('spends ledger resources for trade and keeps values bounded', () => {
    const profile = createRivalProfile(2, 'neutral');
    const beforeFood = profile.ledger.food;
    const result = applyRivalDailyAction(profile, 'trade');
    expect(result.changed).toBe(true);
    expect(profile.ledger.gold).toBeLessThan(20);
    expect(profile.ledger.food).toBeLessThanOrEqual(200);
    expect(profile.ledger.food).toBeGreaterThan(beforeFood);
  });

  it('rejects unaffordable fortification without partial spending', () => {
    const profile = createRivalProfile(2, 'neutral');
    profile.ledger.wood = 3;
    const result = applyRivalDailyAction(profile, 'fortify');
    expect(result.changed).toBe(false);
    expect(profile.ledger.wood).toBe(3);
  });
});
