import { useState } from "react"
import { Dialog, Field } from "./Dialog"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

const ANGLES = [
  { value: 0, label: "Horizontal" },
  { value: 45, label: "Diagonal" },
  { value: 90, label: "Vertical" },
] as const

export function WatermarkDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const setWatermark = useEditor((state) => state.setWatermark)
  const watermark = useEditor((state) => state.doc.watermark)
  const pageCount = useEditor((state) => state.doc.pages.length)
  const [text, setText] = useState(watermark?.text ?? "Draft")
  const [fontSize, setFontSize] = useState(watermark?.fontSize ?? 48)
  const [color, setColor] = useState(watermark?.color ?? "#9aa0a6")
  const [opacity, setOpacity] = useState(watermark?.opacity ?? 0.18)
  const [angle, setAngle] = useState(watermark?.angle ?? 45)

  const apply = () => {
    setWatermark({ text: text.trim(), fontSize, color, opacity, angle })
    setStatus(t("Watermark applied to every page."))
    closeDialog()
  }

  const remove = () => {
    setWatermark(null)
    setStatus(t("Watermark removed."))
    closeDialog()
  }

  return (
    <Dialog
      title={t("Watermark")}
      onClose={closeDialog}
      footer={
        <>
          <button type="button" className="btn" onClick={remove} disabled={!watermark}>
            {t("Remove watermark")}
          </button>
          <span className="grow" />
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={apply}
            disabled={pageCount === 0 || text.trim().length === 0}
          >
            {t("Apply watermark")}
          </button>
        </>
      }
    >
      <Field label={t("Watermark text")}>
        <input
          type="text"
          aria-label={t("Watermark text")}
          value={text}
          maxLength={60}
          onChange={(event) => setText(event.target.value)}
          autoFocus
        />
      </Field>
      <div className="grid-2">
        <Field label={t("Size")}>
          <input
            type="number"
            min={12}
            max={200}
            aria-label={t("Size")}
            value={fontSize}
            onChange={(event) => setFontSize(Math.min(200, Math.max(12, Number(event.target.value) || 48)))}
          />
        </Field>
        <Field label={t("Angle")}>
          <select
            aria-label={t("Angle")}
            value={angle}
            onChange={(event) => setAngle(Number(event.target.value))}
          >
            {ANGLES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {t(entry.label)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid-2">
        <Field label={t("Colour")}>
          <input
            type="color"
            aria-label={t("Colour")}
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </Field>
        <Field label={t("Opacity")} hint={`${Math.round(opacity * 100)}%`}>
          <input
            type="range"
            min={5}
            max={80}
            aria-label={t("Opacity")}
            value={Math.round(opacity * 100)}
            onChange={(event) => setOpacity(Number(event.target.value) / 100)}
          />
        </Field>
      </div>
    </Dialog>
  )
}
