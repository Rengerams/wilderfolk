/**
 * Simulation positions must not depend on engine-approximated `Math.sin`/`Math.cos`: an ulp between
 * engines can drift a saved coordinate. `simTrig` is the arithmetic-only owner, and the tick modules
 * that write positions use it instead.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deterministicCos, deterministicSin } from '../src/game/simTrig';

describe('deterministic sine and cosine', () => {
  it('matches the mathematical functions closely across quadrants and wraps', () => {
    for (const angle of [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 2, 2.5, -7.25, 100.5]) {
      expect(deterministicSin(angle)).toBeCloseTo(Math.sin(angle), 4);
      expect(deterministicCos(angle)).toBeCloseTo(Math.cos(angle), 4);
    }
    expect(deterministicSin(0)).toBe(0);
    expect(deterministicCos(0)).toBeCloseTo(1, 6);
    // No direction is defined for a non-finite angle; the simulation gets a stable zero, not NaN.
    expect(deterministicSin(Number.NaN)).toBe(0);
    expect(deterministicSin(Number.POSITIVE_INFINITY)).toBe(0);
    expect(deterministicCos(Number.NaN)).toBe(0);
  });

  it('is bit-stable and keeps points on the unit circle', () => {
    for (const angle of [0.1, 1.7, 4.9, -2.2, 31.4]) {
      const sin = deterministicSin(angle);
      expect(deterministicSin(angle)).toBe(sin);
      expect(sin * sin + deterministicCos(angle) * deterministicCos(angle)).toBeCloseTo(1, 5);
    }
  });
});

/** The modules that integrate a settler or animal position on a tick. */
const TICK_POSITION_MODULES = [
  'src/game/humanTick.ts',
  'src/game/factionWander.ts',
  'src/game/tickLayerSystems.ts',
  'src/game/moonHowler.ts',
  'src/game/villageLeadership.ts',
  'src/game/simulation/humanMovement.ts',
  'src/game/simulation/humanLifecycle.ts',
  'src/game/worldEventSites.ts',
  'src/game/dailyGrassEcology.ts',
];

describe('tick-position modules', () => {
  it('use the deterministic owner instead of Math.sin/Math.cos', () => {
    const offenders: string[] = [];
    for (const file of TICK_POSITION_MODULES) {
      readFileSync(resolve(process.cwd(), file), 'utf8').split('\n').forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        if (/Math\.(sin|cos)\(/.test(line)) offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
