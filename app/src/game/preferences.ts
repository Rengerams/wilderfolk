const AUTOSAVE_KEY = 'wilderfolk-autosave';
const TUTORIALS_ENABLED_KEY = 'wilderfolk-tutorials-enabled';
const JUICE_EFFECTS_KEY = 'wilderfolk-juice-effects';
const FIRST_NIGHT_WARNING_KEY = 'wilderfolk-first-night-warning-dismissed';

let cachedJuiceEffects: boolean | null = null;

export function loadAutoSavePreference(): boolean {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch { /* ignore */ }
  return true;
}

export function saveAutoSavePreference(enabled: boolean): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, enabled ? '1' : '0');
  } catch { /* ignore */ }
}

export function loadTutorialsEnabled(): boolean {
  try {
    return localStorage.getItem(TUTORIALS_ENABLED_KEY) !== '0';
  } catch { /* ignore */ }
  return true;
}

export function saveTutorialsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TUTORIALS_ENABLED_KEY, enabled ? '1' : '0');
  } catch { /* ignore */ }
}

export function loadJuiceEffectsEnabled(): boolean {
  if (cachedJuiceEffects !== null) return cachedJuiceEffects;
  try {
    if (localStorage.getItem(JUICE_EFFECTS_KEY) === '0') {
      cachedJuiceEffects = false;
      return false;
    }
  } catch { /* ignore */ }
  cachedJuiceEffects = true;
  return true;
}

export function saveJuiceEffectsEnabled(enabled: boolean): void {
  cachedJuiceEffects = enabled;
  try {
    localStorage.setItem(JUICE_EFFECTS_KEY, enabled ? '1' : '0');
  } catch { /* ignore */ }
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