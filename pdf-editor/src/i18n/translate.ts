import { currentSettings } from "../storage/settings"
import { DEFAULT_LANGUAGE, normalizeLanguage, type LanguageCode } from "./languages"
import { nl } from "./nl"

export type MessageValues = Record<string, string | number>

/** Catalogs hold the source message (English) as key, so a missing entry falls back to English. */
const CATALOGS: Partial<Record<LanguageCode, Record<string, string>>> = { nl }

export function translate(language: LanguageCode, message: string, values?: MessageValues): string {
  const template = language === DEFAULT_LANGUAGE ? message : CATALOGS[language]?.[message] ?? message
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  )
}

export function currentLanguage(): LanguageCode {
  return normalizeLanguage(currentSettings().language)
}

/** For messages built outside React: store mutations and document actions. */
export function t(message: string, values?: MessageValues): string {
  return translate(currentLanguage(), message, values)
}
