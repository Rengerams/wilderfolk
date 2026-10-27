import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERFORMANCE_SAMPLE_LIMIT,
  getPerformanceSnapshot,
  isPerformanceProfilingEnabled,
  profileEnd,
  profileRenderedFrame,
  profileSimulationTick,
  profileStart,
  setPerformanceProfilingEnabled,
} from '../src/game/performanceProfiler';

describe('opt-in performance profiler', () => {
  it('reports bounded rolling percentiles and lifetime budget overruns', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    setPerformanceProfilingEnabled(true);
    for (let i = 0; i < PERFORMANCE_SAMPLE_LIMIT + 1; i++) {
      profileEnd('sim.totalTick', performance.now() - (i === 0 ? 2000 : 10));
    }
    const section = getPerformanceSnapshot().sections[0];
    expect(section.calls).toBe(PERFORMANCE_SAMPLE_LIMIT + 1);
    expect(section.overBudgetCalls).toBe(1);
    expect(section.p50Ms).toBeGreaterThanOrEqual(10);
    expect(section.p99Ms).toBeLessThan(1000);
    expect(section.p50Ms).toBeLessThanOrEqual(section.p95Ms);
    expect(section.p95Ms).toBeLessThanOrEqual(section.p99Ms);
    expect(section.maxMs).toBeGreaterThanOrEqual(2000);
  });

  it('ignores a section completed after profiling was stopped', () => {
    setPerformanceProfilingEnabled(true);
    const start = profileStart();
    setPerformanceProfilingEnabled(false);
    profileEnd('sim.totalTick', start);
    expect(getPerformanceSnapshot().sections).toEqual([]);
  });

  beforeEach(() => {
    setPerformanceProfilingEnabled(false);
    setPerformanceProfilingEnabled(true);
    setPerformanceProfilingEnabled(false);
  });
  afterEach(() => {
    setPerformanceProfilingEnabled(false);
    vi.restoreAllMocks();
  });

  it('adds no section records when disabled', () => {
    const start = profileStart();
    expect(start).toBe(-1);
    profileEnd('sim.daily', start);
    profileSimulationTick(72, 1800, 'rain');
    profileRenderedFrame(72, 'rain');
    const report = getPerformanceSnapshot();
    expect(report.enabled).toBe(false);
    expect(report.sections).toEqual([]);
    expect(report.ticks).toBe(0);
  });

  it('records call counts and timing for repeatedly invoked stages', () => {
    setPerformanceProfilingEnabled(true);
    expect(isPerformanceProfilingEnabled()).toBe(true);
    profileSimulationTick(72, 1800, 'rain');
    for (let i = 0; i < 4; i++) {
      const start = profileStart();
      profileEnd('daily.advanceSocialRelationships', start);
    }
    profileRenderedFrame(72, 'rain');
    const report = getPerformanceSnapshot();
    expect(report.ticks).toBe(1);
    expect(report.frames).toBe(1);
    expect(report.population).toBe(1800);
    expect(report.weather).toBe('rain');
    expect(report.lastTick).toBe(72);
    const stage = report.sections.find((section) => section.name === 'daily.advanceSocialRelationships');
    expect(stage).toBeDefined();
    expect(stage?.calls).toBe(4);
    expect(stage?.peakTick).toBe(72);
    expect(stage?.totalMs).toBeGreaterThanOrEqual(0);
    expect(stage?.maxMs).toBeGreaterThanOrEqual(0);
  });

  it('retains a stopped report and clears measurements on the next start', () => {
    setPerformanceProfilingEnabled(true);
    const s = profileStart();
    profileEnd('render.weather', s);
    setPerformanceProfilingEnabled(false);
    expect(getPerformanceSnapshot().sections).toHaveLength(1);
    const offStart = profileStart();
    profileEnd('render.weather', offStart);
    expect(getPerformanceSnapshot().sections[0].calls).toBe(1);
    setPerformanceProfilingEnabled(true);
    expect(getPerformanceSnapshot().sections).toHaveLength(0);
  });
});
