import { PDFDocument } from "@cantoo/pdf-lib"
import { t } from "../i18n/translate"

/** Raised when a PDF needs a password; `incorrect` tells the prompt that the last answer failed. */
export class PdfPasswordError extends Error {
  readonly incorrect: boolean

  constructor(incorrect: boolean) {
    super(t(incorrect ? "That password is not correct." : "This PDF is password protected."))
    this.name = "PdfPasswordError"
    this.incorrect = incorrect
  }
}

const ENCRYPT_MARKER = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74] // "/Encrypt"

/** A cheap byte scan before the full parse; the parsed document is the authority on encryption. */
function hasEncryptMarker(bytes: Uint8Array): boolean {
  const last = bytes.length - ENCRYPT_MARKER.length
  outer: for (let start = 0; start <= last; start += 1) {
    for (let offset = 0; offset < ENCRYPT_MARKER.length; offset += 1) {
      if (bytes[start + offset] !== ENCRYPT_MARKER[offset]) continue outer
    }
    return true
  }
  return false
}

/** Pages move into a fresh document, which leaves the old encryption and xref state behind. */
async function unlockedCopy(source: PDFDocument): Promise<Uint8Array> {
  const clean = await PDFDocument.create({ updateMetadata: false })
  const pages = await clean.copyPages(source, source.getPageIndices())
  for (const page of pages) clean.addPage(page)
  return clean.save()
}

/** Unlocks a locked file once and returns a plain copy; null means the file was never locked. */
export async function decryptPdfBytes(
  bytes: Uint8Array,
  password: string | undefined,
): Promise<Uint8Array | null> {
  if (!hasEncryptMarker(bytes)) return null
  let probe: PDFDocument
  try {
    probe = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true, updateMetadata: false })
  } catch {
    return null
  }
  if (!probe.isEncrypted) return null
  try {
    const document = await PDFDocument.load(bytes.slice(), {
      password: password ?? "",
      updateMetadata: false,
    })
    return await unlockedCopy(document)
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.message)) {
      throw new PdfPasswordError(password !== undefined)
    }
    throw error
  }
}
