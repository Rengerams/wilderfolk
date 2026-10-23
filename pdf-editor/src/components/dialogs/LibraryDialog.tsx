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

export function LibraryDialog() {
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
      setError(caught instanceof Error ? caught.message : "The library could not be read.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const open = async (meta: StoredDocMeta) => {
    setError("")
    setStatus(`Opening ${meta.name}…`)
    try {
      await openFromLibrary(meta)
      closeDialog()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "That document could not be opened."
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
      setStatus(`Deleted ${meta.name} from the library`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That document could not be deleted.")
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
      title={`Open from ${provider.label.toLowerCase()}`}
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            {currentSettings().provider === "cloud"
              ? "Documents come from your own cloud endpoint."
              : "Documents are kept on this PC in the browser's local storage."}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void importFiles()}>
            Open a file from this PC…
          </button>
        </>
      }
    >
      <div className="row">
        <Field label="Search">
          <input
            type="text"
            value={filter}
            placeholder="Filter by name"
            onChange={(event) => setFilter(event.target.value)}
          />
        </Field>
        <button type="button" className="btn" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {needsPassphrase ? (
        <div className="note">
          <Field label="Library passphrase" hint="Used only to unlock encrypted documents; it is never stored.">
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
              setStatus("Library unlocked for this session")
            }}
          >
            Unlock library
          </button>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      {visible.length === 0 ? (
        <p className="hint">
          {loading ? "Reading the library…" : "No documents here yet. Save a document to see it in this list."}
        </p>
      ) : (
        <div className="list">
          {visible.map((meta) => (
            <div key={meta.id} className="list-row">
              <span className="grow">
                <strong>{meta.name}</strong>
                <small className="hint">
                  {meta.pages} page{meta.pages === 1 ? "" : "s"} · {formatFileSize(meta.size)} ·{" "}
                  {formatTimestamp(meta.updatedAt)}
                  {meta.encrypted ? " · encrypted" : ""}
                </small>
              </span>
              <button type="button" className="btn btn-primary" onClick={() => void open(meta)}>
                Open
              </button>
              <button
                type="button"
                className="icon-btn"
                title={`Delete ${meta.name}`}
                aria-label={`Delete ${meta.name}`}
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
