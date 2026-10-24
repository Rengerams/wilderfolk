import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { LICENSE_TEXT } from "../src/setup/license"

/** The repository LICENSE sits one level above this app; the sandbox mounts the app folder alone. */
const REPOSITORY_LICENSE = fileURLToPath(new URL("../../LICENSE", import.meta.url))

describe("setup license", () => {
  it("carries the complete license notice", () => {
    expect(LICENSE_TEXT).toContain("Wilderfolk Permission-Required License")
    expect(LICENSE_TEXT).toContain("6. Permission requests")
    expect(LICENSE_TEXT.trim().endsWith("decision.")).toBe(true)
  })

  it.skipIf(!existsSync(REPOSITORY_LICENSE))("shows the repository license text unchanged", () => {
    const repository = readFileSync(REPOSITORY_LICENSE, "utf8")
    expect(LICENSE_TEXT.trim()).toBe(repository.replace(/\r\n/g, "\n").trim())
  })
})
