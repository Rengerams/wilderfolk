import type { Rotation } from "../types"
import type { PdfSource } from "./render"

/** Rendered page bitmaps stay on hand, so a page revisited or prefetched paints without re-rendering. */
const MAX_CACHED_PAGES = 6
const MAX_CACHED_PIXELS = 12_000_000

export type PageRenderInput = {
  pageId: string
  srcIndex: number
  rotation: Rotation
  scale: number
  dpr: number
}

type CachedPage = { bitmap: ImageBitmap; pixels: number }

const cached = new Map<string, CachedPage>()
let owner: PdfSource | null = null

export function pageRenderKey(input: PageRenderInput): string {
  return [
    input.pageId,
    input.srcIndex,
    input.rotation,
    input.scale.toFixed(3),
    input.dpr.toFixed(2),
  ].join("|")
}

/** Bitmaps belong to one opened file; a new source (another file, or a rewritten one) drops them. */
export function syncPageCache(source: PdfSource | null): void {
  if (owner === source) return
  owner = source
  clearPageCache()
}

export function recallPageBitmap(key: string): ImageBitmap | null {
  const entry = cached.get(key)
  if (!entry) return null
  cached.delete(key)
  cached.set(key, entry)
  return entry.bitmap
}

export function rememberPageBitmap(key: string, bitmap: ImageBitmap): void {
  const previous = cached.get(key)
  if (previous) {
    cached.delete(key)
    if (previous.bitmap !== bitmap) previous.bitmap.close()
  }
  cached.set(key, { bitmap, pixels: bitmap.width * bitmap.height })

  let pixels = 0
  for (const entry of cached.values()) pixels += entry.pixels
  for (const [oldKey, entry] of cached) {
    if (cached.size <= 1 || (cached.size <= MAX_CACHED_PAGES && pixels <= MAX_CACHED_PIXELS)) break
    cached.delete(oldKey)
    pixels -= entry.pixels
    entry.bitmap.close()
  }
}

export function clearPageCache(): void {
  for (const entry of cached.values()) entry.bitmap.close()
  cached.clear()
}
