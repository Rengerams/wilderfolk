import { useMemo, useState } from "react"
import { Dialog, Field } from "./Dialog"
import { insertMarkImage } from "../../app/pageTools"
import { renderStampPng } from "../../pdf/markImages"
import { useDialogBase } from "./useDialogBase"

const PRESETS = [
  { text: "APPROVED", color: "#0f7b0f" },
  { text: "REJECTED", color: "#c42b1c" },
  { text: "DRAFT", color: "#5d5d68" },
  { text: "CONFIDENTIAL", color: "#c42b1c" },
  { text: "PAID", color: "#0f7b0f" },
  { text: "VOID", color: "#c42b1c" },
  { text: "REVIEWED", color: "#0f6cbd" },
  { text: "RECEIVED", color: "#0f6cbd" },
] as const

export function StampDialog() {
  const { t, closeDialog, setStatus, pageCount } = useDialogBase()
  const [text, setText] = useState<string>(PRESETS[0].text)
  const [color, setColor] = useState<string>(PRESETS[0].color)
  const [includeDate, setIncludeDate] = useState(true)
  const [tilt, setTilt] = useState(true)
  const [today] = useState(() =>
    new Date().toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }),
  )
  const preview = useMemo(
    () => renderStampPng({ text, color, date: includeDate ? today : null, tilt }),
    [text, color, includeDate, tilt, today],
  )

  const insert = () => {
    if (!preview) return
    if (!insertMarkImage(preview, 0.32)) {
      setStatus(t("Select a page first."))
      return
    }
    setStatus(t("Stamp added to the page."))
    closeDialog()
  }

  return (
    <Dialog
      title={t("Stamp")}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">
            {t("The stamp is added as a picture you can move and resize.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={insert}
            disabled={!preview || pageCount === 0}
          >
            {t("Add stamp")}
          </button>
        </>
      }
    >
      <div className="stamp-preview" aria-live="polite">
        {preview ? <img src={preview.dataUrl} alt={t("Stamp preview")} /> : null}
      </div>

      <Field label={t("Preset stamps")}>
        <div className="stamp-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.text}
              type="button"
              className="stamp-preset"
              style={{ color: preset.color }}
              aria-pressed={text.toUpperCase() === preset.text && color === preset.color}
              onClick={() => {
                setText(preset.text)
                setColor(preset.color)
              }}
            >
              {preset.text}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid-2">
        <Field label={t("Stamp text")}>
          <input
            type="text"
            value={text}
            maxLength={24}
            aria-label={t("Stamp text")}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        <Field label={t("Colour")}>
          <input
            type="color"
            aria-label={t("Colour")}
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </Field>
      </div>

      <div className="row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeDate}
            onChange={(event) => setIncludeDate(event.target.checked)}
          />
          {t("Include today's date")}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={tilt} onChange={(event) => setTilt(event.target.checked)} />
          {t("Tilted")}
        </label>
      </div>
    </Dialog>
  )
}
