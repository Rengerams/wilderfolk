import type { Annotation, PageRef, Rect } from "../types"
import { t } from "../i18n/translate"
import { createId, totalRotation } from "../pdf/pages"
import { rotateRect } from "../pdf/geometry"
import { readPageTextRuns, sampleRegionStyle } from "../pdf/render"
import { findTextMatches, fitFontSize, type TextHit } from "../pdf/textReplace"
import { getCurrentSource } from "./sourceRegistry"
import { useEditor } from "./store"

export type SearchScope = "current" | "all"

export const MAX_TEXT_HITS = 300

function activePage(): PageRef | null {
  const state = useEditor.getState()
  return state.doc.pages.find((page) => page.id === state.activePageId) ?? state.doc.pages[0] ?? null
}

/** Searches text that is already inside the open PDF file. */
export async function searchDocumentText(needle: string, scope: SearchScope): Promise<TextHit[]> {
  const state = useEditor.getState()
  const source = getCurrentSource()
  if (!source) {
    throw new Error(
      t(
        "Only text inside an opened PDF file can be found. Text added in the editor is edited directly on the page.",
      ),
    )
  }
  if (needle.trim().length === 0) return []

  const candidates = scope === "all" ? state.doc.pages : [activePage()].filter((page) => page !== null)
  const hits: TextHit[] = []
  for (const page of candidates) {
    if (page.kind !== "source") continue
    const items = await readPageTextRuns(source, page.srcIndex)
    hits.push(
      ...findTextMatches({
        items,
        needle,
        srcIndex: page.srcIndex,
        pageWidth: page.width,
        pageHeight: page.height,
      }),
    )
    if (hits.length >= MAX_TEXT_HITS) break
  }
  return hits.slice(0, MAX_TEXT_HITS)
}

/** Covers each match with the page's own colour and types the new text in its place. */
export async function replaceTextHits(input: {
  hits: TextHit[]
  replacement: string
  matchPageStyle: boolean
}): Promise<number> {
  const state = useEditor.getState()
  const source = getCurrentSource()
  if (!source) throw new Error(t("Open a PDF file first."))
  if (input.hits.length === 0) return 0

  const created: Annotation[] = []
  for (const hit of input.hits) {
    const page = state.doc.pages.find(
      (entry) => entry.kind === "source" && entry.srcIndex === hit.srcIndex,
    )
    if (!page || page.kind !== "source") continue
    const rotation = totalRotation(page)
    const style = input.matchPageStyle
      ? await sampleRegionStyle({
          source,
          srcIndex: page.srcIndex,
          totalRotation: rotation,
          displayRect: rotateRect(hit.rect, rotation),
          scale: 2,
        })
      : { background: "#ffffff", textColor: "#111111" }

    const padding = hit.rect.h * 0.2
    const cover: Rect = {
      x: hit.rect.x,
      y: Math.max(0, hit.rect.y - padding),
      w: hit.rect.w,
      h: hit.rect.h + padding * 2,
    }
    created.push({
      id: createId("ann"),
      pageId: page.id,
      type: "shape",
      rect: cover,
      stroke: style.background,
      fill: style.background,
      fillOpacity: 1,
      lineWidth: 0.5,
    })

    if (input.replacement.length > 0) {
      created.push({
        id: createId("ann"),
        pageId: page.id,
        type: "text",
        rect: {
          x: hit.rect.x,
          y: Math.max(0, hit.rect.y - padding * 0.6),
          w: Math.max(hit.rect.w, 0.08),
          h: hit.rect.h + padding,
        },
        text: input.replacement,
        fontSize: fitFontSize(hit.fontSize, hit.rect.w * page.width, input.replacement),
        color: style.textColor,
      })
    }
  }

  state.addAnnotations(created)
  useEditor
    .getState()
    .setStatus(
      t(
        input.hits.length === 1
          ? "Replaced {count} match — undo with Ctrl+Z"
          : "Replaced {count} matches — undo with Ctrl+Z",
        { count: input.hits.length },
      ),
    )
  return created.length
}
