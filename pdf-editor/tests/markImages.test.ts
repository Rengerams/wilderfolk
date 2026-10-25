import { describe, expect, it } from "vitest"
import { inkCurves, markRect, smoothInkPoints } from "../src/pdf/markImages"

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

describe("signature smoothing", () => {
  it("keeps the ends of a stroke and softens a spike in the middle", () => {
    const smoothed = smoothInkPoints([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.3 },
      { x: 1, y: 0 },
    ], 1)
    expect(smoothed[0]).toMatchObject({ x: 0, y: 0 })
    expect(smoothed[smoothed.length - 1]).toMatchObject({ x: 1, y: 0 })
    expect(smoothed[1].y).toBeCloseTo(0.15, 5)
  })

  it("carries the stroke pressure along with the smoothed points", () => {
    const smoothed = smoothInkPoints([
      { x: 0, y: 0, strength: 1 },
      { x: 0.5, y: 0.1, strength: 0.5 },
      { x: 1, y: 0, strength: 1 },
    ], 1)
    expect(smoothed[1].strength).toBeCloseTo(0.75, 5)
  })

  it("curves between samples through their midpoints and keeps the ends", () => {
    const curves = inkCurves([
      { x: 0, y: 0 },
      { x: 0.25, y: 0.4 },
      { x: 0.75, y: 0.2 },
      { x: 1, y: 0 },
    ])
    expect(curves).toHaveLength(3)
    expect(curves[0].start).toMatchObject({ x: 0, y: 0 })
    expect(curves[0].control).toMatchObject({ x: 0.25, y: 0.4 })
    expect(curves[0].end.x).toBeCloseTo(0.5, 5)
    expect(curves[0].end.y).toBeCloseTo(0.3, 5)
    expect(curves[1].start.x).toBeCloseTo(0.5, 5)
    expect(curves[1].start.y).toBeCloseTo(0.3, 5)
    expect(curves[2].end).toMatchObject({ x: 1, y: 0 })
  })

  it("draws a two-point stroke as a single curve that ends where the pointer is", () => {
    const curves = inkCurves([
      { x: 0, y: 0 },
      { x: 1, y: 0.5 },
    ])
    expect(curves).toHaveLength(1)
    expect(curves[0]).toMatchObject({
      start: { x: 0, y: 0 },
      control: { x: 1, y: 0.5 },
      end: { x: 1, y: 0.5 },
    })
  })
})
