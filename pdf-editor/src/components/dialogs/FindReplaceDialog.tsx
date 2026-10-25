import { useState } from "react"
import { Search } from "lucide-react"
import { Dialog, Field } from "./Dialog"
import type { TextHit } from "../../pdf/textReplace"
import { replaceTextHits, searchDocumentText, type SearchScope } from "../../app/textActions"
import { useEditor } from "../../app/store"
import { useT } from "../../i18n"

export function FindReplaceDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const pages = useEditor((state) => state.doc.pages)
  const setActivePage = useEditor((state) => state.setActivePage)
  const [needle, setNeedle] = useState("")
  const [replacement, setReplacement] = useState("")
  const [scope, setScope] = useState<SearchScope>("current")
  const [matchStyle, setMatchStyle] = useState(true)
  const [hits, setHits] = useState<TextHit[] | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [currentHitId, setCurrentHitId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const pageLabel = (srcIndex: number): string => {
    const index = pages.findIndex((page) => page.kind === "source" && page.srcIndex === srcIndex)
    return index < 0 ? "?" : String(index + 1)
  }

  const jumpToHit = (hit: TextHit) => {
    setCurrentHitId(hit.id)
    const page = pages.find((entry) => entry.kind === "source" && entry.srcIndex === hit.srcIndex)
    if (page) setActivePage(page.id)
  }

  const search = async (everyPage: boolean) => {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const found = await searchDocumentText(needle, everyPage ? "all" : scope)
      setHits(found)
      setExcluded([])
      if (found[0]) jumpToHit(found[0])
      setMessage(
        found.length === 0
          ? t(
              "No text like “{needle}” was found. Text added inside the editor is edited directly on the page.",
              { needle },
            )
          : found.length === 1
            ? t("{count} match found.", { count: found.length })
            : t("{count} matches found.", { count: found.length }),
      )
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : t("Searching failed.")
      setError(text)
      setStatus(`⚠ ${text}`)
    } finally {
      setBusy(false)
    }
  }

  const selected = (hits ?? []).filter((hit) => !excluded.includes(hit.id))

  const replaceOne = async () => {
    const current = (hits ?? []).find((hit) => hit.id === currentHitId) ?? selected[0]
    if (!current) return
    setBusy(true)
    setError("")
    try {
      await replaceTextHits({ hits: [current], replacement, matchPageStyle: matchStyle })
      const remaining = (hits ?? []).filter((hit) => hit.id !== current.id)
      setHits(remaining)
      setCurrentHitId(remaining[0]?.id ?? null)
      setMessage(t("{count} match replaced.", { count: 1 }))
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : t("The text could not be replaced.")
      setError(text)
      setStatus(`⚠ ${text}`)
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setBusy(true)
    setError("")
    try {
      await replaceTextHits({ hits: selected, replacement, matchPageStyle: matchStyle })
      setHits(null)
      setMessage(
        selected.length === 1
          ? t("{count} match replaced.", { count: selected.length })
          : t("{count} matches replaced.", { count: selected.length }),
      )
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : t("The text could not be replaced.")
      setError(text)
      setStatus(`⚠ ${text}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={t("Find and replace text")}
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            {t(
              "Each match is covered with the page's own colour and retyped in place — the same result as a PDF editor doing it properly, without touching the file's compressed structure.",
            )}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Close")}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void search(false)}>
            <Search size={15} /> {busy ? t("Working…") : t("Find")}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void search(true)}>
            {busy ? t("Working…") : t("Find all")}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label={t("Find")}>
          <input
            type="text"
            value={needle}
            autoFocus
            placeholder={t("Text that is inside the PDF file")}
            onChange={(event) => setNeedle(event.target.value)}
          />
        </Field>
        <Field label={t("Replace with")} hint={t("Leave empty to delete the text.")}>
          <input type="text" value={replacement} onChange={(event) => setReplacement(event.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field label={t("Search in")}>
          <select value={scope} onChange={(event) => setScope(event.target.value as SearchScope)}>
            <option value="current">{t("This page")}</option>
            <option value="all">{t("Every page")}</option>
          </select>
        </Field>
        <label className="checkbox" style={{ paddingBottom: 8 }}>
          <input
            type="checkbox"
            checked={matchStyle}
            onChange={(event) => setMatchStyle(event.target.checked)}
          />
          {t("Match the page's paper and ink colours")}
        </label>
      </div>

      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {hits && hits.length > 0 ? (
        <>
          <div className="row">
            <strong className="grow">{t("Matches")}</strong>
            <button type="button" className="btn" disabled={busy} onClick={() => void replaceOne()}>
              {t("Replace")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || selected.length === 0}
              onClick={() => void apply()}
            >
              {t("Replace all")}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setExcluded([])}>
              {t("Select all")}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setExcluded(hits.map((hit) => hit.id))}
            >
              {t("Select none")}
            </button>
          </div>
          <p className="hint">{t("Click a match to jump to its page.")}</p>
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
                <span
                  className="grow"
                  style={{ cursor: "pointer" }}
                  onClick={(event) => {
                    event.preventDefault()
                    jumpToHit(hit)
                  }}
                >
                  <strong>“{hit.text}”</strong>
                  <small className="hint">
                    {t("Page {number} · {across}% across · {size} pt", {
                      number: pageLabel(hit.srcIndex),
                      across: Math.round(hit.rect.x * 100),
                      size: Math.round(hit.fontSize),
                    })}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <p className="hint">
            {t(
              "Replaced text is added as an editable object, so you can move it, restyle it or undo it afterwards.",
            )}
          </p>
        </>
      ) : null}

      <div className="note">
        <strong>{t("Fixed template?")}</strong>{" "}
        {t("If your PDF has fillable form fields (a recurring invoice or contract), use")}{" "}
        <em>{t("Fill form fields")}</em>{" "}
        {t("instead — that writes into the file's own fields and never disturbs the layout.")}
      </div>
    </Dialog>
  )
}
