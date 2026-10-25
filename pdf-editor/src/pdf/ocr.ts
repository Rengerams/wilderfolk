import type { OcrLine, Rect, Rotation } from "../types"
import { t } from "../i18n/translate"
import { clampRectToPage, unrotateRect } from "./geometry"
import { createId } from "./pages"
import { renderPageCanvas, type PdfSource } from "./render"

export const OCR_LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "nld", label: "Dutch" },
  { code: "deu", label: "German" },
  { code: "fra", label: "French" },
  { code: "spa", label: "Spanish" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "swe", label: "Swedish" },
  { code: "dan", label: "Danish" },
  { code: "pol", label: "Polish" },
]

export const DEFAULT_OCR_LANGUAGES = ["eng"]
export const OCR_RENDER_SCALE = 2

/** The worker, core and language data ship with the app, so recognition needs no network. */
const OCR_ASSETS = `${import.meta.env.BASE_URL}ocr`

export type OcrProgress = { status: string; progress: number }
export type OcrPageResult = { lines: OcrLine[]; text: string; confidence: number }

type TesseractBbox = { x0: number; y0: number; x1: number; y1: number }
type TesseractLine = { text: string; confidence: number; bbox: TesseractBbox }
type TesseractBlock = { paragraphs: { lines: TesseractLine[] }[] }
type TesseractWorker = {
  recognize: (
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, unknown>,
  ) => Promise<{
    data: { text: string; confidence: number; blocks: TesseractBlock[] | null }
  }>
  terminate: () => Promise<unknown>
}
type TesseractModule = {
  createWorker: (
    langs: string,
    oem?: number,
    options?: Record<string, unknown>,
  ) => Promise<TesseractWorker>
  OEM: { LSTM_ONLY: number }
}

/** tesseract.js ships a CommonJS bundle; resolve whichever interop shape the bundler produced. */
async function loadTesseract(): Promise<TesseractModule> {
  const imported = (await import("tesseract.js")) as unknown as
    | (Partial<TesseractModule> & { default?: TesseractModule })
    | undefined
  const module = imported?.createWorker ? (imported as TesseractModule) : imported?.default
  if (!module?.createWorker) throw new Error(t("The OCR engine could not be loaded."))
  return module
}

let activeWorker: { key: string; worker: TesseractWorker } | null = null

async function getWorker(
  languages: string[],
  onProgress: (progress: OcrProgress) => void,
): Promise<TesseractWorker> {
  const key = languages.join("+")
  if (activeWorker?.key === key) return activeWorker.worker
  if (activeWorker) {
    await activeWorker.worker.terminate()
    activeWorker = null
  }
  const module = await loadTesseract()
  const worker = await module.createWorker(key, module.OEM.LSTM_ONLY, {
    workerPath: `${OCR_ASSETS}/worker.min.js`,
    corePath: `${OCR_ASSETS}/core`,
    langPath: `${OCR_ASSETS}/lang`,
    logger: (message: { status?: unknown; progress?: unknown }) => {
      onProgress({
        status: typeof message.status === "string" ? message.status : "working",
        progress: typeof message.progress === "number" ? message.progress : 0,
      })
    },
  })
  activeWorker = { key, worker }
  return worker
}

export async function terminateOcrWorker(): Promise<void> {
  if (!activeWorker) return
  await activeWorker.worker.terminate()
  activeWorker = null
}

/** Warms the engine with the installed language data, so a later recognition starts immediately. */
export async function prepareOcrLanguages(
  languages: string[],
  onProgress: (progress: OcrProgress) => void,
): Promise<void> {
  await getWorker(languages, onProgress)
  await terminateOcrWorker()
}

/** Recognizes one rendered raster; `mapRect` turns raster coordinates into page coordinates. */
export async function recognizeCanvas(input: {
  canvas: HTMLCanvasElement
  languages: string[]
  onProgress: (progress: OcrProgress) => void
  mapRect: (rect: Rect) => Rect
}): Promise<OcrPageResult> {
  const { canvas } = input
  const worker = await getWorker(input.languages, input.onProgress)
  const result = await worker.recognize(canvas, {}, { blocks: true, text: true })

  const lines: OcrLine[] = []
  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = line.text.replace(/\s+/g, " ").trim()
        if (text.length === 0) continue
        const rasterRect = clampRectToPage({
          x: line.bbox.x0 / canvas.width,
          y: line.bbox.y0 / canvas.height,
          w: (line.bbox.x1 - line.bbox.x0) / canvas.width,
          h: (line.bbox.y1 - line.bbox.y0) / canvas.height,
        })
        if (rasterRect.h <= 0 || rasterRect.w <= 0) continue
        lines.push({
          id: createId("ocr"),
          text,
          confidence: Math.round(line.confidence),
          rect: input.mapRect(rasterRect),
        })
      }
    }
  }

  lines.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
  return {
    lines,
    text: result.data.text.trim(),
    confidence: Math.round(result.data.confidence),
  }
}

export async function recognizePage(input: {
  source: PdfSource
  srcIndex: number
  totalRotation: Rotation
  languages: string[]
  onProgress: (progress: OcrProgress) => void
}): Promise<OcrPageResult> {
  const canvas = await renderPageCanvas({
    source: input.source,
    srcIndex: input.srcIndex,
    totalRotation: input.totalRotation,
    scale: OCR_RENDER_SCALE,
  })
  return recognizeCanvas({
    canvas,
    languages: input.languages,
    onProgress: input.onProgress,
    mapRect: (rect) => unrotateRect(rect, input.totalRotation),
  })
}

/** Scanned and imported pages hold their raster as an image object, so recognize that instead. */
export async function recognizeImagePage(input: {
  dataUrl: string
  rect: Rect
  languages: string[]
  onProgress: (progress: OcrProgress) => void
}): Promise<OcrPageResult> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () =>
      reject(new Error(t("The page picture could not be read for recognition.")))
    element.src = input.dataUrl
  })
  const maxWidth = 2400
  const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error(t("Canvas is not available in this browser."))
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return recognizeCanvas({
    canvas,
    languages: input.languages,
    onProgress: input.onProgress,
    mapRect: (rect) => ({
      x: input.rect.x + rect.x * input.rect.w,
      y: input.rect.y + rect.y * input.rect.h,
      w: rect.w * input.rect.w,
      h: rect.h * input.rect.h,
    }),
  })
}
