import { beforeEach, describe, expect, it } from "vitest"
import {
  clearPageCache,
  pageRenderKey,
  recallPageBitmap,
  rememberPageBitmap,
  syncPageCache,
} from "../src/pdf/pageCache"
import type { PdfSource } from "../src/pdf/render"

type FakeBitmap = { width: number; height: number; closed: boolean }

const opened: FakeBitmap[] = []

function bitmap(width: number, height: number): ImageBitmap {
  const fake: FakeBitmap = { width, height, closed: false }
  opened.push(fake)
  const handle = {
    width,
    height,
    close: () => {
      fake.closed = true
    },
  }
  return handle as unknown as ImageBitmap
}

const key = (pageId: string) =>
  pageRenderKey({ pageId, srcIndex: 0, rotation: 0, scale: 1, dpr: 2 })

describe("page bitmap cache", () => {
  beforeEach(() => {
    clearPageCache()
    opened.length = 0
  })

  it("keys a bitmap by page, rotation, scale and pixel density", () => {
    const base = { pageId: "page-1", srcIndex: 3, rotation: 0 as const, scale: 1, dpr: 2 }
    expect(pageRenderKey(base)).not.toBe(pageRenderKey({ ...base, rotation: 90 }))
    expect(pageRenderKey(base)).not.toBe(pageRenderKey({ ...base, scale: 1.5 }))
    expect(pageRenderKey(base)).not.toBe(pageRenderKey({ ...base, dpr: 1 }))
    expect(pageRenderKey(base)).toBe(pageRenderKey({ ...base }))
  })

  it("returns a remembered bitmap and drops unknown keys", () => {
    const first = bitmap(120, 160)
    rememberPageBitmap(key("a"), first)
    expect(recallPageBitmap(key("a"))).toBe(first)
    expect(recallPageBitmap(key("missing"))).toBeNull()
  })

  it("evicts and releases bitmaps once the pixel budget is spent", () => {
    const keys = ["a", "b", "c", "d"]
    for (const pageId of keys) rememberPageBitmap(key(pageId), bitmap(2000, 2000))

    expect(recallPageBitmap(key("a"))).toBeNull()
    expect(opened[0].closed).toBe(true)
    expect(recallPageBitmap(key("d"))).not.toBeNull()
  })

  it("releases every bitmap when the opened file changes", () => {
    rememberPageBitmap(key("a"), bitmap(100, 100))
    syncPageCache({} as PdfSource)
    expect(recallPageBitmap(key("a"))).toBeNull()
    expect(opened[0].closed).toBe(true)
  })
})
