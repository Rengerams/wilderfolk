/** Opt-in per-realm CPU-time sampling with bounded call-site names. */
export interface PerformanceSection {
  name: string;
  calls: number;
  totalMs: number;
  averageMs: number;
  maxMs: number;
  peakTick: number;
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
}

interface MutableSection {
  calls: number;
  totalMs: number;
  maxMs: number;
  peakTick: number;
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
  if (start < 0) return;
  const elapsed = Math.max(0, performance.now() - start);
  let row = sections.get(name);
  if (!row) {
    row = { calls: 0, totalMs: 0, maxMs: 0, peakTick: 0 };
    sections.set(name, row);
  }
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
    sections: [...sections].map(([name, s]) => ({
      name,
      calls: s.calls,
      totalMs: s.totalMs,
      averageMs: s.totalMs / s.calls,
      maxMs: s.maxMs,
      peakTick: s.peakTick,
    })).sort((a, b) => b.totalMs - a.totalMs),
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
