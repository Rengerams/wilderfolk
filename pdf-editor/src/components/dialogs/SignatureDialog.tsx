import { useEffect, useRef, useState, type PointerEvent } from "react"
import { Dialog, Field } from "./Dialog"
import { insertMarkImage } from "../../app/pageTools"
import { Swatches } from "../Swatches"
import { useDialogBase } from "./useDialogBase"
import {
  SIGNATURE_FONTS,
  drawInkStrokes,
  inkStrength,
  renderSignaturePng,
  type InkPoint,
  type InkStroke,
  type SignatureFontId,
} from "../../pdf/markImages"

const PAD_WIDTH = 1200
const PAD_HEIGHT = 420
/** Share of the pad height; keeps the stroke weight natural at any display size. */
const PEN_WIDTH = 0.014
/** Pointer samples closer than this are the same bit of ink. */
const MIN_POINT_DISTANCE = 0.0015
const TIME_FLOOR_MS = 8
const INK_COLORS = ["#111111", "#1a3b8b", "#0f6cbd"]
const FONT_IDS: SignatureFontId[] = ["script", "elegant", "casual"]
const FONT_LABELS: Record<SignatureFontId, string> = {
  script: "Script",
  elegant: "Elegant",
  casual: "Casual",
}

export function SignatureDialog() {
  const { t, closeDialog, setStatus, pageCount } = useDialogBase()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<InkStroke[]>([])
  const currentRef = useRef<InkStroke | null>(null)
  const lastTimeRef = useRef(0)
  const frameRef = useRef(0)
  const [strokes, setStrokes] = useState<InkStroke[]>([])
  const [mode, setMode] = useState<"draw" | "type">("draw")
  const [color, setColor] = useState(INK_COLORS[0])
  const [typed, setTyped] = useState("")
  const [font, setFont] = useState<SignatureFontId>("script")

  // Redraws are batched to one per frame so a fast pen never queues up work.
  const redrawPad = () => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0
      const canvas = canvasRef.current
      const context = canvas?.getContext("2d")
      if (!canvas || !context) return
      const active = currentRef.current
      const visible = active ? [...strokesRef.current, active] : strokesRef.current
      drawInkStrokes(context, visible, canvas.width, canvas.height, canvas.height * PEN_WIDTH)
    })
  }

  useEffect(() => {
    if (mode === "draw") redrawPad()
  }, [mode])

  useEffect(() => () => window.cancelAnimationFrame(frameRef.current), [])

  const pointAt = (sample: { clientX: number; clientY: number }, bounds: DOMRect): InkPoint => ({
    x: Math.min(1, Math.max(0, (sample.clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.min(1, Math.max(0, (sample.clientY - bounds.top) / Math.max(1, bounds.height))),
  })

  /** Browsers can report several samples per frame; using them keeps fast strokes round. */
  const pointerSamples = (event: PointerEvent<HTMLCanvasElement>): globalThis.PointerEvent[] => {
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
    return coalesced.length > 0 ? coalesced : [event.nativeEvent]
  }

  /** Pen pressure when the device reports it; otherwise a fast flick inks lighter than a slow one. */
  const strokeInk = (sample: { pointerType: string; pressure: number }, speed: number): number => {
    if (sample.pointerType === "pen" && sample.pressure > 0) {
      return Math.min(1.2, 0.35 + sample.pressure * 0.95)
    }
    return Math.min(1.15, Math.max(0.42, 1.12 - speed * 140))
  }

  const startStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture only helps when the pointer leaves the pad; drawing works without it.
    }
    const point = pointAt(event.nativeEvent, event.currentTarget.getBoundingClientRect())
    currentRef.current = { color, points: [{ ...point, strength: strokeInk(event.nativeEvent, 0) }] }
    lastTimeRef.current = event.timeStamp
    redrawPad()
  }

  const extendStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = currentRef.current
    if (!stroke) return
    const bounds = event.currentTarget.getBoundingClientRect()
    for (const sample of pointerSamples(event)) {
      const last = stroke.points[stroke.points.length - 1]
      if (!last) break
      const target = pointAt(sample, bounds)
      const distance = Math.hypot(target.x - last.x, target.y - last.y)
      if (distance < MIN_POINT_DISTANCE) continue
      const elapsed = Math.max(TIME_FLOOR_MS, sample.timeStamp - lastTimeRef.current)
      lastTimeRef.current = sample.timeStamp
      const ink = strokeInk(sample, distance / elapsed)
      stroke.points.push({
        ...target,
        strength: inkStrength(last) + (ink - inkStrength(last)) * 0.4,
      })
    }
    redrawPad()
  }

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = currentRef.current
    currentRef.current = null
    if (!stroke) return
    const last = stroke.points[stroke.points.length - 1]
    const target = pointAt(event.nativeEvent, event.currentTarget.getBoundingClientRect())
    if (last && Math.hypot(target.x - last.x, target.y - last.y) > MIN_POINT_DISTANCE) {
      stroke.points.push({ ...target, strength: inkStrength(last) })
    }
    strokesRef.current = [...strokesRef.current, stroke]
    setStrokes(strokesRef.current)
    redrawPad()
  }

  const undoStroke = () => {
    strokesRef.current = strokesRef.current.slice(0, -1)
    setStrokes(strokesRef.current)
    redrawPad()
  }

  const clearPad = () => {
    strokesRef.current = []
    currentRef.current = null
    setStrokes(strokesRef.current)
    redrawPad()
  }

  const pickColor = (next: string) => {
    setColor(next)
    if (strokesRef.current.length === 0) return
    strokesRef.current = strokesRef.current.map((stroke) => ({ ...stroke, color: next }))
    setStrokes(strokesRef.current)
    redrawPad()
  }

  const canInsert = pageCount > 0 && (mode === "draw" ? strokes.length > 0 : typed.trim().length > 0)

  const insert = () => {
    const mark =
      mode === "draw"
        ? renderSignaturePng({ mode: "draw", strokes: strokesRef.current })
        : renderSignaturePng({ mode: "type", text: typed.trim(), font, color })
    if (!mark) return
    if (!insertMarkImage(mark, 0.42)) {
      setStatus(t("Select a page first."))
      return
    }
    setStatus(t("Signature added to the page."))
    closeDialog()
  }

  return (
    <Dialog
      title={t("Signature")}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">
            {t("The signature is added as a picture you can move and resize.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={insert} disabled={!canInsert}>
            {t("Insert signature")}
          </button>
        </>
      }
    >
      <div className="segmented" role="tablist" aria-label={t("Signature style")}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "draw"}
          onClick={() => setMode("draw")}
        >
          {t("Draw")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "type"}
          onClick={() => setMode("type")}
        >
          {t("Type")}
        </button>
      </div>

      <div hidden={mode !== "draw"}>
        <canvas
          ref={canvasRef}
          className="signature-pad"
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          aria-label={t("Signature drawing area")}
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        <div className="row">
          <span className="hint">{t("Draw your signature with the mouse, a pen or a finger.")}</span>
          <span className="grow" />
          <button type="button" className="btn" onClick={undoStroke} disabled={strokes.length === 0}>
            {t("Undo stroke")}
          </button>
          <button type="button" className="btn" onClick={clearPad} disabled={strokes.length === 0}>
            {t("Clear")}
          </button>
        </div>
      </div>

      <div hidden={mode !== "type"}>
        <div className="grid-2">
          <Field label={t("Your name")}>
            <input
              type="text"
              value={typed}
              maxLength={40}
              aria-label={t("Your name")}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t("Type your name")}
            />
          </Field>
          <Field label={t("Style")}>
            <select
              aria-label={t("Style")}
              value={font}
              onChange={(event) => setFont(event.target.value as SignatureFontId)}
            >
              {FONT_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(FONT_LABELS[id])}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div
          className="signature-preview"
          style={{ fontFamily: SIGNATURE_FONTS[font], color }}
          aria-live="polite"
        >
          {typed.trim() || t("Your signature")}
        </div>
      </div>

      <Field label={t("Ink colour")}>
        <Swatches colors={INK_COLORS} current={color} onPick={pickColor} />
      </Field>
    </Dialog>
  )
}
