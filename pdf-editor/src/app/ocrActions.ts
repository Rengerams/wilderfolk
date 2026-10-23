import type { PageRef } from "../types"
import { recognizeImagePage, recognizePage, type OcrProgress } from "../pdf/ocr"
import { totalRotation } from "../pdf/pages"
import { t } from "../i18n/translate"
import { getCurrentSource } from "./sourceRegistry"
import { useEditor } from "./store"

export type OcrOutcome = { pages: number; lines: number }

/** A page is recognizable when it came from a PDF file or holds one picture (scanned/imported). */
export function pageCanBeRecognized(page: PageRef, imageCount: number): boolean {
  if (page.kind === "source" && getCurrentSource()) return true
  return imageCount === 1
}

async function recognizeOnePage(
  page: PageRef,
  languages: string[],
  onProgress: (progress: OcrProgress) => void,
): Promise<number> {
  const state = useEditor.getState()
  const source = getCurrentSource()
  const languageKey = languages.join("+")

  if (page.kind === "source" && source) {
    const result = await recognizePage({
      source,
      srcIndex: page.srcIndex,
      totalRotation: totalRotation(page),
      languages,
      onProgress,
    })
    state.setOcrLayer({
      pageId: page.id,
      language: languageKey,
      lines: result.lines,
      confidence: result.confidence,
      applied: false,
    })
    return result.lines.length
  }

  const image = state.doc.annotations.find(
    (annotation) => annotation.pageId === page.id && annotation.type === "image",
  )
  if (!image || image.type !== "image") {
    throw new Error(
      t("This page has no picture to recognize. Scanned and imported pages can be recognized."),
    )
  }
  const result = await recognizeImagePage({
    dataUrl: image.dataUrl,
    rect: image.rect,
    languages,
    onProgress,
  })
  state.setOcrLayer({
    pageId: page.id,
    language: languageKey,
    lines: result.lines,
    confidence: result.confidence,
    applied: false,
  })
  return result.lines.length
}

export async function recognizePagesToDraft(
  pageIds: string[],
  languages: string[],
  onProgress: (progress: OcrProgress) => void,
): Promise<OcrOutcome> {
  const state = useEditor.getState()
  let lines = 0
  let pages = 0
  for (const pageId of pageIds) {
    const page = state.doc.pages.find((entry) => entry.id === pageId)
    if (!page) continue
    lines += await recognizeOnePage(page, languages, onProgress)
    pages += 1
  }
  return { pages, lines }
}

export function applyOcrLayers(pageIds: string[]): void {
  const state = useEditor.getState()
  for (const pageId of pageIds) state.setOcrApplied(pageId, true)
}
