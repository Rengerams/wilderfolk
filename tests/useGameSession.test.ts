import { describe, expect, it } from 'vitest';
import { shouldRunGameSession } from '../src/hooks/useGameSession';

describe('useGameSession lifecycle gate', () => {
  it('starts the worker-backed game loop only after sprites load outside intro and setup', () => {
    expect(shouldRunGameSession(false, false, false)).toBe(false);
    expect(shouldRunGameSession(true, true, false)).toBe(false);
    expect(shouldRunGameSession(true, false, true)).toBe(false);
    expect(shouldRunGameSession(true, false, false)).toBe(true);
  });
});
