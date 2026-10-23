import { useEffect, useState } from "react"
import { CopyPlus, RotateCcw, RotateCw, Trash2 } from "lucide-react"
import type { Annotation, Rotation } from "../types"
import { totalRotation } from "../pdf/pages"
import { renderPageCanvas } from "../pdf/render"
import { getCurrentSource } from "../app/sourceRegistry"
import { useEditor } from "../app/store"

type ThumbEntry = { url: string; rotation: Rotation }

export function ThumbnailRail() {
  const pages = useEditor((state) => state.doc.pages)
  const annotations = useEditor((state) => state.doc.annotations)
  const activePageId = useEditor((state) => state.activePageId)
  const documentId = useEditor((state) => state.doc.id)
  const setActivePage = useEditor((state) => state.setActivePage)
  const rotatePage = useEditor((state) => state.rotatePage)
  const duplicatePage = useEditor((state) => state.duplicatePage)
  const removePage = useEditor((state) => state.removePage)
  const insertBlankPage = useEditor((state) => state.insertBlankPage)
  const movePageTo = useEditor((state) => state.movePageTo)

  const [thumbs, setThumbs] = useState<Record<string, ThumbEntry>>({})
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    setThumbs({})
  }, [documentId])

  useEffect(() => {
    const source = getCurrentSource()
    if (!source) return
    const pending = pages.filter(
      (page) => page.kind === "source" && thumbs[page.id]?.rotation !== totalRotation(page),
    )
    if (pending.length === 0) return
    let cancelled = false
    void (async () => {
      for (const page of pending) {
        if (cancelled) return
        if (page.kind !== "source") continue
        try {
          const canvas = await renderPageCanvas({
            source,
            srcIndex: page.srcIndex,
            totalRotation: totalRotation(page),
            scale: 0.32,
          })
          if (cancelled) return
          const url = canvas.toDataURL("image/jpeg", 0.72)
          setThumbs((current) => ({
            ...current,
            [page.id]: { url, rotation: totalRotation(page) },
          }))
        } catch {
          // A missing thumbnail must never interrupt editing.
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pages, thumbs])

  const pageImage = (pageId: string): Annotation | undefined =>
    annotations.find((annotation) => annotation.pageId === pageId && annotation.type === "image")

  return (
    <aside className="rail" aria-label="Pages">
      <div className="panel-heading">
        <span>Pages</span>
        <span>{pages.length}</span>
      </div>
      <div className="rail-list">
        {pages.length === 0 ? <p className="rail-empty">No pages yet.</p> : null}
        {pages.map((page, index) => {
          const image = pageImage(page.id)
          const thumb = thumbs[page.id]
          const preview = thumb?.url ?? (image?.type === "image" ? image.dataUrl : null)
          return (
            <div
              key={page.id}
              className={`thumb${dragOverId === page.id ? " drag-over" : ""}`}
              role="button"
              tabIndex={0}
              aria-current={page.id === activePageId}
              draggable
              onClick={() => setActivePage(page.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setActivePage(page.id)
              }}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", page.id)
                event.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOverId(page.id)
              }}
              onDragLeave={() => setDragOverId((current) => (current === page.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault()
                setDragOverId(null)
                const dragged = event.dataTransfer.getData("text/plain")
                if (dragged) movePageTo(dragged, index)
              }}
            >
              <div className={preview ? "thumb-frame" : "thumb-frame is-blank"}>
                {preview ? <img src={preview} alt={`Page ${index + 1}`} /> : null}
              </div>
              <div className="thumb-meta">
                <span className="thumb-index">Page {index + 1}</span>
                {page.kind === "blank" ? <span>New page</span> : null}
                {totalRotation(page) !== 0 ? <span>{totalRotation(page)}° rotated</span> : null}
                {image ? <span>Scanned picture</span> : null}
              </div>
              <div className="thumb-actions">
                <button
                  type="button"
                  className="icon-btn"
                  title="Rotate left"
                  aria-label={`Rotate page ${index + 1} left`}
                  onClick={(event) => {
                    event.stopPropagation()
                    rotatePage(page.id, -90)
                  }}
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Rotate right"
                  aria-label={`Rotate page ${index + 1} right`}
                  onClick={(event) => {
                    event.stopPropagation()
                    rotatePage(page.id, 90)
                  }}
                >
                  <RotateCw size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Duplicate page"
                  aria-label={`Duplicate page ${index + 1}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    duplicatePage(page.id)
                  }}
                >
                  <CopyPlus size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Delete page"
                  aria-label={`Delete page ${index + 1}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    removePage(page.id)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )
        })}
        <button type="button" className="btn btn-quiet" onClick={() => insertBlankPage(activePageId || null)}>
          + Add blank page
        </button>
      </div>
    </aside>
  )
}
