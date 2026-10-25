import { t } from "../i18n/translate"

export type SplitMode = "pages" | "size" | "ranges"

/** A run of pages, 1-based and inclusive. */
export type SplitPart = { from: number; to: number }

export type SplitBuild = (part: SplitPart) => Promise<Uint8Array>
export type SplitResult = { part: SplitPart; bytes: Uint8Array }
export type SplitProgress = (progress: number, partNumber: number) => void

export const MIN_SPLIT_BYTES = 100 * 1024
export const MAX_SPLIT_BYTES = 150 * 1024 * 1024
const MIN_PAGE_BYTES = 8 * 1024

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
      throw new Error(t("Page numbers start at 1."))
    }
    if (start > pageCount || end > pageCount) {
      throw new Error(t("Pages go up to {count}.", { count: pageCount }))
    }
    parts.push({ from: Math.min(start, end), to: Math.max(start, end) })
  }
  if (parts.length === 0) throw new Error(t("Enter at least one page or range."))
  return parts
}

/** Checked page count per file; the dialog and the split action share this rule. */
export function pagesPerFileValue(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(t("Choose at least one page per file."))
  }
  return Math.min(200, Math.floor(value))
}

/** Whole megabytes with one decimal, so the message never shows a byte fraction. */
function megabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

/** Checked maximum part size in bytes; the dialog and the split action share this rule. */
export function splitSizeLimit(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes < MIN_SPLIT_BYTES || bytes > MAX_SPLIT_BYTES) {
    throw new Error(
      t("Choose a file size between {min} MB and {max} MB.", {
        min: megabytes(MIN_SPLIT_BYTES),
        max: megabytes(MAX_SPLIT_BYTES),
      }),
    )
  }
  return Math.floor(bytes)
}

/** Even chunks of `pagesPerFile` pages, covering the document from page 1. */
export function chunkPageRanges(pageCount: number, pagesPerFile: number): SplitPart[] {
  const size = pagesPerFileValue(pagesPerFile)
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

/** Yields to the interface between builds so the progress bar keeps painting. */
function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Builds one PDF per planned part. */
export async function buildParts(
  parts: SplitPart[],
  build: SplitBuild,
  onProgress: SplitProgress,
): Promise<SplitResult[]> {
  const results: SplitResult[] = []
  for (const [index, part] of parts.entries()) {
    results.push({ part, bytes: await build(part) })
    onProgress((index + 1) / parts.length, index + 1)
    await breathe()
  }
  return results
}

export type SizeSplitInput = {
  pageCount: number
  limit: number
  /** Source bytes per page, used to guess the first chunk before measuring it. */
  averagePageBytes: number
  build: SplitBuild
  onProgress: SplitProgress
}

/** Greedy split: guess a chunk, measure it, shrink until it fits; an oversized page stays whole. */
export async function buildSizeParts(input: SizeSplitInput): Promise<SplitResult[]> {
  const { pageCount, build, onProgress } = input
  const limit = splitSizeLimit(input.limit)
  const averagePage = Math.max(MIN_PAGE_BYTES, input.averagePageBytes)
  const results: SplitResult[] = []
  let start = 1
  while (start <= pageCount) {
    const remaining = pageCount - start + 1
    let take = Math.min(remaining, Math.max(1, Math.floor(limit / averagePage)))
    let part: SplitPart = { from: start, to: start + take - 1 }
    let bytes = await build(part)
    while (bytes.byteLength > limit && take > 1) {
      const scaled = Math.floor((take * limit * 0.97) / bytes.byteLength)
      take = Math.max(1, Math.min(take - 1, scaled))
      part = { from: start, to: start + take - 1 }
      bytes = await build(part)
    }
    results.push({ part, bytes })
    start = part.to + 1
    onProgress((start - 1) / pageCount, results.length)
    await breathe()
  }
  onProgress(1, results.length)
  return results
}
