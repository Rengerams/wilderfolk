import { BuildingType } from './gameTypes';

/**
 * The sidebar / focused-view vocabulary — one definition, here with the hotkeys that produce it.
 *
 * `useGameShellState` used to declare a second, same-named union with an extra `'schedule'` member,
 * while `useKeyboardControls` typed its `openTab` with this one. The two disagreed by a member, so
 * `'schedule'` was a branch no hotkey or rail button could reach and the hook's own switch was
 * unreachable behind the type mismatch (audit C2 "`SidebarTab` union"). The type now lives in one
 * place and the hook imports it.
 *
 * `'schedule'` is kept as the declared-but-unproduced id for the Work Schedule view, which now
 * renders inside the People section (`CitizenOverviewScreen`) rather than as its own rail tab.
 */
export type SidebarTab = 'village' | 'schedule' | 'frontier' | 'nature' | 'progress' | 'log' | 'more';

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

/**
 * F4 logistics overlay toggle — one definition, read by the keyboard owner and the UI hint.
 *
 * `X` for "eXamine the network": taken letters are the sidebar tabs (V/F/N/P/L/M), the citizen
 * overview (O), and the build/grid/rotate/center actions (B/G/R/H).
 */
export const LOGISTICS_HOTKEY = 'x';
export const LOGISTICS_HOTKEY_CODE = 'KeyX';

/** True when this keydown is the logistics-overlay toggle (never with a modifier). */
export function isLogisticsHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  return e.key.toLowerCase() === LOGISTICS_HOTKEY || e.code === LOGISTICS_HOTKEY_CODE;
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

/**
 * True when the target is a control that Space and Enter activate natively.
 *
 * `isEditableTarget` deliberately excludes buttons so gameplay hotkeys keep working while
 * a HUD button holds focus; Space is the exception, because swallowing it pauses the game
 * instead of pressing the focused button.
 */
export function isActivatableTarget(target: EventTarget | null): boolean {
  const el = (target instanceof HTMLElement ? target : null)
    ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!el) return false;
  if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SUMMARY') return true;
  const role = el.getAttribute('role');
  return role === 'button' || role === 'switch' || role === 'menuitem' || role === 'tab';
}