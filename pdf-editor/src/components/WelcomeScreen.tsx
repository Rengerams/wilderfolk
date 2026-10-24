import { useEffect, useState } from "react"
import { Camera, FilePlus2, FolderOpen, Keyboard, Library, Settings } from "lucide-react"
import type { StoredDocMeta } from "../types"
import { IMPORT_ACCEPT, pickFiles } from "../app/files"
import { listLibrary, openFromLibrary } from "../app/documentActions"
import { formatFileSize, formatTimestamp } from "../pdf/pages"
import { useEditor } from "../app/store"
import { useCommands } from "../app/useCommands"
import { useT } from "../i18n"

export function WelcomeScreen() {
  const t = useT()
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
    setStatus(t("Opening {name}…", { name: meta.name }))
    try {
      await openFromLibrary(meta)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("That document could not be opened.")
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
        {t(
          "Create, edit, copy and scan PDF documents. Everything stays on this PC unless you switch on cloud storage.",
        )}
      </p>
      <div className="welcome-actions">
        <button type="button" className="welcome-card" onClick={commands.newDocument}>
          <FilePlus2 size={18} />
          <strong>{t("New document")}</strong>
          <small>{t("Blank pages in A4, Letter or A3")}</small>
        </button>
        <button type="button" className="welcome-card" onClick={() => void openFiles()}>
          <FolderOpen size={18} />
          <strong>{t("Open a file")}</strong>
          <small>{t("PDF, PNG or JPEG from this PC")}</small>
        </button>
        <button type="button" className="welcome-card" onClick={() => useEditor.getState().openDialog("scan")}>
          <Camera size={18} />
          <strong>{t("Scan pages")}</strong>
          <small>{t("Scanner or camera, with OCR")}</small>
        </button>
        <button type="button" className="welcome-card" onClick={commands.openLibrary}>
          <Library size={18} />
          <strong>{t("Open from library")}</strong>
          <small>{t("Documents saved on this PC")}</small>
        </button>
        <button type="button" className="welcome-card" onClick={() => useEditor.getState().openDialog("shortcuts")}>
          <Keyboard size={18} />
          <strong>{t("Keyboard shortcuts")}</strong>
          <small>{t("Every tool and key at a glance")}</small>
        </button>
        <button type="button" className="welcome-card" onClick={commands.storageSettings}>
          <Settings size={18} />
          <strong>{t("Storage & security")}</strong>
          <small>{t("Theme, language and where documents are saved")}</small>
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {recent.length > 0 ? (
        <div className="welcome-section">
          <h2>{t("Recent documents")}</h2>
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
                  {meta.pages === 1
                    ? t("{count} page", { count: meta.pages })
                    : t("{count} pages", { count: meta.pages })}{" "}
                  · {formatFileSize(meta.size)} · {formatTimestamp(meta.updatedAt)}
                  {meta.encrypted ? ` · ${t("encrypted")}` : ""}
                </small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
