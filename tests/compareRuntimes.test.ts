import { describe, expect, it } from 'vitest';
import { median, parseResults, validateComparable } from '../scripts/compare-runtimes.mjs';

const result = { label: 'City 300 player humans', humans: 300, alive: 350, p95Ms: 2.34567, averageMs: 1.23456, deltaHash: 'same-state' };
const output = (row: typeof result) => 'PERF_RESULT ' + JSON.stringify(row) + '\n';

describe('runtime benchmark comparison validation', () => {
  it('parses unrounded machine-readable metrics', () => {
    expect(parseResults(output(result), 'Node/tsx')).toEqual([result]);
  });
  it('rejects missing, malformed and duplicate results', () => {
    expect(() => parseResults('human-readable only', 'Deno')).toThrow();
    expect(() => parseResults('PERF_RESULT {bad}', 'Deno')).toThrow();
    expect(() => parseResults(output(result) + output(result), 'Deno')).toThrow();
  });
  it('refuses unequal populations, simulation hashes and scenarios', () => {
    expect(() => validateComparable([result], [{ ...result, alive: 351 }])).toThrow('simulation differs');
    expect(() => validateComparable([result], [{ ...result, deltaHash: 'other-state' }])).toThrow('simulation differs');
    expect(() => validateComparable([result], [{ ...result, label: 'Different city' }])).toThrow('labels differ');
  });
  it('accepts equivalent simulations despite different timings', () => {
    expect(() => validateComparable([result], [{ ...result, p95Ms: 1.111 }])).not.toThrow();
    expect(median([2, 5, 1, 4])).toBe(3);
  });
});
