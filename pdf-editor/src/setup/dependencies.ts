import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { PDFDocument } from "pdf-lib"
import { t } from "../i18n/translate"
import { prepareOcrLanguages } from "../pdf/ocr"

export type SetupCheckId = "renderer" | "writer" | "canvas" | "storage" | "engine" | "languages"

export type SetupCheck = {
  id: SetupCheckId
  label: string
  hint: string
  /** Optional checks never block finishing; a failure is reported instead. */
  required: boolean
}

export type SetupCheckOutcome = { status: "ready" | "failed"; detail: string }

export type SetupCheckContext = {
  languages: string[]
  onProgress: (progress: number) => void
}

/** Everything the editor needs at runtime, in the order the setup program installs it. */
export const SETUP_CHECKS: SetupCheck[] = [
  {
    id: "renderer",
    label: "PDF rendering engine",
    hint: "Loads the bundled pdf.js worker that draws every page.",
    required: true,
  },
  {
    id: "writer",
    label: "PDF writing engine",
    hint: "Writes edited pages back into a valid PDF file.",
    required: true,
  },
  {
    id: "canvas",
    label: "Page drawing",
    hint: "Checks that this browser can paint pages onto a canvas.",
    required: true,
  },
  {
    id: "storage",
    label: "Local library",
    hint: "Stores documents and settings on this PC.",
    required: true,
  },
  {
    id: "engine",
    label: "Text recognition engine",
    hint: "Runs the OCR engine that makes scanned pages searchable.",
    required: true,
  },
  {
    id: "languages",
    label: "Recognition languages",
    hint: "Downloads and caches the language data chosen in the previous step.",
    required: false,
  },
]

async function checkRenderer(): Promise<string> {
  if (typeof Worker === "undefined") throw new Error(t("This browser cannot run background workers."))
  const response = await fetch(workerUrl)
  if (!response.ok) throw new Error(t("The rendering engine could not be loaded."))
  const size = (await response.blob()).size
  return t("Rendering engine ready ({size} KB).", { size: Math.max(1, Math.round(size / 1024)) })
}

async function checkWriter(): Promise<string> {
  const document = await PDFDocument.create()
  document.addPage()
  const bytes = await document.save()
  if (bytes.length === 0) throw new Error(t("The PDF writer produced an empty document."))
  return t("PDF writer ready.")
}

async function checkCanvas(): Promise<string> {
  if (typeof document === "undefined") throw new Error(t("This browser cannot draw PDF pages."))
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) throw new Error(t("This browser cannot draw PDF pages."))
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, 1, 1)
  return t("Page drawing ready.")
}

async function checkStorage(): Promise<string> {
  const probeKey = "pdf-studio.setup.probe"
  localStorage.setItem(probeKey, "1")
  if (localStorage.getItem(probeKey) !== "1") throw new Error(t("Settings storage is not writable."))
  localStorage.removeItem(probeKey)
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("pdf-studio.setup.probe", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("probe")
    request.onsuccess = () => {
      request.result.close()
      indexedDB.deleteDatabase("pdf-studio.setup.probe")
      resolve()
    }
    request.onerror = () => reject(new Error(t("The document library is unavailable in this browser.")))
  })
  return t("Local library ready.")
}

async function checkEngine(): Promise<string> {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    throw new Error(t("This browser cannot run the text recognition engine."))
  }
  return t("Text recognition engine ready.")
}

async function installLanguages(context: SetupCheckContext): Promise<string> {
  if (context.languages.length === 0) return t("No recognition languages selected.")
  context.onProgress(0)
  await prepareOcrLanguages(context.languages, ({ progress }) => context.onProgress(progress))
  context.onProgress(1)
  return t("Recognition languages installed: {count}.", { count: context.languages.length })
}

const RUNNERS: Record<SetupCheckId, (context: SetupCheckContext) => Promise<string>> = {
  renderer: checkRenderer,
  writer: checkWriter,
  canvas: checkCanvas,
  storage: checkStorage,
  engine: checkEngine,
  languages: installLanguages,
}

/** Runs one install step; a failure is reported as an outcome so the wizard can retry or skip it. */
export async function runSetupCheck(
  id: SetupCheckId,
  context: SetupCheckContext,
): Promise<SetupCheckOutcome> {
  try {
    return { status: "ready", detail: await RUNNERS[id](context) }
  } catch (caught) {
    return {
      status: "failed",
      detail: caught instanceof Error ? caught.message : t("This step could not be completed."),
    }
  }
}
