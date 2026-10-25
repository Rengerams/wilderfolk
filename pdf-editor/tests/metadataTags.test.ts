import { describe, expect, it } from "vitest"
import { customTagsFromInfo } from "../src/pdf/metadataTags"

describe("reading every metadata tag", () => {
  it("reads the custom entries pdf.js collects from the Info dictionary", () => {
    const custom = new Map<string, string | number | null>([
      ["InvoiceNumber", "2026-042"],
      ["Department", "Finance"],
      ["Empty", ""],
    ])
    expect(customTagsFromInfo({ Custom: custom })).toEqual({
      InvoiceNumber: "2026-042",
      Department: "Finance",
    })
  })

  it("reads tags given as a plain object and casts numbers and booleans", () => {
    expect(customTagsFromInfo({ Custom: { Page: 3, Flag: true, Broken: null } })).toEqual({
      Page: "3",
      Flag: "true",
    })
  })

  it("returns nothing when the file carries no custom entries", () => {
    expect(customTagsFromInfo({})).toEqual({})
  })
})
