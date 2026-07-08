/**
 * Format and export the full village chronicle from headless sims.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { GameEventLog, WorldState } from '../src/game/gameTypes';
import { formatChronicleText, type ChronicleExportMeta } from '../src/game/eventLogExport';

export const CHRONICLE_EVENT_TYPES: GameEventLog['type'][] = [
  'marriage',
  'birth',
  'death',
  'scandal',
  'building',
  'research',
  'trade',
  'migration',
  'combat',
  'disaster',
  'season',
  'event',
];

export function countEventsByType(events: readonly GameEventLog[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

export function formatEventSummaryLines(events: readonly GameEventLog[]): string[] {
  const counts = countEventsByType(events);
  const lines = [`Total chronicle entries: ${events.length}`];
  for (const type of CHRONICLE_EVENT_TYPES) {
    const n = counts[type];
    if (n > 0) lines.push(`  ${type}: ${n}`);
  }
  for (const [type, n] of Object.entries(counts)) {
    if (!CHRONICLE_EVENT_TYPES.includes(type as GameEventLog['type'])) {
      lines.push(`  ${type}: ${n}`);
    }
  }
  return lines;
}

/** Oldest-first, grouped by event type (weddings, births, deaths, …). */
function isWarDeath(message: string): boolean {
  return message.includes('fell defending the village');
}

function classifyCombatOutcome(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('overran the militia')) return 'defeat';
  if (m.includes('stalemate')) return 'stalemate';
  if (m.includes('routed')) return 'decisive_win';
  if (m.includes('drove back')) return 'narrow_win';
  if (m.includes('repelled')) return 'barricade_win';
  if (m.includes('held poorly')) return 'barricade_loss';
  if (m.includes('paid ') && m.includes('food')) return 'payoff';
  if (m.includes('no response in time')) return 'expired';
  if (m.includes('fell defending against')) return 'casualties';
  if (m.includes('launched a raid')) return 'incoming';
  if (m.includes('raid on ') && m.includes('succeeded')) return 'outgoing_win';
  if (m.includes('raid on ') && m.includes('failed')) return 'outgoing_fail';
  if (m.includes('meager spoils')) return 'outgoing_meager';
  return 'other';
}

type RaidActionRow = {
  tick: number;
  action: string;
  ok: boolean;
  detail?: string;
};

/** Always-on combat summary for balance sim logs (independent of SIM_LOG_EVENTS). */
export function formatCombatReportLines(
  events: readonly GameEventLog[],
  actionLog: readonly RaidActionRow[],
): string[] {
  const combat = [...events].reverse().filter((e) => e.type === 'combat');
  const warDeaths = [...events].reverse().filter((e) => e.type === 'death' && isWarDeath(e.message));
  const raidResponses = actionLog.filter((a) => a.category === 'raid_response');
  const outcomeCounts: Record<string, number> = {};

  for (const e of combat) {
    const kind = classifyCombatOutcome(e.message);
    outcomeCounts[kind] = (outcomeCounts[kind] ?? 0) + 1;
  }

  const lines: string[] = [
    `Combat chronicle entries: ${combat.length}`,
    `War deaths (defending village): ${warDeaths.length}`,
  ];

  const summaryParts = Object.entries(outcomeCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}=${n}`);
  if (summaryParts.length > 0) lines.push(`Outcomes: ${summaryParts.join(', ')}`);

  if (raidResponses.length > 0) {
    lines.push('');
    lines.push(`── RAID RESPONSES (${raidResponses.length}) ──`);
    for (const row of raidResponses) {
      const status = row.ok ? 'ok' : 'FAIL';
      lines.push(`tick ${row.tick} | ${row.action} [${status}] | ${row.detail ?? ''}`);
    }
  }

  if (combat.length > 0) {
    lines.push('');
    lines.push(`── COMBAT CHRONICLE (${combat.length}) ──`);
    for (const e of combat) {
      const who = e.entityName ? ` (${e.entityName})` : '';
      lines.push(`Y${e.year} D${e.day} tick ${e.tick} | ${e.message}${who}`);
    }
  }

  if (warDeaths.length > 0) {
    lines.push('');
    lines.push(`── WAR DEATHS (${warDeaths.length}) ──`);
    for (const e of warDeaths) {
      const who = e.entityName ? ` (${e.entityName})` : '';
      lines.push(`Y${e.year} D${e.day} tick ${e.tick} | ${e.message}${who}`);
    }
  }

  if (combat.length === 0 && raidResponses.length === 0) {
    lines.push('(no combat or raid responses recorded — check rival tension and raid injections)');
  }

  return lines;
}

export function formatGroupedChronicleLines(events: readonly GameEventLog[]): string[] {
  const chronological = [...events].reverse();
  const lines: string[] = [];

  for (const type of CHRONICLE_EVENT_TYPES) {
    const ofType = chronological.filter((e) => e.type === type);
    if (ofType.length === 0) continue;
    lines.push('');
    lines.push(`── ${type.toUpperCase()} (${ofType.length}) ${'─'.repeat(Math.max(0, 40 - type.length))}`);
    for (const e of ofType) {
      const who = e.entityName ? ` (${e.entityName})` : '';
      lines.push(`Y${e.year} D${e.day} tick ${e.tick} | ${e.message}${who}`);
    }
  }

  return lines;
}

/** Flat oldest-first list — matches in-game chronicle export order reversed. */
export function formatFlatChronicleLines(events: readonly GameEventLog[]): string[] {
  return [...events].reverse().map(
    (e) => `Y${e.year} D${e.day} tick ${e.tick} [${e.type}] ${e.message}`,
  );
}

export function buildChronicleMeta(state: WorldState): ChronicleExportMeta {
  return {
    villageName: state.villageName ?? 'Balanceville',
    year: state.year,
    day: state.dayInYear,
    tick: state.tick,
    population: state.humanPopulation,
    exportedAt: new Date(),
  };
}

export function writeChronicleFile(
  events: readonly GameEventLog[],
  meta: ChronicleExportMeta,
  logPath: string,
): string {
  const text = formatChronicleText([...events], meta);
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, text, 'utf8');
  return logPath;
}

export function chroniclePathFromSimLog(simLogPath: string): string {
  return simLogPath.replace(/\.txt$/i, '-chronicle.txt');
}

export function defaultChroniclePath(
  logDir: string,
  years: number,
  profile: string,
  stamp: string,
): string {
  return join(logDir, `sim-${years}year-${profile}-chronicle-${stamp}.txt`);
}