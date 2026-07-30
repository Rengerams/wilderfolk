/** Per-tick spatial query counters — enable via SPATIAL_QUERY_METRICS=1 (benchmark scripts). */

export type SpatialQueryCategory =
  | 'graze'
  | 'flee'
  | 'hunt'
  | 'wolf_pack'
  | 'mate'
  | 'social'
  | 'human_hunt'
  | 'tamed_hunt'
  | 'road_near'
  | 'road_avoid'
  | 'lumber_trees';

export interface SpatialQueryBucket {
  queries: number;
  candidates: number;
  cells: number;
}

export interface SpatialQueryReport {
  ticks: number;
  perTick: Record<SpatialQueryCategory, SpatialQueryBucket>;
  session: Record<SpatialQueryCategory, SpatialQueryBucket>;
  gridMode: 'grid' | 'naive';
}

/** Human-readable labels for each category. Acts as the single source of truth for categories. */
const CATEGORY_LABELS: Record<SpatialQueryCategory, string> = {
  graze: 'Graze',
  flee: 'Flee',
  hunt: 'Hunt',
  wolf_pack: 'Wolf pack',
  mate: 'Mate',
  social: 'Social',
  human_hunt: 'Human hunt/flee',
  tamed_hunt: 'Tamed hunt',
  road_near: 'Road near',
  road_avoid: 'Road avoid',
  lumber_trees: 'Lumber mill trees',
};

/** Compile-time check: if a category is added to the union but not to labels, TypeScript will error here. */
const _typeCheck: Record<SpatialQueryCategory, string> = CATEGORY_LABELS;
void _typeCheck; // suppress unused-var warning

const CATEGORIES: SpatialQueryCategory[] = Object.keys(CATEGORY_LABELS) as SpatialQueryCategory[];

function envFlagEnabled(val: string | undefined): boolean {
  if (val == null || val === '') return false;
  return /^(1|true|yes|on|enabled)$/i.test(val.trim());
}

function isMetricsEnvEnabled(): boolean {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  if (envFlagEnabled(runtime.process?.env?.SPATIAL_QUERY_METRICS)) return true;
  if (typeof import.meta !== 'undefined') {
    return envFlagEnabled(import.meta.env?.VITE_SPATIAL_QUERY_METRICS);
  }
  return false;
}

function emptyBucket(): SpatialQueryBucket {
  return { queries: 0, candidates: 0, cells: 0 };
}

function emptyRecord(): Record<SpatialQueryCategory, SpatialQueryBucket> {
  const out: Partial<Record<SpatialQueryCategory, SpatialQueryBucket>> = {};
  for (const cat of CATEGORIES) out[cat] = emptyBucket();
  return out as Record<SpatialQueryCategory, SpatialQueryBucket>;
}

function cloneRecord(record: Record<SpatialQueryCategory, SpatialQueryBucket>): Record<SpatialQueryCategory, SpatialQueryBucket> {
  const out: Partial<Record<SpatialQueryCategory, SpatialQueryBucket>> = {};
  for (const cat of CATEGORIES) out[cat] = { ...record[cat] };
  return out as Record<SpatialQueryCategory, SpatialQueryBucket>;
}

let enabled = isMetricsEnvEnabled();
let activeTag: SpatialQueryCategory | null = null;
let tickBuckets = emptyRecord();
let sessionBuckets = emptyRecord();
let measuredTicks = 0;
let gridMode: 'grid' | 'naive' = 'grid';

function bump(
  cat: SpatialQueryCategory,
  field: keyof SpatialQueryBucket,
  n = 1,
): void {
  tickBuckets[cat][field] += n;
}

export function isSpatialQueryMetricsEnabled(): boolean {
  return enabled;
}

export function setSpatialQueryMetricsEnabled(value: boolean): void {
  enabled = value;
  if (!value) activeTag = null;
}

export function setSpatialQueryGridMode(mode: 'grid' | 'naive'): void {
  gridMode = mode;
}

export function getSpatialQueryGridMode(): 'grid' | 'naive' {
  return gridMode;
}

export function resetSpatialQuerySession(): void {
  tickBuckets = emptyRecord();
  sessionBuckets = emptyRecord();
  measuredTicks = 0;
  activeTag = null;
}

export function resetSpatialQueryTickMetrics(): void {
  tickBuckets = emptyRecord();
}

export function flushSpatialQueryTickToSession(): void {
  if (!enabled) return;

  let hadActivity = false;
  for (const cat of CATEGORIES) {
    const tick = tickBuckets[cat];
    if (tick.queries > 0 || tick.candidates > 0 || tick.cells > 0) {
      hadActivity = true;
    }
    sessionBuckets[cat].queries += tick.queries;
    sessionBuckets[cat].candidates += tick.candidates;
    sessionBuckets[cat].cells += tick.cells;
  }

  if (hadActivity) {
    measuredTicks++;
  }
}

export function withSpatialQuery<T>(category: SpatialQueryCategory, fn: () => T): T {
  if (!enabled) {
    activeTag = null;
    return fn();
  }
  const prev = activeTag;
  activeTag = category;
  bump(category, 'queries', 1);
  try {
    return fn();
  } finally {
    activeTag = prev;
  }
}

export function recordSpatialCandidate(category?: SpatialQueryCategory): void {
  const cat = category ?? activeTag;
  if (!enabled || !cat) return;
  bump(cat, 'candidates', 1);
}

export function recordSpatialCells(category: SpatialQueryCategory | null, count: number): void {
  const cat = category ?? activeTag;
  if (!enabled || !cat || count <= 0) return;
  bump(cat, 'cells', count);
}

/** Returns a snapshot of the current (unflushed) tick metrics. */
export function getCurrentTickMetrics(): Record<SpatialQueryCategory, SpatialQueryBucket> {
  return cloneRecord(tickBuckets);
}

export function getSpatialQueryReport(): SpatialQueryReport {
  const perTick = emptyRecord();
  if (measuredTicks > 0) {
    for (const cat of CATEGORIES) {
      perTick[cat].queries = sessionBuckets[cat].queries / measuredTicks;
      perTick[cat].candidates = sessionBuckets[cat].candidates / measuredTicks;
      perTick[cat].cells = sessionBuckets[cat].cells / measuredTicks;
    }
  }
  return {
    ticks: measuredTicks,
    perTick,
    session: cloneRecord(sessionBuckets),
    gridMode,
  };
}

function fmtBucket(label: string, bucket: SpatialQueryBucket, showCells: boolean): string {
  const cells = showCells ? ` cells=${bucket.cells.toFixed(1)}` : '';
  return `${label}: queries=${bucket.queries.toFixed(1)}/tick candidates=${bucket.candidates.toFixed(1)}/tick${cells}`;
}

export function formatSpatialQueryReport(report: SpatialQueryReport): string {
  const lines: string[] = [];
  const mode = report.gridMode === 'grid' ? 'grid (default)' : 'naive (USE_SPATIAL_GRID=0)';
  lines.push(`Spatial query metrics — ${report.ticks} ticks, mode=${mode}`);
  const showCells = report.gridMode === 'grid';

  for (const cat of CATEGORIES) {
    const bucket = report.perTick[cat];
    if (bucket.queries <= 0 && bucket.candidates <= 0 && bucket.cells <= 0) continue;
    lines.push(`  ${fmtBucket(CATEGORY_LABELS[cat], bucket, showCells)}`);
  }

  const graze = report.perTick.graze.candidates;
  const flee = report.perTick.flee.candidates;
  const hunt = report.perTick.hunt.candidates;
  const social = report.perTick.social.candidates;
  if (graze > 0 || flee > 0 || hunt > 0 || social > 0) {
    lines.push(
      `  Hot-path averages: graze=${graze.toFixed(0)} flee=${flee.toFixed(0)} hunt=${hunt.toFixed(0)} social=${social.toFixed(0)} candidate checks/tick`,
    );
  }
  return lines.join('\n');
}