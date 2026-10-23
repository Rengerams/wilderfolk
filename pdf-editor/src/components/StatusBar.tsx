import { formatFileSize } from "../pdf/pages"
import { totalRotation } from "../pdf/pages"
import { currentSettings } from "../storage/settings"
import { selectActivePage, useEditor } from "../app/store"

export function StatusBar() {
  const pages = useEditor((state) => state.doc.pages)
  const annotations = useEditor((state) => state.doc.annotations)
  const ocr = useEditor((state) => state.doc.ocr)
  const activePageId = useEditor((state) => state.activePageId)
  const status = useEditor((state) => state.status)
  const dirty = useEditor((state) => state.doc.dirty)
  const savedAt = useEditor((state) => state.doc.savedAt)
  const sourceBytes = useEditor((state) => state.doc.source?.bytes.byteLength ?? 0)
  const zoom = useEditor((state) => state.zoom)
  const fitMode = useEditor((state) => state.fitMode)
  const page = selectActivePage(useEditor.getState())

  const index = pages.findIndex((entry) => entry.id === (page?.id ?? activePageId))
  const appliedOcr = ocr.filter((layer) => layer.applied).reduce((sum, layer) => sum + layer.lines.length, 0)
  const settings = currentSettings()

  return (
    <footer className="statusbar">
      <span>
        Page <strong>{pages.length === 0 ? "—" : `${index + 1}/${pages.length}`}</strong>
      </span>
      {page ? (
        <span>
          {Math.round(page.width)} × {Math.round(page.height)} pt
          {totalRotation(page) !== 0 ? ` · rotated ${totalRotation(page)}°` : ""}
        </span>
      ) : null}
      <span>
        Zoom <strong>{fitMode === "custom" ? `${Math.round(zoom * 100)}%` : fitMode === "page" ? "fit page" : "fit width"}</strong>
      </span>
      <span>
        Objects <strong>{annotations.length}</strong>
      </span>
      {appliedOcr > 0 ? (
        <span>
          Recognized <strong>{appliedOcr} lines</strong>
        </span>
      ) : null}
      {sourceBytes > 0 ? <span>File {formatFileSize(sourceBytes)}</span> : null}
      <span className="grow">{status}</span>
      <span className={dirty ? "chip-accent chip" : "chip"}>
        {dirty ? "Unsaved changes" : savedAt ? "Saved" : "Not saved yet"}
      </span>
      <span className="chip" title="Where documents are stored">
        {settings.provider === "cloud" ? "Cloud storage" : "Local library"}
        {settings.encryptLibrary && settings.provider === "local" ? " · encrypted" : ""}
      </span>
    </footer>
  )
}
