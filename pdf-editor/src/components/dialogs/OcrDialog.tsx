import { useMemo, useState } from "react"
import { Dialog, Field } from "./Dialog"
import { applyOcrLayers, recognizePagesToDraft } from "../../app/ocrActions"
import { exportAs, saveDocument } from "../../app/documentActions"
import { BusyProgress } from "./BusyProgress"
import { LanguagePicker } from "./LanguagePicker"
import { currentSettings } from "../../storage/settings"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

export function OcrDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const pages = useEditor((state) => state.doc.pages)
  const ocr = useEditor((state) => state.doc.ocr)
  const activePageId = useEditor((state) => state.activePageId)
  const updateOcrLine = useEditor((state) => state.updateOcrLine)

  const [scope, setScope] = useState<"current" | "all">("current")
  const [languages, setLanguages] = useState<string[]>(currentSettings().defaultOcrLanguages)
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const pageIds = useMemo(() => {
    if (pages.length === 0) return []
    if (scope === "all") return pages.map((page) => page.id)
    const active = pages.find((page) => page.id === activePageId) ?? pages[0]
    return [active.id]
  }, [pages, scope, activePageId])

  const layers = useMemo(
    () => pageIds.map((id) => ocr.find((layer) => layer.pageId === id)).filter((layer) => layer !== undefined),
    [pageIds, ocr],
  )

  const recognize = async () => {
    setError("")
    setMessage("")
    setBusy({ label: t("Preparing recognition"), progress: 0.05 })
    try {
      const outcome = await recognizePagesToDraft(pageIds, languages, (progress) =>
        setBusy({ label: progress.status, progress: 0.1 + progress.progress * 0.85 }),
      )
      setMessage(
        outcome.lines > 0
          ? t(
              "Recognized {lines} lines on {pages}. Check the text below, then make it searchable.",
              {
                lines: outcome.lines,
                pages:
                  outcome.pages === 1
                    ? t("{count} page", { count: outcome.pages })
                    : t("{count} pages", { count: outcome.pages }),
              },
            )
          : t("No text was found on those pages. Try a higher scan resolution or another language."),
      )
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : t("Text recognition failed.")
      setError(text)
      setStatus(`⚠ ${text}`)
    } finally {
      setBusy(null)
    }
  }

  const applyAndSave = async () => {
    applyOcrLayers(pageIds)
    setMessage(t("Saving a searchable PDF…"))
    try {
      await saveDocument()
      setMessage(
        t("Saved. The recognized text is now hidden inside the PDF and can be searched."),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("The document could not be saved."))
    }
  }

  return (
    <Dialog
      title={t("Recognize text (OCR)")}
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            {t(
              "Recognized text is placed invisibly on the page, so searching and copying work while the page looks unchanged.",
            )}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Close")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || pageIds.length === 0}
            onClick={() => void recognize()}
          >
            {busy ? t("Working…") : t("Recognize text")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={layers.length === 0}
            onClick={() => {
              applyOcrLayers(pageIds)
              setMessage(t("The pages are now searchable."))
            }}
          >
            {t("Make searchable")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={layers.length === 0}
            onClick={() => void applyAndSave()}
          >
            {t("Save searchable PDF")}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label={t("Pages")}>
          <select value={scope} onChange={(event) => setScope(event.target.value as "current" | "all")}>
            <option value="current">{t("This page only")}</option>
            <option value="all">{t("Every page ({count})", { count: pages.length })}</option>
          </select>
        </Field>
        <Field label={t("Recognition languages")}>
          <LanguagePicker value={languages} onChange={setLanguages} />
        </Field>
      </div>

      {busy ? <BusyProgress busy={busy} /> : null}
      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {layers.length > 0 ? (
        <>
          <h3>{t("Check the recognized text")}</h3>
          <p className="hint">
            {t(
              "Correct anything the recognizer misread. Your corrections are what end up in the searchable layer and in any exported text.",
            )}
          </p>
          {layers.map((layer) => (
            <div key={layer.pageId}>
              <div className="row">
                <strong className="grow">
                  {t("Page {number} · {lines} lines · {confidence}% confidence", {
                    number: pages.findIndex((page) => page.id === layer.pageId) + 1,
                    lines: layer.lines.length,
                    confidence: layer.confidence,
                  })}
                </strong>
                <span className={layer.applied ? "chip chip-accent" : "chip"}>
                  {layer.applied ? t("searchable") : t("draft")}
                </span>
              </div>
              <div className="ocr-review">
                {layer.lines.map((line) => (
                  <div key={line.id} className="ocr-line">
                    <small>{line.confidence}%</small>
                    <input
                      type="text"
                      value={line.text}
                      onChange={(event) => updateOcrLine(layer.pageId, line.id, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="hint">
          {t(
            "Pages that came from a PDF file, and scanned or imported picture pages, can all be recognized here.",
          )}
        </p>
      )}

      <button
        type="button"
        className="btn btn-quiet"
        disabled={layers.length === 0}
        onClick={() => void exportAs("txt")}
      >
        {t("Export the recognized text as a .txt file")}
      </button>
    </Dialog>
  )
}
