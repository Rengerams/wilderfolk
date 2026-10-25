import type { Annotation, PageRef, TextAnnotation } from "../types"
import { t } from "../i18n/translate"
import { createId } from "./pages"

export type PageNumberPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export type PageNumberFormat = "plain" | "of-total" | "page" | "page-of"

export type PageNumberOptions = {
  position: PageNumberPosition
  format: PageNumberFormat
  startAt: number
  fontSize: number
  /** 1-based, inclusive; the last page index is clamped to the document. */
  from: number
  to: number
}

const MARGIN = 0.05
const LINE_HEIGHT = 1.28
/** Digits run about 0.62 em wide; the text box is sized to them so the chosen edge lines up. */
const CHARACTER_WIDTH = 0.62

export function pageNumberLabel(format: PageNumberFormat, number: number, total: number): string {
  switch (format) {
    case "of-total":
      return `${number} / ${total}`
    case "page":
      return `${t("Page")} ${number}`
    case "page-of":
      return t("Page {number} of {total}", { number, total })
    default:
      return String(number)
  }
}

/** One text stamp per page in the range, positioned along the chosen edge. */
export function pageNumberStamps(pages: PageRef[], options: PageNumberOptions): Annotation[] {
  const total = pages.length
  const from = Math.max(1, Math.min(options.from, options.to))
  const to = Math.min(pages.length, Math.max(options.from, options.to))
  const [, edge = "left"] = options.position.split("-")
  const stamps: Annotation[] = []

  for (let index = from - 1; index < to; index += 1) {
    const page = pages[index]
    if (!page) continue
    const text = pageNumberLabel(options.format, options.startAt + (index - (from - 1)), total)
    const width = Math.min(0.9, (text.length * options.fontSize * CHARACTER_WIDTH) / page.width)
    const height = (options.fontSize * LINE_HEIGHT) / page.height
    const x = edge === "center" ? (1 - width) / 2 : edge === "right" ? 1 - MARGIN - width : MARGIN
    const y = options.position.startsWith("top") ? MARGIN : 1 - MARGIN - height
    const stamp: TextAnnotation = {
      id: createId("ann"),
      pageId: page.id,
      type: "text",
      rect: { x, y, w: width, h: height },
      text,
      fontSize: options.fontSize,
      color: "#000000",
    }
    stamps.push(stamp)
  }
  return stamps
}
