import { describe, expect, it } from 'vitest';
import { decideRepeatedError } from '../src/game/repeatedErrorLog';

describe('repeated worker error throttling', () => {
  it('logs the first fault and counts identical ones inside the window', () => {
    const first = decideRepeatedError(null, 'timeout', 1000, 5000);
    expect(first).toEqual({ log: true, suppressed: 0 });

    let state = { message: 'timeout', at: 1000, suppressed: 0 };
    for (let i = 0; i < 3; i++) {
      const decision = decideRepeatedError(state, 'timeout', 2000 + i, 5000);
      expect(decision.log).toBe(false);
      state = { ...state, suppressed: decision.suppressed };
    }
    expect(state.suppressed).toBe(3);
  });

  it('logs a different message immediately and reports the previous suppressed count', () => {
    const state = { message: 'timeout', at: 1000, suppressed: 4 };
    expect(decideRepeatedError(state, 'pool exhausted', 1200, 5000)).toEqual({ log: true, suppressed: 4 });
  });

  it('logs the same message again once the window has expired', () => {
    const state = { message: 'timeout', at: 1000, suppressed: 2 };
    expect(decideRepeatedError(state, 'timeout', 7000, 5000).log).toBe(true);
  });
});
