import { useState } from "react"
import { Dialog } from "./Dialog"
import { FORMAT_ADAPTERS, type ExportFormatId } from "../../formats/registry"
import { useEditor } from "../../app/store"
import { useCommands } from "../../app/useCommands"
import { useT } from "../../i18n"

export function ExportDialog() {
  const t = useT()
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
      title={t("Export as")}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">
            {selected.status === "ready"
              ? pages === 1
                ? t("{count} page will be exported.", { count: pages })
                : t("{count} pages will be exported.", { count: pages })
              : t("This format is not installed in this build.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Cancel")}
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
            {busy
              ? t("Exporting…")
              : t("Export {format}", { format: selected.extension.toUpperCase() })}
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
                {t(adapter.label)} (.{adapter.extension})
                {adapter.status !== "ready" ? ` — ${t("extension slot")}` : ""}
              </strong>
              <small className="hint">{t(adapter.note)}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="note">
        <strong>{t("What goes into the export:")}</strong>{" "}
        {t(
          "every page in its saved order and rotation, all text, highlights, drawings and pictures,",
        )}{" "}
        {ocrLines > 0 ? t("{count} lines of recognized searchable text, ", { count: ocrLines }) : ""}
        {t("and the document details.")}{" "}
        {annotations > 0
          ? annotations === 1
            ? t("{count} editable object is printed into the page.", { count: annotations })
            : t("{count} editable objects are printed into the page.", { count: annotations })
          : ""}
      </div>
      <p className="hint">
        {t(
          "Image formats write one file per page. Text export includes the file's own text plus everything OCR recognized.",
        )}
      </p>
    </Dialog>
  )
}
