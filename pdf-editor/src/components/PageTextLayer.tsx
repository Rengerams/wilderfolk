import { useEffect, useRef } from "react"
import { TextLayer } from "pdfjs-dist"
import type { Rotation } from "../types"
import type { PdfSource } from "../pdf/render"

type Props = {
  source: PdfSource
  srcIndex: number
  rotation: Rotation
  scale: number
  width: number
  height: number
  interactive: boolean
}

/** Transparent text over the painted page, so its text can be selected, copied and searched. */
export function PageTextLayer({ source, srcIndex, rotation, scale, width, height, interactive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.replaceChildren()
    let cancelled = false
    let layer: TextLayer | null = null
    void (async () => {
      const page = await source.doc.getPage(srcIndex + 1)
      try {
        const viewport = page.getViewport({ scale, rotation })
        const textContent = await page.getTextContent()
        if (cancelled) return
        layer = new TextLayer({ textContentSource: textContent, container, viewport })
        await layer.render()
      } finally {
        page.cleanup()
      }
    })().catch(() => {
      // A page that moves on mid-render leaves an empty layer behind.
    })
    return () => {
      cancelled = true
      layer?.cancel()
    }
  }, [source, srcIndex, rotation, scale])

  return (
    <div
      ref={containerRef}
      className="textLayer"
      data-interactive={interactive ? "true" : "false"}
      style={{ width, height, "--total-scale-factor": scale } as React.CSSProperties}
    />
  )
}
