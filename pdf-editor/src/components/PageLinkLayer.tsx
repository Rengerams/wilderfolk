import { useEffect, useState } from "react"
import type { Rotation } from "../types"
import type { PdfSource } from "../pdf/render"
import { t } from "../i18n/translate"

type LinkBox = {
  id: string
  left: number
  top: number
  width: number
  height: number
  href?: string
  pageIndex?: number
}

type Props = {
  source: PdfSource
  srcIndex: number
  rotation: Rotation
  scale: number
  interactive: boolean
  onFollowPage: (srcIndex: number) => void
}

/** Only web and mail links from a PDF are opened; unknown schemes are ignored. */
function openableHref(href: string): boolean {
  try {
    const scheme = new URL(href).protocol
    return scheme === "http:" || scheme === "https:" || scheme === "mailto:"
  } catch {
    return false
  }
}

/** The link boxes of the page they were measured for, so a stale page never shows stale boxes. */
type LoadedLinks = {
  source: PdfSource
  srcIndex: number
  rotation: Rotation
  scale: number
  links: LinkBox[]
}

/** Clickable regions for the links a PDF carries, so URLs and cross-references work in the editor. */
export function PageLinkLayer({ source, srcIndex, rotation, scale, interactive, onFollowPage }: Props) {
  const [loaded, setLoaded] = useState<LoadedLinks | null>(null)
  const links =
    loaded &&
    loaded.source === source &&
    loaded.srcIndex === srcIndex &&
    loaded.rotation === rotation &&
    loaded.scale === scale
      ? loaded.links
      : []

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const page = await source.doc.getPage(srcIndex + 1)
      try {
        const viewport = page.getViewport({ scale, rotation })
        const annotations = await page.getAnnotations({ intent: "display" })
        const boxes: LinkBox[] = []
        for (const annotation of annotations) {
          if (annotation.subtype !== "Link") continue
          const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1])
          const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3])
          boxes.push({
            id: annotation.id ?? `${x1}:${y1}:${x2}:${y2}`,
            left: Math.min(x1, x2),
            top: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
            href: annotation.url ?? undefined,
            pageIndex: await destinationPage(source, annotation.dest),
          })
        }
        if (!cancelled) setLoaded({ source, srcIndex, rotation, scale, links: boxes })
      } finally {
        page.cleanup()
      }
    })().catch(() => {
      // A page without a readable annotation layer simply carries no links.
    })
    return () => {
      cancelled = true
    }
  }, [source, srcIndex, rotation, scale])

  return (
    <div className="linkLayer" data-interactive={interactive ? "true" : "false"}>
      {links.map((link) => {
        const pageIndex = link.pageIndex
        const href = link.href
        if (!href && pageIndex === undefined) return null
        return (
          <button
            key={link.id}
            type="button"
            className="page-link"
            style={{ left: link.left, top: link.top, width: link.width, height: link.height }}
            title={href ?? t("Go to page {number}", { number: pageIndex! + 1 })}
            onClick={() => {
              if (href && openableHref(href)) window.open(href, "_blank", "noopener,noreferrer")
              else if (pageIndex !== undefined) onFollowPage(pageIndex)
            }}
          />
        )
      })}
    </div>
  )
}

async function destinationPage(source: PdfSource, dest: unknown): Promise<number | undefined> {
  const resolved = typeof dest === "string" ? await source.doc.getDestination(dest) : dest
  if (!Array.isArray(resolved) || resolved.length === 0) return undefined
  const ref: unknown = resolved[0]
  if (typeof ref === "number") return ref
  if (!ref || typeof ref !== "object") return undefined
  try {
    return await source.doc.getPageIndex(ref as Parameters<PdfSource["doc"]["getPageIndex"]>[0])
  } catch {
    return undefined
  }
}
