import { useState } from "react"
import { Dialog, Field } from "./Dialog"
import { applyPageNumbers } from "../../app/pageTools"
import type { PageNumberFormat, PageNumberPosition } from "../../pdf/pageStamps"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

const POSITIONS: { id: PageNumberPosition; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-center", label: "Top centre" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-center", label: "Bottom centre" },
  { id: "bottom-right", label: "Bottom right" },
]

export function PageNumbersDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const pageCount = useEditor((state) => state.doc.pages.length)
  const [position, setPosition] = useState<PageNumberPosition>("bottom-center")
  const [format, setFormat] = useState<PageNumberFormat>("page-of")
  const [startAt, setStartAt] = useState(1)
  const [fontSize, setFontSize] = useState(10)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(Math.max(1, pageCount))

  const apply = () => {
    const count = applyPageNumbers({ position, format, startAt, fontSize, from, to })
    setStatus(t("Added page numbers to {count} pages.", { count }))
    closeDialog()
  }

  return (
    <Dialog
      title={t("Page numbers")}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">
            {t("Numbers are added as text, so you can move or delete each one afterwards.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={pageCount === 0}>
            {t("Add numbers")}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label={t("Position")}>
          <select
            aria-label={t("Position")}
            value={position}
            onChange={(event) => setPosition(event.target.value as PageNumberPosition)}
          >
            {POSITIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {t(entry.label)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Format")}>
          <select
            aria-label={t("Format")}
            value={format}
            onChange={(event) => setFormat(event.target.value as PageNumberFormat)}
          >
            <option value="plain">1</option>
            <option value="of-total">{`1 / ${pageCount}`}</option>
            <option value="page">{`${t("Page")} 1`}</option>
            <option value="page-of">{t("Page {number} of {total}", { number: 1, total: pageCount })}</option>
          </select>
        </Field>
      </div>
      <div className="grid-2">
        <Field label={t("Start at")}>
          <input
            type="number"
            min={1}
            aria-label={t("Start at")}
            value={startAt}
            onChange={(event) => setStartAt(Math.max(1, Number(event.target.value) || 1))}
          />
        </Field>
        <Field label={t("Font size")}>
          <input
            type="number"
            min={6}
            max={36}
            aria-label={t("Font size")}
            value={fontSize}
            onChange={(event) => setFontSize(Math.min(36, Math.max(6, Number(event.target.value) || 10)))}
          />
        </Field>
      </div>
      <div className="grid-2">
        <Field label={t("From page")}>
          <input
            type="number"
            min={1}
            max={pageCount}
            aria-label={t("From page")}
            value={from}
            onChange={(event) => setFrom(Math.max(1, Number(event.target.value) || 1))}
          />
        </Field>
        <Field label={t("To page")}>
          <input
            type="number"
            min={1}
            max={pageCount}
            aria-label={t("To page")}
            value={to}
            onChange={(event) => setTo(Math.max(1, Number(event.target.value) || 1))}
          />
        </Field>
      </div>
    </Dialog>
  )
}
