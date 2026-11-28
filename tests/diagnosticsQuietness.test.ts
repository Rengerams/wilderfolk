/**
 * Normal play stays quiet: the diagnostics owner always collects for the drawer and history, but
 * console emission is opt-in and only `?debug=1` in `App.tsx` switches it on; that wiring is
 * guarded in `scripts/check-source-guards.mjs`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  flushRelationshipDiagnostics,
  getRelationshipDiagnosticsHistory,
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsEnabled,
  setRelationshipDiagnosticsConsoleLoggingEnabled,
} from '../src/game/relationshipDiagnostics';

afterEach(() => resetRelationshipDiagnostics());

describe('diagnostics quietness (roadmap U5)', () => {
  it('collects without emitting when console logging is off', () => {
    setRelationshipDiagnosticsEnabled(true);
    setRelationshipDiagnosticsConsoleLoggingEnabled(false);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const before = getRelationshipDiagnosticsHistory().length;
      const snapshot = flushRelationshipDiagnostics(72, 1, 3);

      expect(snapshot, 'the console switch must not disable collection').not.toBeNull();
      expect(getRelationshipDiagnosticsHistory().length).toBe(before + 1);
      expect(info, 'normal play must stay quiet').not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });

  it('emits the collected snapshot once when console logging is on (the debug path)', () => {
    setRelationshipDiagnosticsEnabled(true);
    setRelationshipDiagnosticsConsoleLoggingEnabled(true);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const snapshot = flushRelationshipDiagnostics(144, 2, 5);

      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0]?.[0]).toBe('[Wilderfolk relationship diagnostics]');
      expect(info.mock.calls[0]?.[1]).toEqual(snapshot);
    } finally {
      info.mockRestore();
    }
  });
});


