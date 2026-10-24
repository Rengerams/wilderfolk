import { useEffect, useRef, useState } from "react"
import { CopyPlus, RotateCcw, RotateCw, Trash2 } from "lucide-react"
import type { Annotation, Rotation } from "../types"
import { totalRotation } from "../pdf/pages"
import { renderPageCanvas } from "../pdf/render"
import { getCurrentSource } from "../app/sourceRegistry"
import { useEditor } from "../app/store"
import { useT } from "../i18n"

type ThumbEntry = { url: string; rotation: Rotation }

export function ThumbnailRail() {
  const t = useT()
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
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(() => new Set())
  const railListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setThumbs({})
  }, [documentId])

  // Only pages near the visible part of the rail get a thumbnail, so a long file stays responsive.
  useEffect(() => {
    const root = railListRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleIds((current) => {
          const next = new Set(current)
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.pageId
            if (!id) continue
            if (entry.isIntersecting) next.add(id)
            else next.delete(id)
          }
          return next
        })
      },
      { root, rootMargin: "600px 0px" },
    )
    root.querySelectorAll<HTMLElement>("[data-page-id]").forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [pages])

  useEffect(() => {
    const source = getCurrentSource()
    if (!source) return
    const pending = pages.filter(
      (page) =>
        page.kind === "source" &&
        (page.id === activePageId || visibleIds.has(page.id)) &&
        thumbs[page.id]?.rotation !== totalRotation(page),
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
          // A page that cannot be rendered keeps its previous thumbnail.
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activePageId, pages, thumbs, visibleIds])

  const pageImage = (pageId: string): Annotation | undefined =>
    annotations.find((annotation) => annotation.pageId === pageId && annotation.type === "image")

  return (
    <aside className="rail" aria-label={t("Pages")}>
      <div className="panel-heading">
        <span>{t("Pages")}</span>
        <span>{pages.length}</span>
      </div>
      <div className="rail-list" ref={railListRef}>
        {pages.length === 0 ? <p className="rail-empty">{t("No pages yet.")}</p> : null}
        {pages.map((page, index) => {
          const image = pageImage(page.id)
          const thumb = thumbs[page.id]
          const preview = thumb?.url ?? (image?.type === "image" ? image.dataUrl : null)
          return (
            <div
              key={page.id}
              data-page-id={page.id}
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
                {preview ? <img src={preview} alt={t("Page {number}", { number: index + 1 })} /> : null}
              </div>
              <div className="thumb-meta">
                <span className="thumb-index">{t("Page {number}", { number: index + 1 })}</span>
                {page.kind === "blank" ? <span>{t("New page")}</span> : null}
                {totalRotation(page) !== 0 ? (
                  <span>{t("{degrees}° rotated", { degrees: totalRotation(page) })}</span>
                ) : null}
                {image ? <span>{t("Scanned picture")}</span> : null}
              </div>
              <div className="thumb-actions">
                <button
                  type="button"
                  className="icon-btn"
                  title={t("Rotate left")}
                  aria-label={t("Rotate page {number} left", { number: index + 1 })}
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
                  title={t("Rotate right")}
                  aria-label={t("Rotate page {number} right", { number: index + 1 })}
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
                  title={t("Duplicate page")}
                  aria-label={t("Duplicate page {number}", { number: index + 1 })}
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
                  title={t("Delete page")}
                  aria-label={t("Delete page {number}", { number: index + 1 })}
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
          {t("+ Add blank page")}
        </button>
      </div>
    </aside>
  )
}
