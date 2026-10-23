import { useMemo, useState } from "react"
import { Dialog, Field } from "./Dialog"
import { applyOcrLayers, recognizePagesToDraft } from "../../app/ocrActions"
import { exportAs, saveDocument } from "../../app/documentActions"
import { OCR_LANGUAGES } from "../../pdf/ocr"
import { currentSettings } from "../../storage/settings"
import { useEditor } from "../../app/store"

export function OcrDialog() {
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
    setBusy({ label: "Preparing recognition", progress: 0.05 })
    try {
      const outcome = await recognizePagesToDraft(pageIds, languages, (progress) =>
        setBusy({ label: progress.status, progress: 0.1 + progress.progress * 0.85 }),
      )
      setMessage(
        outcome.lines > 0
          ? `Recognized ${outcome.lines} lines on ${outcome.pages} page${outcome.pages === 1 ? "" : "s"}. Check the text below, then make it searchable.`
          : "No text was found on those pages. Try a higher scan resolution or another language.",
      )
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Text recognition failed."
      setError(text)
      setStatus(`⚠ ${text}`)
    } finally {
      setBusy(null)
    }
  }

  const applyAndSave = async () => {
    applyOcrLayers(pageIds)
    setMessage("Saving a searchable PDF…")
    try {
      await saveDocument()
      setMessage("Saved. The recognized text is now hidden inside the PDF and can be searched.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The document could not be saved.")
    }
  }

  return (
    <Dialog
      title="Recognize text (OCR)"
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            Recognized text is placed invisibly on the page, so searching and copying work while the page looks
            unchanged.
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            Close
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || pageIds.length === 0}
            onClick={() => void recognize()}
          >
            {busy ? "Working…" : "Recognize text"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={layers.length === 0}
            onClick={() => {
              applyOcrLayers(pageIds)
              setMessage("The pages are now searchable.")
            }}
          >
            Make searchable
          </button>
          <button type="button" className="btn btn-primary" disabled={layers.length === 0} onClick={() => void applyAndSave()}>
            Save searchable PDF
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Pages">
          <select value={scope} onChange={(event) => setScope(event.target.value as "current" | "all")}>
            <option value="current">This page only</option>
            <option value="all">Every page ({pages.length})</option>
          </select>
        </Field>
        <Field label="Recognition languages">
          <div className="checkbox-grid">
            {OCR_LANGUAGES.map((language) => (
              <label key={language.code} className="checkbox">
                <input
                  type="checkbox"
                  checked={languages.includes(language.code)}
                  onChange={(event) =>
                    setLanguages((current) =>
                      event.target.checked
                        ? [...current, language.code]
                        : current.length > 1
                          ? current.filter((code) => code !== language.code)
                          : current,
                    )
                  }
                />
                {language.label}
              </label>
            ))}
          </div>
        </Field>
      </div>

      {busy ? (
        <div>
          <p className="hint">{busy.label}</p>
          <div className="progress">
            <span style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {layers.length > 0 ? (
        <>
          <h3>Check the recognized text</h3>
          <p className="hint">
            Correct anything the recognizer misread. Your corrections are what end up in the searchable layer
            and in any exported text.
          </p>
          {layers.map((layer) => (
            <div key={layer.pageId}>
              <div className="row">
                <strong className="grow">
                  Page {pages.findIndex((page) => page.id === layer.pageId) + 1} · {layer.lines.length} lines ·{" "}
                  {layer.confidence}% confidence
                </strong>
                <span className={layer.applied ? "chip chip-accent" : "chip"}>{layer.applied ? "searchable" : "draft"}</span>
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
          Pages that came from a PDF file, and scanned or imported picture pages, can all be recognized here.
        </p>
      )}

      <button
        type="button"
        className="btn btn-quiet"
        disabled={layers.length === 0}
        onClick={() => void exportAs("txt")}
      >
        Export the recognized text as a .txt file
      </button>
    </Dialog>
  )
}
