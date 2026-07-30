import { BuildingType } from './gameTypes';

export type SidebarTab = 'village' | 'frontier' | 'nature' | 'progress' | 'log' | 'more';

export const TAB_HOTKEYS: Record<string, SidebarTab> = {
  v: 'village',
  f: 'frontier',
  n: 'nature',
  p: 'progress',
  l: 'log',
  m: 'more',
};

export const TAB_HOTKEY_CODES: Record<string, SidebarTab> = {
  KeyV: 'village',
  KeyF: 'frontier',
  KeyN: 'nature',
  KeyP: 'progress',
  KeyL: 'log',
  KeyM: 'more',
};

/** Number keys → building types (must be string BuildingType values, not indices). */
export const HOTKEY_BUILDINGS: Record<string, BuildingType> = {
  '1': BuildingType.House,
  '2': BuildingType.Farm,
  '3': BuildingType.LumberMill,
  '4': BuildingType.Quarry,
  '5': BuildingType.Barn,
  '6': BuildingType.Well,
  '7': BuildingType.Store,
  '8': BuildingType.Road,
  '9': BuildingType.Workshop,
};

export const BUILDING_HOTKEYS: Partial<Record<BuildingType, string>> = {};
for (const [key, val] of Object.entries(HOTKEY_BUILDINGS)) {
  BUILDING_HOTKEYS[val] = key;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = (target instanceof HTMLElement ? target : null)
    ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox';
}

export function resolveSidebarTabFromKey(e: KeyboardEvent): SidebarTab | null {
  return TAB_HOTKEYS[e.key.toLowerCase()] ?? TAB_HOTKEY_CODES[e.code] ?? null;
}
