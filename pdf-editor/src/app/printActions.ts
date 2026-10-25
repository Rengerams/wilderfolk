import { t } from "../i18n/translate"
import { closePdfSource, openPdfSource, renderPageCanvas } from "../pdf/render"
import { buildCurrentPdf } from "./documentActions"
import { useEditor } from "./store"

const PRINT_DPI = 150
const PRINT_TIMEOUT_MS = 120_000

/** Prints the document exactly as it will be saved: one sheet per page, annotations included. */
export async function printDocument(): Promise<void> {
  const state = useEditor.getState()
  if (state.doc.pages.length === 0) throw new Error(t("There are no pages to print."))
  const bytes = await buildCurrentPdf()
  const source = await openPdfSource(bytes, state.doc.name)
  const sheet = document.createElement("div")
  sheet.className = "print-sheet"
  const urls: string[] = []
  try {
    for (let index = 0; index < source.doc.numPages; index += 1) {
      const canvas = await renderPageCanvas({
        source,
        srcIndex: index,
        totalRotation: 0,
        scale: PRINT_DPI / 72,
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) continue
      const url = URL.createObjectURL(blob)
      urls.push(url)
      const image = document.createElement("img")
      image.src = url
      image.alt = ""
      sheet.append(image)
    }
    document.body.append(sheet)
    await Promise.all(
      [...sheet.querySelectorAll("img")].map((image) => image.decode().catch(() => undefined)),
    )
    await whenPrintDialogCloses()
  } finally {
    sheet.remove()
    for (const url of urls) URL.revokeObjectURL(url)
    await closePdfSource(source)
  }
}

function whenPrintDialogCloses(): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(timer)
      window.removeEventListener("afterprint", done)
      resolve()
    }
    const timer = window.setTimeout(done, PRINT_TIMEOUT_MS)
    window.addEventListener("afterprint", done, { once: true })
    window.print()
  })
}
