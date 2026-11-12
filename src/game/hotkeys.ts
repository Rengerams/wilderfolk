import { BuildingType } from './gameTypes';

/**
 * The sidebar / focused-view vocabulary — one definition, here with the hotkeys that produce it.
 * `'schedule'` is declared but unproduced: the Work Schedule view renders inside People.
 */
export type SidebarTab = 'village' | 'schedule' | 'frontier' | 'nature' | 'progress' | 'log' | 'more';

/**
 * The six header doors, in the order every surface presents them — key→tab routing, no names.
 * A door's name is owned by `OVERVIEW_SUBJECTS`; surfaces read it with `overviewSubjectForTab`.
 */
export const HEADER_DOORS: readonly { key: string; tab: SidebarTab }[] = [
  { key: 'V', tab: 'village' },
  { key: 'F', tab: 'frontier' },
  { key: 'N', tab: 'nature' },
  { key: 'P', tab: 'progress' },
  { key: 'L', tab: 'log' },
  { key: 'M', tab: 'more' },
];

export const TAB_HOTKEYS: Record<string, SidebarTab> = Object.fromEntries(
  HEADER_DOORS.map((door) => [door.key.toLowerCase(), door.tab] as const),
);

export const TAB_HOTKEY_CODES: Record<string, SidebarTab> = Object.fromEntries(
  HEADER_DOORS.map((door) => [`Key${door.key}`, door.tab] as const),
);

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

/**
 * F4 logistics overlay toggle — `X` for "eXamine the network"; `isLogisticsHotkey` is the one
 * keydown test. The other letters belong to the sidebar tabs and actions.
 */
export const LOGISTICS_HOTKEY = 'x';
export const LOGISTICS_HOTKEY_CODE = 'KeyX';

/** True when this keydown is the logistics-overlay toggle (never with a modifier). */
export function isLogisticsHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  return e.key.toLowerCase() === LOGISTICS_HOTKEY || e.code === LOGISTICS_HOTKEY_CODE;
}

/**
 * Village overview toggle — `C` for the council, which is what the window's own heading says.
 * Its door is one unlabelled 🏘️ among six, so the letter is the route that cannot be missed.
 */
export const COUNCIL_HOTKEY = 'c';
export const COUNCIL_HOTKEY_CODE = 'KeyC';

/** True when this keydown is the village-overview toggle (never with a modifier). */
export function isCouncilHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  return e.key.toLowerCase() === COUNCIL_HOTKEY || e.code === COUNCIL_HOTKEY_CODE;
}

/** Input types that accept typed text; every other input is a pointer/toggle control. */
const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'password', 'url', 'tel', 'number',
  'date', 'time', 'datetime-local', 'month', 'week',
]);

/**
 * True when the target accepts typed text, where every key belongs to the field. Checkboxes,
 * selects and buttons do not block hotkeys.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = (target instanceof HTMLElement ? target : null)
    ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type?.toLowerCase() || 'text';
    return TEXT_INPUT_TYPES.has(type);
  }
  return el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox';
}

export function resolveSidebarTabFromKey(e: KeyboardEvent): SidebarTab | null {
  return TAB_HOTKEYS[e.key.toLowerCase()] ?? TAB_HOTKEY_CODES[e.code] ?? null;
}

/**
 * True when the target is a control that Space and Enter activate natively. `isEditableTarget`
 * excludes these controls so gameplay hotkeys still work while they hold focus.
 */
export function isActivatableTarget(target: EventTarget | null): boolean {
  const el = (target instanceof HTMLElement ? target : null)
    ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!el) return false;
  if (
    el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SUMMARY'
    || el.tagName === 'SELECT' || el.tagName === 'INPUT'
  ) return true;
  const role = el.getAttribute('role');
  return role === 'button' || role === 'switch' || role === 'menuitem' || role === 'tab'
    || role === 'checkbox' || role === 'radio' || role === 'combobox';
}