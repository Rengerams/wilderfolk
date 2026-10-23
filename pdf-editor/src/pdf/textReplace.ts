import type { Rect } from "../types"
import { createId } from "./pages"
import type { TextRunItem } from "./render"

/** Finding and replacing text that is already in a PDF. */

export type TextHit = {
  id: string
  srcIndex: number
  rect: Rect
  text: string
  fontSize: number
}

type Run = {
  text: string
  items: { item: TextRunItem; start: number; end: number }[]
  baseline: number
  pageWidth: number
  pageHeight: number
}

const BASELINE_TOLERANCE = 2

function itemRect(item: TextRunItem, pageWidth: number, pageHeight: number): Rect {
  const [, , , scale, x, y] = item.transform
  const width = item.width > 0 ? item.width : Math.abs(scale) * item.str.length * 0.5
  const height = item.height > 0 ? item.height : Math.abs(scale)
  return {
    x: x / pageWidth,
    y: 1 - (y + height) / pageHeight,
    w: width / pageWidth,
    h: height / pageHeight,
  }
}

/** Consecutive runs that sit on the same baseline are joined, so a phrase split in two is still found. */
function buildRuns(items: TextRunItem[], pageWidth: number, pageHeight: number): Run[] {
  const runs: Run[] = []
  for (const item of items) {
    const baseline = item.transform[5]
    const current = runs[runs.length - 1]
    if (current && Math.abs(current.baseline - baseline) <= BASELINE_TOLERANCE) {
      const start = current.text.length
      current.text += item.str
      current.items.push({ item, start, end: start + item.str.length })
      continue
    }
    runs.push({
      text: item.str,
      items: [{ item, start: 0, end: item.str.length }],
      baseline,
      pageWidth,
      pageHeight,
    })
  }
  return runs
}

function unionRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
  return { x, y, w: right - x, h: bottom - y }
}

export function findTextMatches(input: {
  items: TextRunItem[]
  needle: string
  srcIndex: number
  pageWidth: number
  pageHeight: number
}): TextHit[] {
  const needle = input.needle.trim().toLowerCase()
  if (needle.length === 0) return []
  const hits: TextHit[] = []
  for (const run of buildRuns(input.items, input.pageWidth, input.pageHeight)) {
    const haystack = run.text.toLowerCase()
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      const end = index + needle.length
      const pieces: Rect[] = []
      for (const entry of run.items) {
        if (entry.end <= index || entry.start >= end) continue
        const rect = itemRect(entry.item, run.pageWidth, run.pageHeight)
        const length = Math.max(1, entry.end - entry.start)
        const from = Math.max(0, index - entry.start) / length
        const to = Math.min(length, end - entry.start) / length
        if (to <= from) continue
        pieces.push({
          x: rect.x + rect.w * from,
          y: rect.y,
          w: rect.w * (to - from),
          h: rect.h,
        })
      }
      if (pieces.length > 0) {
        const rect = unionRect(pieces)
        const fontSize = Math.abs(run.items[0].item.transform[3]) || rect.h * run.pageHeight
        hits.push({
          id: createId("hit"),
          srcIndex: input.srcIndex,
          rect,
          text: run.text.slice(index, end),
          fontSize: Math.max(4, Math.min(72, fontSize)),
        })
      }
      index = haystack.indexOf(needle, index + needle.length)
    }
  }
  return hits
}

/** Replacement text that is longer than the original is shrunk so it still fits the space. */
export function fitFontSize(original: number, boxWidth: number, text: string): number {
  if (text.length === 0) return original
  const estimated = 0.52 * original * text.length
  if (estimated <= boxWidth) return original
  return Math.max(5, Math.min(original, (original * boxWidth) / estimated))
}
