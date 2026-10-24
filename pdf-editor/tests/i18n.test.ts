import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { nl } from "../src/i18n/nl"

const SOURCE_ROOT = fileURLToPath(new URL("../src", import.meta.url))

function sourceMessages(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceMessages(path)
    if (!/\.tsx?$/.test(path)) return []
    const text = readFileSync(path, "utf8")
    return [...text.matchAll(/(?<![A-Za-z])t\(\s*"([^"]*)"/g)].map((match) => match[1])
  })
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
}

const MESSAGES = [...new Set(sourceMessages(SOURCE_ROOT))].sort()

describe("Dutch interface catalog", () => {
  it("finds the interface messages in the source", () => {
    expect(MESSAGES.length).toBeGreaterThan(300)
  })

  it("translates every interface message", () => {
    const untranslated = MESSAGES.filter((message) => !nl[message]?.trim())
    expect(untranslated).toEqual([])
  })

  it("keeps every placeholder of the source message", () => {
    const broken = MESSAGES.filter((message) => {
      const translation = nl[message]
      return translation ? placeholders(translation).join() !== placeholders(message).join() : false
    })
    expect(broken).toEqual([])
  })
})
