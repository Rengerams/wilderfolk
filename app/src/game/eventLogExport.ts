import type { GameEventLog } from './gameTypes';
import { GAME_VERSION } from './version';

export interface ChronicleExportMeta {
  villageName: string;
  year: number;
  day: number;
  tick: number;
  population: number;
  exportedAt?: Date;
}

export function formatChronicleText(events: GameEventLog[], meta: ChronicleExportMeta): string {
  const exported = meta.exportedAt ?? new Date();
  const header = [
    'Wilderfolk — Village Chronicle',
    `Settlement: ${meta.villageName}`,
    `Game year ${meta.year}, day ${meta.day} (tick ${meta.tick}) · population ${meta.population}`,
    `Exported: ${exported.toLocaleString()} · game v${GAME_VERSION}`,
    `Events: ${events.length} (newest listed first)`,
    '',
    '---',
    '',
  ];

  const body = events.map(
    (evt) => `[Y${evt.year} D${evt.day}] [${evt.type}] ${evt.message}`,
  );

  return [...header, ...body].join('\n');
}

export function buildChronicleFilename(villageName: string): string {
  const safe = villageName
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'village';
  return `wilderfolk-${safe}-chronicle.txt`;
}

export function downloadTextFile(content: string, filename: string): void {
  if (typeof document === 'undefined') {
    console.warn('[chronicle] downloadTextFile is only available in the browser');
    return;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadChronicleLog(events: GameEventLog[], meta: ChronicleExportMeta): string {
  const content = formatChronicleText(events, meta);
  downloadTextFile(content, buildChronicleFilename(meta.villageName));
  return content;
}

export function formatChronicleJSON(events: GameEventLog[], meta: ChronicleExportMeta): string {
  return JSON.stringify(
    {
      meta: {
        ...meta,
        exportedAt: (meta.exportedAt ?? new Date()).toISOString(),
        gameVersion: GAME_VERSION,
      },
      events,
    },
    null,
    2,
  );
}

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

export function formatChronicleCSV(events: GameEventLog[]): string {
  const header = 'id,tick,year,day,type,message,entityName';
  const rows = events.map(
    (evt) =>
      `${evt.id},${evt.tick},${evt.year},${evt.day},${evt.type},${escapeCsvField(evt.message || '')},${escapeCsvField(evt.entityName || '')}`,
  );
  return [header, ...rows].join('\n');
}

export function downloadChronicleJSON(events: GameEventLog[], meta: ChronicleExportMeta): void {
  const content = formatChronicleJSON(events, meta);
  const safe = buildChronicleFilename(meta.villageName).replace(/-chronicle\.txt$/, '');
  downloadTextFile(content, `${safe}-chronicle.json`);
}

export function downloadChronicleCSV(events: GameEventLog[], meta: ChronicleExportMeta): void {
  const content = formatChronicleCSV(events);
  const safe = buildChronicleFilename(meta.villageName).replace(/-chronicle\.txt$/, '');
  downloadTextFile(content, `${safe}-chronicle.csv`);
}

const EXPORT_ON_SAVE_KEY = 'wilderfolk_export_chronicle_on_save';

export function loadExportChronicleOnSave(): boolean {
  try {
    const raw = localStorage.getItem(EXPORT_ON_SAVE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function saveExportChronicleOnSave(enabled: boolean): void {
  try {
    localStorage.setItem(EXPORT_ON_SAVE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}