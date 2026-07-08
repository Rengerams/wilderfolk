const AUTOSAVE_KEY = 'wilderfolk-autosave';
const TUTORIALS_ENABLED_KEY = 'wilderfolk-tutorials-enabled';
const JUICE_EFFECTS_KEY = 'wilderfolk-juice-effects';
const FIRST_NIGHT_WARNING_KEY = 'wilderfolk-first-night-warning-dismissed';

let cachedJuiceEffects: boolean | null = null;

function readBoolPreference(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    if (raw == null) return defaultValue;
  } catch { /* ignore */ }
  return defaultValue;
}

function writeBoolPreference(key: string, enabled: boolean): void {
  try {
    localStorage.setItem(key, enabled ? '1' : '0');
  } catch { /* ignore */ }
}

export function loadAutoSavePreference(): boolean {
  return readBoolPreference(AUTOSAVE_KEY, true);
}

export function saveAutoSavePreference(enabled: boolean): void {
  writeBoolPreference(AUTOSAVE_KEY, enabled);
}

export function loadTutorialsEnabled(): boolean {
  return readBoolPreference(TUTORIALS_ENABLED_KEY, true);
}

export function saveTutorialsEnabled(enabled: boolean): void {
  writeBoolPreference(TUTORIALS_ENABLED_KEY, enabled);
}

export function loadJuiceEffectsEnabled(): boolean {
  if (cachedJuiceEffects !== null) return cachedJuiceEffects;
  cachedJuiceEffects = readBoolPreference(JUICE_EFFECTS_KEY, true);
  return cachedJuiceEffects;
}

export function saveJuiceEffectsEnabled(enabled: boolean): void {
  cachedJuiceEffects = enabled;
  writeBoolPreference(JUICE_EFFECTS_KEY, enabled);
}

export function loadFirstNightWarningDismissed(): boolean {
  try {
    return localStorage.getItem(FIRST_NIGHT_WARNING_KEY) === '1';
  } catch { /* ignore */ }
  return false;
}

export function saveFirstNightWarningDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(FIRST_NIGHT_WARNING_KEY, '1');
    } else {
      localStorage.removeItem(FIRST_NIGHT_WARNING_KEY);
    }
  } catch { /* ignore */ }
}