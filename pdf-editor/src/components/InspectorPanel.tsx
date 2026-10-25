import { useMemo } from "react"
import { Library, ScanText, Settings2, ShieldCheck } from "lucide-react"
import { formatFileSize, formatTimestamp, totalRotation } from "../pdf/pages"
import { currentSettings } from "../storage/settings"
import { Swatches } from "./Swatches"
import { useEditor } from "../app/store"
import { useT } from "../i18n"

const COLORS = ["#111111", "#c42b1c", "#0f6cbd", "#0f7b0f", "#9d5d00", "#ffd400", "#8a2be2", "#ffffff"]

const TYPE_LABELS: Record<string, string> = {
  text: "Text box",
  highlight: "Highlight",
  shape: "Rectangle",
  ink: "Freehand drawing",
  image: "Picture",
}

export function InspectorPanel() {
  const t = useT()
  const doc = useEditor((state) => state.doc)
  const pages = useEditor((state) => state.doc.pages)
  const annotations = useEditor((state) => state.doc.annotations)
  const ocr = useEditor((state) => state.doc.ocr)
  const activePageId = useEditor((state) => state.activePageId)
  const selectedId = useEditor((state) => state.selectedAnnotationId)
  const setDocumentName = useEditor((state) => state.setDocumentName)
  const updateAnnotation = useEditor((state) => state.updateAnnotation)
  const removeAnnotation = useEditor((state) => state.removeAnnotation)
  const setOcrApplied = useEditor((state) => state.setOcrApplied)
  const removeOcrLayer = useEditor((state) => state.removeOcrLayer)
  const openDialog = useEditor((state) => state.openDialog)

  const page = useMemo(
    () => pages.find((entry) => entry.id === activePageId) ?? pages[0] ?? null,
    [pages, activePageId],
  )
  const annotation = useMemo(
    () => annotations.find((entry) => entry.id === selectedId) ?? null,
    [annotations, selectedId],
  )
  const layer = useMemo(
    () => ocr.find((entry) => entry.pageId === page?.id) ?? null,
    [ocr, page],
  )
  const settings = currentSettings()

  const colourField = (current: string, apply: (color: string) => void) => (
    <div className="field">
      <label>{t("Colour")}</label>
      <Swatches colors={COLORS} current={current} onPick={apply} />
    </div>
  )

  const lineWidthField = (width: number, apply: (width: number) => void) => (
    <div className="field">
      <label>{t("Line width ({width} pt)", { width })}</label>
      <input
        type="number"
        min={1}
        max={16}
        value={width}
        onChange={(event) => apply(Math.min(16, Math.max(1, Number(event.target.value) || 1)))}
      />
    </div>
  )

  return (
    <aside className="inspector" aria-label={t("Properties")}>
      <section>
        <div className="panel-heading">{t("Document")}</div>
        <div className="body">
          <div className="field">
            <label>{t("File name")}</label>
            <input
              type="text"
              value={doc.name}
              onChange={(event) => setDocumentName(event.target.value)}
              aria-label={t("File name")}
            />
          </div>
          <dl className="kv">
            <dt>{t("Pages")}</dt>
            <dd>{pages.length}</dd>
            <dt>{t("Objects")}</dt>
            <dd>{annotations.length}</dd>
            <dt>{t("Source")}</dt>
            <dd>{doc.source ? doc.source.name : t("New document")}</dd>
            <dt>{t("File size")}</dt>
            <dd>{doc.source ? formatFileSize(doc.source.bytes.byteLength) : "—"}</dd>
            <dt>{t("Last saved")}</dt>
            <dd>{doc.savedAt ? formatTimestamp(doc.savedAt) : t("Not saved yet")}</dd>
          </dl>
        </div>
      </section>

      <section>
        <div className="panel-heading">{t("Details written in the file")}</div>
        <div className="body">
          <dl className="kv">
            <dt>{t("Title")}</dt>
            <dd title={doc.metadata.title}>{doc.metadata.title || "—"}</dd>
            <dt>{t("Author")}</dt>
            <dd title={doc.metadata.author}>{doc.metadata.author || "—"}</dd>
            <dt>{t("Created by")}</dt>
            <dd title={doc.metadata.creator}>{doc.metadata.creator || "—"}</dd>
            <dt>{t("Created")}</dt>
            <dd>{formatTimestamp(doc.metadata.creationDate)}</dd>
            <dt>{t("Modified")}</dt>
            <dd>{formatTimestamp(doc.metadata.modificationDate)}</dd>
          </dl>
          <button type="button" className="btn" onClick={() => openDialog("metadata")}>
            <Settings2 size={15} /> {t("Edit all details")}
          </button>
        </div>
      </section>

      {page ? (
        <section>
          <div className="panel-heading">
            {t("Page {number}", { number: pages.findIndex((entry) => entry.id === page.id) + 1 })}
          </div>
          <div className="body">
            <dl className="kv">
              <dt>{t("Size")}</dt>
              <dd>
                {Math.round(page.width)} × {Math.round(page.height)} pt
              </dd>
              <dt>{t("Rotation")}</dt>
              <dd>{totalRotation(page)}°</dd>
              <dt>{t("Objects on page")}</dt>
              <dd>{annotations.filter((entry) => entry.pageId === page.id).length}</dd>
            </dl>
          </div>
        </section>
      ) : null}

      <section>
        <div className="panel-heading">{t("Selected object")}</div>
        <div className="body">
          {annotation ? (
            <>
              <div className="field">
                <label>{t("Type")}</label>
                <span className="chip chip-accent">{t(TYPE_LABELS[annotation.type] ?? annotation.type)}</span>
              </div>
              {annotation.type === "text" ? (
                <>
                  <div className="field">
                    <label>{t("Text")}</label>
                    <textarea
                      value={annotation.text}
                      onChange={(event) => updateAnnotation(annotation.id, { text: event.target.value })}
                      aria-label={t("Annotation text")}
                    />
                  </div>
                  <div className="field">
                    <label>{t("Font size ({size} pt)", { size: annotation.fontSize })}</label>
                    <input
                      type="number"
                      min={6}
                      max={72}
                      value={annotation.fontSize}
                      onChange={(event) =>
                        updateAnnotation(annotation.id, {
                          fontSize: Math.min(72, Math.max(6, Number(event.target.value) || 12)),
                        })
                      }
                    />
                  </div>
                  {colourField(annotation.color, (color) => updateAnnotation(annotation.id, { color }))}
                </>
              ) : null}
              {annotation.type === "highlight"
                ? colourField(annotation.color, (color) => updateAnnotation(annotation.id, { color }))
                : null}
              {annotation.type === "shape" ? (
                <>
                  <div className="field">
                    <label>{t("Outline")}</label>
                    <Swatches
                      colors={COLORS}
                      current={annotation.stroke}
                      onPick={(stroke) => updateAnnotation(annotation.id, { stroke })}
                    />
                  </div>
                  {lineWidthField(annotation.lineWidth, (lineWidth) =>
                    updateAnnotation(annotation.id, { lineWidth }),
                  )}
                  <div className="field">
                    <label>
                      {t("Fill strength ({percent}%)", {
                        percent: Math.round((annotation.fillOpacity ?? 0.22) * 100),
                      })}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round((annotation.fillOpacity ?? 0.22) * 100)}
                      onChange={(event) =>
                        updateAnnotation(annotation.id, {
                          fillOpacity: Math.min(1, Math.max(0, (Number(event.target.value) || 0) / 100)),
                        })
                      }
                    />
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={annotation.fill !== null}
                      onChange={(event) =>
                        updateAnnotation(annotation.id, {
                          fill: event.target.checked ? annotation.stroke : null,
                        })
                      }
                    />
                    {t("Filled rectangle")}
                  </label>
                </>
              ) : null}
              {annotation.type === "ink" ? (
                <>
                  {colourField(annotation.color, (color) => updateAnnotation(annotation.id, { color }))}
                  {lineWidthField(annotation.lineWidth, (lineWidth) =>
                    updateAnnotation(annotation.id, { lineWidth }),
                  )}
                </>
              ) : null}
              {annotation.type === "image" ? (
                <p className="hint">
                  {t(
                    "Pictures can be moved and resized on the page; the picture data itself is kept as is.",
                  )}
                </p>
              ) : null}
              <button type="button" className="btn btn-danger" onClick={() => removeAnnotation(annotation.id)}>
                {t("Remove object")}
              </button>
            </>
          ) : (
            <p className="hint">
              {t(
                "Nothing selected. Pick the Select tool and click an object on the page to change its colour, size or text.",
              )}
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="panel-heading">{t("Recognized text")}</div>
        <div className="body">
          {layer ? (
            <>
              <dl className="kv">
                <dt>{t("Lines")}</dt>
                <dd>{layer.lines.length}</dd>
                <dt>{t("Confidence")}</dt>
                <dd>{layer.confidence}%</dd>
                <dt>{t("Languages")}</dt>
                <dd>{layer.language}</dd>
                <dt>{t("Searchable")}</dt>
                <dd>{layer.applied ? t("Yes") : t("Not yet")}</dd>
              </dl>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={layer.applied}
                  onChange={(event) => setOcrApplied(layer.pageId, event.target.checked)}
                />
                {t("Include as invisible searchable text")}
              </label>
              <button type="button" className="btn" onClick={() => openDialog("ocr")}>
                <ScanText size={15} /> {t("Review recognized text")}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => removeOcrLayer(layer.pageId)}>
                {t("Delete recognized text on this page")}
              </button>
            </>
          ) : (
            <>
              <p className="hint">
                {t(
                  "This page has no recognized text yet. Scanned and picture pages can be made searchable.",
                )}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => openDialog("ocr")}
                disabled={pages.length === 0}
              >
                <ScanText size={15} /> {t("Recognize text")}
              </button>
            </>
          )}
        </div>
      </section>

      <section>
        <div className="panel-heading">{t("Storage & security")}</div>
        <div className="body">
          <dl className="kv">
            <dt>{t("Documents are stored in")}</dt>
            <dd>{settings.provider === "cloud" ? t("Cloud storage") : t("Local library")}</dd>
            <dt>{t("Encryption at rest")}</dt>
            <dd>{settings.encryptLibrary ? t("On (passphrase)") : t("Off")}</dd>
          </dl>
          <button type="button" className="btn" onClick={() => openDialog("open")}>
            <Library size={15} /> {t("Open from library")}
          </button>
          <button type="button" className="btn" onClick={() => openDialog("settings")}>
            <ShieldCheck size={15} /> {t("Storage & security…")}
          </button>
        </div>
      </section>
    </aside>
  )
}
