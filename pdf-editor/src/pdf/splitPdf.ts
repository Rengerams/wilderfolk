import { t } from "../i18n/translate"

export type SplitMode = "pages" | "size" | "ranges"

/** A run of pages, 1-based and inclusive. */
export type SplitPart = { from: number; to: number }

/** `1-3, 5, 8-10` — every entry becomes one file. */
export function parsePageRanges(input: string, pageCount: number): SplitPart[] {
  const parts: SplitPart[] = []
  for (const raw of input.split(",")) {
    const token = raw.trim()
    if (token.length === 0) continue
    const match = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(token)
    if (!match) throw new Error(t("Use page numbers like 1-3, 5 or 8-10."))
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : start
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) {
      throw new Error(t("Use page numbers like 1-3, 5 or 8-10."))
    }
    if (start > pageCount || end > pageCount) {
      throw new Error(t("Pages go up to {count}.", { count: pageCount }))
    }
    parts.push({ from: Math.min(start, end), to: Math.max(start, end) })
  }
  if (parts.length === 0) throw new Error(t("Enter at least one page or range."))
  return parts
}

/** Even chunks of `pagesPerFile` pages, covering the document from page 1. */
export function chunkPageRanges(pageCount: number, pagesPerFile: number): SplitPart[] {
  const size = Math.max(1, Math.floor(pagesPerFile))
  const parts: SplitPart[] = []
  for (let from = 1; from <= pageCount; from += size) {
    parts.push({ from, to: Math.min(pageCount, from + size - 1) })
  }
  return parts
}

/** `Report-part-01-pages-1-10.pdf` — sorts in reading order and names both ends of the part. */
export function splitFileName(baseName: string, index: number, part: SplitPart): string {
  const number = String(index).padStart(2, "0")
  const pages = part.from === part.to ? `page-${part.from}` : `pages-${part.from}-${part.to}`
  return `${baseName}-part-${number}-${pages}.pdf`
}
