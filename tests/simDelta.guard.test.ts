import { describe, expect, it } from 'vitest';
import { SIM_DELTA_PROTO, isSimTickDelta } from '../src/game/simBuffers/simDelta';

function delta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    proto: SIM_DELTA_PROTO,
    tick: 42,
    resources: {},
    storageMax: {},
    ...overrides,
  };
}

describe('worker delta boundary guard', () => {
  it('accepts a payload with the current protocol and the fields the host applies first', () => {
    expect(isSimTickDelta(delta())).toBe(true);
  });

  it('rejects a stale or incompatible protocol version', () => {
    expect(isSimTickDelta(delta({ proto: SIM_DELTA_PROTO - 1 }))).toBe(false);
    expect(isSimTickDelta(delta({ proto: String(SIM_DELTA_PROTO) }))).toBe(false);
  });

  it('rejects a payload that cannot be applied', () => {
    expect(isSimTickDelta(null)).toBe(false);
    expect(isSimTickDelta(undefined)).toBe(false);
    expect(isSimTickDelta('tick')).toBe(false);
    expect(isSimTickDelta(delta({ tick: Number.NaN }))).toBe(false);
    expect(isSimTickDelta(delta({ resources: null }))).toBe(false);
    expect(isSimTickDelta(delta({ storageMax: undefined }))).toBe(false);
  });
});
