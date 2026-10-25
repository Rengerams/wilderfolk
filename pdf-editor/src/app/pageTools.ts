import { t } from "../i18n/translate"
import { markRect, type RasterMark } from "../pdf/markImages"
import { createId, sanitizeFileName } from "../pdf/pages"
import { pageNumberStamps, type PageNumberOptions } from "../pdf/pageStamps"
import { selectActivePage, useEditor } from "./store"

/** Stamps page numbers on the chosen range; returns how many pages were stamped. */
export function applyPageNumbers(options: PageNumberOptions): number {
  const state = useEditor.getState()
  const stamps = pageNumberStamps(state.doc.pages, options)
  state.addAnnotations(stamps)
  return stamps.length
}

/** Places a signature or stamp picture on the current page, selected and ready to move. */
export function insertMarkImage(mark: RasterMark, widthFraction: number): boolean {
  const state = useEditor.getState()
  const page = selectActivePage(state)
  if (!page) return false
  state.addAnnotation({
    id: createId("ann"),
    pageId: page.id,
    type: "image",
    rect: markRect(mark, page, widthFraction),
    dataUrl: mark.dataUrl,
    mime: "image/png",
  })
  return true
}

/** Opens the chosen range as its own document; returns how many pages it holds. */
export function extractPageRange(from: number, to: number): number {
  const state = useEditor.getState()
  const pages = state.doc.pages
  if (pages.length === 0) return 0
  const start = Math.max(1, Math.min(from, to))
  const end = Math.min(pages.length, Math.max(from, to))
  const kept = pages.slice(start - 1, end)
  const keptIds = new Set(kept.map((page) => page.id))
  const base = state.doc.name.replace(/\.pdf$/i, "")
  state.replaceDocument({
    ...state.doc,
    id: createId("doc"),
    name: `${sanitizeFileName(base)} ${t("(pages {from}–{to})", { from: start, to: end })}.pdf`,
    pages: kept,
    annotations: state.doc.annotations.filter((annotation) => keptIds.has(annotation.pageId)),
    ocr: state.doc.ocr.filter((layer) => keptIds.has(layer.pageId)),
    dirty: true,
    savedAt: null,
  })
  return kept.length
}
