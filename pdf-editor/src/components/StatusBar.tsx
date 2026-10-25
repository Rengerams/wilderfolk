import { useState } from "react"
import { formatFileSize } from "../pdf/pages"
import { totalRotation } from "../pdf/pages"
import { currentSettings } from "../storage/settings"
import { selectActivePage, useEditor } from "../app/store"
import { useT } from "../i18n"

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200]

export function StatusBar() {
  const t = useT()
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
  const setActivePage = useEditor((state) => state.setActivePage)
  const setZoom = useEditor((state) => state.setZoom)
  const setFitMode = useEditor((state) => state.setFitMode)
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  const page = selectActivePage(useEditor.getState())

  const index = pages.findIndex((entry) => entry.id === (page?.id ?? activePageId))
  const appliedOcr = ocr.filter((layer) => layer.applied).reduce((sum, layer) => sum + layer.lines.length, 0)
  const settings = currentSettings()

  const goToPage = (value: string) => {
    const wanted = Number.parseInt(value, 10)
    const target = Number.isFinite(wanted) ? pages[Math.min(pages.length, Math.max(1, wanted)) - 1] : undefined
    if (target) setActivePage(target.id)
    setPageDraft(null)
  }

  const zoomPercent = Math.round(zoom * 100)
  const zoomChoices = ZOOM_PRESETS.includes(zoomPercent) || fitMode !== "custom"
    ? ZOOM_PRESETS
    : [...ZOOM_PRESETS, zoomPercent].sort((a, b) => a - b)

  return (
    <footer className="statusbar">
      <span className="page-jump">
        {t("Page")}
        <input
          type="text"
          inputMode="numeric"
          className="page-number"
          aria-label={t("Go to page")}
          value={pageDraft ?? (pages.length === 0 ? "" : String(index + 1))}
          disabled={pages.length === 0}
          onChange={(event) => setPageDraft(event.target.value)}
          onBlur={(event) => goToPage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") goToPage(event.currentTarget.value)
            if (event.key === "Escape") setPageDraft(null)
          }}
        />
        <strong>{pages.length === 0 ? "—" : `/ ${pages.length}`}</strong>
      </span>
      {page ? (
        <span>
          {Math.round(page.width)} × {Math.round(page.height)} pt
          {totalRotation(page) !== 0
            ? ` · ${t("rotated {degrees}°", { degrees: totalRotation(page) })}`
            : ""}
        </span>
      ) : null}
      <span>
        {t("Zoom")}{" "}
        <select
          className="zoom-select"
          aria-label={t("Zoom")}
          value={fitMode === "custom" ? String(zoomPercent) : fitMode}
          onChange={(event) => {
            const value = event.target.value
            if (value === "page" || value === "width") setFitMode(value)
            else setZoom(Number(value) / 100)
          }}
        >
          <option value="page">{t("Fit page")}</option>
          <option value="width">{t("Fit width")}</option>
          {zoomChoices.map((percent) => (
            <option key={percent} value={String(percent)}>
              {`${percent}%`}
            </option>
          ))}
        </select>
      </span>
      <span>
        {t("Objects")} <strong>{annotations.length}</strong>
      </span>
      {appliedOcr > 0 ? (
        <span>
          {t("Recognized")}{" "}
          <strong>{t("{count} lines", { count: appliedOcr })}</strong>
        </span>
      ) : null}
      {sourceBytes > 0 ? <span>{t("File {size}", { size: formatFileSize(sourceBytes) })}</span> : null}
      <span className="grow">{status}</span>
      <span className={dirty ? "chip-accent chip" : "chip"}>
        {dirty ? t("Unsaved changes") : savedAt ? t("Saved") : t("Not saved yet")}
      </span>
      <span className="chip" title={t("Where documents are stored")}>
        {settings.provider === "cloud" ? t("Cloud storage") : t("Local library")}
        {settings.encryptLibrary && settings.provider === "local" ? ` · ${t("encrypted")}` : ""}
      </span>
    </footer>
  )
}
