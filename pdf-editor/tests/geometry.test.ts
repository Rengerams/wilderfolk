import { describe, expect, it } from "vitest"
import {
  displaySize,
  normalizeRotation,
  pdfRect,
  rectFromPoints,
  rotatePoint,
  rotateRect,
  unrotatePoint,
  unrotateRect,
} from "../src/pdf/geometry"

const rect = { x: 0.2, y: 0.3, w: 0.4, h: 0.1 }

describe("page rotation", () => {
  it("keeps a rect unchanged when the page is not rotated", () => {
    expect(rotateRect(rect, 0)).toEqual(rect)
  })

  it("round-trips a rect through every rotation", () => {
    for (const rotation of [90, 180, 270] as const) {
      const rotated = rotateRect(rect, rotation)
      const back = unrotateRect(rotated, rotation)
      expect(back.x).toBeCloseTo(rect.x, 10)
      expect(back.y).toBeCloseTo(rect.y, 10)
      expect(back.w).toBeCloseTo(rect.w, 10)
      expect(back.h).toBeCloseTo(rect.h, 10)
    }
  })

  it("moves the top-left corner to the top-right when the page turns 90 degrees", () => {
    expect(rotatePoint({ x: 0, y: 0 }, 90)).toEqual({ x: 1, y: 0 })
    expect(rotatePoint({ x: 1, y: 0 }, 90)).toEqual({ x: 1, y: 1 })
  })

  it("round-trips a point through every rotation", () => {
    const point = { x: 0.25, y: 0.8 }
    for (const rotation of [90, 180, 270] as const) {
      const back = unrotatePoint(rotatePoint(point, rotation), rotation)
      expect(back.x).toBeCloseTo(point.x, 10)
      expect(back.y).toBeCloseTo(point.y, 10)
    }
  })

  it("swaps the displayed size for quarter turns only", () => {
    expect(displaySize(600, 800, 0)).toEqual({ width: 600, height: 800 })
    expect(displaySize(600, 800, 180)).toEqual({ width: 600, height: 800 })
    expect(displaySize(600, 800, 90)).toEqual({ width: 800, height: 600 })
    expect(displaySize(600, 800, 270)).toEqual({ width: 800, height: 600 })
  })

  it("snaps and wraps rotation values", () => {
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(360)).toBe(0)
  })
})

describe("coordinate helpers", () => {
  it("builds a rect from two drag points in any direction", () => {
    const rect = rectFromPoints({ x: 0.6, y: 0.6 }, { x: 0.2, y: 0.3 })
    expect(rect.x).toBeCloseTo(0.2, 10)
    expect(rect.y).toBeCloseTo(0.3, 10)
    expect(rect.w).toBeCloseTo(0.4, 10)
    expect(rect.h).toBeCloseTo(0.3, 10)
  })

  it("converts a normalized rect into PDF user space", () => {
    const converted = pdfRect({ x: 0.25, y: 0.1, w: 0.5, h: 0.2 }, 800, 1000)
    expect(converted).toEqual({ x: 200, y: 700, width: 400, height: 200 })
  })
})
