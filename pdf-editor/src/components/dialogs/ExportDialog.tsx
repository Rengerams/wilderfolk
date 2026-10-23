import { useState } from "react"
import { Dialog } from "./Dialog"
import { FORMAT_ADAPTERS, type ExportFormatId } from "../../formats/registry"
import { useEditor } from "../../app/store"
import { useCommands } from "../../app/useCommands"

export function ExportDialog() {
  const closeDialog = useEditor((state) => state.closeDialog)
  const pages = useEditor((state) => state.doc.pages.length)
  const annotations = useEditor((state) => state.doc.annotations.length)
  const ocrLines = useEditor((state) =>
    state.doc.ocr.filter((layer) => layer.applied).reduce((sum, layer) => sum + layer.lines.length, 0),
  )
  const commands = useCommands()
  const [format, setFormat] = useState<ExportFormatId>("pdf")
  const [busy, setBusy] = useState(false)
  const selected = FORMAT_ADAPTERS.find((adapter) => adapter.id === format) ?? FORMAT_ADAPTERS[0]

  return (
    <Dialog
      title="Export as"
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">
            {selected.status === "ready"
              ? `${pages} page${pages === 1 ? "" : "s"} will be exported.`
              : "This format is not installed in this build."}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || selected.status !== "ready" || pages === 0}
            onClick={async () => {
              setBusy(true)
              await commands.exportAs(format)
              setBusy(false)
              closeDialog()
            }}
          >
            {busy ? "Exporting…" : `Export ${selected.extension.toUpperCase()}`}
          </button>
        </>
      }
    >
      <div className="list">
        {FORMAT_ADAPTERS.map((adapter) => (
          <label key={adapter.id} className="list-row" style={{ cursor: adapter.status === "ready" ? "pointer" : "default" }}>
            <input
              type="radio"
              name="export-format"
              checked={format === adapter.id}
              disabled={adapter.status !== "ready"}
              onChange={() => setFormat(adapter.id)}
            />
            <span className="grow">
              <strong>
                {adapter.label} (.{adapter.extension})
                {adapter.status !== "ready" ? " — extension slot" : ""}
              </strong>
              <small className="hint">{adapter.note}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="note">
        <strong>What goes into the export:</strong> every page in its saved order and rotation, all text,
        highlights, drawings and pictures, {ocrLines > 0 ? `${ocrLines} lines of recognized searchable text, ` : ""}
        and the document details. {annotations > 0 ? `${annotations} editable object${annotations === 1 ? "" : "s"} are printed into the page.` : ""}
      </div>
      <p className="hint">
        Image formats write one file per page. Text export includes the file's own text plus everything OCR
        recognized.
      </p>
    </Dialog>
  )
}
