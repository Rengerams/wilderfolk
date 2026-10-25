/** Info-dictionary entries pdf.js reads beyond the standard eight, as a string map. */
export function customTagsFromInfo(info: Record<string, unknown>): Record<string, string> {
  const raw = info["Custom"]
  const entries = raw instanceof Map ? Array.from(raw) : Object.entries(raw ?? {})
  const tags: Record<string, string> = {}
  for (const [key, value] of entries) {
    const text =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : ""
    if (key.trim().length > 0 && text.trim().length > 0) tags[key] = text
  }
  return tags
}
