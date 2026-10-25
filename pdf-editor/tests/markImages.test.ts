import { describe, expect, it } from "vitest"
import { markRect } from "../src/pdf/markImages"

const PAGE = { width: 595, height: 842 }

describe("signature and stamp placement", () => {
  it("keeps the mark's aspect ratio and centres it on the page", () => {
    const rect = markRect({ width: 1600, height: 400 }, PAGE, 0.5)
    expect(rect.x).toBeCloseTo((1 - rect.w) / 2, 5)
    expect(rect.y).toBeCloseTo((1 - rect.h) / 2, 5)
    const pixelRatio = (rect.w * PAGE.width) / (rect.h * PAGE.height)
    expect(pixelRatio).toBeCloseTo(4, 4)
  })

  it("caps a tall mark at the page height limit", () => {
    const rect = markRect({ width: 400, height: 1600 }, PAGE, 0.5)
    expect(rect.h * PAGE.height).toBeCloseTo(PAGE.height * 0.35, 4)
    expect(rect.w * PAGE.width).toBeCloseTo((PAGE.height * 0.35 * 400) / 1600, 4)
  })

  it("clamps an oversized width request to the page", () => {
    const rect = markRect({ width: 1000, height: 500 }, PAGE, 2)
    expect(rect.w).toBeCloseTo(0.9, 5)
  })
})
