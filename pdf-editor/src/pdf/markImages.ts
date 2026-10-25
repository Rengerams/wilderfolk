import type { Rect } from "../types"

/** A transparent PNG built in a canvas, kept with its pixel size so placement can keep its shape. */
export type RasterMark = { dataUrl: string; width: number; height: number }

/** `strength` (0.25–1.2) carries pen pressure or pointer speed into the line weight. */
export type InkPoint = { x: number; y: number; strength?: number }

/** Points are normalized (0..1) inside the drawing pad, so the same stroke renders at any size. */
export type InkStroke = { color: string; points: InkPoint[] }

export type SignatureFontId = "script" | "elegant" | "casual"

export type TypedSignature = { mode: "type"; text: string; font: SignatureFontId; color: string }
export type DrawnSignature = { mode: "draw"; strokes: InkStroke[] }
export type SignatureInput = TypedSignature | DrawnSignature

export type StampDesign = {
  text: string
  color: string
  /** Already formatted for display; `null` leaves the date line out. */
  date: string | null
  tilt: boolean
}

export const SIGNATURE_FONTS: Record<SignatureFontId, string> = {
  script: '"Segoe Script", "Brush Script MT", "Bradley Hand", cursive',
  elegant: '"Lucida Handwriting", "Apple Chancery", "URW Chancery L", cursive',
  casual: '"Segoe Print", "Chalkboard SE", "Comic Sans MS", cursive',
}

const SIGNATURE_CANVAS = { width: 1600, height: 560 }
const STAMP_CANVAS = { width: 1000, height: 380 }
const TRIM_PADDING = 28

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  return canvas
}

export function inkStrength(point: InkPoint): number {
  return Math.min(1.2, Math.max(0.25, point.strength ?? 1))
}

/** Moving-average passes take the tremor out of a hand-drawn line while both ends stay put. */
export function smoothInkPoints(points: InkPoint[], passes = 2): InkPoint[] {
  let smoothed = points
  for (let pass = 0; pass < passes; pass += 1) {
    smoothed = smoothed.map((point, index) => {
      const previous = smoothed[index - 1]
      const next = smoothed[index + 1]
      if (!previous || !next) return point
      return {
        x: previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
        y: previous.y * 0.25 + point.y * 0.5 + next.y * 0.25,
        strength:
          inkStrength(previous) * 0.25 + inkStrength(point) * 0.5 + inkStrength(next) * 0.25,
      }
    })
  }
  return smoothed
}

/** Segments carry their own width, so a slow stroke inks heavier than a fast flick. */
export function drawInkStrokes(
  context: CanvasRenderingContext2D,
  strokes: InkStroke[],
  width: number,
  height: number,
  lineWidth: number,
): void {
  context.clearRect(0, 0, width, height)
  context.lineCap = "round"
  context.lineJoin = "round"
  for (const stroke of strokes) {
    const points = smoothInkPoints(stroke.points)
    const first = points[0]
    if (!first) continue
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    if (points.length === 1) {
      const radius = (lineWidth * inkStrength(first)) / 2
      context.beginPath()
      context.arc(first.x * width, first.y * height, radius, 0, Math.PI * 2)
      context.fill()
      continue
    }
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]
      const to = points[index]
      context.lineWidth = Math.max(0.4, (lineWidth * (inkStrength(from) + inkStrength(to))) / 2)
      context.beginPath()
      context.moveTo(from.x * width, from.y * height)
      context.lineTo(to.x * width, to.y * height)
      context.stroke()
    }
  }
}

/** Crops the drawing to its visible pixels so margins never end up in the placed object. */
function trimTransparent(canvas: HTMLCanvasElement, padding = TRIM_PADDING): RasterMark | null {
  const context = canvas.getContext("2d")
  if (!context) return null
  const { width, height } = canvas
  const pixels = context.getImageData(0, 0, width, height).data
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 8) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < left || bottom < top) return null
  const trimmedWidth = right - left + 1
  const trimmedHeight = bottom - top + 1
  const output = createCanvas(trimmedWidth + padding * 2, trimmedHeight + padding * 2)
  output
    .getContext("2d")
    ?.drawImage(canvas, left, top, trimmedWidth, trimmedHeight, padding, padding, trimmedWidth, trimmedHeight)
  return { dataUrl: output.toDataURL("image/png"), width: output.width, height: output.height }
}

/** Fits a text width to the available space, never growing beyond the chosen size. */
function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: string,
  size: number,
  maxWidth: number,
): number {
  context.font = `${weight} ${size}px ${family}`
  const measured = context.measureText(text).width
  return measured > maxWidth ? Math.max(18, Math.floor((size * maxWidth) / measured)) : size
}

function drawTypedSignature(input: TypedSignature): RasterMark | null {
  const canvas = createCanvas(SIGNATURE_CANVAS.width, SIGNATURE_CANVAS.height)
  const context = canvas.getContext("2d")
  const text = input.text.trim()
  if (!context || text.length === 0) return null
  const family = SIGNATURE_FONTS[input.font]
  const size = fitFontSize(context, text, family, "italic", 190, SIGNATURE_CANVAS.width - 200)
  context.font = `italic ${size}px ${family}`
  context.fillStyle = input.color
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText(text, SIGNATURE_CANVAS.width / 2, SIGNATURE_CANVAS.height / 2)
  return trimTransparent(canvas)
}

function drawDrawnSignature(input: DrawnSignature): RasterMark | null {
  const canvas = createCanvas(SIGNATURE_CANVAS.width, SIGNATURE_CANVAS.height)
  const context = canvas.getContext("2d")
  if (!context || input.strokes.length === 0) return null
  drawInkStrokes(context, input.strokes, canvas.width, canvas.height, canvas.height * 0.013)
  return trimTransparent(canvas)
}

export function renderSignaturePng(input: SignatureInput): RasterMark | null {
  return input.mode === "type" ? drawTypedSignature(input) : drawDrawnSignature(input)
}

function roundedPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

/** Letter spacing is drawn per character so the result is identical in every browser. */
function drawSpacedText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
  spacing: number,
): void {
  const characters = [...text]
  const widths = characters.map((character) => context.measureText(character).width)
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, characters.length - 1)
  let x = centerX - total / 2
  characters.forEach((character, index) => {
    context.fillText(character, x, baselineY)
    x += widths[index] + spacing
  })
}

function drawStampBase(design: StampDesign): HTMLCanvasElement | null {
  const text = design.text.trim().toUpperCase()
  if (text.length === 0) return null
  const canvas = createCanvas(STAMP_CANVAS.width, STAMP_CANVAS.height)
  const context = canvas.getContext("2d")
  if (!context) return null
  const { width, height } = canvas

  context.strokeStyle = design.color
  context.fillStyle = design.color
  context.lineCap = "round"
  roundedPath(context, 14, 14, width - 28, height - 28, 34)
  context.lineWidth = 12
  context.stroke()
  roundedPath(context, 42, 42, width - 84, height - 84, 18)
  context.lineWidth = 3
  context.stroke()

  const family = '"Arial Black", "Segoe UI", Arial, sans-serif'
  const size = fitFontSize(context, text, family, "900", 100, width - 180)
  context.font = `900 ${size}px ${family}`
  context.textAlign = "left"
  context.textBaseline = "middle"

  if (design.date) {
    drawSpacedText(context, text, width / 2, 158, 9)
    context.beginPath()
    context.moveTo(150, 214)
    context.lineTo(width - 150, 214)
    context.lineWidth = 2
    context.stroke()
    context.font = `600 34px "Segoe UI", Arial, sans-serif`
    context.textAlign = "center"
    context.fillText(design.date, width / 2, 268)
  } else {
    drawSpacedText(context, text, width / 2, height / 2 + 4, 9)
  }
  return canvas
}

export function renderStampPng(design: StampDesign): RasterMark | null {
  const base = drawStampBase(design)
  if (!base) return null
  if (!design.tilt) {
    return { dataUrl: base.toDataURL("image/png"), width: base.width, height: base.height }
  }
  const tilted = createCanvas(base.width + 120, base.height + 140)
  const context = tilted.getContext("2d")
  if (!context) return null
  context.translate(tilted.width / 2, tilted.height / 2)
  context.rotate((-6 * Math.PI) / 180)
  context.drawImage(base, -base.width / 2, -base.height / 2)
  return trimTransparent(tilted)
}

/** Lays the mark on the page centre, keeping its aspect ratio and a sensible maximum height. */
export function markRect(
  mark: { width: number; height: number },
  page: { width: number; height: number },
  widthFraction: number,
): Rect {
  const safeWidth = Math.min(0.9, Math.max(0.05, widthFraction)) * page.width
  let pixelWidth = safeWidth
  let pixelHeight = (safeWidth * mark.height) / Math.max(1, mark.width)
  const maxHeight = page.height * 0.35
  if (pixelHeight > maxHeight) {
    pixelHeight = maxHeight
    pixelWidth = (maxHeight * mark.width) / Math.max(1, mark.height)
  }
  const w = pixelWidth / page.width
  const h = pixelHeight / page.height
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}
