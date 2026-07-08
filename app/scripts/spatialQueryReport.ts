import {
  formatSpatialQueryReport,
  getSpatialQueryReport,
  resetSpatialQuerySession,
  setSpatialQueryMetricsEnabled,
  type SpatialQueryReport,
} from '../src/game/spatialQueryMetrics';

export function enableSpatialQueryMetrics(): void {
  setSpatialQueryMetricsEnabled(true);
  resetSpatialQuerySession();
}

export function printSpatialQueryMetricsSection(): void {
  const report = getSpatialQueryReport();
  if (report.ticks <= 0) return;
  console.log('\n--- Spatial query metrics (measured) ---');
  console.log(formatSpatialQueryReport(report));
  printSpatialQueryComparisonHints(report);
}

export function formatSpatialQueryComparison(
  grid: SpatialQueryReport,
  naive: SpatialQueryReport,
): string {
  const lines: string[] = [];
  lines.push('Spatial query A/B (city profile, measured):');
  const keys = ['graze', 'flee', 'hunt', 'social'] as const;
  for (const key of keys) {
    const g = grid.perTick[key].candidates;
    const n = naive.perTick[key].candidates;
    if (g <= 0 && n <= 0) continue;
    const reduction = n > 0 ? ((1 - g / n) * 100).toFixed(1) : 'n/a';
    lines.push(
      `  ${key}: grid=${g.toFixed(1)}/tick naive=${n.toFixed(1)}/tick reduction=${reduction}%`,
    );
  }
  return lines.join('\n');
}

function printSpatialQueryComparisonHints(report: SpatialQueryReport): void {
  const graze = report.perTick.graze;
  const flee = report.perTick.flee;
  if (graze.queries > 0) {
    console.log(
      `  Graze: ${graze.queries.toFixed(1)} queries/tick, ${graze.candidates.toFixed(1)} candidate checks/tick, ${graze.cells.toFixed(1)} cells/tick (grass 56px)`,
    );
  }
  if (flee.queries > 0) {
    console.log(
      `  Flee: ${flee.queries.toFixed(1)} queries/tick, ${flee.candidates.toFixed(1)} candidate checks/tick, ${flee.cells.toFixed(1)} cells/tick (mobile 80px)`,
    );
  }
}