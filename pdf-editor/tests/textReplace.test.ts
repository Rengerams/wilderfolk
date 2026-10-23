import { describe, expect, it } from "vitest"
import { findTextMatches, fitFontSize } from "../src/pdf/textReplace"
import type { TextRunItem } from "../src/pdf/render"

function item(str: string, x: number, y: number, width: number, size = 12): TextRunItem {
  return { str, transform: [size, 0, 0, size, x, y], width, height: size }
}

const PAGE = { pageWidth: 600, pageHeight: 800, srcIndex: 0 }

describe("finding text in a PDF", () => {
  it("finds a phrase that is split across two runs on the same line", () => {
    const items = [item("Hello ", 40, 700, 36), item("world", 76, 700, 30)]
    const hits = findTextMatches({ items, needle: "hello world", ...PAGE })
    expect(hits).toHaveLength(1)
    expect(hits[0].text).toBe("Hello world")
    expect(hits[0].rect.x).toBeCloseTo(40 / 600, 6)
    expect(hits[0].rect.w).toBeCloseTo(66 / 600, 6)
    expect(hits[0].fontSize).toBe(12)
  })

  it("narrows a match to the characters that were asked for", () => {
    const items = [item("abcdef", 60, 700, 60)]
    const hits = findTextMatches({ items, needle: "cd", ...PAGE })
    expect(hits).toHaveLength(1)
    expect(hits[0].rect.x).toBeCloseTo(80 / 600, 6)
    expect(hits[0].rect.w).toBeCloseTo(20 / 600, 6)
  })

  it("finds every occurrence on the page", () => {
    const items = [item("invoice invoice", 40, 700, 120)]
    expect(findTextMatches({ items, needle: "invoice", ...PAGE })).toHaveLength(2)
  })

  it("does not join runs that sit on different lines", () => {
    const items = [item("Total", 40, 700, 30), item("cost", 40, 680, 24)]
    expect(findTextMatches({ items, needle: "Total cost", ...PAGE })).toHaveLength(0)
  })

  it("returns nothing for an empty or absent search", () => {
    const items = [item("Hello", 40, 700, 30)]
    expect(findTextMatches({ items, needle: "   ", ...PAGE })).toHaveLength(0)
    expect(findTextMatches({ items, needle: "goodbye", ...PAGE })).toHaveLength(0)
  })
})

describe("fitting replacement text", () => {
  it("keeps the original size when the new text fits", () => {
    expect(fitFontSize(12, 200, "Kort")).toBe(12)
  })

  it("shrinks longer replacement text so it stays inside the space", () => {
    const size = fitFontSize(12, 50, "een veel langere vervanging")
    expect(size).toBeGreaterThanOrEqual(5)
    expect(size).toBeLessThan(12)
  })
})
