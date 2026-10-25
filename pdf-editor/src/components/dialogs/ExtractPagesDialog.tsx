import { useState } from "react"
import { Dialog, Field } from "./Dialog"
import { extractPageRange } from "../../app/pageTools"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

export function ExtractPagesDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const pageCount = useEditor((state) => state.doc.pages.length)
  const dirty = useEditor((state) => state.doc.dirty)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(Math.max(1, pageCount))

  const extract = () => {
    const count = extractPageRange(from, to)
    setStatus(
      count === 1
        ? t("Extracted {count} page into a new document.", { count })
        : t("Extracted {count} pages into a new document.", { count }),
    )
    closeDialog()
  }

  return (
    <Dialog
      title={t("Extract pages")}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">
            {dirty
              ? t("The current document is replaced by the extracted pages; save it first to keep the whole file.")
              : t("The extracted pages open as a new document you can save on their own.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={extract} disabled={pageCount === 0}>
            {t("Extract pages")}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label={t("From page")}>
          <input
            type="number"
            min={1}
            max={pageCount}
            aria-label={t("From page")}
            value={from}
            onChange={(event) => setFrom(Math.max(1, Number(event.target.value) || 1))}
            autoFocus
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
      <p className="hint">{t("{count} pages in this document.", { count: pageCount })}</p>
    </Dialog>
  )
}
