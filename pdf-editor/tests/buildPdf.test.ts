import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import type { Annotation, DocMetadata } from "../src/types"
import { buildPdfBytes, sanitizeForWinAnsi } from "../src/pdf/buildPdf"
import { blankPage, sourcePage } from "../src/pdf/pages"
import { contentStreams, hasText } from "./pdfText"

const PAGE = { width: 595.28, height: 841.89 }

const METADATA: DocMetadata = {
  title: "Kwartaalrapport",
  author: "Jan Janssen",
  subject: "Rapportage",
  keywords: "kwartaal, rapport",
  creator: "PDF Studio test",
  producer: "PDF Studio test",
  creationDate: "2026-10-23T10:00:00.000Z",
  modificationDate: "2026-10-23T11:00:00.000Z",
}

async function makeSourcePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false })
  const font = await document.embedFont(StandardFonts.Helvetica)
  const first = document.addPage([PAGE.width, PAGE.height])
  first.drawText("Original first page", { x: 40, y: 700, size: 18, font })
  const second = document.addPage([PAGE.width, PAGE.height])
  second.drawText("Original second page", { x: 40, y: 700, size: 18, font })
  return document.save({ useObjectStreams: false })
}

describe("building the PDF", () => {
  it("keeps page order, adds new pages, bakes objects and writes every document detail", async () => {
    const source = await makeSourcePdf()
    const first = sourcePage({ srcIndex: 0, size: PAGE, authoredRotation: 0 })
    const blank = blankPage(PAGE)
    const second = sourcePage({ srcIndex: 1, size: PAGE, authoredRotation: 90 })

    const text: Annotation = {
      id: "a1",
      pageId: blank.id,
      type: "text",
      rect: { x: 0.1, y: 0.2, w: 0.4, h: 0.1 },
      text: "Nieuw",
      fontSize: 14,
      color: "#111111",
    }
    const highlight: Annotation = {
      id: "a2",
      pageId: first.id,
      type: "highlight",
      rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.03 },
      color: "#ffd400",
    }
    // An opaque patch, which is how replaced text is covered.
    const cover: Annotation = {
      id: "a3",
      pageId: first.id,
      type: "shape",
      rect: { x: 0.05, y: 0.05, w: 0.3, h: 0.05 },
      stroke: "#ffffff",
      fill: "#ffffff",
      fillOpacity: 1,
      lineWidth: 0.5,
    }

    const bytes = await buildPdfBytes({
      sourceBytes: source,
      pages: [first, blank, second],
      annotations: [text, highlight, cover],
      ocr: [
        {
          pageId: blank.id,
          language: "eng",
          lines: [
            {
              id: "l1",
              text: "Zoekbare tekst",
              rect: { x: 0.1, y: 0.4, w: 0.4, h: 0.03 },
              confidence: 92,
            },
          ],
          confidence: 92,
          applied: true,
        },
      ],
      metadata: METADATA,
      watermark: null,
      includeOcr: true,
    })

    // Read back without the library's own metadata stamping, so the file's real values show.
    const output = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(output.getPageCount()).toBe(3)
    expect(output.getTitle()).toBe("Kwartaalrapport")
    expect(output.getAuthor()).toBe("Jan Janssen")
    expect(output.getSubject()).toBe("Rapportage")
    expect(output.getKeywords()).toBe("kwartaal, rapport")
    expect(output.getCreator()).toBe("PDF Studio test")
    expect(output.getProducer()).toBe("PDF Studio test")
    expect(output.getCreationDate()?.toISOString()).toBe("2026-10-23T10:00:00.000Z")
    expect(output.getModificationDate()?.toISOString()).toBe("2026-10-23T11:00:00.000Z")
    expect(output.getPage(0).getRotation().angle).toBe(0)
    expect(output.getPage(1).getRotation().angle).toBe(0)
    expect(output.getPage(2).getRotation().angle).toBe(90)

    const content = contentStreams(bytes)
    expect(hasText(content, "Original first page")).toBe(true)
    expect(hasText(content, "Original second page")).toBe(true)
    expect(hasText(content, "Nieuw")).toBe(true)
    expect(hasText(content, "Zoekbare tekst")).toBe(true)
  })

  it("leaves the recognized layer out when it is not wanted", async () => {
    const blank = blankPage(PAGE)
    const layer = {
      pageId: blank.id,
      language: "eng",
      lines: [
        { id: "l1", text: "NietBedoeld", rect: { x: 0.1, y: 0.4, w: 0.4, h: 0.03 }, confidence: 90 },
      ],
      confidence: 90,
      applied: true,
    }
    const bytes = await buildPdfBytes({
      sourceBytes: null,
      pages: [blank],
      annotations: [],
      ocr: [layer],
      metadata: METADATA,
      watermark: null,
      includeOcr: false,
    })
    expect(hasText(contentStreams(bytes), "NietBedoeld")).toBe(false)
  })

  it("writes the watermark onto every page", async () => {
    const pages = [blankPage(PAGE), blankPage(PAGE)]
    const bytes = await buildPdfBytes({
      sourceBytes: null,
      pages,
      annotations: [],
      ocr: [],
      metadata: METADATA,
      watermark: { text: "Vertrouwelijk", fontSize: 48, color: "#9aa0a6", opacity: 0.2, angle: 45 },
      includeOcr: false,
    })
    const streams = contentStreams(bytes)
    const written =
      streams.split("vertrouwelijk").length - 1 ||
      streams.split(Buffer.from("Vertrouwelijk").toString("hex")).length - 1
    expect(hasText(streams, "Vertrouwelijk")).toBe(true)
    expect(written).toBeGreaterThanOrEqual(2)
  })

  it("reports a damaged source file instead of writing a broken PDF", async () => {
    const blank = blankPage(PAGE)
    await expect(
      buildPdfBytes({
        sourceBytes: new Uint8Array([1, 2, 3, 4, 5]),
        pages: [blank],
        annotations: [],
        ocr: [],
        metadata: METADATA,
        watermark: null,
        includeOcr: true,
      }),
    ).rejects.toThrow(/could not be read/)
  })

  it("replaces characters the standard font cannot encode", () => {
    expect(sanitizeForWinAnsi("café — 20°")).toBe("café — 20°")
    expect(sanitizeForWinAnsi("привет")).toBe("??????")
  })
})
