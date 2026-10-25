import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import {
  MAX_SPLIT_BYTES,
  MIN_SPLIT_BYTES,
  buildParts,
  buildSizeParts,
  chunkPageRanges,
  parsePageRanges,
  splitFileName,
  splitSizeLimit,
  type SplitPart,
} from "../src/pdf/splitPdf"

const PAGE = { width: 595, height: 842 }

/** Deterministic noisy text, so the PDF streams cannot compress down to nothing. */
function noisyFiller(length: number, seed: number): string {
  let state = seed
  let text = ""
  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648
    text += String.fromCharCode(33 + (state % 90))
  }
  return text
}

async function makeSourcePdf(pageCount: number, filler = 120): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false })
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([PAGE.width, PAGE.height])
    page.drawText(`Page ${index + 1} ${noisyFiller(filler, index + 1)}`, {
      x: 30,
      y: 800,
      size: 8,
      font,
    })
  }
  return document.save({ useObjectStreams: false })
}

/** Copies the requested pages into a fresh document, the way the editor does. */
async function buildFrom(sourceBytes: Uint8Array) {
  return async (part: SplitPart): Promise<Uint8Array> => {
    const source = await PDFDocument.load(sourceBytes, { updateMetadata: false })
    const output = await PDFDocument.create({ updateMetadata: false })
    const indices = Array.from({ length: part.to - part.from + 1 }, (_, offset) => part.from - 1 + offset)
    for (const page of await output.copyPages(source, indices)) output.addPage(page)
    return output.save({ useObjectStreams: false })
  }
}

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

describe("page range parsing", () => {
  it("reads single pages and ranges in either direction", () => {
    expect(parsePageRanges("1-3, 5, 10-8", 12)).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 5 },
      { from: 8, to: 10 },
    ])
  })

  it("rejects text, page zero and ranges past the last page", () => {
    expect(() => parsePageRanges("one-two", 10)).toThrow(/Use page numbers/)
    expect(() => parsePageRanges("0-2", 10)).toThrow(/start at 1/)
    expect(() => parsePageRanges("9-11", 10)).toThrow(/go up to/)
    expect(() => parsePageRanges(" , ", 10)).toThrow(/at least one page or range/)
  })

  it("chunks a document from page one and rejects an empty chunk size", () => {
    expect(chunkPageRanges(25, 10)).toEqual([
      { from: 1, to: 10 },
      { from: 11, to: 20 },
      { from: 21, to: 25 },
    ])
    expect(() => chunkPageRanges(10, 0)).toThrow(/at least one page per file/)
  })

  it("accepts a supported file size unchanged", () => {
    expect(splitSizeLimit(MIN_SPLIT_BYTES)).toBe(MIN_SPLIT_BYTES)
  })
})

describe("split file naming", () => {
  it("keeps the original name and the page span", () => {
    expect(splitFileName("Report", 1, { from: 1, to: 10 })).toBe("Report-part-01-pages-1-10.pdf")
    expect(splitFileName("Report", 12, { from: 7, to: 7 })).toBe("Report-part-12-page-7.pdf")
  })
})

describe("splitting a real document", () => {
  it("writes one readable PDF per page chunk and reports progress", async () => {
    const source = await makeSourcePdf(10)
    const parts = chunkPageRanges(10, 4)
    const progress: number[] = []
    const results = await buildParts(parts, await buildFrom(source), (value) => progress.push(value))

    expect(results.map((result) => result.part)).toEqual(parts)
    expect(await Promise.all(results.map((result) => pageCountOf(result.bytes)))).toEqual([4, 4, 2])
    expect(progress).toEqual([1 / 3, 2 / 3, 1])
  })

  it("splits by explicit ranges and names every file after the original", async () => {
    const source = await makeSourcePdf(6)
    const results = await buildParts(
      parsePageRanges("1-2, 5", 6),
      await buildFrom(source),
      () => undefined,
    )

    expect(results.map((result) => result.part)).toEqual([
      { from: 1, to: 2 },
      { from: 5, to: 5 },
    ])
    expect(await Promise.all(results.map((result) => pageCountOf(result.bytes)))).toEqual([2, 1])
    expect(results.map((result, index) => splitFileName("Kwartaalrapport", index + 1, result.part))).toEqual([
      "Kwartaalrapport-part-01-pages-1-2.pdf",
      "Kwartaalrapport-part-02-page-5.pdf",
    ])
  })

  it("keeps every size part within the limit and covers every page once", async () => {
    const source = await makeSourcePdf(9, 40_000)
    const limit = MIN_SPLIT_BYTES
    const progress: number[] = []
    const results = await buildSizeParts({
      pageCount: 9,
      limit,
      averagePageBytes: source.byteLength / 9,
      build: await buildFrom(source),
      onProgress: (value) => progress.push(value),
    })

    expect(results.length).toBeGreaterThan(1)
    let next = 1
    for (const result of results) {
      expect(result.part.from).toBe(next)
      next = result.part.to + 1
      // A page that alone exceeds the limit is still written, on its own.
      const oversized = result.bytes.byteLength > limit
      expect(!oversized || result.part.from === result.part.to).toBe(true)
    }
    expect(next).toBe(10)
    expect(progress.at(-1)).toBe(1)
    expect(await pageCountOf(results[0].bytes)).toBe(results[0].part.to - results[0].part.from + 1)
  })

  it("refuses limits outside the supported range", () => {
    expect(() => splitSizeLimit(MIN_SPLIT_BYTES - 1)).toThrow(/Choose a file size/)
    expect(() => splitSizeLimit(MAX_SPLIT_BYTES + 1)).toThrow(/Choose a file size/)
  })
})
