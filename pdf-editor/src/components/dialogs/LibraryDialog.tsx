import { useEffect, useMemo, useState } from "react"
import { RefreshCw, Trash2 } from "lucide-react"
import { Dialog, Field } from "./Dialog"
import type { StoredDocMeta } from "../../types"
import {
  activeProvider,
  listLibrary,
  openFromLibrary,
  removeFromLibrary,
} from "../../app/documentActions"
import { IMPORT_ACCEPT, pickFiles } from "../../app/files"
import { formatFileSize, formatTimestamp } from "../../pdf/pages"
import { currentSettings, setPassphrase } from "../../storage/settings"
import { useEditor } from "../../app/store"
import { useCommands } from "../../app/useCommands"
import { useT } from "../../i18n"

export function LibraryDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const commands = useCommands()
  const [documents, setDocuments] = useState<StoredDocMeta[]>([])
  const [filter, setFilter] = useState("")
  const [error, setError] = useState("")
  const [passphrase, setPassphraseValue] = useState("")
  const [needsPassphrase, setNeedsPassphrase] = useState(false)
  const [loading, setLoading] = useState(true)
  const provider = useMemo(() => activeProvider(), [])

  const refresh = async () => {
    setLoading(true)
    setError("")
    try {
      setDocuments(await listLibrary())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("The library could not be read."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const documents = await listLibrary()
        if (cancelled) return
        setDocuments(documents)
      } catch (caught) {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : t("The library could not be read."))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  const open = async (meta: StoredDocMeta) => {
    setError("")
    setStatus(t("Opening {name}…", { name: meta.name }))
    try {
      await openFromLibrary(meta)
      closeDialog()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("That document could not be opened.")
      setError(message)
      setStatus(`⚠ ${message}`)
      if (meta.encrypted) setNeedsPassphrase(true)
    }
  }

  const remove = async (meta: StoredDocMeta) => {
    setError("")
    try {
      await removeFromLibrary(meta.id)
      await refresh()
      setStatus(t("Deleted {name} from the library", { name: meta.name }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("That document could not be deleted."))
    }
  }

  const importFiles = async () => {
    const files = await pickFiles(IMPORT_ACCEPT)
    if (!files) return
    await commands.openFiles(files)
    closeDialog()
  }

  const visible = documents.filter((meta) =>
    meta.name.toLowerCase().includes(filter.trim().toLowerCase()),
  )

  return (
    <Dialog
      title={t("Open from {source}", { source: t(provider.label).toLowerCase() })}
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            {currentSettings().provider === "cloud"
              ? t("Documents come from your own cloud endpoint.")
              : t("Documents are kept on this PC in the browser's local storage.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void importFiles()}>
            {t("Open a file from this PC…")}
          </button>
        </>
      }
    >
      <div className="row">
        <Field label={t("Search")}>
          <input
            type="text"
            value={filter}
            placeholder={t("Filter by name")}
            onChange={(event) => setFilter(event.target.value)}
          />
        </Field>
        <button type="button" className="btn" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={15} /> {t("Refresh")}
        </button>
      </div>

      {needsPassphrase ? (
        <div className="note">
          <Field
            label={t("Library passphrase")}
            hint={t("Used only to unlock encrypted documents; it is never stored.")}
          >
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphraseValue(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setPassphrase(passphrase)
              setNeedsPassphrase(false)
              setStatus(t("Library unlocked for this session"))
            }}
          >
            {t("Unlock library")}
          </button>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      {visible.length === 0 ? (
        <p className="hint">
          {loading
            ? t("Reading the library…")
            : t("No documents here yet. Save a document to see it in this list.")}
        </p>
      ) : (
        <div className="list">
          {visible.map((meta) => (
            <div key={meta.id} className="list-row">
              <span className="grow">
                <strong>{meta.name}</strong>
                <small className="hint">
                  {meta.pages === 1
                    ? t("{count} page", { count: meta.pages })
                    : t("{count} pages", { count: meta.pages })}{" "}
                  · {formatFileSize(meta.size)} · {formatTimestamp(meta.updatedAt)}
                  {meta.encrypted ? ` · ${t("encrypted")}` : ""}
                </small>
              </span>
              <button type="button" className="btn btn-primary" onClick={() => void open(meta)}>
                {t("Open")}
              </button>
              <button
                type="button"
                className="icon-btn"
                title={t("Delete {name}", { name: meta.name })}
                aria-label={t("Delete {name}", { name: meta.name })}
                onClick={() => void remove(meta)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
