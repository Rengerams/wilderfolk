import type { ImportedImage } from "./store"
import { scanViaBridge, type BridgeScanRequest } from "../scan/bridge"
import { applyOcrLayers, recognizePagesToDraft } from "./ocrActions"
import { t } from "../i18n/translate"
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
  onProgress(t("Asking the scanner to start"), 0.05)
  const images = await scanViaBridge(request.bridgeUrl, {
    deviceId: request.deviceId,
    paperSource: request.paperSource,
    pageSize: request.pageSize,
    dpi: request.dpi,
    showNativeUI: request.showNativeUI,
  })
  onProgress(
    images.length === 1
      ? t("Received {count} page", { count: images.length })
      : t("Received {count} pages", { count: images.length }),
    0.4,
  )
  return finishScan(images, request, onProgress)
}

export function finishCameraScan(
  images: ImportedImage[],
  request: Pick<ScanRequest, "recognize" | "languages" | "startNewDocument" | "documentName">,
  onProgress: (message: string, progress: number) => void,
): Promise<ScanOutcome> {
  onProgress(
    images.length === 1
      ? t("Captured {count} page", { count: images.length })
      : t("Captured {count} pages", { count: images.length }),
    0.4,
  )
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
    onProgress(t("Recognizing text"), 0.55)
    const outcome = await recognizePagesToDraft(newPageIds, request.languages, (progress) =>
      onProgress(
        t("Recognizing: {status}", { status: progress.status }),
        0.55 + progress.progress * 0.4,
      ),
    )
    recognizedLines = outcome.lines
    applyOcrLayers(newPageIds)
    onProgress(
      recognizedLines > 0
        ? t("Recognized {count} lines", { count: recognizedLines })
        : t("No text was recognized on these pages"),
      0.97,
    )
  }

  const scanned =
    images.length === 1
      ? t("Scanned {count} page", { count: images.length })
      : t("Scanned {count} pages", { count: images.length })
  useEditor
    .getState()
    .setStatus(
      recognizedLines > 0
        ? `${scanned}, ${t("recognized {count} lines", { count: recognizedLines })}`
        : scanned,
    )
  return { pages: images.length, recognizedLines }
}
