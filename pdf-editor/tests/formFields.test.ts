import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { fillFormFields, readFormFields } from "../src/pdf/formFields"
import { contentStreams, hasText } from "./pdfText"

async function makeTemplate(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([595.28, 841.89])
  const form = document.getForm()
  const name = form.createTextField("KlantNaam")
  name.addToPage(page, { x: 40, y: 700, width: 200, height: 20 })
  const date = form.createTextField("FactuurDatum")
  date.addToPage(page, { x: 40, y: 660, width: 200, height: 20 })
  const agree = form.createCheckBox("Akkoord")
  agree.addToPage(page, { x: 40, y: 620, width: 14, height: 14 })
  return document.save({ useObjectStreams: false })
}

describe("PDF form fields", () => {
  it("lists the fields a template contains", async () => {
    const fields = await readFormFields(await makeTemplate())
    expect(fields.map((field) => field.name).sort()).toEqual(["Akkoord", "FactuurDatum", "KlantNaam"])
    expect(fields.find((field) => field.name === "KlantNaam")?.type).toBe("text")
    expect(fields.find((field) => field.name === "Akkoord")?.type).toBe("checkbox")
    expect(fields.find((field) => field.name === "KlantNaam")?.value).toBe("")
  })

  it("writes values into the fields", async () => {
    const template = await makeTemplate()
    const filled = await fillFormFields(
      template,
      { KlantNaam: "Jan Janssen", FactuurDatum: "23-10-2026", Akkoord: true },
      false,
    )
    const fields = await readFormFields(filled)
    expect(fields.find((field) => field.name === "KlantNaam")?.value).toBe("Jan Janssen")
    expect(fields.find((field) => field.name === "FactuurDatum")?.value).toBe("23-10-2026")
    expect(fields.find((field) => field.name === "Akkoord")?.value).toBe("true")
    expect(hasText(contentStreams(filled), "Jan Janssen")).toBe(true)
  })

  it("makes the values permanent when the form is flattened", async () => {
    const template = await makeTemplate()
    const flattened = await fillFormFields(template, { KlantNaam: "Jan Janssen" }, true)
    expect(await readFormFields(flattened)).toHaveLength(0)
    expect(hasText(contentStreams(flattened), "Jan Janssen")).toBe(true)
  })

  it("leaves fields alone that were not given a value", async () => {
    const template = await makeTemplate()
    const filled = await fillFormFields(template, { KlantNaam: "Alleen dit" }, false)
    const fields = await readFormFields(filled)
    expect(fields.find((field) => field.name === "FactuurDatum")?.value).toBe("")
  })
})
