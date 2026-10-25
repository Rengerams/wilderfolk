import { t } from "../i18n/translate"
import { buildPdfBytes } from "../pdf/buildPdf"
import {
  chunkPageRanges,
  parsePageRanges,
  splitFileName,
  type SplitPart,
} from "../pdf/splitPdf"
import { baseNameOf } from "./documentActions"
import { useEditor } from "./store"

export type SplitOutput = { filename: string; bytes: Uint8Array; from: number; to: number }

export type SplitRequest =
  | { mode: "pages"; pagesPerFile: number }
  | { mode: "size"; maxBytes: number }
  | { mode: "ranges"; input: string }

export type SplitProgress = (progress: number, label: string) => void

const MIN_PAGE_BYTES = 8 * 1024
const PAGE_OVERHEAD_BYTES = 12 * 1024

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Splits the current document into independent PDFs; the editor itself is left untouched. */
export async function splitDocument(
  request: SplitRequest,
  onProgress: SplitProgress,
): Promise<SplitOutput[]> {
  const { doc } = useEditor.getState()
  const pageCount = doc.pages.length
  if (pageCount === 0) throw new Error(t("Add at least one page before splitting."))
  const baseName = baseNameOf(doc.name)

  const build = async (part: SplitPart): Promise<Uint8Array> => {
    const pages = doc.pages.slice(part.from - 1, part.to)
    const pageIds = new Set(pages.map((page) => page.id))
    return buildPdfBytes({
      sourceBytes: doc.source?.bytes ?? null,
      pages,
      annotations: doc.annotations.filter((annotation) => pageIds.has(annotation.pageId)),
      ocr: doc.ocr.filter((layer) => pageIds.has(layer.pageId)),
      metadata: doc.metadata,
      watermark: doc.watermark,
      includeOcr: true,
    })
  }

  const outputs: SplitOutput[] = []
  const addOutput = (part: SplitPart, bytes: Uint8Array): void => {
    outputs.push({
      filename: splitFileName(baseName, outputs.length + 1, part),
      bytes,
      from: part.from,
      to: part.to,
    })
  }

  if (request.mode === "size") {
    const limit = Math.max(64 * 1024, Math.floor(request.maxBytes))
    const averagePage = Math.max(
      MIN_PAGE_BYTES,
      (doc.source?.bytes.byteLength ?? pageCount * PAGE_OVERHEAD_BYTES) / pageCount,
    )
    let start = 1
    while (start <= pageCount) {
      const remaining = pageCount - start + 1
      let take = Math.min(remaining, Math.max(1, Math.floor(limit / averagePage)))
      let part: SplitPart = { from: start, to: start + take - 1 }
      let bytes = await build(part)
      // Shrink by the measured overshoot until the part fits; a lone page is always kept.
      while (bytes.byteLength > limit && take > 1) {
        const scaled = Math.floor((take * limit * 0.97) / bytes.byteLength)
        take = Math.max(1, Math.min(take - 1, scaled))
        part = { from: start, to: start + take - 1 }
        bytes = await build(part)
      }
      addOutput(part, bytes)
      start = part.to + 1
      onProgress(
        (start - 1) / pageCount,
        t("Building part {number}…", { number: outputs.length }),
      )
      await nextFrame()
    }
    onProgress(1, t("Preparing the files…"))
    return outputs
  }

  const parts =
    request.mode === "pages"
      ? chunkPageRanges(pageCount, request.pagesPerFile)
      : parsePageRanges(request.input, pageCount)

  for (const [index, part] of parts.entries()) {
    addOutput(part, await build(part))
    onProgress(
      (index + 1) / parts.length,
      t("Building part {number}…", { number: index + 1 }),
    )
    await nextFrame()
  }
  onProgress(1, t("Preparing the files…"))
  return outputs
}
