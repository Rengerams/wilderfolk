/**
 * Normal play stays quiet: the diagnostics owner always collects for the drawer and history, but
 * console emission is opt-in and only `?debug=1` in `App.tsx` switches it on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function read(relativePath: string): string {
  // `DIAGNOSTICS_QUIET_ROOT` points this guard at a mirrored tree without touching `src/`.
  const root = process.env.DIAGNOSTICS_QUIET_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('app wires the debug flag (roadmap U5)', () => {
  it('switches the diagnostics console off unless the debug flag is set', () => {
    // The owner default is on, so `App.tsx` must switch console logging from the debug flag.
    const app = read('src/App.tsx');

    expect(app, 'the app no longer switches diagnostics console logging').toContain(
      'setRelationshipDiagnosticsConsoleLoggingEnabled(debugMode)',
    );
    expect(app, 'the switch is no longer tied to the debug flag').toContain("get('debug') === '1'");
  });
});
