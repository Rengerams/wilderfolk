import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Point, Rect, Rotation } from "../types"
import {
  clamp01,
  displaySize,
  rectFromPoints,
  rotatePoint,
  rotateRect,
  unrotatePoint,
  unrotateRect,
} from "../pdf/geometry"
import { createId, totalRotation } from "../pdf/pages"
import { renderPageInto } from "../pdf/render"
import { pageRenderKey, recallPageBitmap, rememberPageBitmap, syncPageCache } from "../pdf/pageCache"
import { hexToRgb } from "../pdf/buildPdf"
import { insertImageOnPage } from "../app/documentActions"
import { pickFiles } from "../app/files"
import { getCurrentSource } from "../app/sourceRegistry"
import { useEditor } from "../app/store"
import { useCommands } from "../app/useCommands"
import { PageLinkLayer } from "./PageLinkLayer"
import { PageTextLayer } from "./PageTextLayer"
import { WelcomeScreen } from "./WelcomeScreen"

const MIN_MARQUEE = 0.005
const VIEWER_PADDING = 48
const PREFETCH_DELAY_MS = 350
const DEFAULT_INK_COLOR = "#c42b1c"
const DEFAULT_TEXT_COLOR = "#111111"

type Draft =
  | { kind: "marquee"; start: Point; rect: Rect }
  | { kind: "ink"; points: Point[] }
  | null

function tint(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`
}

export function PageViewer() {
  const commands = useCommands()
  const pages = useEditor((state) => state.doc.pages)
  const annotations = useEditor((state) => state.doc.annotations)
  const ocrLayers = useEditor((state) => state.doc.ocr)
  const activePageId = useEditor((state) => state.activePageId)
  const tool = useEditor((state) => state.tool)
  const zoom = useEditor((state) => state.zoom)
  const fitMode = useEditor((state) => state.fitMode)
  const selectedId = useEditor((state) => state.selectedAnnotationId)
  const setZoom = useEditor((state) => state.setZoom)
  const selectAnnotation = useEditor((state) => state.selectAnnotation)
  const addAnnotation = useEditor((state) => state.addAnnotation)
  const updateAnnotation = useEditor((state) => state.updateAnnotation)
  const setActivePage = useEditor((state) => state.setActivePage)
  const source = getCurrentSource()

  const page = useMemo(
    () => pages.find((entry) => entry.id === activePageId) ?? pages[0] ?? null,
    [pages, activePageId],
  )
  const pageAnnotations = useMemo(
    () => (page ? annotations.filter((annotation) => annotation.pageId === page.id) : []),
    [annotations, page],
  )
  const ocrLayer = useMemo(
    () => ocrLayers.find((layer) => layer.pageId === page?.id) ?? null,
    [ocrLayers, page],
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [container, setContainer] = useState({ width: 900, height: 700 })
  const [draft, setDraft] = useState<Draft>(null)
  const [moveDraft, setMoveDraft] = useState<{ id: string; rect: Rect } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [textDraft, setTextDraft] = useState("")
  // Committing reads the ref, so the value can never be a frame behind the last keystroke.
  const textDraftRef = useRef("")

  const rotation: Rotation = page ? totalRotation(page) : 0
  const pageDisplay = page
    ? displaySize(page.width, page.height, rotation)
    : { width: 595, height: 842 }

  const fitScale = useMemo(() => {
    const available = {
      width: Math.max(120, container.width - VIEWER_PADDING),
      height: Math.max(120, container.height - VIEWER_PADDING),
    }
    return {
      page: Math.max(0.1, Math.min(available.width / pageDisplay.width, available.height / pageDisplay.height)),
      width: Math.max(0.1, available.width / pageDisplay.width),
    }
  }, [container, pageDisplay])

  const scale = fitMode === "custom" ? zoom : fitMode === "page" ? fitScale.page : fitScale.width
  const stageWidth = Math.max(1, Math.round(pageDisplay.width * scale))
  const stageHeight = Math.max(1, Math.round(pageDisplay.height * scale))

  useEffect(() => {
    if (fitMode !== "custom") setZoom(scale, fitMode)
  }, [fitMode, scale, setZoom])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => setContainer({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !page) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const sheetWidth = Math.max(1, Math.round(stageWidth * dpr))
    const sheetHeight = Math.max(1, Math.round(stageHeight * dpr))
    // A blank sheet is painted first, so the previous page never lingers under the new one.
    const paintSheet = () => {
      if (canvas.width !== sheetWidth) canvas.width = sheetWidth
      if (canvas.height !== sheetHeight) canvas.height = sheetHeight
      const context = canvas.getContext("2d")
      if (!context) return
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    const paintBitmap = (bitmap: ImageBitmap) => {
      if (canvas.width !== bitmap.width) canvas.width = bitmap.width
      if (canvas.height !== bitmap.height) canvas.height = bitmap.height
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
    }

    paintSheet()
    const source = getCurrentSource()
    syncPageCache(source)
    if (page.kind !== "source" || !source) return
    const key = pageRenderKey({
      pageId: page.id,
      srcIndex: page.srcIndex,
      rotation,
      scale,
      dpr,
    })
    const remembered = recallPageBitmap(key)
    if (remembered) {
      paintBitmap(remembered)
      return
    }

    const controller = new AbortController()
    const buffer = document.createElement("canvas")
    void renderPageInto({
      source,
      srcIndex: page.srcIndex,
      totalRotation: rotation,
      scale,
      canvas: buffer,
      dpr,
      signal: controller.signal,
    })
      .then(async () => {
        if (controller.signal.aborted) return
        if (canvas.width !== buffer.width) canvas.width = buffer.width
        if (canvas.height !== buffer.height) canvas.height = buffer.height
        canvas.getContext("2d")?.drawImage(buffer, 0, 0)
        try {
          const bitmap = await createImageBitmap(buffer)
          if (controller.signal.aborted) {
            bitmap.close()
            return
          }
          rememberPageBitmap(key, bitmap)
        } catch {
          // Caching is an optimisation; the page itself is already on screen.
        }
      })
      .catch(() => {
        // A cancelled render leaves the blank sheet in place.
      })
    return () => controller.abort()
  }, [page, rotation, scale, stageWidth, stageHeight])

  // The neighbouring pages render while the view is idle, so paging through a long file stays instant.
  useEffect(() => {
    const source = getCurrentSource()
    if (!source || !page || page.kind !== "source") return
    const index = pages.findIndex((entry) => entry.id === page.id)
    if (index < 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const neighbour of [pages[index + 1], pages[index - 1]]) {
          if (!neighbour || neighbour.kind !== "source" || controller.signal.aborted) continue
          const neighbourRotation = totalRotation(neighbour)
          const key = pageRenderKey({
            pageId: neighbour.id,
            srcIndex: neighbour.srcIndex,
            rotation: neighbourRotation,
            scale,
            dpr,
          })
          if (recallPageBitmap(key)) continue
          const buffer = document.createElement("canvas")
          try {
            await renderPageInto({
              source,
              srcIndex: neighbour.srcIndex,
              totalRotation: neighbourRotation,
              scale,
              canvas: buffer,
              dpr,
              signal: controller.signal,
            })
            if (controller.signal.aborted) return
            const bitmap = await createImageBitmap(buffer)
            if (controller.signal.aborted) {
              bitmap.close()
              return
            }
            rememberPageBitmap(key, bitmap)
          } catch {
            return
          }
        }
      })()
    }, PREFETCH_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [page, pages, scale])

  const beginTextEdit = (annotationId: string, text: string) => {
    textDraftRef.current = text
    setTextDraft(text)
    setEditingId(annotationId)
  }

  const followPageLink = (srcIndex: number) => {
    const target = pages.find((entry) => entry.kind === "source" && entry.srcIndex === srcIndex)
    if (target) setActivePage(target.id)
  }

  const pointFromEvent = (event: { clientX: number; clientY: number }, element: Element): Point => {
    const bounds = element.getBoundingClientRect()
    return {
      x: clamp01((event.clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clamp01((event.clientY - bounds.top) / Math.max(1, bounds.height)),
    }
  }

  const boxStyle = useCallback(
    (rect: Rect) => ({
      left: `${rect.x * stageWidth}px`,
      top: `${rect.y * stageHeight}px`,
      width: `${rect.w * stageWidth}px`,
      height: `${rect.h * stageHeight}px`,
    }),
    [stageWidth, stageHeight],
  )

  /** Text is laid out along the page's own axes, so on a rotated page it turns with the page
   *  instead of being re-wrapped inside the rotated box. */
  const rotatedTextStyle = (rect: Rect): React.CSSProperties | undefined => {
    if (rotation === 0) return undefined
    const swapped = rotation % 180 !== 0
    return {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: `${rect.w * (swapped ? stageHeight : stageWidth)}px`,
      height: `${rect.h * (swapped ? stageWidth : stageHeight)}px`,
      transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
      transformOrigin: "center center",
    }
  }

  // The overlay ignores pointers while selecting, so a click on the page clears the selection here.
  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== "select") return
    if ((event.target as HTMLElement).closest("[data-ann]")) return
    selectAnnotation(null)
    setEditingId(null)
  }

  const onOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!page) return
    if ((event.target as HTMLElement).closest("[data-ann]")) return
    const point = pointFromEvent(event, event.currentTarget)
    if (tool === "text") {
      const anchor = unrotatePoint(point, rotation)
      addAnnotation({
        id: createId("ann"),
        pageId: page.id,
        type: "text",
        rect: { x: Math.min(anchor.x, 0.58), y: Math.max(0, anchor.y - 0.02), w: 0.4, h: 0.06 },
        text: "Text",
        fontSize: 13,
        color: DEFAULT_TEXT_COLOR,
      })
      const created = useEditor.getState().selectedAnnotationId
      if (created) beginTextEdit(created, "Text")
      return
    }
    if (tool === "image") {
      void (async () => {
        const files = await pickFiles("image/png,image/jpeg", false)
        const file = files?.[0]
        if (!file) return
        try {
          await insertImageOnPage(page.id, file, unrotatePoint(point, rotation))
        } catch (error) {
          useEditor
            .getState()
            .setStatus(error instanceof Error ? `⚠ ${error.message}` : "⚠ The image could not be added.")
        }
      })()
      return
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is an optimisation for dragging outside the page; the tool works without it.
    }
    if (tool === "ink") setDraft({ kind: "ink", points: [point] })
    else setDraft({ kind: "marquee", start: point, rect: { x: point.x, y: point.y, w: 0, h: 0 } })
  }

  const onOverlayPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draft) return
    const point = pointFromEvent(event, event.currentTarget)
    if (draft.kind === "ink") setDraft({ kind: "ink", points: [...draft.points, point] })
    else setDraft({ kind: "marquee", start: draft.start, rect: rectFromPoints(draft.start, point) })
  }

  const onOverlayPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draft || !page) {
      setDraft(null)
      return
    }
    const finished = draft
    setDraft(null)
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // Nothing to release when the pointer was never captured.
    }

    if (finished.kind === "ink") {
      if (finished.points.length < 2) return
      addAnnotation({
        id: createId("ann"),
        pageId: page.id,
        type: "ink",
        points: finished.points.map((point) => unrotatePoint(point, rotation)),
        color: DEFAULT_INK_COLOR,
        lineWidth: 2,
      })
      return
    }

    const rect = finished.rect
    if (rect.w < MIN_MARQUEE || rect.h < MIN_MARQUEE) return
    if (tool === "highlight") {
      addAnnotation({
        id: createId("ann"),
        pageId: page.id,
        type: "highlight",
        rect: unrotateRect(rect, rotation),
        color: "#ffd400",
      })
      return
    }
    if (tool === "shape") {
      addAnnotation({
        id: createId("ann"),
        pageId: page.id,
        type: "shape",
        rect: unrotateRect(rect, rotation),
        stroke: DEFAULT_INK_COLOR,
        fill: null,
        lineWidth: 2,
      })
      return
    }
    if (tool === "region") void commands.captureRegion(rect)
  }

  const startAnnotationDrag = (event: React.PointerEvent<Element>, annotationId: string) => {
    if (tool !== "select") return
    event.stopPropagation()
    selectAnnotation(annotationId)
    const overlay = (event.currentTarget as Element).closest(".overlay")
    const annotation = pageAnnotations.find((entry) => entry.id === annotationId)
    if (!overlay || !annotation || annotation.type === "ink") return
    const bounds = overlay.getBoundingClientRect()
    const origin = { x: event.clientX, y: event.clientY }
    const startRect = rotateRect(annotation.rect, rotation)
    const resizing = (event.target as HTMLElement)?.dataset?.handle === "resize"
    let latest = startRect

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - origin.x) / Math.max(1, bounds.width)
      const dy = (moveEvent.clientY - origin.y) / Math.max(1, bounds.height)
      latest = resizing
        ? { ...startRect, w: Math.max(0.01, startRect.w + dx), h: Math.max(0.01, startRect.h + dy) }
        : {
            x: Math.min(Math.max(startRect.x + dx, 0), Math.max(0, 1 - startRect.w)),
            y: Math.min(Math.max(startRect.y + dy, 0), Math.max(0, 1 - startRect.h)),
            w: startRect.w,
            h: startRect.h,
          }
      setMoveDraft({ id: annotationId, rect: latest })
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setMoveDraft(null)
      updateAnnotation(annotationId, { rect: unrotateRect(latest, rotation) })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const renderAnnotation = (annotationId: string) => {
    const annotation = pageAnnotations.find((entry) => entry.id === annotationId)
    if (!annotation) return null
    const selected = annotation.id === selectedId
    const className = `ann ann-${annotation.type}${selected ? " ann-selected" : ""}`
    const handle = selected ? <span className="ann-handle" data-handle="resize" /> : null
    const common = {
      "data-ann": true,
      onPointerDown: (event: React.PointerEvent<Element>) => startAnnotationDrag(event, annotation.id),
    } as const

    if (annotation.type === "ink") {
      const displayPoints = annotation.points
        .map((point) => rotatePoint(point, rotation))
        .map((point) => `${(point.x * stageWidth).toFixed(1)},${(point.y * stageHeight).toFixed(1)}`)
        .join(" ")
      return (
        <div
          key={annotation.id}
          className={className}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <svg
            width={stageWidth}
            height={stageHeight}
            viewBox={`0 0 ${stageWidth} ${stageHeight}`}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <polyline
              points={displayPoints}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "stroke" }}
              {...common}
            />
            <polyline
              points={displayPoints}
              fill="none"
              stroke={selected ? "#0f6cbd" : annotation.color}
              strokeWidth={Math.max(1, annotation.lineWidth * scale)}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
          </svg>
        </div>
      )
    }

    const rect = moveDraft?.id === annotation.id ? moveDraft.rect : rotateRect(annotation.rect, rotation)
    const style = boxStyle(rect)

    if (annotation.type === "image") {
      return (
        <div key={annotation.id} className={className} style={style} {...common}>
          <img src={annotation.dataUrl} alt="" />
          {handle}
        </div>
      )
    }

    const visual = { ...style } as React.CSSProperties
    if (annotation.type === "highlight") visual.background = tint(annotation.color, 0.35)
    if (annotation.type === "shape") {
      visual.border = `${Math.max(1, annotation.lineWidth * scale)}px solid ${annotation.stroke}`
      visual.background = annotation.fill
        ? tint(annotation.fill, annotation.fillOpacity ?? 0.22)
        : "transparent"
    }
    if (annotation.type === "text" && editingId !== annotation.id) {
      visual.fontSize = `${Math.max(8, annotation.fontSize * scale)}px`
      visual.color = annotation.color
      visual.lineHeight = 1.28
    }

    if (annotation.type === "text" && editingId === annotation.id) {
      return (
        <div key={annotation.id} className="ann ann-text" style={style} data-ann>
          <div style={rotatedTextStyle(annotation.rect)}>
          <textarea
            className="ann-text-input"
            autoFocus
            value={textDraft}
            style={{ fontSize: `${Math.max(9, annotation.fontSize * scale)}px`, color: annotation.color }}
            onChange={(event) => {
              textDraftRef.current = event.target.value
              setTextDraft(event.target.value)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={() => {
              updateAnnotation(annotation.id, { text: textDraftRef.current })
              setEditingId(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditingId(null)
              }
            }}
          />
          </div>
        </div>
      )
    }

    return (
      <div
        key={annotation.id}
        className={className}
        style={visual}
        data-ann
        {...(annotation.type === "text" ? {} : common)}
        onPointerDown={
          annotation.type === "text" ? (event) => startAnnotationDrag(event, annotation.id) : undefined
        }
        onDoubleClick={
          annotation.type === "text"
            ? (event) => {
                event.stopPropagation()
                beginTextEdit(annotation.id, annotation.text)
              }
            : undefined
        }
      >
        {annotation.type === "text" ? (
          <div style={rotatedTextStyle(annotation.rect)}>{annotation.text}</div>
        ) : null}
        {handle}
      </div>
    )
  }

  return (
    <div className="viewer" ref={containerRef}>
      {page ? (
        <div
          className="page-stage"
          style={{ width: stageWidth, height: stageHeight }}
          onPointerDown={onStagePointerDown}
        >
          <canvas
            ref={canvasRef}
            className="page-canvas"
            style={{ width: stageWidth, height: stageHeight }}
          />
          {page.kind === "source" && source ? (
            <>
              <PageTextLayer
                source={source}
                srcIndex={page.srcIndex}
                rotation={rotation}
                scale={scale}
                width={stageWidth}
                height={stageHeight}
                interactive={tool === "select"}
              />
              <PageLinkLayer
                source={source}
                srcIndex={page.srcIndex}
                rotation={rotation}
                scale={scale}
                interactive={tool === "select"}
                onFollowPage={followPageLink}
              />
            </>
          ) : null}
          <div
            className="overlay"
            data-tool={tool}
            onPointerDown={onOverlayPointerDown}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
          >
            {pageAnnotations.map((annotation) => renderAnnotation(annotation.id))}
            {ocrLayer?.lines.map((line) => (
              <div key={line.id} className="ocr-band" style={boxStyle(rotateRect(line.rect, rotation))} />
            ))}
            {draft?.kind === "marquee" ? <div className="marquee" style={boxStyle(draft.rect)} /> : null}
            {draft?.kind === "ink" && draft.points.length > 1 ? (
              <svg
                width={stageWidth}
                height={stageHeight}
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              >
                <polyline
                  points={draft.points
                    .map((point) => `${(point.x * stageWidth).toFixed(1)},${(point.y * stageHeight).toFixed(1)}`)
                    .join(" ")}
                  fill="none"
                  stroke={DEFAULT_INK_COLOR}
                  strokeWidth={Math.max(1, 2 * scale)}
                  strokeLinecap="round"
                />
              </svg>
            ) : null}
          </div>
        </div>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  )
}
