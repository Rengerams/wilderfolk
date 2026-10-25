import * as pdfjsLib from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import type { PDFDocumentProxy } from "pdfjs-dist"
import type { DocMetadata, PageSize, Rect, Rotation } from "../types"
import { t } from "../i18n/translate"
import { decryptPdfBytes } from "./decrypt"
import { normalizeRotation } from "./geometry"
import { customTagsFromInfo } from "./metadataTags"

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_SOURCE_BYTES = 150 * 1024 * 1024
const MAX_RENDER_PIXELS = 14_000_000

type SourcePageMeta = { size: PageSize; authoredRotation: Rotation }

export type PdfSource = {
  name: string
  doc: PDFDocumentProxy
  pageMeta: SourcePageMeta[]
  task: ReturnType<typeof pdfjsLib.getDocument>
  /** The decrypted file bytes when the document was locked, otherwise the file as it arrived. */
  bytes: Uint8Array
}

/** Renders untrusted files with scripting and eval disabled. */
export async function openPdfSource(
  bytes: Uint8Array,
  name: string,
  options: { password?: string } = {},
): Promise<PdfSource> {
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new Error(t("This file is larger than 150 MB and cannot be opened."))
  }
  const readable = (await decryptPdfBytes(bytes, options.password)) ?? bytes
  // pdf.js transfers the buffer to its worker, so it must receive a copy. Document JavaScript is
  // never enabled, which is what keeps scripts inside a PDF from running here.
  const task = pdfjsLib.getDocument({
    data: readable.slice(),
    useSystemFonts: true,
  })
  const doc = await task.promise
  const pageMeta: SourcePageMeta[] = []
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index)
    const viewport = page.getViewport({ scale: 1 })
    const authored = normalizeRotation(page.rotate ?? 0)
    const swapped = authored === 90 || authored === 270
    pageMeta.push({
      size: swapped
        ? { width: viewport.height, height: viewport.width }
        : { width: viewport.width, height: viewport.height },
      authoredRotation: authored,
    })
    page.cleanup()
  }
  return { name, doc, pageMeta, task, bytes: readable }
}

export async function closePdfSource(source: PdfSource | null): Promise<void> {
  if (!source) return
  await source.task.destroy()
}

function clampScale(width: number, height: number, scale: number): number {
  const pixels = width * height * scale * scale
  if (pixels <= MAX_RENDER_PIXELS) return scale
  return Math.max(0.1, scale * Math.sqrt(MAX_RENDER_PIXELS / pixels))
}

/** Renders one page into an existing canvas; `signal` cancels the page when the view moves on. */
export async function renderPageInto(input: {
  source: PdfSource
  srcIndex: number
  totalRotation: Rotation
  scale: number
  canvas: HTMLCanvasElement
  dpr: number
  signal?: AbortSignal
}): Promise<void> {
  const { source, srcIndex, totalRotation, scale, canvas, dpr, signal } = input
  if (signal?.aborted) return
  const page = await source.doc.getPage(srcIndex + 1)
  try {
    const base = page.getViewport({ scale: 1, rotation: totalRotation })
    const effective = clampScale(base.width, base.height, scale * dpr)
    const viewport = page.getViewport({ scale: effective, rotation: totalRotation })
    // pdf.js paints into the canvas' current back buffer, so the target must be sized first.
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const task = page.render({ canvas, viewport, background: "#ffffff" })
    const cancel = () => task.cancel()
    signal?.addEventListener("abort", cancel, { once: true })
    try {
      await task.promise
    } finally {
      signal?.removeEventListener("abort", cancel)
    }
    const context = canvas.getContext("2d")
    if (context && Math.abs(effective - scale * dpr) > 0.001) {
      // Oversized pages render at a reduced scale; report the factor on the element for layout.
      canvas.dataset.renderScale = (effective / dpr).toFixed(4)
    } else if (canvas.dataset.renderScale) {
      delete canvas.dataset.renderScale
    }
  } finally {
    page.cleanup()
  }
}

export async function renderPageCanvas(input: {
  source: PdfSource
  srcIndex: number
  totalRotation: Rotation
  scale: number
  dpr?: number
}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas")
  await renderPageInto({ ...input, canvas, dpr: input.dpr ?? 1 })
  return canvas
}

function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const swapped = Math.abs(degrees) % 180 === 90
  const output = document.createElement("canvas")
  output.width = swapped ? source.height : source.width
  output.height = swapped ? source.width : source.height
  const context = output.getContext("2d")
  if (!context) return source
  context.translate(output.width / 2, output.height / 2)
  context.rotate((degrees * Math.PI) / 180)
  context.drawImage(source, -source.width / 2, -source.height / 2)
  return output
}

/** Extracts the picture inside a drawn region as a PNG data URL, upright in page space. */
export async function cropRegionDataUrl(input: {
  source: PdfSource
  srcIndex: number
  totalRotation: Rotation
  displayRect: Rect
  scale: number
}): Promise<string> {
  const rendered = await renderPageCanvas({
    source: input.source,
    srcIndex: input.srcIndex,
    totalRotation: input.totalRotation,
    scale: input.scale,
  })
  const x = Math.max(0, Math.round(input.displayRect.x * rendered.width))
  const y = Math.max(0, Math.round(input.displayRect.y * rendered.height))
  const width = Math.max(1, Math.min(rendered.width - x, Math.round(input.displayRect.w * rendered.width)))
  const height = Math.max(1, Math.min(rendered.height - y, Math.round(input.displayRect.h * rendered.height)))
  const crop = document.createElement("canvas")
  crop.width = width
  crop.height = height
  const context = crop.getContext("2d")
  if (!context) throw new Error(t("Canvas is not available in this browser."))
  context.drawImage(rendered, x, y, width, height, 0, 0, width, height)
  // The crop comes from the displayed page, so undo the display rotation to get page space.
  const upright = input.totalRotation === 0 ? crop : rotateCanvas(crop, -input.totalRotation)
  return upright.toDataURL("image/png")
}

export async function extractTextFromSource(source: PdfSource): Promise<string> {
  const pages: string[] = []
  for (let index = 1; index <= source.doc.numPages; index += 1) {
    const page = await source.doc.getPage(index)
    try {
      const content = await page.getTextContent()
      let line = ""
      const lines: string[] = []
      for (const item of content.items) {
        if (!("str" in item)) continue
        line += item.str
        if (item.hasEOL) {
          lines.push(line.trim())
          line = ""
        }
      }
      if (line.trim().length > 0) lines.push(line.trim())
      pages.push(lines.filter((entry) => entry.length > 0).join("\n"))
    } finally {
      page.cleanup()
    }
  }
  return pages.join("\n\n")
}

function parsePdfDate(value: string | undefined): string {
  if (!value) return ""
  const match = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(value)
  if (!match) {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? "" : fallback.toISOString()
  }
  const [, year, month = "01", day = "01", hour = "00", minute = "00", second = "00"] = match
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

/** Reads the file's own document information so the user starts from the real values. */
export type SourceMetadata = {
  metadata: Partial<DocMetadata>
  customTags: Record<string, string>
  xmp: string | null
}

export async function readSourceMetadata(source: PdfSource): Promise<SourceMetadata> {
  const raw = await source.doc.getMetadata()
  const info = (raw?.info ?? {}) as Record<string, unknown>
  const read = (key: string): string => {
    const value = info[key]
    return typeof value === "string" ? value : ""
  }
  const keywords = read("Keywords")
  // pdf.js exposes the raw XMP packet on a lightly typed Metadata wrapper.
  const rawXmp = (raw?.metadata as unknown as { raw?: unknown } | undefined)?.raw
  const xmp = typeof rawXmp === "string" ? rawXmp : null
  return {
    metadata: {
      title: read("Title"),
      author: read("Author"),
      subject: read("Subject"),
      keywords,
      creator: read("Creator"),
      producer: read("Producer"),
      creationDate: parsePdfDate(read("CreationDate")),
      modificationDate: parsePdfDate(read("ModDate")),
    },
    customTags: customTagsFromInfo(info),
    xmp,
  }
}

/** Raw text runs of one page, used to locate text that the user wants to replace. */
export type TextRunItem = {
  str: string
  transform: number[]
  width: number
  height: number
}

export async function readPageTextRuns(
  source: PdfSource,
  srcIndex: number,
): Promise<TextRunItem[]> {
  const page = await source.doc.getPage(srcIndex + 1)
  try {
    const content = await page.getTextContent()
    const items: TextRunItem[] = []
    for (const item of content.items) {
      if (!("str" in item) || item.str.length === 0) continue
      items.push({
        str: item.str,
        transform: Array.from(item.transform as number[]),
        width: item.width,
        height: item.height,
      })
    }
    return items
  } finally {
    page.cleanup()
  }
}

function toHex(r: number, g: number, b: number): string {
  const part = (value: number) => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0")
  return `#${part(r)}${part(g)}${part(b)}`
}

/** Reads the paper colour and the ink colour around a region, so replacements match the page. */
export async function sampleRegionStyle(input: {
  source: PdfSource
  srcIndex: number
  totalRotation: Rotation
  displayRect: Rect
  scale: number
}): Promise<{ background: string; textColor: string }> {
  const rendered = await renderPageCanvas({
    source: input.source,
    srcIndex: input.srcIndex,
    totalRotation: input.totalRotation,
    scale: input.scale,
  })
  const context = rendered.getContext("2d")
  if (!context) return { background: "#ffffff", textColor: "#111111" }
  const x = Math.max(0, Math.round(input.displayRect.x * rendered.width))
  const y = Math.max(0, Math.round(input.displayRect.y * rendered.height))
  const width = Math.max(1, Math.min(rendered.width - x, Math.round(input.displayRect.w * rendered.width)))
  const height = Math.max(1, Math.min(rendered.height - y, Math.round(input.displayRect.h * rendered.height)))
  const data = context.getImageData(x, y, width, height).data

  const around = context.getImageData(
    Math.max(0, x - 2),
    Math.max(0, y - 2),
    Math.min(rendered.width - Math.max(0, x - 2), width + 4),
    Math.min(rendered.height - Math.max(0, y - 2), height + 4),
  ).data
  let paperR = 0
  let paperG = 0
  let paperB = 0
  let samples = 0
  for (let index = 0; index < around.length; index += 4) {
    paperR += around[index]
    paperG += around[index + 1]
    paperB += around[index + 2]
    samples += 1
  }
  const background = samples > 0
    ? toHex(paperR / samples, paperG / samples, paperB / samples)
    : "#ffffff"

  let bestDistance = -1
  let inkR = 17
  let inkG = 17
  let inkB = 17
  for (let index = 0; index < data.length; index += 4) {
    const distance =
      Math.abs(data[index] - paperR / Math.max(1, samples)) +
      Math.abs(data[index + 1] - paperG / Math.max(1, samples)) +
      Math.abs(data[index + 2] - paperB / Math.max(1, samples))
    if (distance > bestDistance) {
      bestDistance = distance
      inkR = data[index]
      inkG = data[index + 1]
      inkB = data[index + 2]
    }
  }
  return { background, textColor: toHex(inkR, inkG, inkB) }
}
