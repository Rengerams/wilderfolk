import { useState } from "react"
import { Dialog } from "./Dialog"
import { extractPageRange } from "../../app/pageTools"
import { useEditor } from "../../app/store"
import { PageRangeFields } from "./PageRangeFields"
import { useDialogBase } from "./useDialogBase"

export function ExtractPagesDialog() {
  const { t, closeDialog, setStatus, pageCount } = useDialogBase()
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
      <PageRangeFields
        from={from}
        to={to}
        pageCount={pageCount}
        setFrom={setFrom}
        setTo={setTo}
        autoFocusFrom
      />
      <p className="hint">{t("{count} pages in this document.", { count: pageCount })}</p>
    </Dialog>
  )
}
