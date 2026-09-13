const AUTOSAVE_KEY = 'wilderfolk-autosave';
const TUTORIALS_ENABLED_KEY = 'wilderfolk-tutorials-enabled';
const JUICE_EFFECTS_KEY = 'wilderfolk-juice-effects';
const FIRST_NIGHT_WARNING_KEY = 'wilderfolk-first-night-warning-dismissed';
const SHOW_SIM_TICK_KEY = 'wilderfolk-show-sim-tick';
const SHOW_FPS_KEY = 'wilderfolk-show-fps';
const TUTORIAL_CHOICE_KEY = 'wilderfolk-tutorial-choice';

let cachedJuiceEffects: boolean | null = null;

/** Safely resolves the storage API across browser, private browsing, and headless runtimes. */
function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function readBoolPreference(key: string, defaultValue: boolean): boolean {
  try {
    const storage = getStorage();
    if (!storage) return defaultValue;
    const raw = storage.getItem(key);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    if (raw == null) return defaultValue;
  } catch {
    return defaultValue;
  }
  return defaultValue;
}

function writeBoolPreference(key: string, enabled: boolean): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(key, enabled ? '1' : '0');
  } catch {
    /* ignore storage quotas / private mode errors */
  }
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

/** Per-new-game choice: play the first-spring guide or start free. */
export function loadTutorialChoice(): boolean {
  return readBoolPreference(TUTORIAL_CHOICE_KEY, true);
}

export function saveTutorialChoice(enabled: boolean): void {
  writeBoolPreference(TUTORIAL_CHOICE_KEY, enabled);
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
  return readBoolPreference(FIRST_NIGHT_WARNING_KEY, false);
}

export function saveFirstNightWarningDismissed(dismissed: boolean): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (dismissed) {
      storage.setItem(FIRST_NIGHT_WARNING_KEY, '1');
    } else {
      storage.removeItem(FIRST_NIGHT_WARNING_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function loadShowSimTick(): boolean {
  return readBoolPreference(SHOW_SIM_TICK_KEY, false);
}

export function saveShowSimTick(enabled: boolean): void {
  writeBoolPreference(SHOW_SIM_TICK_KEY, enabled);
}

export function loadShowFps(): boolean {
  return readBoolPreference(SHOW_FPS_KEY, false);
}

export function saveShowFps(enabled: boolean): void {
  writeBoolPreference(SHOW_FPS_KEY, enabled);
}

/** Resets in-memory preference caches (primarily for unit tests and session resets). */
export function resetPreferencesCache(): void {
  cachedJuiceEffects = null;
}