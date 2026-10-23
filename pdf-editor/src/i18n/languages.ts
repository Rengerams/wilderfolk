/** Interface languages the editor can be shown in. English is also the source language of every message. */

export type LanguageCode = "en" | "nl"

export type LanguageOption = { code: LanguageCode; label: string }

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "nl", label: "Nederlands" },
]

export const DEFAULT_LANGUAGE: LanguageCode = "en"

/** Unknown or missing codes fall back to English instead of leaving the interface untranslated. */
export function normalizeLanguage(value: unknown): LanguageCode {
  return LANGUAGES.some((entry) => entry.code === value) ? (value as LanguageCode) : DEFAULT_LANGUAGE
}
