import type { Point, Rect, Rotation } from "../types"

/** Display rotation is clockwise; normalized page space has its origin at the top-left. */

export function normalizeRotation(degrees: number): Rotation {
  const snapped = Math.round(degrees / 90) * 90
  return (((snapped % 360) + 360) % 360) as Rotation
}

export function rotatePoint(point: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: 1 - point.y, y: point.x }
    case 180:
      return { x: 1 - point.x, y: 1 - point.y }
    case 270:
      return { x: point.y, y: 1 - point.x }
    default:
      return { x: point.x, y: point.y }
  }
}

/** Inverse of `rotatePoint` — maps a displayed coordinate back into unrotated page space. */
export function unrotatePoint(point: Point, rotation: Rotation): Point {
  return rotatePoint(point, normalizeRotation(360 - rotation))
}

export function rotateRect(rect: Rect, rotation: Rotation): Rect {
  if (rotation === 0) return { ...rect }
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ]
  const xs: number[] = []
  const ys: number[] = []
  for (const corner of corners) {
    const rotated = rotatePoint(corner, rotation)
    xs.push(rotated.x)
    ys.push(rotated.y)
  }
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function unrotateRect(rect: Rect, rotation: Rotation): Rect {
  return rotateRect(rect, normalizeRotation(360 - rotation))
}

/** Size of the page as the user sees it, with `rotation` applied. */
export function displaySize(
  width: number,
  height: number,
  rotation: Rotation,
): { width: number; height: number } {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width }
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function clampRectToPage(rect: Rect): Rect {
  const x = clamp01(rect.x)
  const y = clamp01(rect.y)
  return {
    x,
    y,
    w: Math.min(clamp01(rect.w), 1 - x),
    h: Math.min(clamp01(rect.h), 1 - y),
  }
}

/** Converts a normalized top-left rect into PDF user-space coordinates (origin bottom-left). */
export function pdfRect(
  rect: Rect,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: rect.x * pageWidth,
    y: pageHeight * (1 - rect.y - rect.h),
    width: rect.w * pageWidth,
    height: rect.h * pageHeight,
  }
}
