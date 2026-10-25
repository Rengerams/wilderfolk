import {
  BlendMode,
  LineCapStyle,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "@cantoo/pdf-lib"
import { t } from "../i18n/translate"
import type { Annotation, DocMetadata, OcrLayer, PageRef, Point, Rect, Watermark } from "../types"
import { pdfRect } from "./geometry"
import { totalRotation } from "./pages"

export type BuildInput = {
  sourceBytes: Uint8Array | null
  pages: PageRef[]
  annotations: Annotation[]
  ocr: OcrLayer[]
  metadata: DocMetadata
  /** Non-standard Info-dictionary entries written alongside the standard details. */
  customTags: Record<string, string>
  watermark: Watermark | null
  includeOcr: boolean
}

/** WinAnsi is what the standard fonts encode; unsupported characters become replacement marks. */
const WINANSI_UNSAFE =
  /[^\n\r\x20-\x7E\u00A0-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g

export function sanitizeForWinAnsi(text: string): string {
  return text.replace(WINANSI_UNSAFE, "?")
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return { r: 0, g: 0, b: 0 }
  const value = Number.parseInt(match[1], 16)
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  }
}

/** pdf-lib's `rgb()` takes numbers; colours in the document are hex strings. */
function pdfColor(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return rgb(r, g, b)
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error(t("The image data could not be read."))
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return { bytes, mime: match[1] }
}

function toPdfPoint(point: Point, width: number, height: number): Point {
  return { x: point.x * width, y: height * (1 - point.y) }
}

function drawTextBlock(
  page: PDFPage,
  font: PDFFont,
  annotation: { rect: Rect; text: string; fontSize: number; color: string },
  pageWidth: number,
  pageHeight: number,
): void {
  const lines = annotation.text.split("\n")
  const lineHeight = annotation.fontSize * 1.28
  const startY = pageHeight - annotation.rect.y * pageHeight - annotation.fontSize
  lines.forEach((line, index) => {
    if (line.length === 0) return
    page.drawText(sanitizeForWinAnsi(line), {
      x: annotation.rect.x * pageWidth + 2,
      y: startY - index * lineHeight,
      size: annotation.fontSize,
      font,
      color: pdfColor(annotation.color),
    })
  })
}

/** Centres the watermark on the page, rotating the text about its own centre. */
function drawWatermark(page: PDFPage, font: PDFFont, watermark: Watermark, ref: PageRef): void {
  const text = sanitizeForWinAnsi(watermark.text).trim()
  if (text.length === 0) return
  const size = watermark.fontSize
  const textWidth = font.widthOfTextAtSize(text, size)
  const textHeight = font.heightAtSize(size)
  const theta = (watermark.angle * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  page.drawText(text, {
    x: ref.width / 2 - (textWidth / 2) * cos + (textHeight / 2) * sin,
    y: ref.height / 2 - (textWidth / 2) * sin - (textHeight / 2) * cos,
    size,
    font,
    color: pdfColor(watermark.color),
    opacity: watermark.opacity,
    rotate: degrees(watermark.angle),
  })
}

async function drawAnnotation(
  page: PDFPage,
  target: PDFDocument,
  font: PDFFont,
  annotation: Annotation,
  ref: PageRef,
): Promise<void> {
  const width = ref.width
  const height = ref.height
  switch (annotation.type) {
    case "highlight": {
      const rect = pdfRect(annotation.rect, width, height)
      page.drawRectangle({
        ...rect,
        color: pdfColor(annotation.color),
        opacity: 0.35,
        blendMode: BlendMode.Multiply,
      })
      return
    }
    case "shape": {
      const rect = pdfRect(annotation.rect, width, height)
      const fill = annotation.fill
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        borderColor: pdfColor(annotation.stroke),
        borderWidth: annotation.lineWidth,
        ...(fill ? { color: pdfColor(fill), opacity: annotation.fillOpacity ?? 0.22 } : {}),
      })
      return
    }
    case "ink": {
      const points = annotation.points.map((point) => toPdfPoint(point, width, height))
      for (let index = 1; index < points.length; index += 1) {
        page.drawLine({
          start: points[index - 1],
          end: points[index],
          thickness: annotation.lineWidth,
          color: pdfColor(annotation.color),
          lineCap: LineCapStyle.Round,
        })
      }
      return
    }
    case "image": {
      const { bytes, mime } = dataUrlToBytes(annotation.dataUrl)
      const image: PDFImage = mime.includes("jpeg") ? await target.embedJpg(bytes) : await target.embedPng(bytes)
      const rect = pdfRect(annotation.rect, width, height)
      page.drawImage(image, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      })
      return
    }
    case "text":
      drawTextBlock(page, font, annotation, width, height)
      return
    default:
      return
  }
}

/** Places the reviewed OCR text as an invisible, selectable layer over the page. */
function drawOcrLayer(page: PDFPage, font: PDFFont, layer: OcrLayer, ref: PageRef): void {
  for (const line of layer.lines) {
    const text = sanitizeForWinAnsi(line.text.replace(/\s+/g, " ").trim())
    if (text.length === 0) continue
    const rect = pdfRect(line.rect, ref.width, ref.height)
    const size = Math.min(Math.max(rect.height * 0.82, 4), 36)
    page.drawText(text, {
      x: rect.x + 1,
      y: rect.y + rect.height * 0.1,
      size,
      font,
      color: rgb(0, 0, 0),
      opacity: 0,
    })
  }
}

function applyMetadata(
  document: PDFDocument,
  metadata: DocMetadata,
  customTags: Record<string, string> = {},
): void {
  document.setTitle(metadata.title)
  document.setAuthor(metadata.author)
  document.setSubject(metadata.subject)
  // pdf-lib joins an array with spaces, so the comma-separated list is kept as a single entry.
  const keywords = metadata.keywords.trim()
  document.setKeywords(keywords.length > 0 ? [keywords] : [])
  document.setCreator(metadata.creator || "PDF Studio")
  document.setProducer(metadata.producer || "PDF Studio")
  const created = new Date(metadata.creationDate)
  if (!Number.isNaN(created.getTime())) document.setCreationDate(created)
  const modified = new Date(metadata.modificationDate)
  if (!Number.isNaN(modified.getTime())) document.setModificationDate(modified)
  // The standard setters above guarantee the Info dictionary exists, in the trailer.
  const info = document.context.lookupMaybe(document.context.trailerInfo.Info, PDFDict)
  if (info) {
    for (const [key, value] of Object.entries(customTags)) {
      const name = key.trim()
      if (name.length > 0 && value.length > 0) info.set(PDFName.of(name), PDFString.of(value))
    }
  }
}

export async function buildPdfBytes(input: BuildInput): Promise<Uint8Array> {
  // `updateMetadata: false` stops pdf-lib from stamping its own producer and modification date
  // over the details the user set.
  const output = await PDFDocument.create({ updateMetadata: false })
  const font = await output.embedFont(StandardFonts.Helvetica)

  let source: PDFDocument | null = null
  if (input.sourceBytes && input.sourceBytes.byteLength > 0) {
    try {
      source = await PDFDocument.load(input.sourceBytes.slice(), { updateMetadata: false })
    } catch {
      throw new Error("This PDF could not be read. It may be damaged or password protected.")
    }
  }

  const byPage = new Map<string, Annotation[]>()
  for (const annotation of input.annotations) {
    const list = byPage.get(annotation.pageId)
    if (list) list.push(annotation)
    else byPage.set(annotation.pageId, [annotation])
  }
  const ocrByPage = new Map<string, OcrLayer>()
  for (const layer of input.ocr) {
    if (layer.applied) ocrByPage.set(layer.pageId, layer)
  }

  for (const ref of input.pages) {
    const page =
      ref.kind === "source" && source
        ? (await output.copyPages(source, [ref.srcIndex]))[0]
        : output.addPage([ref.width, ref.height])
    if (!page) throw new Error("A page could not be copied from the source PDF.")
    if (ref.kind === "source" && source) output.addPage(page)
    page.setRotation(degrees(totalRotation(ref)))

    const annotations = byPage.get(ref.id) ?? []
    // Highlights belong under the ink and text drawn on top of them.
    for (const annotation of annotations) {
      if (annotation.type === "highlight") await drawAnnotation(page, output, font, annotation, ref)
    }
    for (const annotation of annotations) {
      if (annotation.type !== "highlight") await drawAnnotation(page, output, font, annotation, ref)
    }

    const layer = ocrByPage.get(ref.id)
    if (input.includeOcr && layer) drawOcrLayer(page, font, layer, ref)
    if (input.watermark) drawWatermark(page, font, input.watermark, ref)
  }

  applyMetadata(output, input.metadata, input.customTags)
  return output.save({ useObjectStreams: false })
}
