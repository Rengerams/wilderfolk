import { useState } from "react"
import { Search } from "lucide-react"
import { Dialog, Field } from "./Dialog"
import type { TextHit } from "../../pdf/textReplace"
import { replaceTextHits, searchDocumentText, type SearchScope } from "../../app/textActions"
import { useEditor } from "../../app/store"

export function FindReplaceDialog() {
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const pages = useEditor((state) => state.doc.pages)
  const [needle, setNeedle] = useState("")
  const [replacement, setReplacement] = useState("")
  const [scope, setScope] = useState<SearchScope>("current")
  const [matchStyle, setMatchStyle] = useState(true)
  const [hits, setHits] = useState<TextHit[] | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const pageLabel = (srcIndex: number): string => {
    const index = pages.findIndex((page) => page.kind === "source" && page.srcIndex === srcIndex)
    return index < 0 ? "?" : String(index + 1)
  }

  const search = async () => {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const found = await searchDocumentText(needle, scope)
      setHits(found)
      setExcluded([])
      setMessage(
        found.length === 0
          ? `No text like “${needle}” was found. Text added inside the editor is edited directly on the page.`
          : `${found.length} match${found.length === 1 ? "" : "es"} found.`,
      )
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Searching failed."
      setError(text)
      setStatus(`⚠ ${text}`)
    } finally {
      setBusy(false)
    }
  }

  const selected = (hits ?? []).filter((hit) => !excluded.includes(hit.id))

  const apply = async () => {
    setBusy(true)
    setError("")
    try {
      await replaceTextHits({ hits: selected, replacement, matchPageStyle: matchStyle })
      setHits(null)
      setMessage(`${selected.length} match${selected.length === 1 ? "" : "es"} replaced.`)
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "The text could not be replaced."
      setError(text)
      setStatus(`⚠ ${text}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="Find and replace text"
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            Each match is covered with the page's own colour and retyped in place — the same result as a PDF
            editor doing it properly, without touching the file's compressed structure.
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            Close
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void search()}>
            <Search size={15} /> {busy ? "Working…" : "Find"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || selected.length === 0}
            onClick={() => void apply()}
          >
            Replace {selected.length || ""} match{selected.length === 1 ? "" : "es"}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Find">
          <input
            type="text"
            value={needle}
            autoFocus
            placeholder="Text that is inside the PDF file"
            onChange={(event) => setNeedle(event.target.value)}
          />
        </Field>
        <Field label="Replace with" hint="Leave empty to delete the text.">
          <input type="text" value={replacement} onChange={(event) => setReplacement(event.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field label="Search in">
          <select value={scope} onChange={(event) => setScope(event.target.value as SearchScope)}>
            <option value="current">This page</option>
            <option value="all">Every page</option>
          </select>
        </Field>
        <label className="checkbox" style={{ paddingBottom: 8 }}>
          <input
            type="checkbox"
            checked={matchStyle}
            onChange={(event) => setMatchStyle(event.target.checked)}
          />
          Match the page's paper and ink colours
        </label>
      </div>

      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {hits && hits.length > 0 ? (
        <>
          <div className="row">
            <strong className="grow">Matches</strong>
            <button type="button" className="btn btn-quiet" onClick={() => setExcluded([])}>
              Select all
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setExcluded(hits.map((hit) => hit.id))}
            >
              Select none
            </button>
          </div>
          <div className="list">
            {hits.map((hit) => (
              <label key={hit.id} className="list-row">
                <input
                  type="checkbox"
                  checked={!excluded.includes(hit.id)}
                  onChange={(event) =>
                    setExcluded((current) =>
                      event.target.checked
                        ? current.filter((id) => id !== hit.id)
                        : [...current, hit.id],
                    )
                  }
                />
                <span className="grow">
                  <strong>“{hit.text}”</strong>
                  <small className="hint">
                    Page {pageLabel(hit.srcIndex)} · {Math.round(hit.rect.x * 100)}% across ·{" "}
                    {Math.round(hit.fontSize)} pt
                  </small>
                </span>
              </label>
            ))}
          </div>
          <p className="hint">
            Replaced text is added as an editable object, so you can move it, restyle it or undo it afterwards.
          </p>
        </>
      ) : null}

      <div className="note">
        <strong>Fixed template?</strong> If your PDF has fillable form fields (a recurring invoice or contract),
        use <em>Fill form fields</em> instead — that writes into the file's own fields and never disturbs the
        layout.
      </div>
    </Dialog>
  )
}
