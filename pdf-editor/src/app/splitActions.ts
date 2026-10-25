import { t } from "../i18n/translate"
import { buildPdfBytes } from "../pdf/buildPdf"
import {
  buildParts,
  buildSizeParts,
  chunkPageRanges,
  pagesPerFileValue,
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

const PAGE_OVERHEAD_BYTES = 12 * 1024

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
      customTags: doc.customTags,
      watermark: doc.watermark,
      includeOcr: true,
    })
  }

  const report = (fraction: number, partNumber: number) =>
    onProgress(fraction, t("Building part {number}…", { number: partNumber }))

  const results =
    request.mode === "size"
      ? await buildSizeParts({
          pageCount,
          limit: request.maxBytes,
          averagePageBytes:
            (doc.source?.bytes.byteLength ?? pageCount * PAGE_OVERHEAD_BYTES) / pageCount,
          build,
          onProgress: report,
        })
      : await buildParts(
          request.mode === "pages"
            ? chunkPageRanges(pageCount, pagesPerFileValue(request.pagesPerFile))
            : parsePageRanges(request.input, pageCount),
          build,
          report,
        )

  onProgress(1, t("Preparing the files…"))
  return results.map((result, index) => ({
    filename: splitFileName(baseName, index + 1, result.part),
    bytes: result.bytes,
    from: result.part.from,
    to: result.part.to,
  }))
}
