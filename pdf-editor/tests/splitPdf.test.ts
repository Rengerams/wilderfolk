import { describe, expect, it } from "vitest"
import { chunkPageRanges, parsePageRanges, splitFileName } from "../src/pdf/splitPdf"

describe("page range parsing", () => {
  it("reads single pages and ranges in either direction", () => {
    expect(parsePageRanges("1-3, 5, 10-8", 12)).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 5 },
      { from: 8, to: 10 },
    ])
  })

  it("rejects text and ranges past the last page", () => {
    expect(() => parsePageRanges("one-two", 10)).toThrow()
    expect(() => parsePageRanges("9-11", 10)).toThrow()
    expect(() => parsePageRanges(" , ", 10)).toThrow()
  })

  it("chunks a document from page one", () => {
    expect(chunkPageRanges(25, 10)).toEqual([
      { from: 1, to: 10 },
      { from: 11, to: 20 },
      { from: 21, to: 25 },
    ])
  })
})

describe("split file naming", () => {
  it("keeps the original name and the page span", () => {
    expect(splitFileName("Report", 1, { from: 1, to: 10 })).toBe("Report-part-01-pages-1-10.pdf")
    expect(splitFileName("Report", 12, { from: 7, to: 7 })).toBe("Report-part-12-page-7.pdf")
  })
})
