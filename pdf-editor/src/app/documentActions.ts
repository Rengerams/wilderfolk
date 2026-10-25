import type { DocMetadata, Rect, StoredDocMeta } from "../types"
import { t } from "../i18n/translate"
import { buildPdfOffThread } from "../pdf/writeBridge"
import { clampRectToPage, unrotateRect } from "../pdf/geometry"
import {
  createId,
  sanitizeFileName,
  sourcePage,
  totalRotation,
  withPdfExtension,
} from "../pdf/pages"
import { PdfPasswordError } from "../pdf/decrypt"
import {
  closePdfSource,
  cropRegionDataUrl,
  extractTextFromSource,
  openPdfSource,
  readSourceMetadata,
  renderPageCanvas,
  type PdfSource,
} from "../pdf/render"
import { usePasswordPrompt } from "./passwordPrompt"
import type { ExportArtifact, ExportFormatId } from "../formats/registry"
import { runExport } from "../formats/registry"
import { createProvider, type StorageProvider } from "../storage/providers"
import { currentSettings } from "../storage/settings"
import { downloadBlob, isImageFile, isPdfFile, loadImageElement, readFileAsDataUrl, readFileBytes } from "./files"
import { getCurrentSource, setCurrentSource } from "./sourceRegistry"
import { emptyMetadata, useEditor, type ImportedImage } from "./store"

export function baseNameOf(name: string): string {
  return sanitizeFileName(name.replace(/\.pdf$/i, "")) || "document"
}

function stripEmpty(patch: Partial<DocMetadata>): Partial<DocMetadata> {
  const result: Partial<DocMetadata> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string" && value.trim().length > 0) {
      ;(result as Record<string, string>)[key] = value
    }
  }
  return result
}

/** Drops empty values, mirroring how empty standard fields are stripped on load. */
function stripTags(tags: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) {
    if (key.trim().length > 0 && value.trim().length > 0) result[key] = value
  }
  return result
}

export function activeProvider(): StorageProvider {
  return createProvider(currentSettings())
}

export async function buildCurrentPdf(): Promise<Uint8Array> {
  const { doc } = useEditor.getState()
  return buildPdfOffThread({
    sourceBytes: doc.source?.bytes ?? null,
    pages: doc.pages,
    annotations: doc.annotations,
    ocr: doc.ocr,
    metadata: doc.metadata,
    customTags: doc.customTags,
    watermark: doc.watermark,
    includeOcr: true,
  })
}

export async function saveDocument(options: { force?: boolean } = {}): Promise<StoredDocMeta> {
  const state = useEditor.getState()
  if (state.doc.pages.length === 0) throw new Error(t("Add at least one page before saving."))
  const bytes = await buildCurrentPdf()
  const provider = activeProvider()
  const meta = await provider.write({
    id: state.doc.id,
    name: withPdfExtension(baseNameOf(state.doc.name)),
    pages: state.doc.pages.length,
    bytes,
    force: options.force,
  })
  state.markSaved(new Date().toISOString())
  return meta
}

export async function saveDocumentCopy(): Promise<string> {
  const state = useEditor.getState()
  const bytes = await buildCurrentPdf()
  const filename = `${baseNameOf(state.doc.name)} copy.pdf`
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), filename)
  state.setStatus(t("Saved a copy as {filename}", { filename }))
  return filename
}

async function extractCurrentText(): Promise<string> {
  const { doc } = useEditor.getState()
  const parts: string[] = []
  const source = getCurrentSource()
  if (source) {
    const text = await extractTextFromSource(source)
    if (text.trim().length > 0) parts.push(text)
  }
  for (const layer of doc.ocr) {
    if (!layer.applied) continue
    const index = doc.pages.findIndex((page) => page.id === layer.pageId)
    const text = layer.lines.map((line) => line.text).join("\n").trim()
    if (text.length > 0) parts.push(`--- recognized text, page ${index + 1} ---\n${text}`)
  }
  return parts.join("\n\n")
}

/** Renders the finished document, so exported images match the saved PDF exactly. */
async function renderPagesAsImages(
  mime: "image/png" | "image/jpeg",
): Promise<ExportArtifact[]> {
  const state = useEditor.getState()
  const base = baseNameOf(state.doc.name)
  const bytes = await buildCurrentPdf()
  const temporary = await openPdfSource(bytes, `${base} export`)
  try {
    const artifacts: ExportArtifact[] = []
    for (let index = 0; index < temporary.pageMeta.length; index += 1) {
      const canvas = await renderPageCanvas({
        source: temporary,
        srcIndex: index,
        totalRotation: 0,
        scale: 2,
      })
      const dataUrl = canvas.toDataURL(mime, 0.92)
      const blob = await (await fetch(dataUrl)).blob()
      artifacts.push({
        filename: `${base}-page-${String(index + 1).padStart(2, "0")}.${mime === "image/png" ? "png" : "jpg"}`,
        blob,
      })
    }
    return artifacts
  } finally {
    await closePdfSource(temporary)
  }
}

export async function exportAs(format: ExportFormatId): Promise<ExportArtifact[]> {
  const state = useEditor.getState()
  if (state.doc.pages.length === 0) throw new Error(t("There is nothing to export yet."))
  const artifacts = await runExport(format, {
    baseName: baseNameOf(state.doc.name),
    buildPdf: buildCurrentPdf,
    extractText: extractCurrentText,
    renderPages: renderPagesAsImages,
  })
  for (const artifact of artifacts) downloadBlob(artifact.blob, artifact.filename)
  state.setStatus(
    artifacts.length === 1
      ? t("Exported {filename}", { filename: artifacts[0].filename })
      : t("Exported {count} files", { count: artifacts.length }),
  )
  return artifacts
}

/** Opens a file, asking for its password until it unlocks or the user gives up. */
async function openSource(bytes: Uint8Array, name: string): Promise<PdfSource> {
  let password: string | undefined
  for (;;) {
    try {
      return await openPdfSource(bytes, name, { password })
    } catch (error) {
      if (!(error instanceof PdfPasswordError)) throw error
      const answer = await usePasswordPrompt.getState().ask(error.incorrect)
      if (answer === null) {
        throw new Error(t("{name} was not opened because it needs a password.", { name }))
      }
      password = answer
    }
  }
}

async function adoptSource(source: PdfSource): Promise<void> {
  const previous = getCurrentSource()
  setCurrentSource(source)
  if (previous) await closePdfSource(previous)
}

async function loadPdfBytes(
  source: PdfSource,
  name: string,
  options: { id?: string; savedAt?: string; dirty: boolean },
): Promise<void> {
  const pages = source.pageMeta.map((meta, index) =>
    sourcePage({ srcIndex: index, size: meta.size, authoredRotation: meta.authoredRotation }),
  )
  const read = await readSourceMetadata(source)
  const metadata = { ...emptyMetadata(), ...stripEmpty(read.metadata) }
  const customTags = stripTags(read.customTags)
  await adoptSource(source)
  useEditor
    .getState()
    .replaceDocument({
      id: options.id ?? createId("doc"),
      name: withPdfExtension(name),
      source: { name, bytes: source.bytes },
      pages,
      annotations: [],
      ocr: [],
      watermark: null,
      metadata,
      customTags,
      xmp: read.xmp,
      dirty: options.dirty,
      savedAt: options.savedAt ?? null,
    })
}

export async function openDocumentFile(file: File): Promise<void> {
  const bytes = await readFileBytes(file)
  const source = await openSource(bytes, file.name)
  try {
    await loadPdfBytes(source, file.name, { dirty: true })
  } catch (error) {
    await closePdfSource(source)
    throw error
  }
  useEditor.getState().setStatus(t("Opened {name}", { name: file.name }))
}

export async function readImageInput(file: File): Promise<ImportedImage> {
  if (!isImageFile(file)) throw new Error(t("{name} is not a PNG or JPEG image.", { name: file.name }))
  const dataUrl = await readFileAsDataUrl(file)
  const image = await loadImageElement(dataUrl)
  return {
    dataUrl,
    mime: file.type === "image/jpeg" ? "image/jpeg" : "image/png",
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
}

/** Drops a picture onto a page as a movable, resizable object. */
export async function insertImageOnPage(
  pageId: string,
  file: File,
  at?: { x: number; y: number },
): Promise<void> {
  const state = useEditor.getState()
  const page = state.doc.pages.find((entry) => entry.id === pageId)
  if (!page) throw new Error(t("Select a page before adding an image."))
  const image = await readImageInput(file)
  const width = Math.min(0.42, 0.42 * (image.width / image.height) * (page.height / page.width) + 0.1)
  const height = width * (page.width / page.height) * (image.height / image.width)
  const x = at ? Math.min(Math.max(at.x - width / 2, 0), 1 - width) : (1 - width) / 2
  const y = at ? Math.min(Math.max(at.y - height / 2, 0), 1 - height) : (1 - height) / 2
  state.addAnnotation({
    id: createId("ann"),
    pageId,
    type: "image",
    rect: { x, y, w: width, h: height },
    dataUrl: image.dataUrl,
    mime: image.mime,
  })
  state.setStatus(`Added ${file.name} to the page`)
}

/** Copies the picture inside the selected region out of the page as a new image object. */
export async function copyRegionAsImage(pageId: string, displayRect: Rect): Promise<void> {
  const state = useEditor.getState()
  const page = state.doc.pages.find((entry) => entry.id === pageId)
  const source = getCurrentSource()
  if (!page || page.kind !== "source" || !source) {
    throw new Error(t("Only pages that came from a PDF file can be captured this way."))
  }
  const rotation = totalRotation(page)
  const dataUrl = await cropRegionDataUrl({
    source,
    srcIndex: page.srcIndex,
    totalRotation: rotation,
    displayRect,
    scale: 3,
  })
  const image = await loadImageElement(dataUrl)
  state.addAnnotation({
    id: createId("ann"),
    pageId,
    type: "image",
    rect: unrotateRect(clampRectToPage(displayRect), rotation),
    dataUrl,
    mime: "image/png",
  })
  state.setStatus(`Copied a ${image.naturalWidth} × ${image.naturalHeight} image out of the page`)
}

export async function listLibrary(): Promise<StoredDocMeta[]> {
  return activeProvider().list()
}

export async function openFromLibrary(meta: StoredDocMeta): Promise<void> {
  const bytes = await activeProvider().read(meta.id)
  const source = await openSource(bytes, meta.name)
  try {
    await loadPdfBytes(source, meta.name, {
      id: meta.id,
      savedAt: meta.updatedAt,
      dirty: false,
    })
  } catch (error) {
    await closePdfSource(source)
    throw error
  }
  useEditor.getState().setStatus(`Opened ${meta.name} from the library`)
}

export async function removeFromLibrary(id: string): Promise<void> {
  await activeProvider().remove(id)
}

export async function testStorageProvider(): Promise<string> {
  const provider = activeProvider()
  if (provider.probe) return provider.probe()
  const documents = await provider.list()
  return t(
    documents.length === 1
      ? "Connected — {count} document stored locally."
      : "Connected — {count} documents stored locally.",
    { count: documents.length },
  )
}

export function documentIsPdf(file: File): boolean {
  return isPdfFile(file)
}

export function imageFilesOf(files: File[]): File[] {
  return files.filter(isImageFile)
}
