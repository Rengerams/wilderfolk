/**
 * Roadmap **U5** — *"normal play stays quiet; optional debug mode provides detailed daily and
 * cumulative reports."*
 *
 * The owner (`relationshipDiagnostics.ts`) always **collects** — that is what the drawer and the
 * cumulative history read — but the console emission has to be opt-in. It defaults on
 * (`consoleLoggingEnabled = true`) and until this slice nothing in the app ever switched it off, so
 * a normal session printed a full snapshot every in-game day; the test tier worked around it by hand
 * (`fullYear.integration.test.ts`, `low-6-care-chat.test.ts`).
 *
 * The wiring lives in `App.tsx` (the `?debug=1` flag) and this repo has no DOM test tier, so the
 * wiring case is a source guard using the `uiSingleOwner.test.ts` env-override pattern.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  flushRelationshipDiagnostics,
  getRelationshipDiagnosticsHistory,
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsConsoleLoggingEnabled,
} from '../src/game/relationshipDiagnostics';

afterEach(() => resetRelationshipDiagnostics());

describe('diagnostics quietness (roadmap U5)', () => {
  it('collects without emitting when console logging is off', () => {
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
  // `DIAGNOSTICS_QUIET_ROOT` lets the red-before proof run this guard against a mirrored pre-fix
  // tree (`tmp/red-before-u5`) without touching `src/`.
  const root = process.env.DIAGNOSTICS_QUIET_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('app wires the debug flag (roadmap U5)', () => {
  it('switches the diagnostics console off unless the debug flag is set', () => {
    // Pre-fix there was no call at all, so the owner module's own default
    // (`consoleLoggingEnabled = true`) decided, and every session logged a snapshot each colony day.
    const app = read('src/App.tsx');

    expect(app, 'the app no longer switches diagnostics console logging').toContain(
      'setRelationshipDiagnosticsConsoleLoggingEnabled(debugMode)',
    );
    expect(app, 'the switch is no longer tied to the debug flag').toContain("get('debug') === '1'");
  });
});
