import { useEffect, useState } from "react"
import { Camera, FilePlus2, FolderOpen, Library } from "lucide-react"
import type { StoredDocMeta } from "../types"
import { IMPORT_ACCEPT, pickFiles } from "../app/files"
import { listLibrary, openFromLibrary } from "../app/documentActions"
import { formatFileSize, formatTimestamp } from "../pdf/pages"
import { useEditor } from "../app/store"
import { useCommands } from "../app/useCommands"

export function WelcomeScreen() {
  const commands = useCommands()
  const setStatus = useEditor((state) => state.setStatus)
  const [recent, setRecent] = useState<StoredDocMeta[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void listLibrary()
      .then((documents) => {
        if (!cancelled) setRecent(documents.slice(0, 5))
      })
      .catch(() => {
        if (!cancelled) setRecent([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openRecent = async (meta: StoredDocMeta) => {
    setStatus(`Opening ${meta.name}…`)
    try {
      await openFromLibrary(meta)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "That document could not be opened."
      setError(message)
      setStatus(`⚠ ${message}`)
    }
  }

  const openFiles = async () => {
    const files = await pickFiles(IMPORT_ACCEPT)
    if (files) await commands.openFiles(files)
  }

  return (
    <div className="welcome">
      <h1>PDF Studio</h1>
      <p className="lede">
        Create, edit, copy and scan PDF documents. Everything stays on this PC unless you switch on
        cloud storage.
      </p>
      <div className="welcome-actions">
        <button type="button" className="welcome-card" onClick={commands.newDocument}>
          <FilePlus2 size={18} />
          <strong>New document</strong>
          <small>Blank pages in A4, Letter or A3</small>
        </button>
        <button type="button" className="welcome-card" onClick={() => void openFiles()}>
          <FolderOpen size={18} />
          <strong>Open a file</strong>
          <small>PDF, PNG or JPEG from this PC</small>
        </button>
        <button type="button" className="welcome-card" onClick={() => useEditor.getState().openDialog("scan")}>
          <Camera size={18} />
          <strong>Scan pages</strong>
          <small>Scanner or camera, with OCR</small>
        </button>
        <button type="button" className="welcome-card" onClick={commands.openLibrary}>
          <Library size={18} />
          <strong>Open from library</strong>
          <small>Documents saved on this PC</small>
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {recent.length > 0 ? (
        <div className="welcome-section">
          <h2>Recent documents</h2>
          <div className="recent-list">
            {recent.map((meta) => (
              <button
                key={meta.id}
                type="button"
                className="recent-item"
                onClick={() => void openRecent(meta)}
              >
                <span>{meta.name}</span>
                <small>
                  {meta.pages} page{meta.pages === 1 ? "" : "s"} · {formatFileSize(meta.size)} ·{" "}
                  {formatTimestamp(meta.updatedAt)}
                  {meta.encrypted ? " · encrypted" : ""}
                </small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
