import type { PageRef, PageSize, Rotation } from "../types"
import { normalizeRotation } from "./geometry"

export const PAGE_PRESETS = [
  { id: "a4", label: "A4 — 210 × 297 mm", width: 595.28, height: 841.89 },
  { id: "a5", label: "A5 — 148 × 210 mm", width: 419.53, height: 595.28 },
  { id: "a3", label: "A3 — 297 × 420 mm", width: 841.89, height: 1190.55 },
  { id: "letter", label: "Letter — 8.5 × 11 in", width: 612, height: 792 },
  { id: "legal", label: "Legal — 8.5 × 14 in", width: 612, height: 1008 },
  { id: "tabloid", label: "Tabloid — 11 × 17 in", width: 792, height: 1224 },
  { id: "square", label: "Square — 210 × 210 mm", width: 595.28, height: 595.28 },
] as const

export type PagePresetId = (typeof PAGE_PRESETS)[number]["id"]

export const DEFAULT_PRESET_ID: PagePresetId = "a4"

export function presetById(id: string): PageSize {
  const preset = PAGE_PRESETS.find((entry) => entry.id === id) ?? PAGE_PRESETS[0]
  return { width: preset.width, height: preset.height }
}

export function orientSize(size: PageSize, orientation: "portrait" | "landscape"): PageSize {
  const isLandscape = size.width > size.height
  if ((orientation === "landscape") === isLandscape) return size
  return { width: size.height, height: size.width }
}

let idCounter = 0

export function createId(prefix: string): string {
  idCounter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${random}`
}

export function blankPage(size: PageSize, rotation: Rotation = 0): PageRef {
  return {
    id: createId("page"),
    kind: "blank",
    width: size.width,
    height: size.height,
    rotation,
  }
}

export function sourcePage(input: {
  srcIndex: number
  size: PageSize
  authoredRotation: Rotation
}): PageRef {
  return {
    id: createId("page"),
    kind: "source",
    srcIndex: input.srcIndex,
    width: input.size.width,
    height: input.size.height,
    authoredRotation: input.authoredRotation,
    rotation: 0,
  }
}

/** Rotation the page is displayed with: the file's own rotation plus the user's. */
export function totalRotation(page: PageRef): Rotation {
  const authored = page.kind === "source" ? page.authoredRotation : 0
  return normalizeRotation(authored + page.rotation)
}

export function pageIndexById(pages: PageRef[], pageId: string): number {
  return pages.findIndex((page) => page.id === pageId)
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim()
  return cleaned.length > 0 ? cleaned : "document"
}

export function withPdfExtension(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
