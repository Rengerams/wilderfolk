import type { PdfSource } from "../pdf/render"

/** The live pdf.js handle for the opened file. Not part of the document state or undo history. */
let current: PdfSource | null = null

export function setCurrentSource(source: PdfSource | null): void {
  current = source
}

export function getCurrentSource(): PdfSource | null {
  return current
}
