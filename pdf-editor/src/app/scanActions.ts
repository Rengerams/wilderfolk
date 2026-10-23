import type { ImportedImage } from "./store"
import { scanViaBridge, type BridgeScanRequest } from "../scan/bridge"
import { applyOcrLayers, recognizePagesToDraft } from "./ocrActions"
import { useEditor } from "./store"

export type ScanRequest = BridgeScanRequest & {
  bridgeUrl: string
  recognize: boolean
  languages: string[]
  startNewDocument: boolean
  documentName?: string
}

export type ScanOutcome = { pages: number; recognizedLines: number }

export async function runBridgeScan(
  request: ScanRequest,
  onProgress: (message: string, progress: number) => void,
): Promise<ScanOutcome> {
  onProgress("Asking the scanner to start", 0.05)
  const images = await scanViaBridge(request.bridgeUrl, {
    deviceId: request.deviceId,
    paperSource: request.paperSource,
    pageSize: request.pageSize,
    dpi: request.dpi,
    showNativeUI: request.showNativeUI,
  })
  onProgress(`Received ${images.length} page${images.length === 1 ? "" : "s"}`, 0.4)
  return finishScan(images, request, onProgress)
}

export function finishCameraScan(
  images: ImportedImage[],
  request: Pick<ScanRequest, "recognize" | "languages" | "startNewDocument" | "documentName">,
  onProgress: (message: string, progress: number) => void,
): Promise<ScanOutcome> {
  onProgress(`Captured ${images.length} page${images.length === 1 ? "" : "s"}`, 0.4)
  return finishScan(images, request, onProgress)
}

async function finishScan(
  images: ImportedImage[],
  request: Pick<ScanRequest, "recognize" | "languages" | "startNewDocument" | "documentName">,
  onProgress: (message: string, progress: number) => void,
): Promise<ScanOutcome> {
  const state = useEditor.getState()
  const startFresh = request.startNewDocument || state.doc.pages.length === 0
  const stamp = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  if (startFresh) {
    state.importImages({ name: request.documentName ?? `Scan ${stamp}`, images })
  } else {
    state.appendImagePages(images)
  }

  const totalPages = useEditor.getState().doc.pages.length
  const newPageIds = useEditor
    .getState()
    .doc.pages.slice(Math.max(0, totalPages - images.length))
    .map((page) => page.id)

  let recognizedLines = 0
  if (request.recognize && newPageIds.length > 0) {
    onProgress("Recognizing text", 0.55)
    const outcome = await recognizePagesToDraft(newPageIds, request.languages, (progress) =>
      onProgress(`Recognizing: ${progress.status}`, 0.55 + progress.progress * 0.4),
    )
    recognizedLines = outcome.lines
    applyOcrLayers(newPageIds)
    onProgress(
      recognizedLines > 0
        ? `Recognized ${recognizedLines} lines`
        : "No text was recognized on these pages",
      0.97,
    )
  }

  useEditor
    .getState()
    .setStatus(
      `Scanned ${images.length} page${images.length === 1 ? "" : "s"}${
        recognizedLines > 0 ? `, recognized ${recognizedLines} lines` : ""
      }`,
    )
  return { pages: images.length, recognizedLines }
}
