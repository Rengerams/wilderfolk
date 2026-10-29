import type { PathfinderReport } from './pathfindingMetrics';

/** Opt-in per-realm CPU-time sampling with bounded call-site names. */
export interface PerformanceSection {
  name: string;
  calls: number;
  totalMs: number;
  averageMs: number;
  maxMs: number;
  peakTick: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  overBudgetCalls: number;
}

export interface PerformanceSnapshot {
  enabled: boolean;
  elapsedMs: number;
  ticks: number;
  frames: number;
  lastTick: number;
  population: number;
  weather: string;
  sections: PerformanceSection[];
  /** A* shape behind the pathfinding stages; only the sim realm that ran A* attaches it. */
  pathfinder?: PathfinderReport;
}

export const PERFORMANCE_SAMPLE_LIMIT = 512;
export const SIMULATION_TICK_BUDGET_MS = 1000;

interface MutableSection {
  calls: number;
  totalMs: number;
  maxMs: number;
  peakTick: number;
  samples: Float64Array;
  sampleCount: number;
  overBudgetCalls: number;
}

let enabled = false;
let startedAt = 0;
let ticks = 0;
let frames = 0;
let lastTick = 0;
let population = 0;
let weather = '';
let sections = new Map<string, MutableSection>();
let lastPublished = 0;

export function isPerformanceProfilingEnabled(): boolean {
  return enabled;
}

export function setPerformanceProfilingEnabled(next: boolean): void {
  if (next && !enabled) {
    startedAt = performance.now();
    ticks = 0;
    frames = 0;
    lastTick = 0;
    population = 0;
    weather = '';
    sections = new Map();
    lastPublished = startedAt;
  }
  enabled = next;
}

export function profileStart(): number {
  return enabled ? performance.now() : -1;
}

/** The label is a static call-site name; stages can contain other stages. */
export function profileEnd(name: string, start: number): void {
  if (!enabled || start < 0) return;
  const elapsed = Math.max(0, performance.now() - start);
  let row = sections.get(name);
  if (!row) {
    row = {
      calls: 0, totalMs: 0, maxMs: 0, peakTick: 0,
      samples: new Float64Array(PERFORMANCE_SAMPLE_LIMIT), sampleCount: 0, overBudgetCalls: 0,
    };
    sections.set(name, row);
  }
  row.samples[row.calls % PERFORMANCE_SAMPLE_LIMIT] = elapsed;
  row.sampleCount = Math.min(PERFORMANCE_SAMPLE_LIMIT, row.sampleCount + 1);
  if (elapsed > SIMULATION_TICK_BUDGET_MS) row.overBudgetCalls++;
  row.calls++;
  row.totalMs += elapsed;
  if (elapsed > row.maxMs) {
    row.maxMs = elapsed;
    row.peakTick = lastTick;
  }
}

export function profileSimulationTick(tick: number, humanCount: number, currentWeather: string): void {
  if (!enabled) return;
  ticks++;
  lastTick = tick;
  population = humanCount;
  weather = currentWeather;
}

export function profileRenderedFrame(tick: number, currentWeather: string): void {
  if (!enabled) return;
  frames++;
  lastTick = tick;
  weather = currentWeather;
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  const now = performance.now();
  return {
    enabled,
    elapsedMs: startedAt ? now - startedAt : 0,
    ticks,
    frames,
    lastTick,
    population,
    weather,
    sections: [...sections].map(([name, s]) => {
      const sorted = s.samples.slice(0, s.sampleCount).sort();
      const percentile = (fraction: number): number => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
      return {
        name,
        calls: s.calls,
        totalMs: s.totalMs,
        averageMs: s.totalMs / s.calls,
        maxMs: s.maxMs,
        peakTick: s.peakTick,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        overBudgetCalls: s.overBudgetCalls,
      };
    }).sort((a, b) => b.totalMs - a.totalMs),
  };
}

/** Include a bounded summary in an existing tick response, at most once per 3 seconds. */
export function maybeWorkerPerformanceSnapshot(): PerformanceSnapshot | undefined {
  if (!enabled) return undefined;
  const now = performance.now();
  if (now - lastPublished < 3000) return undefined;
  lastPublished = now;
  return getPerformanceSnapshot();
}
