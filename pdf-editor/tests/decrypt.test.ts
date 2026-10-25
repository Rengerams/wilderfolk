import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib"
import { describe, expect, it } from "vitest"
import { PdfPasswordError, decryptPdfBytes } from "../src/pdf/decrypt"

async function lockedPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  document.addPage([300, 200]).drawText("Locked hello", { x: 20, y: 100, size: 18, font })
  document.encrypt({ userPassword: "secret", ownerPassword: "owner" })
  return document.save()
}

describe("password-protected PDFs", () => {
  it("leaves an ordinary file untouched", async () => {
    const document = await PDFDocument.create()
    document.addPage()
    expect(await decryptPdfBytes(await document.save(), undefined)).toBeNull()
  })

  it("asks for a password instead of returning locked bytes", async () => {
    const bytes = await lockedPdf()
    const error = await decryptPdfBytes(bytes, undefined).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PdfPasswordError)
    expect((error as PdfPasswordError).incorrect).toBe(false)
  })

  it("reports a wrong password", async () => {
    const bytes = await lockedPdf()
    const error = await decryptPdfBytes(bytes, "wrong").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PdfPasswordError)
    expect((error as PdfPasswordError).incorrect).toBe(true)
  })

  it("returns a copy that opens without the password", async () => {
    const decrypted = await decryptPdfBytes(await lockedPdf(), "secret")
    expect(decrypted).not.toBeNull()
    const reopened = await PDFDocument.load(decrypted as Uint8Array)
    expect(reopened.getPageCount()).toBe(1)
    expect(reopened.isEncrypted).toBe(false)
  })
})
