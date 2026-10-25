import { DEFAULT_LANGUAGE, normalizeLanguage, type LanguageCode } from "../i18n/languages"
import type { ThemeName } from "../types"

const STORAGE_KEY = "pdf-studio.settings.v1"

export type AppSettings = {
  provider: "local" | "cloud"
  cloudEndpoint: string
  cloudToken: string
  encryptLibrary: boolean
  defaultOcrLanguages: string[]
  theme: ThemeName
  language: LanguageCode
}

const DEFAULT_SETTINGS: AppSettings = {
  provider: "local",
  cloudEndpoint: "",
  cloudToken: "",
  encryptLibrary: false,
  defaultOcrLanguages: ["eng"],
  theme: "light",
  language: DEFAULT_LANGUAGE,
}

/** The library passphrase is never written to disk; it is kept for this session only. */
let sessionPassphrase = ""

export function getPassphrase(): string {
  return sessionPassphrase
}

export function setPassphrase(value: string): void {
  sessionPassphrase = value
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      language: normalizeLanguage(parsed.language),
      defaultOcrLanguages:
        Array.isArray(parsed.defaultOcrLanguages) && parsed.defaultOcrLanguages.length > 0
          ? parsed.defaultOcrLanguages
          : DEFAULT_SETTINGS.defaultOcrLanguages,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  const { cloudToken: _token, ...persisted } = settings
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...persisted, theme: settings.theme }),
    )
  } catch {
    // Storage can be unavailable in private windows; settings then apply to this session only.
  }
  applyTheme(settings.theme)
  applyLanguage(settings.language)
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}

export function applyLanguage(language: LanguageCode): void {
  document.documentElement.lang = language
}

export function isCloudConfigured(settings: AppSettings): boolean {
  return settings.provider === "cloud" && settings.cloudEndpoint.trim().length > 0
}

let active: AppSettings | null = null

export function currentSettings(): AppSettings {
  if (!active) active = loadSettings()
  return active
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  active = { ...currentSettings(), ...patch }
  saveSettings(active)
  return active
}
